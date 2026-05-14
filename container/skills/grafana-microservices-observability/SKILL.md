---
name: grafana-microservices-observability
description: |
  Implement comprehensive Grafana observability stack for microservices with Prometheus metrics,
  Loki log aggregation, and pre-built dashboards. Use when: (1) Setting up monitoring for
  Docker-based microservices, (2) Need 98%+ debugging success rate with unified metrics and logs,
  (3) Deploying Prometheus + Loki + Grafana stack, (4) Creating service health dashboards,
  (5) Adding prom-client metrics to Node.js/Fastify services. Covers correlation ID tracing,
  alerting rules, and dashboard provisioning.
author: Claude Code
version: 1.0.0
date: 2026-02-04
---

# Grafana Microservices Observability Stack

## Problem

Debugging distributed microservices is challenging without unified observability. Teams need:
- Real-time service health visibility
- Log aggregation with request tracing
- Performance metrics and alerting
- Fast root cause analysis (<5 minutes)

## Context / Trigger Conditions

Use this skill when:
- Setting up monitoring for Docker Compose microservices
- Adding Prometheus metrics to Node.js/Fastify/Express services
- Configuring Grafana dashboards for service health
- Implementing Loki log aggregation with Promtail
- Need to trace requests across multiple services via correlation IDs
- Creating alerting rules for service health

## Solution

### 1. Core Stack Components

```yaml
# docker-compose.yml additions
services:
  prometheus:
    image: prom/prometheus:v2.51.0
    ports:
      - "9090:9090"
    volumes:
      - ./infrastructure/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'
      - '--web.enable-lifecycle'

  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    volumes:
      - ./infrastructure/loki/loki-config.yaml:/etc/loki/config.yaml:ro
      - loki-data:/loki
    command: -config.file=/etc/loki/config.yaml

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - ./infrastructure/promtail/promtail-config.yml:/etc/promtail/config.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3004:3000"
    volumes:
      - ./infrastructure/grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### 2. Prometheus Scrape Configuration

```yaml
# infrastructure/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'service-name'
    static_configs:
      - targets: ['service-name:PORT']
    metrics_path: /metrics
```

### 3. Node.js/Fastify Metrics Plugin

```typescript
// src/plugins/metrics.ts
import { FastifyInstance } from 'fastify';
import client from 'prom-client';

const register = new client.Registry();

// Collect Node.js default metrics
client.collectDefaultMetrics({
  register,
  prefix: 'myservice_',
  labels: { service: 'my-service' }
});

// HTTP request metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export async function metricsPlugin(fastify: FastifyInstance) {
  // Track request timing
  fastify.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = (Date.now() - request.startTime) / 1000;
    const route = request.routeOptions?.url || request.url;

    httpRequestDuration.observe(
      { method: request.method, route, status_code: reply.statusCode },
      duration
    );
    httpRequestsTotal.inc(
      { method: request.method, route, status_code: reply.statusCode }
    );
  });

  // Metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
}
```

### 4. Grafana Datasource Provisioning

```yaml
# infrastructure/grafana/provisioning/datasources/datasources.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
    jsonData:
      derivedFields:
        - name: correlationId
          matcherRegex: '"correlationId":"([^"]+)"'
```

### 5. Dashboard Provisioning

```yaml
# infrastructure/grafana/provisioning/dashboards/dashboards.yaml
apiVersion: 1
providers:
  - name: 'Default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
```

### 6. Loki Configuration

```yaml
# infrastructure/loki/loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

limits_config:
  retention_period: 72h
  ingestion_rate_mb: 4
  ingestion_burst_size_mb: 6
  max_entries_limit_per_query: 5000

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
```

### 7. Promtail Configuration

```yaml
# infrastructure/promtail/promtail-config.yml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: container
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: service
    pipeline_stages:
      - json:
          expressions:
            level: level
            msg: msg
            correlationId: correlationId
      - labels:
          level:
          correlationId:
```

### 8. Correlation ID Implementation

```typescript
// src/utils/observability.ts
import { FastifyRequest } from 'fastify';

export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `mm-${timestamp}-${random}`;
}

export function extractCorrelationId(request: FastifyRequest): string {
  return (
    request.headers['x-correlation-id'] as string ||
    request.headers['x-request-id'] as string ||
    generateCorrelationId()
  );
}

// Fastify plugin
export async function correlationPlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request) => {
    request.correlationId = extractCorrelationId(request);
    request.log = request.log.child({ correlationId: request.correlationId });
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-correlation-id', request.correlationId);
  });
}
```

## Verification

1. **Prometheus Targets:** http://localhost:9090/targets - All services should show "UP"
2. **Grafana Access:** http://localhost:3004 - Login with admin/admin
3. **Metrics Endpoint:** `curl http://localhost:SERVICE_PORT/metrics` - Should return Prometheus format
4. **Loki Logs:** In Grafana Explore, query `{service="your-service"}` - Should show logs
5. **Correlation Trace:** Search by `{correlationId="mm-xxx"}` - Should find related logs

## Example Dashboard Panels

### Service Health Grid (Stat Panel)
```
Query: up{job=~".*service.*"}
Legend: {{job}}
Thresholds: 0=red, 1=green
```

### Request Rate (Time Series)
```
Query: sum(rate(http_requests_total[5m])) by (service)
Legend: {{service}}
```

### Error Rate % (Gauge)
```
Query: sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
Thresholds: 0-1=green, 1-5=yellow, 5+=red
```

### P95 Latency (Time Series)
```
Query: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
Legend: {{service}} P95
```

## Notes

- Use `scrape_interval: 15s` for production (balances freshness vs load)
- Retention: Prometheus 15 days, Loki 72 hours (adjust based on storage)
- Add `prom-client` to all services for consistent metrics
- Structured JSON logging is required for Loki label extraction
- Correlation IDs must be passed in `x-correlation-id` header between services

## References

- [Grafana Observability Stack 2026](https://medium.com/@krishnafattepurkar/building-a-production-ready-observability-stack-the-complete-2026-guide-9ec6e7e06da2)
- [prom-client Documentation](https://github.com/siimon/prom-client)
- [Grafana Dashboard Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Loki Configuration](https://grafana.com/docs/loki/latest/configure/)
- [Node.js Dashboard Template](https://grafana.com/grafana/dashboards/11159)
