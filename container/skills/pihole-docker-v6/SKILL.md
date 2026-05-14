# Pi-hole v6 Docker with Permission Fixes

## Overview

Running Pi-hole v6 (latest) in Docker on Proxmox/Debian hosts, with solutions for FTL permission issues and the new v6 REST API.

## Credentials

**Source**: `C:\Repo\hass-migration\.env`

| Variable | Description |
|----------|-------------|
| `PIHOLE_PASSWORD` | Pi-hole web admin / API password |
| `PIHOLE_PORT` | Web UI port (default: 8084) |
| `PIHOLE_URL` | Cloudflare Tunnel URL |

Host IP: `192.168.68.200` (Proxmox host running Docker)

## Docker Compose Configuration

```yaml
pihole:
  image: pihole/pihole:latest
  container_name: pihole
  privileged: true  # Required for FTL group permission fix
  ports:
    - "53:53/tcp"
    - "53:53/udp"
    - "${PIHOLE_PORT:-8084}:80/tcp"  # Web UI on custom port
  environment:
    - TZ=Asia/Jerusalem
    - FTLCONF_webserver_api_password=${PIHOLE_PASSWORD}
    - DNSMASQ_USER=root  # Prevents permission issues
  cap_add:
    - NET_ADMIN
  volumes:
    - /opt/homelab/pihole/etc:/etc/pihole
    - /opt/homelab/pihole/dnsmasq:/etc/dnsmasq.d
  restart: unless-stopped
```

**Compose file location**: `/opt/homelab/docker-compose.yml` on the Proxmox host.

## Permission Fix (Critical)

### Problem

Pi-hole v6 (latest) throws on startup:

```
Unable to get group list for user: Permission denied
```

This occurs when pihole-FTL starts and cannot read system group info inside the container.

### Solution

Both of these are required together:

1. `privileged: true` in the Docker Compose service
2. `DNSMASQ_USER=root` as an environment variable

`cap_add: NET_ADMIN` alone is **NOT** enough to fix this.

## Pi-hole v6 API

v6 uses a completely different REST API from v5. The old `/admin/api.php` endpoints do not exist.

### Authentication

```bash
# POST to /api/auth to get a session ID
curl -s http://192.168.68.200:${PIHOLE_PORT}/api/auth -X POST \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"${PIHOLE_PASSWORD}\"}"

# Response:
# {"session":{"valid":true,"sid":"<SESSION_ID>","csrf":"<CSRF_TOKEN>"}}
```

### Get Stats

```bash
# Use the session ID from authentication
curl -s http://192.168.68.200:${PIHOLE_PORT}/api/stats/summary \
  -H "sid: ${SID}"

# Response:
# {"queries":{"total":0,"blocked":0,"percent_blocked":0,...},...}
```

### Endpoints That Do NOT Work in v6

| Attempted Endpoint | Result |
|---|---|
| `/admin/api.php?summary` | Does not exist (v5 only) |
| `/api/info` | Returns `"not_found"` |

## Homepage Dashboard Widget

When integrating with Homepage dashboard, you **must** specify `version: 6`:

```yaml
# In Homepage services.yaml
- Pi-hole:
    widget:
      type: pihole
      url: http://192.168.68.200:8084
      version: 6  # CRITICAL - without this, Homepage uses v5 API and fails
      key: ${PIHOLE_PASSWORD}
```

## Access URLs

| Access Method | URL |
|---|---|
| Local (LAN) | `http://192.168.68.200:8084/admin/` |
| Cloudflare Tunnel | `https://pihole.danielshaprvt.work` |

## Verification Steps

### 1. Check container is running

```bash
ssh root@192.168.68.200 "docker ps --filter name=pihole --format '{{.Status}}'"
```

### 2. Check for permission errors in logs

```bash
ssh root@192.168.68.200 "docker logs pihole 2>&1 | grep -i 'permission'"
# Should return nothing if the fix is applied correctly
```

### 3. Verify FTL is running inside container

```bash
ssh root@192.168.68.200 "docker exec pihole pihole-FTL --version"
```

### 4. Test API authentication

```bash
SID=$(curl -s http://192.168.68.200:8084/api/auth -X POST \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"${PIHOLE_PASSWORD}\"}" | jq -r '.session.sid')

echo "Session valid: $([ -n \"$SID\" ] && echo 'yes' || echo 'no')"
```

### 5. Test DNS resolution through Pi-hole

```bash
dig @192.168.68.200 google.com +short
# Should return IP addresses
```

### 6. Check gravity database

```bash
ssh root@192.168.68.200 "docker exec pihole pihole -g -l"
# Gravity has ~81K entries by default
```

### 7. Verify Homepage widget

Check the Homepage dashboard at `https://homepage.danielshaprvt.work` -- the Pi-hole widget should show query stats (will be 0 until devices point DNS to Pi-hole).

## Notes

- Pi-hole DNS queries will be 0 until you configure devices/router to use `192.168.68.200` as their DNS server
- Gravity database ships with ~81K blocked domains by default
- The web admin panel is at `/admin/` (trailing slash matters for some browsers)
- Pi-hole container runs on the Proxmox host directly, not inside a VM
