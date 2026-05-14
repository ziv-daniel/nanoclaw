---
name: ha-loki-observability
description: |
  Set up lightweight observability stack with Grafana Loki for log aggregation in Home Assistant
  or Docker environments. Use when: (1) need "New Relic-like" logging on low-memory devices
  (Raspberry Pi, <250MB RAM), (2) setting up centralized logging for Docker microservices,
  (3) encountering "mkdir /data/loki/chunks: permission denied" errors with Loki addon,
  (4) configuring Promtail docker_sd_configs for container log discovery, (5) migrating
  from Promtail to Grafana Alloy before March 2026 EOL, (6) connecting remote Promtail
  to Loki on Home Assistant. Covers HA addon setup, Docker Compose alternatives, permission
  fixes, and Alloy migration paths.
author: Claude Code
version: 1.0.0
date: 2026-01-22
tags: [observability, logging, grafana, loki, promtail, alloy, home-assistant, docker]
---

# Home Assistant Loki Observability Stack

## Problem

Setting up a lightweight, centralized logging solution for Docker microservices that:
- Runs on low-memory devices (Raspberry Pi, <250MB RAM)
- Provides "New Relic-like" log aggregation without cloud costs
- Integrates with Grafana for visualization
- Supports correlation IDs for distributed tracing across services

## Context / Trigger Conditions

Use this skill when:
- Need centralized logging for Docker Compose microservices
- Running Home Assistant on Raspberry Pi and want to add observability
- Seeing error: `mkdir /data/loki/chunks: permission denied`
- Seeing error: `stat /data/loki/chunks: permission denied`
- Need to configure Promtail to discover Docker containers
- Planning migration from Promtail to Grafana Alloy (EOL March 2026)
- Grafana can't connect to Loki data source

## Architecture Options

### Option 1: Home Assistant Add-ons (Simplest)

```
[Docker Services] → [Promtail Container] → [Loki HA Addon] → [Grafana HA Addon]
     (Dev Machine)                              (Raspberry Pi / PIE5)
```

**Pros**: Managed by HA, auto-restarts, easy updates
**Cons**: Permission issues (Issue #167), less control

### Option 2: Full Docker Compose (Most Control)

```
[Docker Services] → [Promtail/Alloy] → [Loki Container] → [Grafana Container]
                    (Same Docker Compose network)
```

**Pros**: Full control, no permission issues, portable
**Cons**: More setup, manage updates yourself

### Option 3: Hybrid (Recommended)

```
[Docker Services] → [Promtail/Alloy Container] → [Loki on HA/Remote] → [Grafana on HA]
     (Dev Machine)        (Dev Machine)              (Raspberry Pi)
```

**Pros**: Best of both worlds, HA manages visualization, dev controls log shipping
**Cons**: Network configuration required

## Solution

### Part 1: Home Assistant Loki Addon Setup

#### Step 1: Install Add-on Repository

1. Go to Settings → Add-ons → Add-on Store
2. Click ⋮ (three dots) → Repositories
3. Add: `https://github.com/mdegat01/hassio-addons`

#### Step 2: Install and Configure Loki

```yaml
# Loki addon configuration
days_to_keep: 1  # Retention period (low for memory constraints)
log_level: warn  # Reduce log verbosity
```

**Known Issue - Permission Denied (Issue #167)**:
```
mkdir /data/loki/chunks: permission denied
```

**Root Cause**: Loki runs as UID 10001 by default. WAL enabled by default since v2.4.0.

**Workarounds**:
1. Wait for addon fix (check GitHub issue status)
2. Use Docker Compose alternative (see Part 2)
3. SSH into HA and fix permissions manually (advanced, not recommended)

#### Step 3: Configure Grafana Data Source

In Grafana → Configuration → Data Sources → Add Loki:

```
# For HA addon-to-addon communication:
URL: http://39bd2704-loki:3100

# For external access (from dev machine):
URL: http://{HA_IP}:3100
```

### Part 2: Docker Compose Loki (Alternative to HA Addon)

When HA addon has permission issues, run Loki in Docker Compose:

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:3.6.0
    container_name: loki
    user: "10001:10001"  # Match Loki's expected UID
    ports:
      - "3100:3100"
    volumes:
      - ./infrastructure/loki/loki-config.yaml:/etc/loki/loki-config.yaml:ro
      - loki-data:/loki
    command: -config.file=/etc/loki/loki-config.yaml
    networks:
      - observability
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3100/ready"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  loki-data:
```

**Loki Configuration** (`infrastructure/loki/loki-config.yaml`):

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

ingester:
  wal:
    dir: /loki/wal  # Critical: explicitly set WAL directory
  lifecycler:
    ring:
      replication_factor: 1
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

storage_config:
  filesystem:
    directory: /loki/chunks

limits_config:
  retention_period: 24h  # Low retention for memory constraints
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  max_entries_limit_per_query: 5000

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  retention_delete_delay: 2h
  delete_request_store: filesystem
```

### Part 3: Promtail Configuration for Docker

```yaml
# infrastructure/promtail/promtail-config.yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://${LOKI_HOST:-192.168.68.136}:${LOKI_PORT:-3100}/loki/api/v1/push

scrape_configs:
  - job_name: docker-containers
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        filters:
          # Filter by Docker Compose project name
          - name: label
            values: ["com.docker.compose.project=music-mind"]

    relabel_configs:
      # Extract container name (remove leading /)
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'

      # Add log stream (stdout/stderr)
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'logstream'

      # Add service name from compose label
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'

      # Add compose project
      - source_labels: ['__meta_docker_container_label_com_docker_compose_project']
        target_label: 'project'

    pipeline_stages:
      # Parse JSON logs (common in Node.js/NestJS services)
      - json:
          expressions:
            level: level
            message: msg
            timestamp: time
            correlationId: correlationId
            requestId: requestId
            service: service

      # Extract labels from parsed JSON
      - labels:
          level:
          correlationId:
          requestId:

      # Remap log levels for consistency
      - match:
          selector: '{level="50"}'
          stages:
            - labels:
                level: error
      - match:
          selector: '{level="40"}'
          stages:
            - labels:
                level: warn
      - match:
          selector: '{level="30"}'
          stages:
            - labels:
                level: info
```

**Docker Compose for Promtail**:

```yaml
promtail:
  image: grafana/promtail:2.9.0  # LTS until Feb 2026
  container_name: promtail
  volumes:
    - ./infrastructure/promtail/promtail-config.yaml:/etc/promtail/config.yaml:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /var/lib/docker/containers:/var/lib/docker/containers:ro  # Optional: for reading files directly
  command: -config.file=/etc/promtail/config.yaml -config.expand-env=true
  environment:
    - LOKI_HOST=${LOKI_HOST:-192.168.68.136}
    - LOKI_PORT=${LOKI_PORT:-3100}
  networks:
    - your-network
  restart: unless-stopped
  depends_on:
    - redis  # Or any service that should start first
```

### Part 4: Grafana Alloy Migration (Future-Proof)

**CRITICAL**: Promtail EOL is March 2, 2026. Plan migration to Grafana Alloy.

#### Convert Promtail Config to Alloy

```bash
# One-time conversion
alloy convert --source-format=promtail \
  --output=alloy-config.alloy \
  promtail-config.yaml

# Or run Alloy with Promtail config directly (transitional)
docker run -v ./promtail-config.yaml:/etc/promtail/config.yaml \
  grafana/alloy:latest \
  run --config.format=promtail /etc/promtail/config.yaml
```

#### Alloy Docker Compose

```yaml
alloy:
  image: grafana/alloy:latest
  container_name: alloy
  volumes:
    - ./infrastructure/alloy/config.alloy:/etc/alloy/config.alloy:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
  command:
    - run
    - /etc/alloy/config.alloy
  ports:
    - "12345:12345"  # Alloy UI
  environment:
    - LOKI_HOST=${LOKI_HOST:-192.168.68.136}
    - LOKI_PORT=${LOKI_PORT:-3100}
  networks:
    - your-network
  restart: unless-stopped
```

#### Alloy Configuration Example

```hcl
// infrastructure/alloy/config.alloy

// Docker log discovery
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
  refresh_interval = "5s"

  filter {
    name   = "label"
    values = ["com.docker.compose.project=music-mind"]
  }
}

// Relabel discovered targets
discovery.relabel "docker" {
  targets = discovery.docker.containers.targets

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "container"
  }

  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    target_label  = "service"
  }
}

// Collect logs from discovered containers
loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.docker.output
  forward_to = [loki.process.json_logs.receiver]
}

// Process JSON logs
loki.process "json_logs" {
  forward_to = [loki.write.default.receiver]

  stage.json {
    expressions = {
      level         = "level",
      message       = "msg",
      correlationId = "correlationId",
    }
  }

  stage.labels {
    values = {
      level         = "",
      correlationId = "",
    }
  }
}

// Write to Loki
loki.write "default" {
  endpoint {
    url = "http://" + env("LOKI_HOST") + ":" + env("LOKI_PORT") + "/loki/api/v1/push"
  }
}
```

## Verification

### 1. Verify Loki is Running

```bash
# Check readiness
curl -s http://${LOKI_HOST}:3100/ready
# Expected: "ready"

# Check metrics
curl -s http://${LOKI_HOST}:3100/metrics | head -20
```

### 2. Verify Promtail/Alloy Connection

```bash
# Check Promtail targets
curl -s http://localhost:9080/targets

# Check Promtail is sending logs
curl -s http://localhost:9080/metrics | grep promtail_sent_entries_total
```

### 3. Query Logs in Grafana

```logql
# All logs from a service
{service="identity-service"}

# Error logs only
{service="identity-service"} |= "error"

# Filter by correlation ID (for tracing requests)
{correlationId="abc-123-def"}

# JSON parsing on the fly
{service="bff"} | json | level="error"

# Rate of errors over time
rate({service=~".+"} |= "error" [5m])
```

## Troubleshooting

### Issue: "Unable to connect with Loki" in Grafana

**Symptoms**: Grafana data source test fails

**Checklist**:
1. Verify Loki is running: `curl http://{LOKI_HOST}:3100/ready`
2. For HA addon, check addon is started (not just installed)
3. For HA addon-to-addon, use hostname: `http://39bd2704-loki:3100`
4. For external connections, use IP: `http://192.168.x.x:3100`
5. Check firewall allows port 3100

### Issue: "mkdir /data/loki/chunks: permission denied"

**Root Cause**: Loki runs as UID 10001, WAL enabled by default since v2.4.0

**Solutions** (in order of preference):
1. **Docker Compose**: Use `user: "10001:10001"` in service definition
2. **Fix volume permissions**: `chown -R 10001:10001 /path/to/loki-data`
3. **Explicit WAL path**: Set `ingester.wal.dir` in config
4. **Disable WAL** (not recommended): `ingester.wal.enabled: false`

### Issue: No logs appearing in Grafana

**Checklist**:
1. Promtail targets showing containers: `curl http://localhost:9080/targets`
2. Promtail sending entries: check `promtail_sent_entries_total` metric
3. Docker socket mounted: `-v /var/run/docker.sock:/var/run/docker.sock:ro`
4. Container filter matches: check `docker.compose.project` label
5. Network connectivity: Promtail can reach Loki URL

### Issue: High memory usage

**Solutions**:
1. Reduce retention: `limits_config.retention_period: 24h`
2. Lower chunk size: `ingester.chunk_target_size: 524288`
3. Limit query results: `limits_config.max_entries_limit_per_query: 1000`
4. Disable caching in single-node deployments

## Example: Complete Music Mind Setup

```yaml
# docker-compose.yml (excerpt)
services:
  # ... your services ...

  promtail:
    image: grafana/promtail:2.9.0
    container_name: musicmind-promtail
    volumes:
      - ./infrastructure/promtail/promtail-config.yml:/etc/promtail/config.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml -config.expand-env=true
    environment:
      - LOKI_HOST=${LOKI_HOST:-192.168.68.136}
      - LOKI_PORT=${LOKI_PORT:-3100}
    networks:
      - musicmind-network
    restart: unless-stopped
```

```yaml
# .env
LOKI_HOST=192.168.68.136  # Your Home Assistant IP
LOKI_PORT=3100
```

## Notes

- **Promtail vs Alloy**: Promtail is simpler but EOL March 2026. Start with Promtail, plan Alloy migration.
- **Memory Constraints**: For <250MB environments, use 24h retention and disable unused features.
- **Correlation IDs**: Add `correlationId` to all service logs for distributed tracing.
- **Label Cardinality**: Keep label values bounded (avoid UUIDs as labels, use them in log content).
- **HA Addon vs Docker**: HA addon simpler but has known issues; Docker gives more control.

## References

- [Grafana Loki Docker Installation](https://grafana.com/docs/loki/latest/setup/install/docker/)
- [Promtail Configuration](https://grafana.com/docs/loki/latest/send-data/promtail/configuration/)
- [mdegat01 Loki Addon](https://github.com/mdegat01/hassio-addons)
- [Loki Permission Issue #5513](https://github.com/grafana/loki/issues/5513)
- [HA Addon Loki Issue #167](https://github.com/mdegat01/addon-loki/issues/167)
- [Promtail to Alloy Migration](https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/)
- [Grafana Alloy Documentation](https://grafana.com/docs/alloy/latest/)
- [Promtail EOL Announcement](https://community.grafana.com/t/promtail-end-of-life-eol-march-2026-how-to-migrate-to-grafana-alloy-for-existing-loki-server-deployments/159636)
