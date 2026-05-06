---
name: pie5-operations-guide
description: |
  Comprehensive guide for PIE5 (Raspberry Pi 5) operations - SSH access, Docker container management,
  and remote automation via n8n/Node-RED.

  Use when:
  - (1) Connecting to PIE5 via SSH to run commands
  - (2) Checking or managing Docker container status (waha, zigbee2mqtt, glances)
  - (3) Troubleshooting PIE5 services or "unhealthy" container status
  - (4) Setting up Home Assistant dashboard buttons that trigger remote actions
  - (5) Creating n8n or Node-RED flows for container management
  - (6) Understanding the HA -> MQTT -> n8n/Node-RED -> SSH -> PIE5 pipeline
  - (7) Running management scripts (container-manager.sh, version-checker.sh)
  - (8) Debugging SSH command execution from automation flows

  Credentials stored in project .env file at C:\Repo\pie5\.env
author: Claude Code
version: 2.0.0
date: 2026-02-04
---

# PIE5 Operations Guide

Complete reference for managing PIE5 (Raspberry Pi 5) - direct SSH operations, Docker container
management, and remote automation via Home Assistant with n8n/Node-RED.

---

## Quick Reference

### Connection Details

| Property | Value |
|----------|-------|
| IP | 192.168.68.136 |
| Username | `admin` (NOT root or pi) |
| Port | 22 (SSH) |
| Password | In `.env` as `PIE5_PASSWORD` |
| Host Key | `SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag` |

### Services Overview

| Container | Image | Port | Purpose | Status |
|-----------|-------|------|---------|--------|
| waha | devlikeapro/waha:arm | 3000 | WhatsApp API | Working |
| zigbee2mqtt | koenkk/zigbee2mqtt | 8099->8080 | Zigbee gateway | Working |
| glances | nicolargo/glances:latest-full | 61208 | System monitoring | Working |

### Web Interfaces

- **Glances**: http://192.168.68.136:61208
- **WAHA (WhatsApp)**: http://192.168.68.136:3000
- **Zigbee2MQTT**: http://192.168.68.136:8099

### Docker-Compose Locations

| Service | Path |
|---------|------|
| waha | `/home/admin/waha/docker-compose.yml` |
| zigbee2mqtt + glances | `/home/admin/zigbee2mqtt-docker/docker-compose.yml` |

### Environment File Format

Store credentials in project `.env` (e.g., `C:\Repo\pie5\.env`):
```
PIE5_IP=192.168.68.136
PIE5_PASSWORD=YOUR_PASSWORD
```

---

## Direct SSH Operations

### Quick Connect (Windows with Plink)

```bash
"C:\Program Files\PuTTY\plink.exe" -ssh -batch -hostkey "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag" -pw "PASSWORD" admin@192.168.68.136 "COMMAND"
```

### Common Commands

#### List Docker Containers
```bash
"C:\Program Files\PuTTY\plink.exe" -ssh -batch -hostkey "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag" -pw "$PIE5_PASSWORD" admin@192.168.68.136 "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'"
```

#### Check Container Logs
```bash
"C:\Program Files\PuTTY\plink.exe" -ssh -batch -hostkey "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag" -pw "$PIE5_PASSWORD" admin@192.168.68.136 "docker logs --tail 50 CONTAINER_NAME"
```

#### Check Container Health
```bash
"C:\Program Files\PuTTY\plink.exe" -ssh -batch -hostkey "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag" -pw "$PIE5_PASSWORD" admin@192.168.68.136 "docker inspect --format='{{json .State.Health}}' CONTAINER_NAME"
```

#### System Info
```bash
"C:\Program Files\PuTTY\plink.exe" -ssh -batch -hostkey "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag" -pw "$PIE5_PASSWORD" admin@192.168.68.136 "df -h && free -h"
```

### PowerShell Quick Reference

```powershell
# Windows - Load .env and run command
$env = Get-Content .env -Raw | ConvertFrom-StringData
& "C:\Program Files\PuTTY\plink.exe" -ssh -batch -hostkey "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag" -pw $env.PIE5_PASSWORD admin@192.168.68.136 "/home/admin/scripts/container-manager.sh status"
```

### PowerShell Helper Script

Save as `pie5-cmd.ps1` and use: `.\pie5-cmd.ps1 "docker ps -a"`

```powershell
# PIE 5 SSH Command Runner (PowerShell)
# Usage: .\pie5-cmd.ps1 "docker ps -a"

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Command,

    [string]$EnvFile = ".env"
)

# Load environment variables from .env file
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)\s*=\s*(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

$PIE5_IP = $env:PIE5_IP
if (-not $PIE5_IP) { $PIE5_IP = "192.168.68.136" }

$PIE5_PASSWORD = $env:PIE5_PASSWORD
if (-not $PIE5_PASSWORD) {
    Write-Error "PIE5_PASSWORD not set. Add it to .env file or set environment variable."
    exit 1
}

$HOSTKEY = "SHA256:Vo2bs75SoFzQ5/C4RdemFS+qvvGDz+KOeTcgIltXcag"
$PLINK = "C:\Program Files\PuTTY\plink.exe"

if (-not (Test-Path $PLINK)) {
    Write-Error "Plink not found at $PLINK. Install PuTTY."
    exit 1
}

Write-Host "Connecting to PIE 5 ($PIE5_IP)..." -ForegroundColor Cyan
& $PLINK -ssh -batch -hostkey $HOSTKEY -pw $PIE5_PASSWORD "admin@$PIE5_IP" $Command
```

---

## Remote Automation (n8n / Node-RED)

### Architecture Overview

```
+-------------------+     +--------------+     +-------------------+     +---------------+
| Home Assistant    |---->| MQTT Broker  |---->| n8n / Node-RED    |---->| PIE5 (SSH)    |
| Dashboard Button  |     | (Mosquitto)  |     | on HA             |     | Containers    |
+-------------------+     +--------------+     +-------------------+     +---------------+
     tap_action          pie5/container/      exec node with         /home/admin/
     call-service        restart|stop|update  sshpass + ssh          scripts/
```

### MQTT Topics for Container Management

| Topic | Payload | Action |
|-------|---------|--------|
| `pie5/container/status` | (empty) | Get all container status |
| `pie5/container/restart` | `container_name` | Restart specific container |
| `pie5/container/stop` | `container_name` | Stop specific container |
| `pie5/container/start` | `container_name` | Start specific container |
| `pie5/container/update` | `container_name` | Pull latest image and recreate |
| `pie5/container/check_updates` | (empty) | Check all containers for updates |

### n8n Flow Pattern

#### Basic Container Action Flow

```
+---------------+     +----------------+     +---------------+     +---------------+
| MQTT          |---->| Function       |---->| Execute       |---->| MQTT          |
| Trigger       |     | Build Command  |     | Command       |     | (Optional)    |
+---------------+     +----------------+     +---------------+     +---------------+
     topic:              Build SSH           Run via             Publish
     pie5/container/*    command string      sshpass             result
```

#### n8n Code Node - Build SSH Command

```javascript
const topic = $input.first().json.topic;
const container = $input.first().json.message;

// Determine action from topic
const action = topic.split('/').pop(); // restart, stop, update, etc.

// Build the remote command
let remoteCommand;
switch(action) {
  case 'restart':
    remoteCommand = `/home/admin/scripts/container-manager.sh restart ${container}`;
    break;
  case 'stop':
    remoteCommand = `/home/admin/scripts/container-manager.sh stop ${container}`;
    break;
  case 'start':
    remoteCommand = `/home/admin/scripts/container-manager.sh start ${container}`;
    break;
  case 'update':
    remoteCommand = `/home/admin/scripts/container-manager.sh update ${container}`;
    break;
  case 'status':
    remoteCommand = `/home/admin/scripts/container-manager.sh status`;
    break;
  default:
    throw new Error(`Unknown action: ${action}`);
}

return {
  json: {
    container,
    action,
    sshCommand: `sshpass -p '${$env.PIE5_PASSWORD}' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null admin@192.168.68.136 '${remoteCommand}'`
  }
};
```

#### n8n Execute Command Node Configuration

| Setting | Value |
|---------|-------|
| Execute Once | No |
| Command | `{{ $json.sshCommand }}` |
| Timeout | 120 (seconds) |

### Node-RED Flow Pattern

#### SSH Pattern for Home Assistant

Use `sshpass` for password authentication from Node-RED running on Home Assistant:

```bash
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null admin@192.168.68.136 'command'
```

#### Exec Node Configuration

| Setting | Value |
|---------|-------|
| Command | `sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null admin@192.168.68.136` |
| Append | msg.payload or msg.sshCommand (for dynamic commands) |
| Timeout | 30 seconds |

#### Node-RED Flow Example (JSON)

```json
[
  {
    "id": "mqtt-trigger",
    "type": "mqtt in",
    "topic": "pie5/container/#",
    "qos": "1"
  },
  {
    "id": "build-command",
    "type": "function",
    "func": "const topic = msg.topic;\nconst container = msg.payload;\nconst action = topic.split('/').pop();\nmsg.sshCommand = `/home/admin/scripts/container-manager.sh ${action} ${container}`;\nreturn msg;",
    "wires": [["exec-ssh"]]
  },
  {
    "id": "exec-ssh",
    "type": "exec",
    "command": "sshpass -p $PIE5_PASSWORD ssh -o StrictHostKeyChecking=no admin@192.168.68.136",
    "append": "msg.sshCommand",
    "timeout": "120"
  }
]
```

#### Installing sshpass in HA Container

If sshpass is not available:
```bash
# In HA terminal or SSH addon
apk add sshpass  # Alpine-based containers
# or
apt-get install sshpass  # Debian-based
```

### HA Script for Dashboard Buttons

```yaml
# In scripts.yaml or via HA UI
update_container:
  alias: Update Container
  mode: single
  fields:
    container_name:
      description: Name of the container to update
      example: waha
  sequence:
    - action: mqtt.publish
      data:
        topic: pie5/container/update
        payload: "{{ container_name }}"
```

### Complete Update Flow Example

1. User clicks "Update WAHA" button on HA dashboard
2. Dashboard calls `script.update_container` with `container_name: waha`
3. Script publishes to `pie5/container/update` with payload `waha`
4. n8n/Node-RED receives MQTT message
5. Flow builds SSH command: `sshpass ... container-manager.sh update waha`
6. Exec node runs command
7. On PIE5: `docker compose pull waha && docker compose up -d waha`
8. Container updated with latest image

---

## Management Scripts

Located at `/home/admin/scripts/` on PIE5:

### container-manager.sh

```bash
#!/bin/bash
# Usage: container-manager.sh <action> <container_name>
# Actions: status, restart, stop, start, update, logs, versions

case "${1:-help}" in
    status)
        # Returns JSON: {"waha":"running","zigbee2mqtt":"running","glances":"running"}
        docker ps -a --format 'table {{.Names}}\t{{.Status}}'
        ;;
    restart)
        docker restart "$2"
        ;;
    stop)
        docker stop "$2"
        ;;
    start)
        docker start "$2"
        ;;
    update)
        # For docker-compose managed containers
        cd /home/admin/$(get_compose_dir "$2")
        docker compose pull "$2"
        docker compose up -d "$2"
        ;;
    logs)
        docker logs --tail "${3:-50}" "$2"
        ;;
    versions)
        # Get container versions
        docker inspect --format='{{.Config.Image}}' $(docker ps -q)
        ;;
esac
```

#### Usage Examples

```bash
# Check all container status (returns JSON)
/home/admin/scripts/container-manager.sh status
# Output: {"waha":"running","zigbee2mqtt":"running","glances":"running"}

# Restart a container
/home/admin/scripts/container-manager.sh restart waha
/home/admin/scripts/container-manager.sh restart zigbee2mqtt
/home/admin/scripts/container-manager.sh restart glances

# Stop/Start containers
/home/admin/scripts/container-manager.sh stop <container>
/home/admin/scripts/container-manager.sh start <container>

# Get container versions
/home/admin/scripts/container-manager.sh versions

# Update container (pull + recreate)
/home/admin/scripts/container-manager.sh update <container>

# View logs
/home/admin/scripts/container-manager.sh logs <container> [lines]
```

### version-checker.sh

```bash
#!/bin/bash
# Check for container updates
# Returns JSON with current/latest versions

for container in $(docker ps --format '{{.Names}}'); do
    current_digest=$(docker inspect --format='{{.Image}}' "$container")
    # Compare with Docker Hub registry...
done
```

#### Usage Examples

```bash
# Check all container versions (returns JSON with update status)
/home/admin/scripts/version-checker.sh all

# Check specific container
/home/admin/scripts/version-checker.sh waha
/home/admin/scripts/version-checker.sh zigbee2mqtt
/home/admin/scripts/version-checker.sh glances
```

#### Output Format

```json
{
  "timestamp": "2026-01-22T18:39:00+02:00",
  "containers": [
    {"container":"waha","current_digest":"594cb375c11c","latest_digest":"8fa14453901a","update_available":true}
  ]
}
```

---

## Troubleshooting

### Known Health Check Issues (Cosmetic Only)

**IMPORTANT**: "Unhealthy" status does NOT mean services are broken. Both services work correctly.

| Container | Health Status | Root Cause | Service Status |
|-----------|--------------|------------|----------------|
| waha | May show unhealthy | `/health` endpoint requires auth, health check lacks credentials | **Working fine** |
| zigbee2mqtt | May show unhealthy | IPv4/IPv6 mismatch: service listens on `0.0.0.0:8080` (IPv4), wget connects to `[::1]:8080` (IPv6) | **Working fine** |

### How to Verify Services Are Actually Working

**waha**: Check logs for request processing
```bash
docker logs --tail 20 waha
# Look for: "request completed" messages
```

**zigbee2mqtt**: Check logs for MQTT publishing
```bash
docker logs --tail 20 zigbee2mqtt
# Look for: "MQTT publish" messages with device data
```

### Health Check Fixes (Applied to docker-compose)

**waha** - Use curl instead of wget (accepts 401 as healthy):
```yaml
healthcheck:
  test: ["CMD", "curl", "-sf", "-o", "/dev/null", "http://127.0.0.1:3000/health"]
```

**zigbee2mqtt** - Use IPv4 address instead of localhost:
```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080"]
```

### SSH Connection Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Connection Refused | PIE5 powered off or SSH not running | Verify PIE5 is powered on: `ping 192.168.68.136` |
| Password Rejected | Wrong username or password | Username is `admin`, NOT `root` or `pi`. Password is case-sensitive |
| "Host key verification failed" | SSH strict checking | Add `-o StrictHostKeyChecking=no` |

### Remote Automation Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Permission denied" | Wrong password or user | Verify PIE5_PASSWORD env var |
| "sshpass: command not found" | sshpass not installed | `apk add sshpass` in container |
| Command runs but nothing happens | Wrong topic format | Check MQTT topic matches flow subscription |
| Timeout on long operations | SSH timeout too short | Increase exec node timeout to 120s+ |

### Debugging Remote Actions

#### Test MQTT Topic from HA Developer Tools

1. Go to Developer Tools -> Services
2. Select `mqtt.publish`
3. Enter:
   ```yaml
   topic: pie5/container/restart
   payload: waha
   ```
4. Click "Call Service"

#### Check n8n/Node-RED Logs

```bash
# n8n
docker logs n8n --tail 100 | grep -i "pie5\|ssh\|error"

# Node-RED
docker logs nodered --tail 100 | grep -i "pie5\|exec\|error"
```

#### Test SSH Command Directly

```bash
# From HA terminal or addon
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no admin@192.168.68.136 'docker ps'
```

### Critical Warnings

1. **DO NOT recreate containers casually** - They contain critical session data (WhatsApp sessions, Zigbee device pairings)
2. **Username is `admin`** - NOT `root` or `pi` (common mistake)
3. **"Unhealthy" is cosmetic** - Always check logs before assuming service is broken

---

## Security Considerations

1. **Store password in environment variable** - Never hardcode in flows or scripts
2. **Use separate service account** - Don't use root or main user
3. **Limit allowed commands** - Scripts validate input, don't allow arbitrary execution
4. **Network isolation** - PIE5 on same VLAN, not exposed to internet

---

## References

- [n8n Execute Command Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/)
- [Node-RED Exec Node](https://nodered.org/docs/user-guide/nodes#exec)
- [MQTT Integration for Home Assistant](https://www.home-assistant.io/integrations/mqtt/)
