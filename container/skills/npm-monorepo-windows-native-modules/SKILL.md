---
name: npm-monorepo-windows-native-modules
description: |
  Fix "Cannot find module @rollup/rollup-win32-x64-msvc", "Failed to load native
  binding" for @swc/core, or "Cannot find native binding" for unrs-resolver on Windows.
  Use when: (1) Vite fails to start with rollup native module error, (2) SWC binding
  fails to load on Windows x64, (3) ESLint fails with unrs-resolver native binding error,
  (4) npm has bug with optional dependencies in monorepos, (5) fresh npm install on
  Windows missing platform-specific packages, (6) pre-commit hooks fail on eslint --fix
  with "Cannot find native binding". Common in npm workspaces monorepos using
  Vite + SWC + ESLint with eslint-plugin-import-x.
author: Claude Code
version: 2.0.0
date: 2026-02-09
---

# Windows Native Module Resolution in npm Monorepos

## Problem
npm has a known bug (https://github.com/npm/cli/issues/4828) where optional
platform-specific native dependencies are not correctly installed in monorepos. This
affects packages like Rollup, SWC, and unrs-resolver that ship separate native binaries
per platform.

## Context / Trigger Conditions

**Rollup error (Vite build/dev):**
```
Error: Cannot find module @rollup/rollup-win32-x64-msvc. npm has a bug related to
optional dependencies (https://github.com/npm/cli/issues/4828).
```

**SWC error (Vite build/dev):**
```
Error: Failed to load native binding
    at Object.<anonymous> (node_modules/@swc/core/binding.js:333:11)
```

**unrs-resolver error (ESLint / lint-staged):**
```
Error: Cannot find native binding. npm has a bug related to optional dependencies
    at Object.<anonymous> (node_modules/unrs-resolver/index.js:376:11)
```

**Common when:**
- Windows x64 machine
- npm workspaces monorepo
- Using Vite (depends on Rollup) and/or SWC (via @vitejs/plugin-react-swc)
- Using ESLint with eslint-plugin-import-x (depends on unrs-resolver)
- Fresh `npm install` or after clearing node_modules
- Pre-commit hooks running eslint --fix fail unexpectedly

## Solution

Install **all three** platform-specific packages explicitly:

```bash
# For Rollup (needed by Vite)
npm install @rollup/rollup-win32-x64-msvc

# For SWC (needed by @vitejs/plugin-react-swc or @swc/core)
npm install @swc/core-win32-x64-msvc

# For unrs-resolver (needed by eslint-plugin-import-x via @tanstack/eslint-config)
npm install @unrs/resolver-binding-win32-x64-msvc
```

### Permanent Fix
Add these to root `package.json` devDependencies so they're always installed:

```json
{
  "devDependencies": {
    "@rollup/rollup-win32-x64-msvc": "^4.57.1",
    "@swc/core-win32-x64-msvc": "^1.15.11",
    "@unrs/resolver-binding-win32-x64-msvc": "^1.11.1"
  }
}
```

### Diagnosis Tip
When you see a "Cannot find native binding" error, check which package needs the binding:
```bash
# Check if the native binding directory exists
ls node_modules/@rollup/rollup-win32-x64-msvc
ls node_modules/@swc/core-win32-x64-msvc
ls node_modules/@unrs/resolver-binding-win32-x64-msvc
```

### Other Platforms
- **macOS ARM64**: `@rollup/rollup-darwin-arm64`, `@swc/core-darwin-arm64`, `@unrs/resolver-binding-darwin-arm64`
- **macOS x64**: `@rollup/rollup-darwin-x64`, `@swc/core-darwin-x64`, `@unrs/resolver-binding-darwin-x64`
- **Linux x64**: `@rollup/rollup-linux-x64-gnu`, `@swc/core-linux-x64-gnu`, `@unrs/resolver-binding-linux-x64-gnu`
- **Linux ARM64**: `@rollup/rollup-linux-arm64-gnu`, `@swc/core-linux-arm64-gnu`, `@unrs/resolver-binding-linux-arm64-gnu`

## Verification
After installing, verify each tool works:
```bash
# Vite dev server
npm run dev

# ESLint
npx eslint --version

# Full pre-commit hook chain
git commit --allow-empty -m "test hooks"
```

## Notes
- This is a known npm bug, not a project configuration issue
- The packages are marked as `optionalDependencies` which npm sometimes fails to resolve
  correctly in workspace setups
- pnpm and yarn handle this correctly in most cases
- Versions should match or be compatible with the installed parent package versions
- **All three bindings can disappear simultaneously** after `npm install` - always check all three
- The unrs-resolver binding was added in 2026 when eslint-plugin-import-x adopted it for fast module resolution
- Pre-commit hooks (Husky + lint-staged) are the most common place to discover missing ESLint bindings,
  since `npm run dev` doesn't trigger ESLint
