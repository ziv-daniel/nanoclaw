---
name: tcp-health-check-non-http-services
description: |
  Add health monitoring for non-HTTP services like Redis, PostgreSQL, MongoDB, or other TCP-based
  services in Node.js/TypeScript applications. Use when: (1) Dashboard shows "unknown" status for
  Redis/database services, (2) Need to verify TCP connectivity without HTTP endpoints, (3) Building
  a service health checker that includes databases and caches, (4) Want to monitor infrastructure
  services alongside HTTP APIs. Implements TCP socket connection tests with timeout handling.
author: Claude Code
version: 1.0.0
date: 2026-02-03
---

# TCP Health Check for Non-HTTP Services

## Problem
Services like Redis, PostgreSQL, and other databases don't expose HTTP health endpoints,
making them appear as "unknown" or unmonitored in health dashboards that only support HTTP checks.

## Context / Trigger Conditions
- Health dashboard shows "unknown" status for Redis, PostgreSQL, MongoDB, etc.
- Need to verify service is accepting connections, not just running
- Building a unified health monitoring system for mixed HTTP and TCP services
- Services show in `docker ps` as running but you can't verify connectivity
- Want to measure TCP connection latency for infrastructure services

## Solution

### 1. Implement TCP Health Check Function (Node.js/TypeScript)

```typescript
import net from 'net';

interface TcpHealthResult {
  status: 'healthy' | 'unhealthy';
  responseTime: number | null;
  lastChecked: string;
  error?: string;
}

interface ServiceConfig {
  host: string;
  port: number;
}

function checkTcpHealth(service: ServiceConfig, timeout = 3000): Promise<TcpHealthResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    // Set timeout for connection
    const timeoutId = setTimeout(() => {
      socket.destroy();
      resolve({
        status: 'unhealthy',
        responseTime: null,
        lastChecked: new Date().toISOString(),
        error: 'Connection timeout',
      });
    }, timeout);

    // Attempt connection
    socket.connect(service.port, service.host, () => {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      socket.destroy(); // Clean up after successful connection
      resolve({
        status: 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
      });
    });

    // Handle connection errors
    socket.on('error', (error) => {
      clearTimeout(timeoutId);
      socket.destroy();
      resolve({
        status: 'unhealthy',
        responseTime: null,
        lastChecked: new Date().toISOString(),
        error: error.message,
      });
    });
  });
}
```

### 2. Integrate with Existing Health Checker

```typescript
async checkHealth(service: ServiceConfig): Promise<HealthResult> {
  // Handle TCP services (Redis, PostgreSQL, etc.)
  if (service.protocol === 'tcp') {
    return this.checkTcpHealth(service);
  }

  // Handle HTTP/HTTPS services
  if (!service.healthPath) {
    return { status: 'unknown', responseTime: null, lastChecked: new Date().toISOString() };
  }

  // ... existing HTTP health check logic
}
```

### 3. Service Configuration Example

```typescript
const services = [
  // HTTP services
  {
    id: 'api',
    host: 'api-service',
    port: 8080,
    protocol: 'http',
    healthPath: '/health',
  },
  // TCP services
  {
    id: 'redis',
    host: 'redis',
    port: 6379,
    protocol: 'tcp',
    healthPath: '', // No health path for TCP
  },
  {
    id: 'postgres',
    host: 'postgres',
    port: 5432,
    protocol: 'tcp',
    healthPath: '',
  },
];
```

## Verification

1. Service shows TCP connection time in milliseconds when healthy
2. Shows "unhealthy" with error message when service is down
3. Handles timeouts gracefully without hanging

Test manually:
```bash
# From host (if Redis is exposed)
nc -zv localhost 6379

# From inside Docker
docker exec dashboard-container nc -zv redis 6379
```

## Example

**Before:** Redis shows as "unknown" in dashboard
```json
{
  "id": "redis",
  "status": "unknown",
  "responseTime": null
}
```

**After:** Redis shows healthy with connection time
```json
{
  "id": "redis",
  "status": "healthy",
  "responseTime": 12,
  "lastChecked": "2026-02-03T19:30:00.000Z"
}
```

## Notes

- TCP health checks only verify the service accepts connections, not that it's fully functional
- For deeper health checks, consider:
  - Redis: Send PING command and expect PONG
  - PostgreSQL: Attempt a simple query like `SELECT 1`
  - MongoDB: Run `db.runCommand({ ping: 1 })`
- Always destroy the socket after checking to prevent connection leaks
- Set appropriate timeout values (3-5 seconds typical)
- Connection time includes DNS resolution if using hostnames

## Extended: Redis PING Check

For a more thorough Redis health check:

```typescript
import { createClient } from 'redis';

async function checkRedisHealth(host: string, port: number): Promise<HealthResult> {
  const startTime = Date.now();
  const client = createClient({ socket: { host, port } });

  try {
    await client.connect();
    const pong = await client.ping();
    await client.disconnect();

    return {
      status: pong === 'PONG' ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: null,
      lastChecked: new Date().toISOString(),
      error: error.message,
    };
  }
}
```

## References
- [Node.js net module](https://nodejs.org/api/net.html)
- [Redis health check patterns](https://redis.io/commands/ping/)
