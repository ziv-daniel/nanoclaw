# Homelab Docker Services on Proxmox VE

## Overview

Docker containers running directly on the Proxmox VE host (not inside VMs or LXCs). These services run alongside Proxmox's VM/LXC management on the same Debian Trixie machine.

## Credentials

All credentials are stored in `C:\Repo\hass-migration\.env`. Key variables:

| Variable | Purpose |
|----------|---------|
| `PROXMOX_IP` | Proxmox host IP (local network) |
| `PROXMOX_USER` / `PROXMOX_PASSWORD` | SSH access to Proxmox host |
| `PROXMOX_API_TOKEN_ID` / `PROXMOX_API_TOKEN_SECRET` | Proxmox API token (used by Homepage) |
| `PORTAINER_USER` / `PORTAINER_PASSWORD` / `PORTAINER_API_KEY` | Portainer admin credentials |
| `PIHOLE_PASSWORD` | Pi-hole web UI password |
| `HOMEPAGE_URL` / `PORTAINER_URL` / `PIHOLE_URL` / `OPENSPEEDTEST_URL` | Cloudflare tunnel URLs |

## Architecture

```
Proxmox VE Host (192.168.68.200)
├── Proxmox hypervisor (manages VMs/LXCs)
├── Docker CE (installed from official Docker repo)
│   ├── Homepage        :3000  -> homepage.danielshaprvt.work
│   ├── OpenSpeedTest   :3080  -> speedtest.danielshaprvt.work
│   ├── Portainer       :9443  -> portainer.danielshaprvt.work
│   └── Pi-hole         :8084  -> pihole.danielshaprvt.work
│                        :53    (DNS)
└── VMs
    └── HAOS VM (ID 100, 192.168.68.121)
```

Docker containers do NOT appear in the Proxmox web UI. Manage them via Portainer or `docker ps` on the host.

## Docker Compose

Location on host: `/opt/homelab/docker-compose.yml`

```yaml
version: "3.9"
services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    container_name: homepage
    ports:
      - 3000:3000
    volumes:
      - /opt/homelab/homepage/config:/app/config
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/host:ro
    environment:
      - HOMEPAGE_ALLOWED_HOSTS=homepage.danielshaprvt.work,192.168.68.200
    restart: unless-stopped

  openspeedtest:
    image: openspeedtest/latest
    container_name: openspeedtest
    ports:
      - 3080:3000
    restart: unless-stopped

  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    privileged: true
    ports:
      - 9443:9443
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data
    restart: unless-stopped

  pihole:
    image: pihole/pihole:latest
    container_name: pihole
    privileged: true
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "8084:80/tcp"
    environment:
      - TZ=Asia/Jerusalem
      - FTLCONF_webserver_api_password=$PIHOLE_PASSWORD
      - DNSMASQ_USER=root
    cap_add:
      - NET_ADMIN
    volumes:
      - /opt/homelab/pihole/etc:/etc/pihole
      - /opt/homelab/pihole/dnsmasq:/etc/dnsmasq.d
    restart: unless-stopped

volumes:
  portainer_data:
```

## Common Operations

### SSH to Proxmox host
```bash
# Credentials from C:\Repo\hass-migration\.env
ssh root@192.168.68.200
```

### Manage containers
```bash
cd /opt/homelab
docker compose up -d          # Start all services
docker compose down            # Stop all services
docker compose pull            # Pull latest images
docker compose restart <svc>   # Restart a specific service
docker compose logs -f <svc>   # Follow logs for a service
docker ps                      # List running containers
```

### Homepage config
```bash
# Config files are at /opt/homelab/homepage/config/
ls /opt/homelab/homepage/config/
# Edit services.yaml, widgets.yaml, settings.yaml, etc.
```

## Docker Installation on Proxmox (Debian Trixie)

Install Docker CE from the official Docker repository (not Proxmox/Debian packages).

### IPv6 image pull failure

If `docker pull` fails with:
```
dial tcp [2606:4700::6810:64d7]:443: connect: network is unreachable
```

Fix by disabling IPv6 in Docker:
```bash
cat > /etc/docker/daemon.json << 'EOF'
{"ip6tables": false, "ipv6": false}
EOF
systemctl restart docker
```

## Known Issues and Fixes

### Portainer: Docker socket "Permission denied"

Even with root user and the socket mounted RW, Portainer gets "Permission denied" on the Docker socket.

**Root cause**: AppArmor on Proxmox (Debian Trixie) blocks socket access.

**Fix**: Add `privileged: true` to the Portainer service in docker-compose.yml.

### Portainer: Initial setup timeout

First-time admin account creation has a 5-minute security window. If you miss it, the setup page shows an error.

**Fix**: Restart the container to reset the window:
```bash
cd /opt/homelab && docker compose restart portainer
```

### Pi-hole: "Unable to get group list for user: Permission denied"

FTL process cannot read system groups.

**Fix**: Add both `privileged: true` and `DNSMASQ_USER=root` to the Pi-hole service.

### Homepage: HOMEPAGE_ALLOWED_HOSTS required

Homepage rejects requests unless the `Host` header matches an allowed value. Must include both:
- The Cloudflare tunnel hostname: `homepage.danielshaprvt.work`
- The local IP: `192.168.68.200`

### Homepage: Disk widget limitation

The resources widget cannot show disk usage inside containers (systeminformation library limitation). CPU and memory widgets work fine. Use the Proxmox widget to display storage information instead.

## Data Paths on Host

| Service | Data Location |
|---------|--------------|
| Homepage config | `/opt/homelab/homepage/config/` |
| Pi-hole config | `/opt/homelab/pihole/etc/` |
| Pi-hole dnsmasq | `/opt/homelab/pihole/dnsmasq/` |
| Portainer data | Docker volume `portainer_data` |
| Docker compose | `/opt/homelab/docker-compose.yml` |

## Adding New Services

1. Add the service definition to `/opt/homelab/docker-compose.yml`
2. Create any needed config/data directories under `/opt/homelab/`
3. Run `cd /opt/homelab && docker compose up -d`
4. If exposed via Cloudflare tunnel, add the tunnel route in Cloudflare dashboard
5. If using Homepage, update `/opt/homelab/homepage/config/services.yaml`
6. Add credentials to `C:\Repo\hass-migration\.env` for documentation
