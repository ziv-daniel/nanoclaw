---
name: portainer-nsenter-host-operations
description: |
  Run host-level commands (systemctl, npm build, apt) from Portainer API when SSH is unavailable.
  Use when: (1) nsenter fails with "can't reassociate to namespace 'ipc': Operation not permitted",
  (2) need to restart systemd services via Portainer, (3) need to run build tools (node, npm, tsc)
  that exist on the host but not in temp containers, (4) claw.sh restart/build commands fail.
  Requires creating privileged containers with PidMode:host via Portainer API.
author: Claude Code
version: 1.0.0
date: 2026-04-03
---

# Portainer: nsenter Host Operations from API

## Problem

When managing servers exclusively through Portainer API (no SSH), you need to run host-level
commands like `systemctl restart`, `npm run build`, or `apt install`. The standard approach
of creating a temp container and using `nsenter -t 1` fails with permission errors because
Portainer creates unprivileged containers by default.

## Context / Trigger Conditions

- `nsenter: setns(): can't reassociate to namespace 'ipc': Operation not permitted`
- Need to access host's systemd, package manager, or installed runtimes (node, npm)
- SSH is unavailable (tunnel down, firewall, not configured)
- Service runs as systemd on the host, not as a Docker container
- Build tools (tsc, npm, cargo) exist on host but not in utility containers

## Solution

Create a **privileged container** with **host PID namespace** access via Portainer API:

```bash
# 1. Get auth token
TOKEN=$(curl -s -k -X POST "$PORTAINER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d '{"username":"USER","password":"PASS"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")

# 2. Create privileged container with PidMode:host
CONTAINER_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Image": "postgres:15-alpine",
    "Cmd": ["sh", "-c", "nsenter -t 1 -m -u -n -p -- sh -c \"YOUR_COMMAND_HERE\""],
    "HostConfig": {
      "Privileged": true,
      "PidMode": "host",
      "Binds": ["/opt/myapp:/myapp"]
    }
  }' \
  "$PORTAINER_URL/api/endpoints/$ENDPOINT_ID/docker/containers/create" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")

# 3. Start container
curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/$ENDPOINT_ID/docker/containers/$CONTAINER_ID/start"

# 4. Wait for completion (adjust based on command)
sleep 10

# 5. Get output (strip 8-byte Docker log frame headers)
curl -s -k \
  -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/$ENDPOINT_ID/docker/containers/$CONTAINER_ID/logs?stdout=true&stderr=true&tail=50" | \
  sed 's/^.\{8\}//'

# 6. ALWAYS cleanup temp container
curl -s -k -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$PORTAINER_URL/api/endpoints/$ENDPOINT_ID/docker/containers/$CONTAINER_ID?force=true" > /dev/null
```

### Key HostConfig flags

| Flag | Purpose | Required? |
|------|---------|-----------|
| `Privileged: true` | Grants all capabilities, disables seccomp/AppArmor | Yes |
| `PidMode: "host"` | Shares host PID namespace so `nsenter -t 1` can reach PID 1 | Yes |
| `Binds` | Mount host paths for file access | Optional |

### Common commands via nsenter

```bash
# Restart a systemd service
nsenter -t 1 -m -u -n -p -- systemctl restart myservice

# Build a Node.js project
nsenter -t 1 -m -u -n -p -- sh -c "cd /opt/myapp && npx tsc 2>&1"

# Check service status and recent logs
nsenter -t 1 -m -u -n -p -- sh -c "systemctl is-active myservice && tail -30 /var/log/myservice.log"
```

## Verification

After running the command:
1. Check the container logs output for expected result (e.g., "BUILD_EXIT: 0", "RESTARTED")
2. For service restarts: run another container to verify with `systemctl is-active`
3. For builds: check that dist/ files were updated

## Notes

- The container image doesn't matter much — `postgres:15-alpine` or `alpine:latest` work fine since nsenter runs on the host
- `nsenter -t 1 -m -u -n -p` enters ALL namespaces of PID 1 (the host init process)
- Drop `-i` (IPC namespace) if you get IPC-specific permission errors
- Sleep duration depends on the command — 5s for systemctl, 15s+ for builds
- Always delete temp containers to prevent accumulation
- Log output has 8-byte binary frame headers from Docker — `sed 's/^.\{8\}//'` strips them
- Shell escaping is tricky through 3+ layers (local shell -> curl JSON -> container sh -> nsenter -> host sh). Use base64 for complex commands.

## References

- [Docker API: Create Container](https://docs.docker.com/engine/api/v1.45/#tag/Container/operation/ContainerCreate)
- [Portainer API: Container endpoints](https://app.swaggerhub.com/apis/portainer/portainer-ce)
- [nsenter man page](https://man7.org/linux/man-pages/man1/nsenter.1.html)
