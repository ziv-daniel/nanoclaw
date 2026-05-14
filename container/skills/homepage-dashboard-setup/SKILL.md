# Homepage Dashboard Setup (gethomepage.dev)

Configure the Homepage dashboard with live service widgets for homelab infrastructure.
Use when: (1) setting up Homepage dashboard, (2) adding or modifying service widgets,
(3) troubleshooting Homepage widget connectivity, (4) configuring Proxmox/Pi-hole/Portainer widgets.

## Credentials

Load from `C:\Repo\hass-migration\.env`:

| Variable | Purpose |
|----------|---------|
| `PROXMOX_IP` | Proxmox host IP |
| `PROXMOX_URL` | Proxmox local URL (https) |
| `PROXMOX_EXTERNAL_URL` | Proxmox CF tunnel URL |
| `PROXMOX_API_TOKEN_ID` | `root@pam!homepage` |
| `PROXMOX_API_TOKEN_SECRET` | API token secret for Homepage widget |
| `PROXMOX_NODE` | Node name (`proxmox`) |
| `PIHOLE_PORT` | Pi-hole port (8084) |
| `PIHOLE_URL` | Pi-hole CF tunnel URL |
| `PIHOLE_PASSWORD` | Pi-hole admin password (used as API key for v6) |
| `PORTAINER_PORT` | Portainer port (9443) |
| `PORTAINER_URL` | Portainer CF tunnel URL |
| `PORTAINER_API_KEY` | Portainer API key |
| `PORTAINER_ENV_ID` | Portainer endpoint ID (15) |
| `HOMEPAGE_PORT` | Homepage port (3000) |
| `HOMEPAGE_URL` | Homepage CF tunnel URL |
| `HOMEPAGE_CONFIG_PATH` | `/opt/homelab/homepage/config` |

## Config Files Location

All config files live at `/opt/homelab/homepage/config/` on the Proxmox host (mounted into the Homepage container).

## services.yaml - Working Configuration

```yaml
---
- Infrastructure:
    - Proxmox VE:
        icon: proxmox.png
        href: https://proxmox.danielshaprvt.work
        description: Hypervisor
        widget:
          type: proxmox
          url: https://192.168.68.200:8006
          username: root@pam!homepage
          password: <PROXMOX_API_TOKEN_SECRET>
          node: proxmox
    - Pi-hole:
        icon: pi-hole.png
        href: https://pihole.danielshaprvt.work
        description: DNS Ad Blocker
        widget:
          type: pihole
          url: http://192.168.68.200:8084
          version: 6  # CRITICAL: Pi-hole v6 uses different API
          key: <PIHOLE_PASSWORD>
    - Portainer:
        icon: portainer.png
        href: https://portainer.danielshaprvt.work
        description: Container Management
        widget:
          type: portainer
          url: https://192.168.68.200:9443
          env: 15  # endpoint ID
          key: <PORTAINER_API_KEY>

- Home Automation:
    - Home Assistant:
        icon: home-assistant.png
        href: https://home.danielshaprvt.work
        description: Smart Home
    - Node-RED:
        icon: node-red.png
        href: https://nodered.danielshaprvt.work
        description: Flow Automation
    - n8n:
        icon: n8n.png
        href: https://n8n-ui.danielshaprvt.work
        description: Workflow Automation

- Tools:
    - OpenSpeedTest:
        icon: openspeedtest.png
        href: https://speedtest.danielshaprvt.work
        description: Network Speed Test
    - Homepage:
        icon: homepage.png
        href: https://homepage.danielshaprvt.work
        description: This Dashboard
```

## widgets.yaml - Top Bar

```yaml
---
- resources:
    cpu: true
    memory: true
    label: Proxmox Host
    # NOTE: disk widget doesn't work in containers (systeminformation limitation)

- search:
    provider: google
    target: _blank

- datetime:
    text_size: xl
    format:
      dateStyle: long
      timeStyle: short
      hour12: false
```

## settings.yaml

```yaml
---
title: Homelab Dashboard
theme: dark
color: slate
headerStyle: clean
layout:
  Infrastructure:
    style: row
    columns: 3
  Home Automation:
    style: row
    columns: 3
  Tools:
    style: row
    columns: 2
```

## Proxmox API Token Setup

Create a dedicated API token with NO privilege separation:

```bash
# Create token
pvesh create /access/users/root@pam/token/homepage -output-format json
# Returns: {"full-tokenid":"root@pam!homepage","value":"<secret>"}

# CRITICAL: Disable privilege separation so it can read node stats
pvesh set /access/users/root@pam/token/homepage -privsep 0
```

The `username` field in the Homepage widget config is the token ID (`root@pam!homepage`), and `password` is the token secret value.

## Pi-hole v6 API Differences

Pi-hole v6 has a completely different API from v5:
- **Auth**: POST `/api/auth` with `{"password":"..."}` returns a `sid` session token
- **Stats**: GET `/api/stats/summary` with `sid: <token>` header
- **Homepage widget**: MUST set `version: 6` in config, and use `key` (the admin password) instead of `apiKey`

If the widget shows "API Error" or no data, verify:
1. `version: 6` is set
2. `key` contains the Pi-hole admin password (not an API token)
3. The URL uses `http://` (not https) on port 8084

## Key Gotchas

1. **Config caching**: After writing config files, restart the Homepage container:
   ```bash
   cd /opt/homelab && docker compose restart homepage
   ```
2. **HOMEPAGE_ALLOWED_HOSTS**: Must include both the Cloudflare tunnel hostname AND local IP in the environment config, otherwise requests will be rejected.
3. **Container recreate resets cache**: When `docker compose up -d --force-recreate` runs, the config volume persists but Homepage may cache old config. Always restart after changes.
4. **Disk widget limitation**: The resources widget's disk monitoring does NOT work in Alpine-based containers (systeminformation limitation). Use the Proxmox widget for storage info instead.
5. **Self-signed cert services**: Proxmox and Portainer widgets work with self-signed certs by default -- no extra config needed.
6. **Widget URLs must be internal**: Widget `url` fields must use internal IPs (e.g., `https://192.168.68.200:8006`), not Cloudflare tunnel URLs. The `href` field uses the external URL for browser navigation.

## Adding a New Service Widget

1. Check the Homepage docs for supported widget types: https://gethomepage.dev/widgets/services/
2. Add the service entry to the appropriate group in `services.yaml`
3. Use internal IP for `widget.url`, external URL for `href`
4. Store any new credentials in `C:\Repo\hass-migration\.env`
5. Restart Homepage: `docker compose restart homepage`
6. Verify the widget loads data (check browser console for API errors)

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Widget shows "API Error" | Wrong URL, bad credentials, or version mismatch | Check widget config values match .env |
| Pi-hole widget empty | Missing `version: 6` | Add `version: 6` to pihole widget config |
| Proxmox shows no data | Privilege separation enabled on token | Run `pvesh set /access/users/root@pam/token/homepage -privsep 0` |
| Dashboard returns 403 | `HOMEPAGE_ALLOWED_HOSTS` missing hostname | Add hostname to allowed hosts env var |
| Config changes not reflected | Homepage caching | `docker compose restart homepage` |
