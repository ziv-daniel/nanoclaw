---
name: portainer-persistent-toolbox-pattern
description: |
  Avoid Docker daemon overload when running many commands on a remote host via Portainer API.
  Use when: (1) you need to run 5+ commands on a remote Docker host without SSH,
  (2) claw.sh host or Portainer container-create is the only way to run commands,
  (3) Docker daemon becomes unresponsive after many temp container operations,
  (4) Portainer API returns empty responses or timeouts after sustained use.
  Replaces the temp-container-per-command antipattern with a persistent exec container.
author: Claude Code
version: 1.0.0
date: 2026-04-07
---

# Portainer Persistent Toolbox Pattern

## Problem

When SSH is unavailable and Portainer is the only way to run commands on a remote Docker host,
the common pattern is to create a temporary container for each command (create -> start -> read logs -> delete).
This works for occasional commands but **overwhelms the Docker daemon** under sustained use (20+ operations),
causing it to become unresponsive. Once Docker is stuck, Portainer itself becomes useless since it talks
to the same Docker daemon.

## Context / Trigger Conditions

- No SSH access to the Docker host (e.g., Dokploy LXC, managed VMs)
- Need to run multiple commands: file reads, installs, builds, restarts
- Using `claw.sh host` or Portainer's container create API as a shell replacement
- After 20-30 temp container operations, API calls start returning empty responses
- `curl` to Portainer Docker endpoints times out with 0 bytes received

## Solution

### Prevention: Use a persistent toolbox container

Deploy a long-running container with all necessary mounts:

```yaml
services:
  nc-toolbox:
    image: node:22-slim  # or alpine with curl/bash
    container_name: nc-toolbox
    restart: unless-stopped
    command: sleep infinity
    volumes:
      - /opt/nanoclaw:/nanoclaw
      - /var/run/docker.sock:/var/run/docker.sock
      - /run/dbus/system_bus_socket:/run/dbus/system_bus_socket
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then use Portainer's **exec** API for all commands:

```bash
# Create exec instance
EXEC_ID=$(curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"AttachStdout":true,"AttachStderr":true,"Cmd":["sh","-c","tail -20 /nanoclaw/logs/nanoclaw.log"]}' \
  "$PORTAINER_URL/api/endpoints/$ENDPOINT/docker/containers/$CONTAINER_ID/exec" | jq -r .Id)

# Run it
curl -s -k -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Detach":false,"Tty":true}' \
  "$PORTAINER_URL/api/endpoints/$ENDPOINT/docker/exec/$EXEC_ID/start"
```

### Prevention: Batch operations

Instead of one container per command, combine operations:

```bash
# BAD: 5 separate containers
bash claw.sh host "cat /file1"
bash claw.sh host "cat /file2"
bash claw.sh host "ls /dir"
bash claw.sh host "grep pattern /file3"
bash claw.sh host "echo done"

# GOOD: 1 container, 1 script
SCRIPT=$(base64 -w0 << 'EOF'
cat /file1; echo "==="; cat /file2; echo "==="; ls /dir; echo "==="; grep pattern /file3
EOF
)
bash claw.sh host "echo $SCRIPT | base64 -d | sh"
```

### Prevention: Use SSH when available

Check for `ssh_exec.py` or similar tools in the project repo FIRST:

```bash
# Much cheaper than Portainer temp containers
python3 tools/ssh_exec.py run "tail -20 /opt/nanoclaw/logs/nanoclaw.log"
```

### Recovery: When Docker daemon is stuck

If you've already overwhelmed the Docker daemon:

1. **Portainer won't help** — it talks to the same stuck Docker daemon
2. **SSH into the hypervisor** (Proxmox host) and restart the VM/LXC:
   ```bash
   pct reboot 101  # Note: "reboot" not "restart"
   ```
3. If no direct SSH, use a **jump host** (e.g., PIE5):
   ```bash
   ssh -i ~/.ssh/pi5_key admin@192.168.68.136 \
     "sshpass -p proxmox123 ssh root@192.168.68.200 'pct reboot 101'"
   ```

## Verification

- After deploying toolbox: `docker exec nc-toolbox echo OK` should respond instantly
- After recovery: Portainer container list API returns JSON within 5 seconds

## Notes

- The Proxmox `pct` command uses `reboot`, not `restart` (which doesn't exist)
- Always have a non-Docker recovery path documented (SSH to hypervisor)
- Docker daemon on LXC containers is more fragile than on full VMs — fewer resources
- Consider setting `--max-concurrent-downloads` and `--max-concurrent-uploads` in daemon.json
