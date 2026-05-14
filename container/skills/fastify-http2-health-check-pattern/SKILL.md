---
name: fastify-http2-health-check-pattern
description: |
  Fix health check failures in Fastify services using HTTPS with HTTP/2. Use when:
  (1) curl returns "Missing ALPN Protocol, expected h2" despite allowHTTP1: true,
  (2) Load balancers can't reach health endpoints on HTTPS-only services,
  (3) BFF or API gateway can't connect to upstream HTTP/2 services,
  (4) Docker health checks fail against HTTPS endpoints. Solution: create a
  separate HTTP health check server that responds on a different port while
  main app serves HTTPS/HTTP2.
author: Claude Code
version: 1.0.0
date: 2026-01-22
---

# Fastify HTTP/2 Health Check Pattern

## Problem
When running Fastify with HTTP/2 and HTTPS, external tools (curl, wget, load balancers,
Docker health checks) often fail to connect because they use HTTP/1.1, even when
`allowHTTP1: true` is configured in Fastify options.

## Context / Trigger Conditions
- Error: `Missing ALPN Protocol, expected 'h2' to be available`
- Error: `The server was not configured with the allowHTTP1 option`
- Health checks return connection errors despite service running fine
- Works in browser but fails with curl/wget
- Fastify configured with `http2: true` and HTTPS

## Root Cause
The `allowHTTP1` option in Node.js HTTP/2 server has compatibility issues with some
clients, particularly when the client doesn't properly negotiate ALPN (Application-Layer
Protocol Negotiation). This is especially common with:
- Older versions of curl without HTTP/2 support compiled in
- Simple HTTP clients in load balancers
- Docker HEALTHCHECK using wget or curl

## Solution

Create a separate lightweight HTTP server specifically for health checks:

```typescript
// src/utils/http-health-server.ts
import { createServer } from 'http';
import { config } from '../config/environment';
import { logger } from './logger';

export async function createHttpHealthCheckServer(): Promise<void> {
  const server = createServer((req, res) => {
    // Only allow health check endpoints on HTTP
    if (req.url === '/health' || req.url === '/health/ready' || req.url === '/health/live') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      });

      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'your-service-name',
        https_redirect: true,
      }));
    } else {
      // Redirect all other traffic to HTTPS
      const host = req.headers.host?.split(':')[0] || 'localhost';
      const httpsPort = config.server.https.port;
      const redirectUrl = `https://${host}:${httpsPort}${req.url}`;

      res.writeHead(301, { Location: redirectUrl });
      res.end(`Redirecting to HTTPS: ${redirectUrl}`);
    }
  });

  const httpPort = config.server.redirect.httpPort; // e.g., 8080
  const host = config.server.host;

  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(httpPort, host, () => {
      logger.info(`HTTP health check server running on http://${host}:${httpPort}`);
      resolve();
    });
  });
}
```

In your main server startup:

```typescript
// Start main HTTPS/HTTP2 server
await app.listen({ port: httpsPort, host });

// Start HTTP health check server (both dev and prod)
await createHttpHealthCheckServer();
```

## Docker Configuration

```yaml
services:
  your-service:
    ports:
      - "8080:8080"   # HTTP health checks
      - "8443:8443"   # HTTPS main traffic
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Verification

```bash
# HTTP health endpoint should work
curl http://localhost:8080/health
# Returns: {"status":"healthy",...}

# HTTPS still works for application traffic
curl -k https://localhost:8443/api/...
```

## Notes

- Keep the HTTP server minimal - only health endpoints, no business logic
- Always redirect non-health traffic to HTTPS for security
- This pattern is common in Kubernetes/Docker environments
- The HTTP port (8080) is internal-only; don't expose to public internet
- Consider adding basic auth if health endpoints expose sensitive info

## References
- [Fastify HTTP2 Documentation](https://fastify.dev/docs/latest/Reference/HTTP2/)
- [Node.js HTTP/2 with HTTP/1.1 fallback](https://nodejs.org/api/http2.html#http2_compatibility_api)
