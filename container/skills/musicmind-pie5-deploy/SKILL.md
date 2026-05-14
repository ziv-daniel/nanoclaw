---
name: musicmind-pie5-deploy
description: Deploy MusicMind to PIE5 (Raspberry Pi 5).
author: Claude Code
version: 1.0.0
date: 2026-01-25
---

# Music Mind PIE5 Deployment

Deploy the Music Mind platform to Raspberry Pi 5 using a unified Docker container.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PIE5 (Raspberry Pi 5)                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              musicmind-caddy (:80, :443)            │    │
│  │         (Auto-HTTPS via Let's Encrypt)              │    │
│  └─────────────────────┬───────────────────────────────┘    │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐    │
│  │           musicmind-app (Unified Container)          │    │
│  │  ┌─────────────────────────────────────────────────┐│    │
│  │  │              supervisord                         ││    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   ││    │
│  │  │  │   BFF   │ │Identity │ │  User Service   │   ││    │
│  │  │  │ (:3001) │ │ (:8002) │ │ (:8080/:8443)   │   ││    │
│  │  │  └─────────┘ └─────────┘ └─────────────────┘   ││    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   ││    │
│  │  │  │  Mood   │ │ Music   │ │    Selector     │   ││    │
│  │  │  │ (:8004) │ │ (:8006) │ │    (:8005)      │   ││    │
│  │  │  └─────────┘ └─────────┘ └─────────────────┘   ││    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   ││    │
│  │  │  │Wearable │ │ Device  │ │   Dashboard     │   ││    │
│  │  │  │ (:8003) │ │ (:8007) │ │    (:9000)      │   ││    │
│  │  │  └─────────┘ └─────────┘ └─────────────────┘   ││    │
│  │  └─────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────┘    │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐    │
│  │     Redis (:6379)    │    Loki/Grafana (optional)   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- PIE5 IP: 192.168.68.136 (SSH: admin@192.168.68.136)
- Domain: musicmind.danielshaprvt.work
- Supabase project for database
- Docker installed on PIE5

## Deployment Files

```
infrastructure/deployment/pie5-unified/
├── docker-compose.yml     # Main deployment config
├── Caddyfile             # HTTPS reverse proxy
├── .env.example          # Environment template
├── promtail-config.yaml  # Log collection
└── deploy.sh             # Management script
```

## Step-by-Step Deployment

### 1. Build Unified Image (Local Machine)

```bash
cd C:\Repo\Music-mind

# Build for ARM64 (PIE5)
docker buildx build \
  --platform linux/arm64 \
  -t musicmind/app:latest \
  -f Dockerfile.unified \
  --load \
  .

# Save image for transfer
docker save musicmind/app:latest | gzip > musicmind-app.tar.gz
```

### 2. Transfer to PIE5

```bash
# Copy image to PIE5
scp musicmind-app.tar.gz admin@192.168.68.136:/tmp/

# Copy deployment files
scp -r infrastructure/deployment/pie5-unified admin@192.168.68.136:/opt/musicmind/
```

### 3. Deploy on PIE5

```bash
# SSH to PIE5
ssh admin@192.168.68.136

# Load Docker image
docker load < /tmp/musicmind-app.tar.gz

# Navigate to deployment directory
cd /opt/musicmind

# Configure environment
cp .env.example .env
nano .env  # Fill in SUPABASE_URL, SUPABASE_KEY, JWT_SECRET, etc.

# Start services
chmod +x deploy.sh
./deploy.sh up
```

### 4. DNS Configuration

Point `musicmind.danielshaprvt.work` A record to your public IP.
Ensure ports 80 and 443 are forwarded to PIE5.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DOMAIN` | Domain name | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_KEY` | Supabase anon key | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `GRAFANA_PASSWORD` | Grafana admin password | Yes |
| `SPOTIFY_CLIENT_ID` | Spotify API (optional) | No |
| `OPENAI_API_KEY` | OpenAI API (optional) | No |

Generate JWT_SECRET:
```bash
openssl rand -base64 64
```

## Management Commands

```bash
# Start services
./deploy.sh up

# Stop services
./deploy.sh down

# View logs
./deploy.sh logs
./deploy.sh logs musicmind

# Check status
./deploy.sh status

# Update deployment
./deploy.sh update

# Access container shell
./deploy.sh shell

# Supervisor status (inside container)
./deploy.sh supervisor

# Restart specific service
./deploy.sh restart bff
./deploy.sh restart identity-service
```

## Service Endpoints

| Endpoint | URL |
|----------|-----|
| API Gateway | https://musicmind.danielshaprvt.work/api/* |
| Dashboard | https://musicmind.danielshaprvt.work/dashboard |
| Health | https://musicmind.danielshaprvt.work/health |
| Grafana | https://musicmind.danielshaprvt.work/grafana |

## Troubleshooting

### Container won't start

```bash
# Check logs
./deploy.sh logs musicmind

# Check supervisor status
docker exec musicmind-app supervisorctl status

# Restart specific service
docker exec musicmind-app supervisorctl restart bff
```

### Service unhealthy

```bash
# Check health endpoint
curl http://localhost:3001/health

# Check individual service
docker exec musicmind-app curl http://localhost:8002/health
```

### Memory issues

```bash
# Check memory usage
./deploy.sh status

# Disable observability to save ~250MB
# Comment out loki, promtail, grafana in docker-compose.yml
```

### Certificate issues

Caddy auto-obtains Let's Encrypt certificates. Ensure:
- Port 80 is open (ACME challenge)
- Domain DNS points to PIE5's public IP
- Domain is correctly set in .env

### Redis connection issues

```bash
# Check Redis
docker exec musicmind-redis redis-cli ping

# Check from app container
docker exec musicmind-app sh -c 'nc -z redis 6379 && echo "OK"'
```

## Resource Usage

Expected memory (~1.2GB total):

| Component | Memory |
|-----------|--------|
| Unified App | ~800MB |
| Redis | ~96MB |
| Loki | ~128MB |
| Promtail | ~64MB |
| Grafana | ~128MB |
| Caddy | ~32MB |

PIE5 with 4GB RAM has ~2.8GB free for the app (other services use ~1.2GB).

## Updating the Application

### Quick Update (existing image)

```bash
./deploy.sh update
```

### Full Rebuild

```bash
# On local machine
cd C:\Repo\Music-mind
docker buildx build --platform linux/arm64 -t musicmind/app:latest -f Dockerfile.unified .
docker save musicmind/app:latest | gzip > musicmind-app.tar.gz
scp musicmind-app.tar.gz admin@192.168.68.136:/tmp/

# On PIE5
docker load < /tmp/musicmind-app.tar.gz
./deploy.sh up
```

## Backup & Restore

### Backup

```bash
./deploy.sh backup
# Creates backup in ./backups/ with Redis dump and .env
```

### Restore

```bash
# Copy backup to PIE5
scp -r backups/TIMESTAMP admin@192.168.68.136:/opt/musicmind/

# Restore Redis
docker cp backup/redis-dump.rdb musicmind-redis:/data/dump.rdb
docker exec musicmind-redis redis-cli DEBUG RELOAD
```

## Security Notes

1. **Never commit .env file** - contains secrets
2. **Rotate JWT_SECRET** periodically
3. **Use strong GRAFANA_PASSWORD**
4. **Keep Supabase keys secure**
5. **Enable Supabase Row Level Security (RLS)**

## References

- PIE5 repo: C:\Repo\pie5
- PIE5 IP: 192.168.68.136
- Domain: danielshaprvt.work
- Supabase: https://supabase.com/dashboard
