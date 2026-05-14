---
name: isolated-system-no-remote-resources
description: |
  Development patterns for offline/isolated web applications (military, secure, or air-gapped systems). Use when: (1) system must work without internet connectivity, (2) no CDN or external resources allowed, (3) military/defense/secure government systems, (4) air-gapped networks. Covers removing Google Fonts, external CDNs, using system fonts, bundling all dependencies locally, and configuring build tools for fully offline operation.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Isolated System Development: No Remote Resources

## Problem

When building web applications for military, defense, secure government, or air-gapped networks, the system must operate completely offline without any external dependencies. Standard web development practices (Google Fonts, CDNs, external APIs) violate this requirement.

## Context / Trigger Conditions

**Use this pattern when:**
- Building for military or defense organizations
- System must work in air-gapped/isolated networks
- No internet connectivity guaranteed
- Security requirements forbid external resources
- System must be fully self-contained

**Symptoms of violation:**
- `@import url('https://fonts.googleapis.com/...')` in CSS
- CDN links in HTML (`<link href="https://cdn.jsdelivr.net/..."`)
- External API calls (except to localhost/internal servers)
- Third-party analytics, monitoring, or tracking scripts
- External image/asset URLs

## Solution

### Step 1: Remove All Remote Font References

**Before (violates isolation):**
```css
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap');

body {
  font-family: 'Heebo', 'Assistant', Arial, sans-serif;
}
```

**After (isolated):**
```css
/* No @import statement needed */

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  /* Uses fonts already installed on system */
}
```

**Tailwind config:**
```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Arial', 'sans-serif'],
      },
    },
  },
};
```

### Step 2: System Font Stack for Different Languages

**English/Latin:**
```css
font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
```

**Hebrew:**
```css
font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
/* Windows: Segoe UI supports Hebrew
   macOS: system-ui uses SF Pro with Hebrew support
   Linux: defaults to system sans-serif with Hebrew */
```

**Arabic:**
```css
font-family: system-ui, -apple-system, 'Segoe UI', 'Arabic Typesetting', Arial, sans-serif;
```

**Chinese:**
```css
font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

### Step 3: Bundle All Dependencies Locally

**package.json - no CDN dependencies:**
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^4.1.0"
  }
}
```

All packages installed via `bun install` (or `npm install`) are bundled into `node_modules` and served locally.

### Step 4: Verify Build Output Contains Everything

**Vite build check:**
```bash
bun run build

# Check dist/ folder:
# ✅ dist/index.html (no external links)
# ✅ dist/assets/*.js (all JS bundled)
# ✅ dist/assets/*.css (all CSS bundled)
# ✅ No references to external URLs
```

**Audit dist/index.html:**
```bash
# Search for external resources:
grep -i "https://" dist/index.html
grep -i "http://" dist/index.html

# Should only find localhost or relative paths
```

### Step 5: Configure API Base URL for Internal Network

**Environment variable:**
```bash
# .env
VITE_API_URL=http://localhost:3333/api

# Or for production internal network:
VITE_API_URL=http://internal-server.local:3333/api
```

**API client:**
```typescript
// src/api/client.ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // No external URLs
});
```

### Step 6: Document Isolation Requirements

**Create DEPLOYMENT.md or add to README:**
```markdown
## Isolation Requirements

This system is designed for isolated/air-gapped networks:

❌ **Forbidden:**
- External CDNs (Google Fonts, jQuery CDN, etc.)
- Third-party analytics (Google Analytics, Mixpanel, etc.)
- External API calls
- Social media widgets
- External images/assets

✅ **Required:**
- All dependencies bundled locally (`node_modules/`)
- System fonts only (no web fonts)
- Internal network API endpoints only
- All assets served from local build
```

**Add to claude.md or project guidelines:**
```markdown
## CRITICAL CONSTRAINTS

**NO REMOTE RESOURCES**: This is a military/secure system:
- ❌ NO Google Fonts API or external font CDN
- ❌ NO external CSS/JS libraries from CDNs
- ❌ NO external API calls except to internal servers
- ✅ Use system fonts only
- ✅ All dependencies bundled locally
- ✅ All assets served from local build
```

## Verification

### Pre-Deployment Checklist

1. **Build the application:**
   ```bash
   bun run build
   ```

2. **Audit for external resources:**
   ```bash
   # Check HTML
   grep -r "https://" dist/ | grep -v "localhost"
   
   # Check CSS
   grep -r "@import url" dist/
   
   # Check JS (look for fetch/axios to external URLs)
   grep -r "https://" dist/assets/*.js | grep -v "localhost"
   ```

3. **Test offline:**
   ```bash
   # Disconnect from internet
   # Serve build locally
   bunx serve dist -p 8080
   
   # Navigate to http://localhost:8080
   # Verify everything works (except API calls to backend)
   ```

4. **Network tab check:**
   - Open browser DevTools → Network tab
   - Load application
   - Filter: "All" or "Other"
   - Verify: No requests to external domains (except localhost)

## Example

**Complete isolated stack example:**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // All assets bundled, no external references
  },
});
```

```css
/* src/index.css - fully isolated */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    direction: rtl; /* for Hebrew/Arabic */
  }
}
```

```typescript
// src/api/client.ts - internal network only
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3333/api',
  timeout: 30000,
});
```

## Notes

- **System fonts**: Different OSes have different system fonts. Test on target deployment OS (usually Windows for military systems).
- **Fallback fonts**: Always provide fallback fonts in font stack: `system-ui, -apple-system, 'Segoe UI', Arial, sans-serif`.
- **Icons**: Use bundled icon libraries (lucide-react, react-icons) instead of Font Awesome CDN.
- **Images**: Store all images in `public/` or `src/assets/`, never external URLs.
- **Maps**: If maps needed, use self-hosted tile server (OpenStreetMap export), not Google Maps API.
- **Service workers**: Can be used for offline functionality once deployed internally.

## References

- [DoD DevSecOps Fundamentals](https://dodcio.defense.gov/Portals/0/Documents/Library/DoD%20Enterprise%20DevSecOps%20Fundamentals%20v2.5.pdf)
- [Military System Containerization](https://www.army-technology.com/news/us-army-contracts-picogrid-for-military-system-integration/)
- [Progressive Web Apps for Offline](https://www.agilesoftlabs.com/blog/2026/01/how-web-application-development-is)
