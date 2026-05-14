---
name: docker-alpine-node-heap-memory-tsc
description: Fix Node.js heap OOM errors during TypeScript compilation in Alpine Linux Docker.
author: Claude Code
version: 1.0.0
date: 2026-02-08
---

# Docker Alpine Node Heap Memory Fix for TypeScript Compilation

## Problem

Alpine Linux Docker containers with Node.js have restrictive memory limits by default. When
compiling large TypeScript monorepos (multiple workspaces with thousands of files), the Node.js
process exhausts the default heap and crashes:

```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

This typically occurs during `npm run build`, `tsc`, or Vite build steps in the Docker builder stage.

## Context / Trigger Conditions

- **Error message**: `FATAL ERROR: Ineffective mark-compacts near heap limit`
- **Stage**: Docker build, specifically in builder stage during `RUN npm run build`
- **Environment**: Alpine Linux containers (`FROM node:XX-alpine`)
- **Workload**: Large monorepos with multiple TypeScript workspaces
- **Tools affected**: `tsc`, `tsc-alias`, Vite, webpack, other bundlers
- **Works locally**: Compiles fine on development machine (more RAM available)

## Solution

Add explicit Node.js heap allocation **before** the build step in Dockerfile.

### Option 1: Set NODE_OPTIONS Environment Variable (Recommended)

In your Dockerfile builder stage, add before the build command:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# ... copy package.json and install dependencies ...

# Add this line before RUN npm run build
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run build
```

**Explanation**:
- `NODE_OPTIONS`: Environment variable Node.js reads on startup
- `--max-old-space-size=4096`: Allocate 4GB of heap memory
- Adjust `4096` based on available container RAM:
  - Small projects: `2048` (2GB)
  - Medium monorepos: `4096` (4GB)
  - Large monorepos: `6144` (6GB) or higher

### Option 2: Pass via Command Line

If you can't modify Dockerfile, pass as environment variable to build:

```bash
docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" .
```

### Option 3: Multiple Workspace Optimization

For monorepos with multiple workspaces, consider building workspaces sequentially:

```dockerfile
# Build in order of dependency
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=@org/shared
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=@org/backend
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=@org/frontend
```

This distributes memory load across separate Node processes.

## Complete Example

```dockerfile
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base

RUN apk add --no-cache libc6-compat tzdata
ENV TZ=Asia/Jerusalem
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

FROM base AS builder

COPY package*.json ./
COPY tsconfig*.json ./
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm ci --ignore-scripts --workspaces

COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend

RUN npm run generate --workspace=@mario/contracts
RUN npm run generate:kartoffel --workspace=backend
RUN npm run prisma:generate --workspace=backend

# ← ADD THIS LINE: Allocate 4GB heap before build
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run build

FROM base AS production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist/ ./backend/public

WORKDIR /app/backend
EXPOSE 8000 50051
CMD [ "npm", "start" ]
```

## Verification

1. **Build locally to test**:
   ```bash
   docker build -t myapp:test .
   ```

2. **Monitor memory during build** (on build host):
   ```bash
   docker stats  # In another terminal, shows memory usage
   ```

3. **Verify successful build**:
   - No "heap out of memory" errors
   - Build completes with final layer: `FROM base AS production`
   - Image exists: `docker images | grep myapp`

## Tuning Heap Size

| Monorepo Size | Recommended | Details |
|---|---|---|
| Small (1-2 workspaces) | 2048 MB | Light TypeScript compilation |
| Medium (3-5 workspaces) | 4096 MB | Standard monorepo |
| Large (5+ workspaces, 10k+ files) | 6144-8192 MB | Heavy compilation load |

**Finding the right value**:
- Start with `4096`
- If still fails: increase by `1024` increments
- If succeeds quickly: can reduce by `512` increments to save memory

## Performance Notes

- **Build time**: Larger heap doesn't make compilation faster, but prevents crashes
- **Container overhead**: Setting heap doesn't increase overall Docker image size
- **Runtime**: Only affects build stage; production container doesn't need large heap
  - For production, Node.js can use default heap (usually fine for running, not compiling)

## Alternative: Multi-Stage Heap Adjustment

If you want different heap sizes for build vs. runtime:

```dockerfile
FROM node:22-alpine AS builder
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:22-alpine AS production
# No NODE_OPTIONS here - production uses default smaller heap
COPY --from=builder /app/dist ./
RUN npm install --production
CMD [ "node", "index.js" ]
```

## Notes

- **Alpine specificity**: Alpine Linux has stricter default memory limits than Debian-based images
- **Node.js versions**: Works with Node.js 14+, tested on 18, 20, 22
- **Other bundlers**: Works for Webpack, Vite, esbuild, Rollup - any Node.js tool using heap
- **CI/CD**: Same fix applies to GitHub Actions, GitLab CI, Docker Compose, Dokploy, etc.
- **Not a build tool issue**: This is not a Vite/webpack bug - it's expected behavior with constrained memory

## Prevention

1. **Monitor heap usage locally**:
   ```bash
   node --expose-gc --max-old-space-size=2048 node_modules/.bin/tsc
   ```

2. **Profile your build**:
   ```bash
   node --trace-gc node_modules/.bin/vite build 2>&1 | grep "garbage collection"
   ```

3. **Pre-commit check**: Verify build succeeds before pushing:
   ```bash
   npm run build && docker build .
   ```

## References

- [Node.js Memory Management - Heap](https://nodejs.org/en/docs/guides/nodejs-memory-management/)
- [Node.js --max-old-space-size documentation](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes)
- [Docker Alpine Linux Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Vite Performance Troubleshooting](https://vitejs.dev/guide/troubleshooting.html)
