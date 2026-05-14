---
name: npm-optional-deps-wrong-platform
description: |
  Fix npm installing wrong platform native binaries for optional dependencies.
  Use when: (1) "Cannot find module @rollup/rollup-win32-x64-msvc" on Windows,
  (2) "Cannot find module @swc/core-win32-x64-msvc" on Windows,
  (3) node_modules/@rollup/ contains linux binaries instead of win32,
  (4) `npm install` repeatedly installs wrong-platform optional deps,
  (5) native binding MODULE_NOT_FOUND errors despite being in package.json optionalDependencies.
  Related to known npm bug with optional dependencies (npm/cli#4828).
author: Claude Code
version: 1.0.0
date: 2026-02-24
---

# npm Optional Dependencies Wrong Platform Fix

## Problem
npm installs native bindings for the wrong platform (e.g., Linux binaries on Windows)
for packages listed in `optionalDependencies`. This is a known npm bug (npm/cli#4828).
Running `npm install` repeatedly does not fix it.

## Context / Trigger Conditions
- Error: `Cannot find module @rollup/rollup-win32-x64-msvc`
- Error: `Cannot find module @swc/core-win32-x64-msvc`
- Error: `Cannot find module @unrs/resolver-binding-win32-x64-msvc`
- `node_modules/@rollup/` contains `rollup-linux-x64-gnu` instead of `rollup-win32-x64-msvc`
- Happens in monorepos with `optionalDependencies` in root `package.json`
- `node -e "console.log(process.platform, process.arch)"` confirms `win32 x64`
- `npm install <package> --force` still doesn't install the correct binary

## Solution

### Step 1: Verify platform
```bash
node -e "console.log(process.platform, process.arch)"
# Expected: win32 x64
```

### Step 2: Download the correct platform package
```bash
npm pack @rollup/rollup-win32-x64-msvc@<version>
# Creates: rollup-rollup-win32-x64-msvc-<version>.tgz
```

### Step 3: Extract to node_modules
```bash
mkdir -p node_modules/@rollup/rollup-win32-x64-msvc
tar xzf rollup-rollup-win32-x64-msvc-<version>.tgz \
  -C node_modules/@rollup/rollup-win32-x64-msvc \
  --strip-components=1
rm rollup-rollup-win32-x64-msvc-<version>.tgz
```

### Step 4: Remove wrong-platform binaries (optional)
```bash
rm -rf node_modules/@rollup/rollup-linux-x64-gnu
rm -rf node_modules/@rollup/rollup-linux-x64-musl
```

### Step 5: Verify
```bash
node -e "require('@rollup/rollup-win32-x64-msvc'); console.log('OK')"
```

### Repeat for other affected packages
Common packages that need this fix:
- `@rollup/rollup-win32-x64-msvc`
- `@swc/core-win32-x64-msvc`
- `@unrs/resolver-binding-win32-x64-msvc`

## Verification
```bash
node -e "require('@rollup/rollup-win32-x64-msvc'); console.log('rollup OK')"
node -e "require('@swc/core-win32-x64-msvc'); console.log('swc OK')"
node -e "require('@unrs/resolver-binding-win32-x64-msvc'); console.log('unrs OK')"
```

## Notes
- This is a workaround; the root cause is npm's handling of optional dependencies
- The manually extracted binaries may be overwritten by `npm install` — re-run if needed
- `npm ci` (clean install) sometimes resolves this; try it before the manual approach
- The `npm pack` + `tar extract` approach is reliable when `npm install --force` fails
- These binaries are NOT committed to git (in node_modules)

## References
- [npm/cli#4828 - Optional dependencies platform mismatch](https://github.com/npm/cli/issues/4828)
- [Rollup troubleshooting - native binary not found](https://rollupjs.org/troubleshooting/)
