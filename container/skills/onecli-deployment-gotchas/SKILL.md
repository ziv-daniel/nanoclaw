---
name: onecli-deployment-gotchas
description: OneCLI Agent Vault deployment quirks — public dashboard URL config, selective secret-mode default for new agents, and what symptoms each one produces in NanoClaw / Andy. Use when an agent reports `Authentication error` despite the credential existing, when Andy keeps emitting an internal `http://0.0.0.0:10254/agents?manage=...` link the user can't reach, or when standing up OneCLI fresh.
author: Claude Code
version: 1.0.0
date: 2026-04-26
---

# OneCLI Deployment Gotchas

## Problem

OneCLI Agent Vault (the credential gateway used by NanoClaw v2) has two non-obvious defaults that make agents look broken when they're actually configured-as-designed:

1. **Newly auto-created agents start in `selective` secret mode** — they get NO secrets injected, even when matching ones exist in the vault. Symptom: `401 Unauthorized` on the first API call, while sibling agents work fine.
2. **The dashboard URL is templated from `${ONECLI_BIND_HOST}` env var** — if the bind host is `0.0.0.0` (default), every approval link the agent posts to the user starts with `http://0.0.0.0:10254/...`, which is unreachable from a phone or anywhere outside the LAN — and a naive `sed` on the compose file misses it because the literal string `0.0.0.0:10254` isn't in the file at all.

## Context / Trigger Conditions

### Symptom A — selective secret mode

- A new Andy session container was just spawned for an agent group
- Andy reports something like:
  - `"GitHub MCP is active but I need you to grant access — click http://0.0.0.0:10254/agents?manage=<id>"`
  - `"I'm getting authentication error, the credential isn't reaching me"`
- **Other agent groups in the same OneCLI instance work fine with the same credential**
- The credential exists in the vault and has a host pattern that *should* match

### Symptom B — internal URL leaking

- Andy posts approval/management links containing `http://0.0.0.0:10254` or `http://127.0.0.1:10254` or `http://localhost:10254`
- User can't open the URL from phone / outside LAN
- Inspecting `docker exec onecli env`:
  - `APP_URL=http://0.0.0.0:10254`
  - `NEXT_PUBLIC_APP_URL=http://0.0.0.0:10254`
  - `NEXTAUTH_URL=http://localhost:10254`

### Bonus symptom C — sed silently no-op on compose

When trying to fix B with `sed -i 's|http://0.0.0.0:10254|https://...|g' docker-compose.yml`:
- Output says success but `docker exec onecli env` still shows `http://0.0.0.0:10254`
- Cause: the compose file actually contains `http://${ONECLI_BIND_HOST:-127.0.0.1}:10254` (template substitution at runtime), so the literal string never appears

## Solution

### Fix A — flip new agents to `all` mode

```bash
# Find the agent (identifier is the agent group id from NanoClaw)
onecli agents list

# Flip — every vault secret matching by host pattern now auto-injects
onecli agents set-secret-mode --id <agent-id> --mode all
# No container restart needed — gateway looks up secrets per-request
```

**Or stay selective and assign specific secrets:**
```bash
onecli secrets list                              # find secret ids
onecli agents set-secrets --id <agent-id> --secret-ids <id1>,<id2>
onecli agents secrets --id <agent-id>            # verify what's assigned
```

**For permanent fix on every new agent:** patch `nanoclaw-v2/src/container-runner.ts` `ensureAgent()` to set `mode: "all"` at create time, OR run a post-create hook on every new spawn.

### Fix B — use public URL in OneCLI compose

Find the compose file (it's NOT in `/opt/...`, it's wherever OneCLI was installed; for the standard installer it's `/root/.onecli/docker-compose.yml`):

```bash
docker inspect onecli --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

Edit the `environment:` block of the `onecli` service — **replace the templated values with literal public URLs:**

```yaml
environment:
  DATABASE_URL: postgresql://${POSTGRES_USER:-onecli}:${POSTGRES_PASSWORD:-onecli}@postgres:5432/${POSTGRES_DB:-onecli}
  NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-}
  NEXT_PUBLIC_APP_URL: https://onecli.your-domain.example   # was ${ONECLI_BIND_HOST:-127.0.0.1}:10254
  APP_URL:             https://onecli.your-domain.example   # was same
  NEXTAUTH_URL:        https://onecli.your-domain.example   # add this — defaults to localhost:10254 in the image
```

Then recreate (NOT just restart — env changes need recreate):
```bash
cd /root/.onecli && docker compose up -d --force-recreate onecli
# Wait for health
for i in $(seq 10); do s=$(docker inspect onecli --format '{{.State.Health.Status}}'); echo "$i: $s"; [ "$s" = "healthy" ] && break; sleep 2; done
docker exec onecli env | grep URL    # verify all 3 show public URL
```

**Critical:** the public URL must already be reachable end-to-end (DNS + tunnel/proxy + TLS + auth) before flipping the env vars, otherwise OAuth callbacks (NextAuth) will fail in the dashboard. Test with `curl -L https://onecli.your-domain.example/agents` — should return 200 and either the dashboard or your auth challenge.

## Verification

**Fix A working:** new container spawn for the affected agent group → Andy makes the API call without prompting for approval. `docker logs <agent-container> | grep -i "401\|unauthorized"` is empty.

**Fix B working:** trigger any flow that makes Andy emit a vault link (e.g. ask for a credentialed action on a fresh agent group). The link Andy posts should now start with `https://onecli.your-domain.example/agents?manage=...` instead of `http://0.0.0.0:10254/...`.

## Gotcha C — iptables DROP for non-loopback traffic to port 10254

After exposing the dashboard externally, requests **post-Access** (i.e., authenticated) returned 502 Bad Gateway from Cloudflare. Origin was healthy (LAN curl returned 200). Ports were correctly bound to `0.0.0.0:10254`.

Root cause: the OneCLI installer adds an explicit `iptables FORWARD` chain with the structure:
```
ACCEPT  127.0.0.0/8     → <onecli-bridge-ip>:10254
ACCEPT  172.16.0.0/12   → <onecli-bridge-ip>:10254   (Docker bridge nets)
DROP    0.0.0.0/0       → <onecli-bridge-ip>:10254   (catch-all)
```

The cloudflared connector running on a different host (e.g. HAOS at `192.168.68.121`) hits the catch-all DROP. Symptoms:
- `iptables -L FORWARD -n -v | grep 10254` shows DROP rule with non-zero packet count
- LAN curl (from within the same host as OneCLI) → 200
- Tunnel curl (from another host on same LAN) → 502

**Fix** (idempotent + survives docker restart):
```ini
# /etc/systemd/system/onecli-tunnel-fw.service
[Unit]
Description=Allow tunnel connector to reach OneCLI
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStartPre=/bin/bash -c 'for i in $(seq 30); do iptables -t nat -L DOCKER -n 2>/dev/null | grep -q "<onecli-bridge-ip>:10254" && break; sleep 2; done'
ExecStart=/bin/bash -c 'iptables -C FORWARD -s <connector-ip>/32 -d <onecli-bridge-ip> -p tcp --dport 10254 -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -s <connector-ip>/32 -d <onecli-bridge-ip> -p tcp --dport 10254 -j ACCEPT'

[Install]
WantedBy=multi-user.target
```
Then `systemctl daemon-reload && systemctl enable --now onecli-tunnel-fw.service`.

Find `<onecli-bridge-ip>` via `docker inspect onecli --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`. The bridge IP can change on container recreate — for fully robust persistence, use a hostname-based or label-selector iptables rule via `docker network inspect`.

## Notes

- The `selective` default exists for a reason: principle of least privilege. Only flip to `all` if every vault secret is something the agent *should* be allowed to use. Otherwise use `set-secrets` per agent.
- After Fix B, **existing chat history with Andy may still echo the old URL once** because it's in the conversation context. Tell Andy "regenerate the approval link, the URL has changed" and the next emission will use the new env.
- OneCLI's `selective`/`all` mode is **not exposed in the SDK** as of v1.18 — only the CLI or the web UI at the dashboard URL.
- Server-side approval rules (block / rate_limit / approve) are **only configurable via the web UI**, not the CLI (`onecli rules create --action` only accepts `block` or `rate_limit` as of v1.18). If you want approval-gating on a credentialed action, you must visit the dashboard — which is exactly why exposing it externally (Fix B) matters.
- When patching the compose file, watch out for accidental duplicate keys — YAML will fail to parse with `mapping key already defined`. If you script-insert a key, check whether it's already present.

## References

- [OneCLI on GitHub](https://github.com/onecli/onecli)
- NanoClaw v2 internal docs: `/opt/nanoclaw-v2/CLAUDE.md` § "Gotcha: auto-created agents start in `selective` secret mode"
- Related skill: `cloudflare-zero-trust-homelab-service` (how to actually expose the dashboard publicly with email-gated SSO)
