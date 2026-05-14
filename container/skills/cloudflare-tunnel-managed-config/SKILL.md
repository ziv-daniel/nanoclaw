# Cloudflare Tunnel - Remotely Managed Configuration

## Overview

Manage Cloudflare Tunnel ingress rules via the Cloudflare API for tunnels using **remotely managed configuration** (dashboard/add-on managed, NOT local `config.yml`).

## Credentials

**Location**: `C:\Repo\hass-migration\.env`

Required variables:
- `CF_ACCOUNT_ID` - Cloudflare account ID
- `CF_TUNNEL_ID` - Tunnel UUID
- `CF_API_TOKEN` - API token (Bearer auth)
- `CF_DOMAIN` - Base domain (e.g., `danielshaprvt.work`)

Load credentials before any operation:
```bash
source <(grep -E '^CF_' 'C:\Repo\hass-migration\.env' | sed 's/\r//')
```

## Key Concept: Managed vs Local Config

| Aspect | Managed (Remote) | Local |
|--------|-------------------|-------|
| Config stored in | Cloudflare API | `/etc/cloudflared/config.yml` |
| Edited via | API / Dashboard | File on disk |
| Used by | HA Cloudflared add-on (default) | Manual cloudflared installs |
| Detection | No local config file; add-on uses `--token` flag | Config file exists on host |

**The HA Cloudflared add-on's `additional_hosts` in `options.json` only creates DNS CNAMEs. It does NOT update managed tunnel ingress rules. You must use the Cloudflare API directly.**

## API Operations

### 1. Get Current Tunnel Configuration

```bash
curl -s -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" | jq .
```

Save output before modifying (backup):
```bash
curl -s -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" > tunnel_config_backup_$(date +%Y%m%d_%H%M%S).json
```

### 2. Update Tunnel Configuration (PUT - Replaces Entire Config)

**WARNING**: PUT replaces the entire configuration. Always GET first, modify, then PUT.

```bash
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config":{"ingress":[...all rules including catch-all...]}}'
```

### 3. Ingress Rule Format

Standard rule:
```json
{
  "service": "http://192.168.68.200:3000",
  "hostname": "homepage.danielshaprvt.work"
}
```

Rule with TLS verification disabled (for self-signed certs like Proxmox, Portainer, HAOS):
```json
{
  "service": "https://192.168.68.200:8006",
  "hostname": "proxmox.danielshaprvt.work",
  "originRequest": { "noTLSVerify": true }
}
```

**Catch-all rule (MUST be last)**:
```json
{
  "service": "http_status:404"
}
```

### 4. Add DNS CNAME Record

After adding an ingress rule, ensure a DNS CNAME exists pointing the hostname to the tunnel:
```bash
cloudflared tunnel route dns <TUNNEL_NAME_OR_ID> <HOSTNAME>
```

Or via API:
```bash
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"subdomain","content":"<TUNNEL_ID>.cfargotunnel.com","proxied":true}'
```

## Workflow: Add a New Ingress Rule

1. **Load credentials**:
   ```bash
   source <(grep -E '^CF_' 'C:\Repo\hass-migration\.env' | sed 's/\r//')
   ```

2. **Backup current config**:
   ```bash
   CURRENT=$(curl -s -X GET \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json")
   echo "$CURRENT" > tunnel_config_backup_$(date +%Y%m%d_%H%M%S).json
   ```

3. **Extract current ingress rules**:
   ```bash
   echo "$CURRENT" | jq '.result.config.ingress'
   ```

4. **Build new config** - Add new rule BEFORE the catch-all:
   ```bash
   # Use jq to insert new rule before the last (catch-all) entry
   NEW_INGRESS=$(echo "$CURRENT" | jq '.result.config.ingress | .[:-1] + [{"service":"http://192.168.68.200:NEW_PORT","hostname":"newservice.'$CF_DOMAIN'"}] + [.[-1]]')
   ```

5. **PUT updated config**:
   ```bash
   curl -s -X PUT \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"config\":{\"ingress\":$NEW_INGRESS}}" | jq .
   ```

6. **Add DNS record** (if not already present from HA add-on).

7. **Verify** (see Verification section below).

## Workflow: Remove an Ingress Rule

1. Load credentials and backup (same as above).
2. Filter out the rule:
   ```bash
   NEW_INGRESS=$(echo "$CURRENT" | jq '[.result.config.ingress[] | select(.hostname != "toremove.'$CF_DOMAIN'")]')
   ```
3. PUT updated config.

## Known Hosts in This Setup

| Hostname | Service | TLS Verify |
|----------|---------|------------|
| `home.danielshaprvt.work` | `https://192.168.68.121:8123` | `noTLSVerify: true` |
| `proxmox.danielshaprvt.work` | `https://192.168.68.200:8006` | `noTLSVerify: true` |
| `homepage.danielshaprvt.work` | `http://192.168.68.200:3000` | N/A |
| `portainer.danielshaprvt.work` | `https://192.168.68.200:9443` | `noTLSVerify: true` |
| `pihole.danielshaprvt.work` | `http://192.168.68.200:8084` | N/A |
| `speedtest.danielshaprvt.work` | `http://192.168.68.200:3080` | N/A |
| `nodered.danielshaprvt.work` | `https://a0d7b954-nodered:1880` | N/A |

## Extracting API Token from cert.pem (HA Add-on)

If you need to find the API token from the HA Cloudflared add-on:

```bash
# SSH into HAOS, then:
cat /mnt/data/supervisor/addons/data/9074a9fa_cloudflared/cert.pem
# Find the section between:
#   -----BEGIN ARGO TUNNEL TOKEN-----
#   <base64 data>
#   -----END ARGO TUNNEL TOKEN-----
# Decode the base64:
echo "<base64_data>" | base64 -d
# Returns JSON: {"AccountTag":"...","TunnelSecret":"...","APIToken":"..."}
```

## Verification

After any configuration change:

1. **Verify API response** shows `"success": true`.

2. **Check updated config**:
   ```bash
   curl -s -X GET \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" | jq '.result.config.ingress'
   ```

3. **Test the endpoint** (allow 30-60 seconds for propagation):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://newservice.danielshaprvt.work
   ```

4. **Check tunnel health** in Cloudflare Dashboard > Zero Trust > Networks > Tunnels.

## Troubleshooting

- **502 Bad Gateway**: The origin service is down or unreachable from cloudflared. Check the service is running and the IP/port is correct.
- **No TLS verification errors**: Add `"originRequest": {"noTLSVerify": true}` for self-signed certs.
- **Catch-all missing**: If you get API errors on PUT, ensure the last ingress rule is `{"service": "http_status:404"}` with no hostname.
- **Config not applying**: Managed config changes apply immediately; if not working, restart the cloudflared add-on in HA.
- **DNS not resolving**: Verify the CNAME record exists in Cloudflare DNS pointing to `<TUNNEL_ID>.cfargotunnel.com`.
