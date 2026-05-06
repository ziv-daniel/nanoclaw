---
name: nanoclaw-deploy
description: Deploy NanoClaw source changes to Dokploy LXC via Portainer API.
author: Claude Code
version: 1.0.0
date: 2026-04-05
---

# NanoClaw Deployment

## Architecture

- NanoClaw is a **systemd service** on Dokploy LXC, NOT a Docker container
- Path: `/opt/nanoclaw/` (src/, dist/, logs/, .env)
- Runs as: `systemd -> node /opt/nanoclaw/dist/index.js`
- Access: **Portainer API only** (SSH is down)
- Source files are in the local repo at `C:\Repo\nanoclaw\staging\`

## Credentials

- Portainer URL: `https://portainer.danielshaprvt.work`
- Username: `admin`, Password: `Z5877029admin`
- Endpoint ID: `16` (Dokploy LXC)

## Quick Reference Commands

All commands below use these shared variables:

```bash
PORTAINER_URL="https://portainer.danielshaprvt.work"
TOKEN=$(curl -s -k -X POST "$PORTAINER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Z5877029admin"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")
```

## Step 1: Upload File(s)

For files under ~30KB, use `claw.sh host` with base64:

```bash
B64=$(base64 -w0 staging/file.ts)
bash claw.sh host "echo '$B64' | base64 -d > /nanoclaw/src/path/file.ts"
```

For files over 30KB (like telegram.ts at ~43KB), the command line is too long.
Use chunked upload via direct Portainer API:

```bash
# Write base64 to temp file and split into 30KB chunks
base64 -w0 staging/file.ts > /tmp/nc_b64.txt
split -b 30000 /tmp/nc_b64.txt /tmp/nc_chunk_

# Clear target and upload b64 accumulator
bash claw.sh host "echo -n > /nanoclaw/src/path/_upload_b64.txt"

# Upload each chunk (append to accumulator)
for chunk in /tmp/nc_chunk_*; do
  CHUNK_DATA=$(cat "$chunk")
  CONTAINER_ID=$(curl -s -k -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"Image\":\"postgres:15-alpine\",\"Cmd\":[\"sh\",\"-c\",\"printf '%s' '$CHUNK_DATA' >> /nanoclaw/src/path/_upload_b64.txt && echo CHUNK_OK\"],\"HostConfig\":{\"Binds\":[\"/opt/nanoclaw:/nanoclaw\"]}}" \
    "$PORTAINER_URL/api/endpoints/16/docker/containers/create" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")
  curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
    "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/start"
  sleep 2
  curl -s -k -H "Authorization: Bearer $TOKEN" \
    "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=3" | sed 's/^.\{8\}//'
  curl -s -k -X DELETE -H "Authorization: Bearer $TOKEN" \
    "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID?force=true" > /dev/null
done

# Decode accumulated base64 to final file
CONTAINER_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Image":"postgres:15-alpine","Cmd":["sh","-c","base64 -d /nanoclaw/src/path/_upload_b64.txt > /nanoclaw/src/path/file.ts && rm /nanoclaw/src/path/_upload_b64.txt && wc -c /nanoclaw/src/path/file.ts && echo DECODE_OK"],"HostConfig":{"Binds":["/opt/nanoclaw:/nanoclaw"]}}' \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/create" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")
curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/start"
sleep 3
curl -s -k -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=5" | sed 's/^.\{8\}//'
curl -s -k -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID?force=true" > /dev/null

# Clean up local temp files
rm -f /tmp/nc_b64.txt /tmp/nc_chunk_*
```

Verify: the `wc -c` output should match the local file size (`wc -c staging/file.ts`).

## Step 2: Build TypeScript

Requires a **privileged container** with `PidMode: host` for nsenter:

```bash
CONTAINER_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Image":"postgres:15-alpine","Cmd":["sh","-c","nsenter -t 1 -m -u -n -p -- sh -c \"cd /opt/nanoclaw && npx tsc 2>&1; echo BUILD_EXIT: $?\""],"HostConfig":{"Privileged":true,"PidMode":"host","Binds":["/opt/nanoclaw:/nanoclaw"]}}' \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/create" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")

curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/start"
sleep 20
curl -s -k -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=50" | sed 's/^.\{8\}//'
curl -s -k -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID?force=true" > /dev/null
```

Expected: `BUILD_EXIT: 0`. If errors appear, fix the source and re-upload.

## Step 3: Restart Service

```bash
CONTAINER_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Image":"postgres:15-alpine","Cmd":["sh","-c","nsenter -t 1 -m -u -n -p -- systemctl restart nanoclaw && sleep 3 && nsenter -t 1 -m -u -n -p -- systemctl is-active nanoclaw && nsenter -t 1 -m -u -n -p -- tail -15 /opt/nanoclaw/logs/nanoclaw.log"],"HostConfig":{"Privileged":true,"PidMode":"host"}}' \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/create" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")

curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/start"
sleep 10
curl -s -k -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=30" | sed 's/^.\{8\}//'
curl -s -k -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID?force=true" > /dev/null
```

Expected output: `active` followed by startup logs showing channels connected.

## Step 4: Verify (Optional)

Check logs after a minute to confirm stability:

```bash
CONTAINER_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Image":"postgres:15-alpine","Cmd":["sh","-c","nsenter -t 1 -m -u -n -p -- tail -30 /opt/nanoclaw/logs/nanoclaw.log"],"HostConfig":{"Privileged":true,"PidMode":"host"}}' \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/create" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")

curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/start"
sleep 3
curl -s -k -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=40" | sed 's/^.\{8\}//'
curl -s -k -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID?force=true" > /dev/null
```

## Shortcut: Restart Only (No Code Changes)

When you just need to restart without uploading/building:

```bash
PORTAINER_URL="https://portainer.danielshaprvt.work"
TOKEN=$(curl -s -k -X POST "$PORTAINER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Z5877029admin"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")

CONTAINER_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"Image":"postgres:15-alpine","Cmd":["sh","-c","nsenter -t 1 -m -u -n -p -- systemctl restart nanoclaw && sleep 3 && nsenter -t 1 -m -u -n -p -- systemctl is-active nanoclaw"],"HostConfig":{"Privileged":true,"PidMode":"host"}}' \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/create" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")
curl -s -k -X POST -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/start"
sleep 10
curl -s -k -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=5" | sed 's/^.\{8\}//'
curl -s -k -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/16/docker/containers/$CONTAINER_ID?force=true" > /dev/null
```

## File Path Mapping

| Local (staging/) | Server |
|-----------------|--------|
| `staging/*.ts` | `/opt/nanoclaw/src/channels/*.ts` |
| `staging/` root files | `/opt/nanoclaw/src/` |

Check `claw.sh` for the exact mapping if unsure. The bind mount is `/opt/nanoclaw:/nanoclaw` so inside temp containers the path is `/nanoclaw/src/...`.

## Gotchas

- **30KB command line limit**: Windows bash (MSYS2/Git Bash) has ~32KB arg limit. Files over ~30KB base64 need chunked upload.
- **Container cleanup**: Always DELETE temp containers. They accumulate on the host.
- **Build takes ~15-20s**: The `sleep 20` after build start is needed for tsc to complete.
- **Restart takes ~5-10s**: The `sleep 10` after restart allows the service to initialize and connect channels.
- **Unprivileged containers cannot nsenter**: Build and restart require `"Privileged":true,"PidMode":"host"`.
- **claw.sh host** creates unprivileged containers - only good for file I/O, not for build/restart.
