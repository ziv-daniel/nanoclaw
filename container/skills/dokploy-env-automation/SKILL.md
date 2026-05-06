---
name: dokploy-env-automation
description: |
  Add or update environment variables in a Dokploy compose service using Playwright
  browser automation (e2e-runner agent). Use when: (1) needing to set secrets in
  Dokploy without manual UI interaction, (2) automating env var updates as part of
  a deployment workflow, (3) Dokploy API returns 401 Unauthorized from external
  networks (Cloudflare blocks direct API access). The Dokploy env editor is a
  CodeMirror instance — requires typing into the editor, not filling a standard input.
  Covers: login, project navigation, env tab, CodeMirror editing, save, and redeploy.
author: Claude Code
version: 1.0.0
date: 2026-04-13
---

# Dokploy Environment Variable Automation via Playwright

## Problem

Dokploy's REST/tRPC API (`/api/auth.login`) returns `401 Unauthorized` when called from
outside the local network because Cloudflare Access or the Cloudflare tunnel blocks it.
Manually setting environment variables through the Dokploy UI is tedious and error-prone
when dealing with multiple secrets. The env editor in Dokploy uses CodeMirror (not a plain
textarea), which requires special Playwright handling.

## Context / Trigger Conditions

- Deploying new secrets (API keys, passwords, tokens) to Dokploy production
- Direct API calls to `https://dokploy.danielshaprvt.work/api/*` return 401
- Local network (192.168.68.x) unreachable from Claude Code's WSL environment
- Need to set `REDIS_PASSWORD`, `JWT_REFRESH_SECRET`, `OAUTH_ENCRYPTION_KEY`, or similar

## Solution

Use the **e2e-runner** agent with Playwright to automate the Dokploy UI.

### Key Playwright Pattern for CodeMirror Editor

The Dokploy environment tab uses a CodeMirror editor, not a plain `<textarea>`. Standard
`fill()` doesn't work. Use keyboard navigation to append lines:

```typescript
// Find the CodeMirror editor
const editor = page.locator('.cm-content');
await editor.click();

// Go to end of existing content
await page.keyboard.press('Control+End');
await page.keyboard.press('End');

// Type new env vars (one per line)
await page.keyboard.press('Enter');
await page.keyboard.type('REDIS_PASSWORD=yourpassword');
await page.keyboard.press('Enter');
await page.keyboard.type('OAUTH_ENCRYPTION_KEY=yourhexkey');
```

### Full Automation Flow

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false }); // headed for debugging
const page = await browser.newPage();

// 1. Login
await page.goto('https://dokploy.danielshaprvt.work');
await page.fill('input[name="email"]', 'zivdaniel12@gmail.com');
await page.fill('input[name="password"]', 'Z5877029admin');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**');

// 2. Navigate to project
await page.click('text=music-mind'); // or however the project is named
// May need: await page.click('text=musicmind-stack');

// 3. Click Environment tab
await page.click('text=Environment');
await page.waitForSelector('.cm-content');

// 4. Append env vars to CodeMirror editor
const editor = page.locator('.cm-content');
await editor.click();
await page.keyboard.press('Control+End');
await page.keyboard.press('End');

const newVars = [
  'REDIS_PASSWORD=...',
  'OAUTH_ENCRYPTION_KEY=...',
  'JWT_REFRESH_SECRET=...',
];

for (const varLine of newVars) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(varLine);
}

// 5. Save
await page.click('button:has-text("Save")');
await page.waitForSelector('text=Environments Added'); // success toast

// 6. Deploy
await page.click('button:has-text("Deploy")');
// Confirm if a dialog appears
const confirmBtn = page.locator('button:has-text("Confirm")');
if (await confirmBtn.isVisible()) {
  await confirmBtn.click();
}

// 7. Verify deployment started
await page.waitForSelector('text=Running');

await browser.close();
```

### Using via e2e-runner Agent

The simplest approach — describe the task to the agent:

```
Use Playwright to log into Dokploy at https://dokploy.danielshaprvt.work
with email: zivdaniel12@gmail.com / password: Z5877029admin

Add these env vars to the musicmind-stack compose service:
- REDIS_PASSWORD=...
- OAUTH_ENCRYPTION_KEY=...
- JWT_REFRESH_SECRET=...

Then trigger a redeploy. Use headed browser so I can see what's happening.
```

## Verification

- Toast message "Environments Added" appears after Save
- Deployment status shows "Running" (yellow dot) then "Done" (green dot)
- Health check: `curl https://musicmind.danielshaprvt.work/api/health` returns 200

## Notes

- **Cloudflare blocks the tRPC API**: `POST /api/auth.login` returns 401 from outside LAN — browser UI is the only external path.
- **CodeMirror editor**: Dokploy's env editor is NOT a plain textarea. It's a CodeMirror instance with class `.cm-content`. Standard `fill()` clears existing content; use keyboard navigation to append.
- **Eye icon**: Existing vars may be masked. Click the eye icon to reveal before editing if you need to check current values.
- **Deployment ordering**: If the new env var is referenced in the compose file (e.g., `REDIS_PASSWORD` in `--requirepass ${REDIS_PASSWORD}`), deploy the compose changes first, THEN set the env var in Dokploy, THEN redeploy. Otherwise Redis starts without a password but URLs expect one — causing connection failures.
- **Credentials location**: `C:\Repo\proxmox\.env` — DOKPLOY_URL, DOKPLOY_USER, DOKPLOY_USER_PASSWORD.

## Homelab Infrastructure Context

- Dokploy UI: `https://dokploy.danielshaprvt.work`
- Dokploy LXC: `192.168.68.201` (reachable from LAN only)
- Music Mind compose: `docker-compose.prod.yml` (auto-deployed on push to `main`)
- Project name in Dokploy: `musicmind-stack` (or similar — navigate via project list)
