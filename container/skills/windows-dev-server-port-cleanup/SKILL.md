---
name: windows-dev-server-port-cleanup
description: |
  Fix "EADDRINUSE" or "port already in use" errors when starting dev servers on Windows.
  Use when: (1) NestJS/Express fails with "Failed to start server. Is port in use?",
  (2) Vite or webpack-dev-server won't start due to port conflict, (3) Previous dev
  session didn't shut down cleanly, (4) Multiple background processes holding ports.
  Covers killing node.exe and bun.exe processes, verifying ports are free, and proper
  server startup sequence for monorepos.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Windows Dev Server Port Cleanup

## Problem
Dev servers fail to start with "EADDRINUSE" or "port already in use" errors because
previous processes didn't terminate cleanly, or background tasks are holding ports.

## Context / Trigger Conditions
- NestJS error: `Error: Failed to start server. Is port 3333 in use?`
- Vite error: `Port 3000 is already in use`
- Error code: `EADDRINUSE`
- Previous dev session crashed or was force-closed
- Running `bun run dev` or `npm run dev` after switching branches
- Background shell tasks still running from previous commands

## Solution

### Step 1: Kill All Node/Bun Processes
In bash (Git Bash, WSL, or similar):
```bash
taskkill //F //IM node.exe 2>/dev/null || true
taskkill //F //IM bun.exe 2>/dev/null || true
```

Note: Use `//F` and `//IM` (double slashes) in bash environments on Windows.

### Step 2: Verify Ports Are Free
```bash
netstat -an | grep -E "3000|3333"
```
Should return empty if ports are clear.

### Step 3: Start Servers in Correct Order
For monorepos with API + Frontend:
```bash
# Terminal 1 - Start API first (it's the dependency)
cd apps/api && bun run src/main.ts

# Terminal 2 - Start Frontend (after API is ready)
cd apps/web && npx vite
```

### Step 4: Verify Servers Are Running
```bash
# Check API
curl -s http://localhost:3333/api

# Check Frontend
curl -s http://localhost:3000 | head -5
```

## Alternative: Using nohup for Background Processes
```bash
# Start API in background
cd apps/api && nohup bun run src/main.ts > /tmp/api.log 2>&1 &

# Wait for API to be ready
sleep 5

# Start web in background
cd apps/web && nohup npx vite > /tmp/web.log 2>&1 &

# Check logs if needed
tail -f /tmp/api.log
tail -f /tmp/web.log
```

## Verification
1. `netstat -an | grep 3333` shows LISTENING
2. `curl http://localhost:3333/api` returns a response (even 404 is OK)
3. `curl http://localhost:3000` returns HTML

## Common Pitfalls

### Nx Plugin Errors
If you see `Unable to resolve local plugin with import path @nx/nest/plugin`:
- Don't use `nx serve` commands
- Run the server directly: `bun run src/main.ts`

### Background Task Outputs
When using `run_in_background` in Claude Code:
- Output files may be empty initially
- Use `sleep` + `cat` to check logs
- Don't rely on immediate output

### Windows Bash Syntax
- Use `//` for Windows flags in bash: `taskkill //F //IM`
- Use `2>/dev/null || true` to suppress errors
- CMD syntax (`for /f`) doesn't work in bash

## Example

**Scenario**: Starting a monorepo after previous session crashed

```bash
# 1. Clean up
taskkill //F //IM node.exe 2>/dev/null || true
taskkill //F //IM bun.exe 2>/dev/null || true

# 2. Wait a moment
sleep 2

# 3. Verify clean
netstat -an | grep -E "3000|3333"
# (should be empty)

# 4. Start API
cd /c/Repo/myproject/apps/api && bun run src/main.ts &

# 5. Wait for API
sleep 5

# 6. Start Web
cd /c/Repo/myproject/apps/web && npx vite &

# 7. Test
curl -s http://localhost:3333/api
curl -s http://localhost:3000 | head -3
```

## Notes
- Always start API before frontend when frontend proxies to API
- Vite proxy config (in `vite.config.ts`) handles `/api/*` routing
- For production, use proper process managers (PM2, systemd)
- This skill is particularly relevant for Nx monorepos with Bun

## References
- [Vite Server Options](https://vite.dev/config/server-options.html)
- [NestJS Bootstrap](https://docs.nestjs.com/first-steps)
