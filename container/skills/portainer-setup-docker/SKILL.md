# Portainer CE Setup with Docker Socket

## Purpose
Setting up Portainer CE to manage Docker containers on a Proxmox/Debian host, including Docker socket permissions, API-based automation, and Homepage dashboard integration.

## Credentials

All credentials are stored in `C:\Repo\hass-migration\.env`:

| Variable | Description |
|----------|-------------|
| `PORTAINER_USER` | Admin username |
| `PORTAINER_PASSWORD` | Admin password |
| `PORTAINER_API_KEY` | API key for external integrations (Homepage) |
| `PORTAINER_PORT` | HTTPS port (default: 9443) |
| `PORTAINER_ENV_ID` | Endpoint/environment ID |
| `PORTAINER_URL` | External URL via Cloudflare Tunnel |
| `PROXMOX_IP` | Host IP for direct access |

## Docker Compose Configuration

```yaml
portainer:
  image: portainer/portainer-ce:latest
  container_name: portainer
  restart: unless-stopped
  privileged: true  # REQUIRED for AppArmor environments (Proxmox/Debian)
  ports:
    - "${PORTAINER_PORT:-9443}:9443"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - portainer_data:/data

volumes:
  portainer_data:
```

## Initial Setup

### Browser-Based Setup
1. Access `https://<host-ip>:9443` within **5 minutes** of first container start
2. Create admin account with username and password
3. If the 5-minute window expires, restart: `docker compose restart portainer`

### CSRF Issue with Reverse Proxy
Browser-based setup **fails through Cloudflare Tunnel** due to CSRF token validation. Use either:
- Direct local IP: `https://192.168.68.200:9443`
- API-based setup (see below)

## API-Based Setup

Use this when browser setup is blocked (CSRF issues, headless environments).

### 1. Initialize Admin User (first-time only)

```bash
curl -sk -X POST https://localhost:9443/api/users/admin/init \
  -H 'Content-Type: application/json' \
  -d '{"username":"'$PORTAINER_USER'","password":"'$PORTAINER_PASSWORD'"}'
```

### 2. Authenticate and Get JWT Token

```bash
JWT=$(curl -sk -X POST https://localhost:9443/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"'$PORTAINER_USER'","password":"'$PORTAINER_PASSWORD'"}' \
  | jq -r '.jwt')
```

### 3. Create Docker Socket Endpoint

```bash
curl -sk -X POST https://localhost:9443/api/endpoints \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: multipart/form-data' \
  -F 'Name=Proxmox Host' \
  -F 'EndpointCreationType=1'
# EndpointCreationType=1 = Docker socket (/var/run/docker.sock)
# Response includes the endpoint ID (use as PORTAINER_ENV_ID)
```

### 4. Create API Key (for Homepage or other integrations)

```bash
curl -sk -X POST https://localhost:9443/api/users/1/tokens \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Homepage Dashboard","password":"'$PORTAINER_PASSWORD'"}'
# Response: {"rawAPIKey":"ptr_..."}
# Save this as PORTAINER_API_KEY in .env
```

### 5. List Containers

```bash
curl -sk https://localhost:9443/api/endpoints/$PORTAINER_ENV_ID/docker/containers/json \
  -H "Authorization: Bearer $JWT"
```

### 6. List Stacks

```bash
curl -sk https://localhost:9443/api/stacks \
  -H "X-API-Key: $PORTAINER_API_KEY"
```

## Docker Socket Permission Fix (AppArmor)

### Symptom
Portainer shows "Permission denied" accessing `/var/run/docker.sock` even when running as root.

### Root Cause
**AppArmor** (common on Proxmox/Debian) blocks container access to the Docker socket. This is NOT a filesystem permission issue.

### What Does NOT Work
- `chmod 666 /var/run/docker.sock` -- no effect, AppArmor overrides it
- Removing `:ro` from the volume mount -- irrelevant, same AppArmor block
- Adding the `docker` group to the container user -- AppArmor doesn't care

### Fix
Add `privileged: true` to the Portainer service in `docker-compose.yml`. This bypasses AppArmor restrictions.

```yaml
portainer:
  privileged: true
```

### Alternative (more restrictive)
If you don't want full privileged mode, add a specific AppArmor security option:
```yaml
portainer:
  security_opt:
    - apparmor:unconfined
```

## Homepage Dashboard Integration

```yaml
# In Homepage services.yaml
- Portainer:
    icon: portainer
    href: https://portainer.danielshaprvt.work
    description: Container Management
    widget:
      type: portainer
      url: https://192.168.68.200:9443
      env: 15  # PORTAINER_ENV_ID from endpoint creation
      key: ptr_xxxxx  # PORTAINER_API_KEY from token creation
```

## Troubleshooting

### "Your Portainer instance timed out for security purposes"
The 5-minute initial setup window expired.
**Fix**: `docker compose restart portainer` and access immediately.

### CSRF error during setup through Cloudflare Tunnel
Portainer validates the Origin header against its own URL, which mismatches through a reverse proxy.
**Fix**: Use the direct local IP or the API-based setup workflow above.

### "Permission denied" on Docker socket
AppArmor is blocking access.
**Fix**: Add `privileged: true` to the container configuration. See the Docker Socket Permission Fix section.

### API returns 401 Unauthorized
- JWT tokens expire. Re-authenticate to get a fresh token.
- API keys (`ptr_...`) do not expire but must be passed as `X-API-Key` header or `Authorization: Bearer` header.

### Endpoint shows 0 containers
- Verify the Docker socket is mounted correctly: `docker exec portainer ls -la /var/run/docker.sock`
- Check Portainer logs: `docker logs portainer`
- Ensure `EndpointCreationType=1` was used (socket, not agent).

### Cannot connect to Portainer after host reboot
- Check if Docker started: `systemctl status docker`
- Check if Portainer is running: `docker ps -a | grep portainer`
- Restart if needed: `docker compose -f /opt/homelab/docker-compose.yml up -d portainer`
