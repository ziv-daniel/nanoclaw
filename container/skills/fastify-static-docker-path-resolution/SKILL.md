---
name: fastify-static-docker-path-resolution
description: |
  Fix @fastify/static "root path must exist" errors in Docker containers. Use when:
  (1) fastify-static throws "root path X must exist" at startup, (2) Frontend files
  built by Vite/Webpack aren't found in Docker, (3) Static files work locally but
  fail in container, (4) SPA returns 404 for index.html. Covers Vite output path
  resolution and __dirname behavior in bundled/unbundled contexts.
author: Claude Code
version: 1.0.0
date: 2026-01-25
---

# Fastify Static File Path Resolution in Docker

## Problem
When serving a frontend (React/Vue/etc) from a Fastify backend in Docker,
`@fastify/static` throws errors like:
```
"root" path "/app/backend/services/my-service/frontend/dist/public" must exist
```

The path looks correct but files aren't there.

## Context / Trigger Conditions
- Using `@fastify/static` to serve SPA frontend
- Frontend built with Vite (or similar bundler)
- Works in local development but fails in Docker
- Error: `"root" path "X" must exist`
- 404 errors when accessing frontend routes

## Root Cause

### Issue 1: Vite Output Path
Vite's `build.outDir` is **relative to the vite.config.ts location**, not the project root.

```typescript
// vite.config.ts in /frontend/
export default defineConfig({
  build: {
    outDir: '../dist/public'  // Outputs to /dist/public (one level UP from frontend/)
  }
})
```

This means if your frontend is at `/app/services/my-service/frontend/`,
the output goes to `/app/services/my-service/dist/public/`, NOT
`/app/services/my-service/frontend/dist/public/`.

### Issue 2: __dirname in Server Code
`__dirname` in the server code points to where the **source file** is, not where
the compiled output is (in Bun/Node with TypeScript).

```typescript
// In /app/services/my-service/src/server.ts
// __dirname = /app/services/my-service/src/

// WRONG: Assumes frontend/dist exists
path.join(__dirname, '..', 'frontend', 'dist', 'public')
// Results in: /app/services/my-service/frontend/dist/public ❌

// CORRECT: Match Vite's actual output location
path.join(__dirname, '..', 'dist', 'public')
// Results in: /app/services/my-service/dist/public ✅
```

### Issue 3: decorateReply Option
If `decorateReply: false` is set, `reply.sendFile()` won't work:

```typescript
// WRONG: sendFile won't be available
await app.register(fastifyStatic, {
  root: frontendPath,
  decorateReply: false,  // Breaks reply.sendFile()
});

// CORRECT: Allow decoration (default is true)
await app.register(fastifyStatic, {
  root: frontendPath,
  // decorateReply defaults to true
});
```

## Solution

### Step 1: Verify Vite Output Location
Check your `vite.config.ts`:
```typescript
export default defineConfig({
  build: {
    outDir: '../dist/public'  // Note the relative path
  }
})
```

### Step 2: Check Docker Build Output
During Docker build, look for the Vite output:
```
✓ built in 2.98s
../dist/public/index.html           0.47 kB
../dist/public/assets/index-xxx.js  187 kB
```

The `../dist/public/` tells you where files actually go.

### Step 3: Verify in Container
```bash
docker exec container-name ls -la /app/path/to/service/
# Look for 'dist' directory at the correct level
```

### Step 4: Fix Server Path
```typescript
import fastifyStatic from '@fastify/static';
import path from 'path';

// Match the actual Vite output location
const frontendPath = path.join(__dirname, '..', 'dist', 'public');

await app.register(fastifyStatic, {
  root: frontendPath,
  prefix: '/',
});

// SPA fallback for client-side routing
app.setNotFoundHandler(async (request, reply) => {
  if (!request.url.startsWith('/api/')) {
    return reply.sendFile('index.html');
  }
  return reply.status(404).send({ error: 'Not Found' });
});
```

## Verification

1. Rebuild Docker image
2. Check container logs for startup errors
3. Test endpoint: `curl https://your-domain/` should return HTML
4. Verify assets load: Check browser Network tab for CSS/JS 200 responses

## Example

**Project Structure:**
```
my-service/
├── src/
│   └── server.ts      # __dirname = /app/my-service/src/
├── frontend/
│   ├── src/
│   └── vite.config.ts # outDir: '../dist/public'
├── dist/
│   └── public/        # Vite output lands HERE
│       ├── index.html
│       └── assets/
└── package.json
```

**Correct server.ts:**
```typescript
const frontendPath = path.join(__dirname, '..', 'dist', 'public');
```

## Debugging Commands

```bash
# Check where files actually are in container
docker exec container-name find /app -name "index.html" 2>/dev/null

# Check Vite config
docker exec container-name cat /app/path/frontend/vite.config.ts

# View fastify-static error
docker logs container-name 2>&1 | grep "root"
```

## Notes

- Always verify the actual Docker build output, not assumptions
- `__dirname` behavior differs between ESM and CommonJS
- In monorepos, relative paths can be especially confusing
- Consider using `process.cwd()` for more predictable paths in some cases

## References
- [@fastify/static documentation](https://github.com/fastify/fastify-static)
- [Vite build.outDir configuration](https://vitejs.dev/config/build-options.html#build-outdir)
