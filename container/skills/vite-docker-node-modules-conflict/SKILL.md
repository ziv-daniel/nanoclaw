---
name: vite-docker-node-modules-conflict
description: |
  Fix Docker build failures with "cannot replace directory with file" errors when building
  Vite, React, or Node.js applications. Use when: (1) Docker build fails at COPY step with
  "cannot replace to directory .../node_modules/... with file", (2) Building a JavaScript/TypeScript
  project that has local node_modules, (3) First-time Dockerization of an existing project.
  The root cause is local node_modules being copied into the container and conflicting with
  freshly installed dependencies.
author: Claude Code
version: 1.0.0
date: 2026-02-03
---

# Vite/Node.js Docker Build - node_modules Conflict

## Problem
Docker build fails when copying project files because the local `node_modules` directory
conflicts with the one created by `RUN npm install` or `RUN bun install` in the Dockerfile.

## Context / Trigger Conditions
- Error message contains: `cannot replace to directory ... with file`
- Error occurs at `COPY . .` step in Dockerfile
- Building a Vite, React, Next.js, or any Node.js project
- Local development has created a `node_modules` folder
- The error often mentions specific packages like `@eslint/js` or similar

Example error:
```
ERROR: cannot replace to directory /var/lib/docker/buildkit/.../node_modules/@eslint/js with file
```

## Solution

### 1. Create a `.dockerignore` file

Create `.dockerignore` in the same directory as your Dockerfile:

```dockerignore
node_modules
dist
build
.git
.gitignore
*.md
.env*
!.env.example
coverage
.nyc_output
*.log
.DS_Store
```

### 2. Ensure Dockerfile installs dependencies before copying source

```dockerfile
FROM node:20-alpine
# or: FROM oven/bun:1.1.38-alpine

WORKDIR /app

# Copy package files FIRST
COPY package.json package-lock.json* bun.lockb* ./

# Install dependencies (creates fresh node_modules)
RUN npm install
# or: RUN bun install

# THEN copy source code (node_modules excluded via .dockerignore)
COPY . .

# Build and run
RUN npm run build
CMD ["npm", "start"]
```

### 3. For development Dockerfiles (hot reload)

```dockerfile
FROM oven/bun:1.1.38-alpine

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install

COPY . .

EXPOSE 5173
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
```

## Verification

1. Ensure `.dockerignore` exists and includes `node_modules`
2. Rebuild with no cache: `docker-compose build --no-cache service-name`
3. Build should complete without file/directory conflicts

## Example

**Project structure:**
```
frontend/
├── .dockerignore     ← Add this file
├── Dockerfile.dev
├── package.json
├── src/
└── node_modules/     ← This should be ignored
```

**.dockerignore content:**
```dockerignore
node_modules
dist
.git
*.md
.env*
!.env.development
playwright-report
e2e-results
coverage
```

## Notes

- `.dockerignore` syntax is similar to `.gitignore`
- The `!` prefix negates a pattern (includes a previously excluded file)
- For monorepos, you may need `.dockerignore` at both root and package level
- If using Docker BuildKit, cache mounts can speed up rebuilds significantly
- Always install dependencies before copying source for better layer caching
- Exclude test artifacts, coverage reports, and build outputs to reduce image size

## References
- [Docker .dockerignore file](https://docs.docker.com/engine/reference/builder/#dockerignore-file)
- [Best practices for writing Dockerfiles](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
