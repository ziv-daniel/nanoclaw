# Proxmox HAOS Migration Skill

## Purpose

Migrate Home Assistant OS from bare-metal (Raspberry Pi) to a Proxmox VE virtual machine, including VM creation, backup restore, SSL certificate provisioning, add-on recovery, and MariaDB configuration.

## Credentials

**All credentials are stored in `C:\Repo\hass-migration\.env`** - always load from there, never hardcode.

Key env vars:

| Variable | Description |
|----------|-------------|
| `PROXMOX_IP` | Proxmox host IP |
| `PROXMOX_PASSWORD` | Root password for Proxmox SSH |
| `PROXMOX_NODE` | Proxmox node name |
| `HAOS_VM_ID` | VM ID for the HAOS VM |
| `HAOS_VM_IP` | IP assigned to the HAOS VM |
| `HAOS_URL` | External URL (via Cloudflare Tunnel) |
| `HAOS_LOCAL_URL` | Local HTTPS URL |
| `HA_USERNAME` / `HA_PASSWORD` | HA login credentials |
| `MARIADB_USER` / `MARIADB_PASSWORD` / `MARIADB_DATABASE` | MariaDB inside HAOS |
| `PIE5_IP` | Separate Pi5 running Z2M |

---

## 1. VM Creation

Use the official HAOS qcow2 image with these settings:

| Setting | Value |
|---------|-------|
| BIOS | OVMF (UEFI) |
| Machine | q35 |
| SCSI Controller | VirtIO SCSI |
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 64 GB (expand after import) |
| Network | VirtIO (bridged) |
| Guest Agent | Enabled |

```bash
# Download HAOS qcow2 image on Proxmox host
wget https://github.com/home-assistant/operating-system/releases/download/<VERSION>/haos_ova-<VERSION>.qcow2.xz
xz -d haos_ova-<VERSION>.qcow2.xz

# Create VM
qm create $HAOS_VM_ID --name haos --memory 4096 --cores 4 --machine q35 --bios ovmf \
  --net0 virtio,bridge=vmbr0 --agent enabled=1 --ostype l26

# Add EFI disk and import qcow2
qm set $HAOS_VM_ID --efidisk0 local-lvm:1,format=raw,efitype=4m,pre-enrolled-keys=0
qm importdisk $HAOS_VM_ID haos_ova-<VERSION>.qcow2 local-lvm
qm set $HAOS_VM_ID --scsi0 local-lvm:vm-${HAOS_VM_ID}-disk-1
qm set $HAOS_VM_ID --boot order=scsi0
qm resize $HAOS_VM_ID scsi0 64G

# Start VM
qm start $HAOS_VM_ID
```

---

## 2. Command Execution Architecture

HAOS does not have SSH. All command execution goes through the QEMU Guest Agent.

### Execution layers (deepest nesting)

```
Python (local) --> paramiko SSH --> Proxmox host --> qm guest exec --> HAOS VM --> docker exec --> HA container
```

### Basic qm guest exec pattern

```bash
# Run a command inside the HAOS VM from the Proxmox host
qm guest exec $HAOS_VM_ID -- /bin/bash -c "cat /mnt/data/supervisor/homeassistant/configuration.yaml"
```

### Accessing the Supervisor API from inside the homeassistant container

```bash
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/core/api/config'"
```

**Important**: `$SUPERVISOR_TOKEN` is an env var inside the `homeassistant` container. Use `\$SUPERVISOR_TOKEN` (escaped) so it resolves inside the container, not on the Proxmox host.

### Python paramiko pattern

```python
import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(PROXMOX_IP, username='root', password=PROXMOX_PASSWORD)

def qm_exec(command: str) -> str:
    """Execute a command inside the HAOS VM via QEMU Guest Agent."""
    escaped = command.replace('"', '\\"')
    full_cmd = f'qm guest exec {HAOS_VM_ID} -- /bin/bash -c "{escaped}"'
    stdin, stdout, stderr = ssh.exec_command(full_cmd)
    output = stdout.read().decode()
    # qm guest exec returns JSON with out-data and err-data
    result = json.loads(output)
    return result.get('out-data', '')

def supervisor_api(endpoint: str, method: str = 'GET', data: dict = None) -> dict:
    """Call the HA Supervisor API from inside the homeassistant container."""
    curl_parts = ['curl -sSL']
    if method != 'GET':
        curl_parts.append(f'-X {method}')
    curl_parts.append('-H "Authorization: Bearer $SUPERVISOR_TOKEN"')
    curl_parts.append('-H "Content-Type: application/json"')
    if data:
        json_str = json.dumps(data).replace('"', '\\\\\\"')
        curl_parts.append(f"-d '{json.dumps(data)}'")
    curl_parts.append(f'http://supervisor{endpoint}')
    curl_cmd = ' '.join(curl_parts)

    outer_cmd = f"docker exec homeassistant bash -c '{curl_cmd}'"
    result = qm_exec(outer_cmd)
    return json.loads(result)
```

---

## 3. Backup Restore

1. Upload a HA backup `.tar` file to the HAOS VM
2. Use the Supervisor API to trigger a restore

```bash
# List existing backups
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/backups'"

# Restore a backup (full restore)
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -X POST -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" -H \"Content-Type: application/json\" -d \"{\\\"password\\\": \\\"BACKUP_PASSWORD\\\"}\" http://supervisor/backups/<slug>/restore/full'"
```

After restore, the VM will reboot. Wait several minutes for all services to come back up.

---

## 4. SSL Certificate Fix

After restoring a backup, `configuration.yaml` references SSL certs that do not exist on the new VM:

```yaml
http:
  ssl_certificate: /ssl/fullchain.pem
  ssl_key: /ssl/privkey.pem
```

These map to `/mnt/data/supervisor/ssl/` on the HAOS filesystem.

### Generate and inject self-signed certs

```bash
# On the Proxmox host: generate self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout /tmp/privkey.pem -out /tmp/fullchain.pem \
  -days 3650 -nodes -subj "/CN=homeassistant.local"

# Base64 encode (to pass through qm guest exec safely)
CERT_B64=$(base64 -w0 /tmp/fullchain.pem)
KEY_B64=$(base64 -w0 /tmp/privkey.pem)

# Write into the HAOS VM
qm guest exec $HAOS_VM_ID -- /bin/bash -c "echo '$CERT_B64' | base64 -d > /mnt/data/supervisor/ssl/fullchain.pem"
qm guest exec $HAOS_VM_ID -- /bin/bash -c "echo '$KEY_B64' | base64 -d > /mnt/data/supervisor/ssl/privkey.pem"
```

Then restart HA Core:

```bash
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -X POST -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/core/restart'"
```

---

## 5. MariaDB Configuration

You **cannot** edit `options.json` directly. Use the Supervisor API to update add-on options.

```bash
# Update MariaDB options via Supervisor API
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -X POST \
    -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" \
    -H \"Content-Type: application/json\" \
    -d \"{\\\"options\\\": {\\\"databases\\\": [\\\"homeassistant\\\"], \\\"logins\\\": [{\\\"username\\\": \\\"homeassistant\\\", \\\"password\\\": \\\"PASSWORD_HERE\\\"}], \\\"rights\\\": [{\\\"username\\\": \\\"homeassistant\\\", \\\"database\\\": \\\"homeassistant\\\"}]}}\" \
    http://supervisor/addons/core_mariadb/options'"
```

---

## 6. Add-on Management

### Start/stop add-ons via Supervisor API

```bash
# Start an add-on
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -X POST -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/addons/core_mariadb/start'"

# Stop an add-on
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -X POST -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/addons/core_mariadb/stop'"

# List all add-ons
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/addons'"
```

Common add-on slugs:
- `core_mariadb` - MariaDB
- `a0d7b954_nodered` - Node-RED
- `45df7312_zigbee2mqtt` - Zigbee2MQTT
- `core_mosquitto` - Mosquitto MQTT broker
- `core_samba` - Samba share
- `a0d7b954_ssh` - SSH add-on

---

## 7. Z2M Conflict Prevention

If Zigbee2MQTT runs on a **separate machine** (PIE5 at `$PIE5_IP`), the Z2M add-on inside HAOS must be stopped to avoid USB coordinator conflicts.

```bash
# Stop Z2M add-on in HAOS
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -X POST -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/addons/45df7312_zigbee2mqtt/stop'"
```

Also disable auto-start for the add-on if it should never run on this instance.

---

## 8. Troubleshooting

### Node-RED crash loops

Node-RED may enter s6-rc init failure loops after restore. The watchdog will automatically restart it multiple times. **Be patient** - it often self-resolves after 3-5 restart cycles (can take 5-10 minutes).

Check add-on logs:

```bash
qm guest exec $HAOS_VM_ID -- /bin/bash -c \
  "docker exec homeassistant bash -c 'curl -sSL -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/addons/a0d7b954_nodered/logs'"
```

### Guest Agent not responding

If `qm guest exec` fails with "QEMU guest agent is not running":
1. Wait 2-3 minutes after VM boot for HAOS to fully initialize
2. Verify the guest agent is enabled: `qm config $HAOS_VM_ID | grep agent`
3. Check VM status: `qm status $HAOS_VM_ID`

### HA not accessible after restore

1. Check if the homeassistant container is running:
   ```bash
   qm guest exec $HAOS_VM_ID -- /bin/bash -c "docker ps --filter name=homeassistant"
   ```
2. Check HA core logs:
   ```bash
   qm guest exec $HAOS_VM_ID -- /bin/bash -c \
     "docker exec homeassistant bash -c 'curl -sSL -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" http://supervisor/core/logs'"
   ```
3. Common cause: missing SSL certs (see section 4)

---

## 9. Key File Paths Inside HAOS VM

| Path | Description |
|------|-------------|
| `/mnt/data/supervisor/homeassistant/configuration.yaml` | Main HA config |
| `/mnt/data/supervisor/ssl/fullchain.pem` | SSL certificate |
| `/mnt/data/supervisor/ssl/privkey.pem` | SSL private key |
| `/mnt/data/supervisor/addons/data/{addon_slug}/options.json` | Add-on config (read-only, use API to modify) |
| `/mnt/data/supervisor/addons/data/core_mariadb/options.json` | MariaDB config |
| `/mnt/data/supervisor/backup/` | Backup storage |
| `/mnt/data/supervisor/share/` | Shared folder accessible by add-ons |

---

## 10. Post-Migration Checklist

- [ ] VM boots with UEFI and guest agent responds
- [ ] Backup restored successfully
- [ ] SSL certificates in place, HTTPS works
- [ ] MariaDB running with correct credentials
- [ ] `recorder` integration connects to MariaDB
- [ ] Node-RED add-on running (may need patience for crash loop recovery)
- [ ] Z2M add-on stopped (if Z2M runs on PIE5)
- [ ] Mosquitto MQTT broker running
- [ ] Cloudflare Tunnel updated to point to new HAOS VM IP
- [ ] All automations and scripts functional
- [ ] History and logbook data accessible
