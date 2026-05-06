---
name: docker-container-naming-cleanup-conflicts
description: Prevent app orphan-cleanup logic from killing infrastructure containers.
author: Claude Code
version: 1.0.0
date: 2026-04-07
---

# Docker Container Naming vs Cleanup Conflicts

## Problem

Applications that spawn containers (like NanoClaw, CI runners, orchestrators) often include
orphan cleanup logic that kills containers matching a name pattern on startup. If you name
infrastructure containers (databases, MCP servers, etc.) with the same pattern, they get
killed every time the application restarts.

## Context / Trigger Conditions

- Deploying companion services (DB, cache, MCP servers) for an app that manages containers
- Containers vanish after the main application restarts
- `docker ps` shows containers running, but after a service restart they're gone
- Application logs show "Stopped orphaned containers" with your infrastructure container names

## Solution

### Step 1: Find the cleanup pattern

Search the application source for orphan/cleanup logic:

```bash
grep -rn "cleanup\|orphan\|docker.*stop\|docker.*rm\|--filter.*name" src/
```

In NanoClaw's case (`container-runtime.ts`):
```typescript
// This kills ANY container with "nanoclaw" in the name
const output = execSync(
  `docker ps --filter name=nanoclaw- --format '{{.Names}}'`
);
```

### Step 2: Name containers OUTSIDE the pattern

```
# BAD: matches "nanoclaw" filter
nanoclaw-qdrant
nanoclaw-mcp-qdrant
nanoclaw-playwright

# GOOD: doesn't match
mcp-qdrant-db
mcp-qdrant-server
playwright-mcp
homelab-mcp
```

### Step 3: Document the naming constraint

Add a comment in the docker-compose or README:

```yaml
# WARNING: Container names must NOT contain "nanoclaw" —
# NanoClaw's orphan cleanup kills containers matching that pattern.
```

## Verification

1. Start the infrastructure containers
2. Restart the main application
3. Verify infrastructure containers are still running: `docker ps`

## Example

NanoClaw cleanup pattern: `docker ps --filter name=nanoclaw-`

| Container Purpose | Bad Name | Good Name |
|---|---|---|
| Qdrant vector DB | nanoclaw-qdrant | mcp-qdrant-db |
| Qdrant MCP server | nanoclaw-mcp-qdrant | mcp-qdrant-server |
| Playwright MCP | nanoclaw-playwright | playwright-mcp |

## Notes

- This applies to any application that manages Docker containers, not just NanoClaw
- The cleanup pattern might use `--filter label=` instead of `--filter name=` — check both
- Consider adding your infrastructure containers to a "protected" list in the cleanup code
- Always grep for cleanup patterns BEFORE naming and deploying containers
