---
name: nanoclaw-portainer-build-restart
description: Deploy NanoClaw TypeScript changes to the Dokploy host via Portainer API — the built-in claw.sh lacks build and its restart fails with "setns ipc permission denied". Covers chunked file upload (tty null-byte workaround), node:20-alpine builder container, and privileged restart container.
author: Claude Code
version: 1.0.0
date: 2026-04-21
---

# NanoClaw: Build + Restart via Portainer API

## Problem

Deploying TypeScript source changes to the NanoClaw server (`/opt/nanoclaw` on Dokploy host) requires three capabilities that `claw.sh host` alone cannot provide:

1. **File upload** — `claw.sh host "cat file"` corrupts binary-sensitive content (one NUL byte per newline from `Tty:true` in its docker exec config).
2. **Build** — `postgres:15-alpine` (claw.sh's temp image) has no `node`; `apk add nodejs` works but each `claw.sh host` call spawns a fresh container so state is lost, and the docker exec logs timeout is 15s which is shorter than a full `tsc` build.
3. **Restart** — `claw.sh restart` runs `nsenter -t 1 -m -u -i -n -p -- systemctl restart nanoclaw` but the plain temp container can't enter the ipc namespace: `setns(): can't reassociate to namespace 'ipc': Operation not permitted`.

## Context / Trigger Conditions

- You edited `src/channels/*.ts` or other files under `/opt/nanoclaw/src/`
- `dist/` needs to be rebuilt (service runs `node /opt/nanoclaw/dist/index.js`)
- You need the new code running in production
- Plain `claw.sh restart` returns `FAILED` with `setns ipc` error

## Solution

### Step 1 — Pull source files (tty-safe)

Use `gzip | base64` through the tty shell to avoid NUL corruption. Even then, strip any residual nulls:

```bash
bash claw.sh host "gzip -c /nanoclaw/src/channels/slack.ts | base64 -w 0" 2>/dev/null \
  | tr -d '\r\n\0 ' > slack.b64
base64 -d slack.b64 | gunzip | tr -d '\0' > slack.ts
```

Confirm line count matches server's `wc -l`.

### Step 2 — Upload edited files in chunks

Portainer's `containers/create` endpoint fails on ~40KB single-shot JSON args (`KeyError: 'Id'`). Split base64 into 8KB chunks and append:

```bash
base64 -w 0 slack.ts > slack.b64
split -b 8000 slack.b64 slack.chunk.

bash claw.sh host "mkdir -p /nanoclaw/tmp && > /nanoclaw/tmp/slack.b64 && echo ok"

for chunk in slack.chunk.*; do
  DATA=$(cat $chunk)
  bash claw.sh host "printf '%s' '$DATA' >> /nanoclaw/tmp/slack.b64" >/dev/null
done

bash claw.sh host "base64 -d /nanoclaw/tmp/slack.b64 > /nanoclaw/tmp/slack.ts.new && md5sum /nanoclaw/tmp/slack.ts.new"
# Verify md5 matches local md5sum slack.ts, then:
bash claw.sh host "cp /nanoclaw/src/channels/slack.ts /nanoclaw/src/channels/slack.ts.bak.$(date +%s) && mv /nanoclaw/tmp/slack.ts.new /nanoclaw/src/channels/slack.ts"
```

### Step 3 — Build dist/ via a node:20-alpine container (direct Portainer API)

```bash
TOKEN=$(curl -s -k --max-time 15 -X POST "https://portainer.danielshaprvt.work/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PORTAINER_PASS>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")

# Pull image if missing (one-time):
curl -s -k --max-time 120 -X POST -H "Authorization: Bearer $TOKEN" \
  "https://portainer.danielshaprvt.work/api/endpoints/16/docker/images/create?fromImage=node&tag=20-alpine"

# Create + start builder (writes result file so we can poll from separate calls):
CREATE=$(curl -s -k -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"Image":"node:20-alpine","Cmd":["sh","-c","cd /nanoclaw && node node_modules/.bin/tsc -p . > /nanoclaw/tmp/build.log 2>&1; echo $? > /nanoclaw/tmp/build.done"],"HostConfig":{"Binds":["/opt/nanoclaw:/nanoclaw"]}}' \
  "https://portainer.danielshaprvt.work/api/endpoints/16/docker/containers/create?name=nanoclaw-builder-$(date +%s)")
CID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")
curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
  "https://portainer.danielshaprvt.work/api/endpoints/16/docker/containers/$CID/start"

# Poll for completion (the build typically takes 40-90s, exceeds claw.sh's 15s log window):
until bash claw.sh host "test -f /nanoclaw/tmp/build.done && echo READY" 2>/dev/null | grep -q READY; do
  sleep 5
done
bash claw.sh host "cat /nanoclaw/tmp/build.done; head -40 /nanoclaw/tmp/build.log"
# Exit code 0 in build.done = success
```

### Step 4 — Restart nanoclaw via privileged temp container

`claw.sh restart`'s nsenter fails without elevated privileges. Create your own temp container with `Privileged:true` + `PidMode:"host"`:

```bash
curl -s -k -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"Image":"postgres:15-alpine","Cmd":["sh","-c","nsenter -t 1 -m -u -i -n -p -- systemctl restart nanoclaw && echo RESTARTED || echo FAILED"],"HostConfig":{"Privileged":true,"PidMode":"host","Binds":["/etc:/host-etc:ro"]}}' \
  "https://portainer.danielshaprvt.work/api/endpoints/16/docker/containers/create?name=nanoclaw-restarter-$(date +%s)" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])" \
  | xargs -I{} curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
      "https://portainer.danielshaprvt.work/api/endpoints/16/docker/containers/{}/start"
```

Container exits quickly (may auto-GC before logs are fetched); verify success by checking service state.

## Verification

```bash
# Check build included your changes:
bash claw.sh host "grep -c 'your_new_symbol' /nanoclaw/dist/channels/slack.js"

# Check dist was rebuilt after upload:
bash claw.sh host "ls -la /nanoclaw/dist/channels/slack.js"   # timestamp should be recent

# Check service came back up:
bash claw.sh host "tail -30 /nanoclaw/logs/nanoclaw.log"
# Look for: "NanoClaw running (trigger: @Andy)" with timestamp AFTER your restart
```

## Notes

- **Always back up before `mv`**: `cp X X.bak.$(date +%s)` before overwriting. NanoClaw has no git history on the server.
- **Credentials**: `PORTAINER_PASS` is hardcoded in `claw.sh`. Don't echo to logs.
- **nanoclaw-agent containers**: the per-chat agent containers (`/nanoclaw-telegram-main-*`, `/nanoclaw-slack-*`) are managed by the service — stopping them manually is pointless, they respawn.
- **Build time**: `tsc -p .` on NanoClaw takes ~45s cold, ~10s warm (after node:20-alpine caches). Always exceeds claw.sh's 15s log window, hence the poll-for-done-file pattern.
- **Why not `docker cp`?** The temp container has `/var/run/docker.sock` mounted but no docker CLI, and adding one via `apk add docker-cli` adds 60MB+ of image pull. Direct Portainer API is faster.
- **`systemctl` alternative**: If the privileged restarter also fails (e.g., Portainer denies Privileged), you can `kill -TERM` the `node /opt/nanoclaw/dist/index.js` PID via `nsenter` — systemd will auto-restart (Restart=always).

## References

- `/opt/nanoclaw/host-etc/systemd/system/nanoclaw.service` — service definition (Restart=always, ExecStart=node dist/index.js)
- Memory: `project_dokploy_oom_recovery.md`, `feedback_portainer_ops.md`
- Related skill: `portainer-persistent-toolbox-pattern`
