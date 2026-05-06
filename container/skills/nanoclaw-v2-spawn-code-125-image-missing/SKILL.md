---
name: nanoclaw-v2-spawn-code-125-image-missing
description: Diagnose silent NanoClaw v2 outage where the orchestrator service is "active" but no agent ever replies, and logs repeat `Container exited code=125 containerName=nanoclaw-v2-...` every minute. Root cause is the agent Docker image (`nanoclaw-agent-v2-<install-slug>:latest`) being deleted by a parallel `docker prune` (Dokploy stack rebuilds, manual cleanup). Use when systemctl says fine but Andy/Music Mind/etc. respond to nothing.
author: Claude Code
version: 1.0.0
date: 2026-04-29
---

# NanoClaw v2 — Silent agent outage from missing Docker image

## Problem

NanoClaw v2 stops responding to **all** Telegram channels. Tasks don't fire, agents don't reply. But:

- `systemctl is-active nanoclaw-v2-*` returns `active`
- `pgrep -af 'node /opt/nanoclaw-v2/dist/index.js'` shows the orchestrator running
- Orchestrator log `nanoclaw.log` shows it dutifully trying to wake containers every minute
- No errors in the orchestrator's own log

The signal is in the wake/exit cycle: every spawn exits **immediately with `code=125`** (Docker run failed before the container could even start). User-facing symptom: complete silence.

## Context / Trigger Conditions

- All agents stop responding at once (not just one channel)
- `bash ops/claw.sh status` shows no `nanoclaw-v2-*` containers running
- Orchestrator logs show this pattern repeating every 60s:
  ```
  Waking container for due messages sessionId=...  count=N
  OneCLI gateway applied containerName=nanoclaw-v2-<group>-<ts>
  Spawning container ...
  Container exited code=125 containerName=...
  ```
- Docker daemon journal (`journalctl -u docker`) shows repeated:
  ```
  fetch failed error="pull access denied, repository does not exist..."
  host=registry-1.docker.io
  ```
  → Docker is trying to **pull** the image from the registry because it's not local — and it's never been pushed to a registry.

## Solution

**The agent Docker image is gone.** Verify and rebuild.

### 1. Confirm the image is missing

```bash
docker image inspect nanoclaw-agent-v2-<install-slug>:latest 2>&1 | head -3
# Expected when missing:  Error response from daemon: No such image: ...
```

You can find the install-slug from the systemd unit:
```bash
systemctl show nanoclaw-v2-* --property=FragmentPath
# → /etc/systemd/system/nanoclaw-v2-<slug>.service
```

### 2. Rebuild

The build script is `/opt/nanoclaw-v2/container/build.sh`. **Run it as a long-lived foreground process** — DO NOT use `nohup ... &` from inside a Portainer temp container, the parent shell exit will kill the build.

The reliable pattern: create a Portainer container with the build command synchronously, let it run to completion, poll its state.

```bash
# Pseudocode for the Portainer-API path:
CID=$(create container postgres:15-alpine privileged PidMode=host \
        cmd="nsenter -t 1 -m -u -n -p -- bash -c 'cd /opt/nanoclaw-v2/container && bash build.sh latest'")
start $CID
# Poll until State.Status == "exited"
# Then read logs and verify exit code 0
```

Build typically takes 5–10 min on a fresh image (downloads chromium, bun, pnpm globals, agent-browser, vercel CLI). On a warm cache it's faster.

### 3. Verify recovery

The orchestrator does NOT need a restart. Its host-sweep ticks every 60s — once the image is back, the next tick spawns a real container.

```bash
# Wait ~90s after image rebuild, then:
docker ps --filter name=nanoclaw-v2 --format '{{.Names}} {{.Status}}'
# Should show telegram_main, telegram_music_mind, etc. with "Up N seconds"

grep 'Message delivered' /opt/nanoclaw-v2/logs/nanoclaw.log | tail -5
# Should show fresh delivery events
```

## Why this happens (and how to prevent recurrence)

The Dokploy LXC runs other Docker stacks (Music Mind, MCP services, etc.). When those stacks redeploy, BuildKit's prune logic considers the NanoClaw agent image "unused" (no running container — agents are short-lived) and reaps it. The image was never pushed to a registry, so it's gone for good once pruned.

Mitigations:

1. **Tag the image so prune skips it** — add a stable label and configure prune to skip:
   ```bash
   docker image tag nanoclaw-agent-v2-<slug>:latest nanoclaw-agent-v2-<slug>:keep
   ```
   The two tags reference the same image; if `:latest` is pruned, `:keep` may survive. Dokploy's auto-prune typically only removes truly dangling images, but the extra tag adds a tracked reference.

2. **Push to a private registry** as a backup. Then when missing, `docker pull` brings it back in seconds instead of a 10-min rebuild:
   ```bash
   docker tag nanoclaw-agent-v2-<slug>:latest ghcr.io/<owner>/nanoclaw-agent-v2:latest
   docker push ghcr.io/<owner>/nanoclaw-agent-v2:latest
   ```

3. **Add a startup health check to the orchestrator OR a periodic check** — if image disappears mid-run, alert via the error-Telegram bot. The current `ExecStartPre` in the systemd unit only checks at start, not while running.

## Verification

After rebuild, confirm:

- `docker image inspect nanoclaw-agent-v2-<slug>:latest` returns the manifest (not "No such image")
- `docker ps --filter name=nanoclaw-v2` lists running agent containers within 90s
- Orchestrator log shows `Spawning container` followed by `Message delivered` (no `Container exited code=125`)
- Telegram-side: agents respond to whatever was queued

## Notes

- This outage is **silent**. `systemctl is-active` doesn't catch it. Don't trust the service status alone — also check `docker ps | grep nanoclaw-v2` and the orchestrator's actual `nanoclaw.log`.
- The orchestrator was queueing messages in `messages_in` the entire time the image was missing. Once recovered, agents may have a backlog to chew through (saw 4 pending for telegram_main + 1 for music_mind in the 2026-04-29 incident).
- `code 125` from `docker run` specifically means "the docker run command failed before the container could start" (image missing, invalid mount, daemon error). `code 126` = container CMD not executable. `code 127` = command not found inside container. Different causes.
- Building the image from inside a temp Portainer container via `nohup ... &` does NOT survive the parent container exiting. Use foreground execution and poll the build container's state.

## References

- Docker exit codes: https://docs.docker.com/engine/reference/run/#exit-status
- Verified during 2026-04-29 incident: image vanished overnight, code=125 loop for ~7h, fixed by rebuilding via long-lived Portainer container.
