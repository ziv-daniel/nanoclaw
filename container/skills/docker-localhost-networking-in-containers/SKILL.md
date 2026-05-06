---
name: docker-localhost-networking-in-containers
description: Fix localhost networking inside Docker containers (use host.docker.internal).
author: Claude Code
version: 1.0.0
date: 2026-02-03
---

# Docker Localhost Networking in Containers

## Problem
When a Docker container tries to reach another service using `localhost`, the connection fails
because `localhost` inside a container refers to the container itself, not the Docker host or
other containers on the same network.

## Context / Trigger Conditions
- Error: "Unable to connect", "ECONNREFUSED", or "Connection refused"
- Health checks pass from host machine (`curl localhost:8002`) but fail from inside container
- Services are running (verified with `docker ps`) but dashboard/monitor shows them as unhealthy
- Configuration uses `localhost` or `127.0.0.1` for service URLs
- Multiple containers need to communicate on the same Docker network

## Solution

### 1. Use Docker service names instead of localhost

In `docker-compose.yml`, services can reach each other by their service name:

```yaml
services:
  dashboard:
    environment:
      # WRONG: localhost refers to the dashboard container itself
      - IDENTITY_SERVICE_HOST=localhost

      # CORRECT: Use the service name from docker-compose
      - IDENTITY_SERVICE_HOST=identity-service

  identity-service:
    ports:
      - "8002:8002"
```

### 2. Ensure services are on the same network

```yaml
services:
  dashboard:
    networks:
      - app-network
  identity-service:
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### 3. For accessing the host machine from a container

Use `host.docker.internal` (works on Docker Desktop for Mac/Windows):

```yaml
environment:
  - EXTERNAL_API_HOST=host.docker.internal
```

### 4. Update application code to use environment variables

```typescript
// Read host from environment with fallback
const getServiceHost = (envVar: string, defaultHost: string): string => {
  return process.env[envVar] || defaultHost;
};

const identityHost = getServiceHost('IDENTITY_SERVICE_HOST', 'localhost');
const url = `http://${identityHost}:8002/health`;
```

## Verification

1. Rebuild the container: `docker-compose build service-name`
2. Restart: `docker-compose up -d service-name`
3. Test from inside the container:
   ```bash
   docker exec container-name wget -qO- http://other-service:port/health
   ```
4. Check that health checks now pass

## Example

**Before (broken):**
```yaml
dashboard:
  environment:
    - USER_SERVICE_HOST=localhost
    - USER_SERVICE_PORT=8080
```
Dashboard health check tries `http://localhost:8080/health` → Fails (localhost = dashboard container)

**After (working):**
```yaml
dashboard:
  environment:
    - USER_SERVICE_HOST=user-service
    - USER_SERVICE_PORT=8080
```
Dashboard health check tries `http://user-service:8080/health` → Works (Docker DNS resolves to user-service container)

## Notes

- Docker Compose automatically creates a default network for all services in the same file
- Service names in docker-compose.yml become DNS hostnames within the Docker network
- Port mappings (`ports: "8080:8080"`) are for host access; containers communicate on internal ports
- For external networks, use `networks: external: true` and reference by name
- `host.docker.internal` doesn't work on Linux Docker by default (needs `--add-host` flag)

## References
- [Docker Compose Networking](https://docs.docker.com/compose/networking/)
- [Container networking](https://docs.docker.com/network/)
