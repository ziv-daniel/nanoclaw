---
name: docker-misleading-error-root-cause
description: Debug misleading Docker build errors that mask missing files or config issues.
author: Claude Code
version: 1.0.0
date: 2026-02-08
---

# Docker Misleading Error Root Cause Investigation

## Problem

Docker build failures often display infrastructure-level error messages (heap exhaustion, out of memory,
timeout) that mask the actual root cause. The build fails for a legitimate file/import reason, but
the error message directs you to fix infrastructure instead.

**Example**: "FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory"
sounds like you need to allocate more memory. But the actual problem was `import { LABELS } from
'@shared/constants/labels'` referencing a file that doesn't exist on disk.

## Context / Trigger Conditions

- **Docker build fails** in a monorepo or multi-stage build
- **Error message** is infrastructure-focused: heap exhaustion, memory limits, timeouts, disk space
- **Local development works fine** - no errors when running `npm run build` locally
- **Build phase**: Error occurs during bundling, TypeScript compilation, or code transformation
- **Previous attempted fix**: You already tried the obvious solution (allocate more memory, increase timeouts)

## Solution

### Step 1: Don't Trust the Error Message

The error message is accurate but misleading. "Out of memory" doesn't mean you need more RAM—it means
a process tried to allocate memory and failed. This can happen because:

1. **Missing imported files** - Bundler tries to resolve imports, can't find files, consumes memory
2. **Circular dependency loops** - Bundler chases circular references indefinitely
3. **Corrupted cache** - Previous build artifacts interfere with current build
4. **Uncommitted files** - Files exist locally but aren't in git, so Docker clone doesn't get them

### Step 2: Check Git for Missing Files

The most common cause: **files referenced in imports but not committed to git**.

```bash
# Find what the error is trying to load
# Look in error message for: "Could not load [path]" or "Cannot find module [path]"

# Example from error: Could not load /app/shared/src/constants/labels

# Check if file exists locally
ls -la shared/src/constants/labels.ts

# Check if it's in git history
git ls-files | grep labels.ts
git status  # Shows uncommitted changes
```

### Step 3: Verify Imports Match Actual Files

Compare component imports to files that actually exist:

```typescript
// In component (src/components/management/tabs/facility/index.tsx):
import { MANAGEMENT_LABELS } from '@shared/constants/labels';  // ← Does this file exist?

// Check if shared/src/constants/labels.ts exists
ls shared/src/constants/labels.ts
# If not found: This is your problem
```

### Step 4: Fix the Root Cause (Not Infrastructure)

**Don't allocate more memory.** Instead:

1. **Create missing files** - If files are imported but don't exist, create them with the expected exports
2. **Remove invalid imports** - If imports reference non-existent files, remove or fix the imports
3. **Commit missing files** - If files exist locally but aren't committed, run `git add` and commit

### Step 5: Verify in Docker

After fixing the root cause:

```bash
# Test locally first
npm run build

# Then test in Docker
docker build -t test:latest .
```

## Verification

- ✅ Local `npm run build` completes without heap errors
- ✅ All imports resolve to actual files: `git ls-files | grep [imported-file]`
- ✅ Docker build completes successfully
- ✅ No "Could not load" or "Cannot find module" errors in logs

## Example

**Scenario**: React components were updated to use centralized Hebrew labels:

```typescript
// frontend/src/components/management/tabs/facility/index.tsx
import { MANAGEMENT_LABELS } from '@shared/constants/labels';  // ← Import added
```

**Docker Build Fails**:
```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
  at vite:load-fallback Could not load /app/shared/src/constants/labels
```

**Why It Looks Like Memory Issue**: The bundler (Vite) is trying to resolve the import, can't find the file,
attempts memory-intensive operations trying to locate it, then runs out of heap.

**Root Cause**: File `shared/src/constants/labels.ts` doesn't exist.

**Fix**: Create the file with proper exports:

```typescript
// shared/src/constants/labels.ts
export const MANAGEMENT_LABELS = {
  tabs: {
    facilities: 'ניהול אתרים',
  },
  userForm: {
    roleLabel: 'תפקיד',
  },
  // ... more labels
} as const;
```

Then commit:
```bash
git add shared/src/constants/labels.ts
git commit -m "feat: create centralized Hebrew labels constants"
docker build .  # Now succeeds
```

## Notes

### Why This Happens

- **Local development**: Uncommitted files exist on your filesystem, so imports resolve fine
- **Docker**: Only committed files are cloned, so imports fail
- **The cascade**: Import resolution failures cause memory-intensive retry loops, eventually exhausting heap

### Prevention

1. **Pre-commit checks** - Validate all imports are resolvable before committing
2. **TypeScript checks** - Run `tsc --noEmit` to catch unresolvable imports
3. **Git status discipline** - Always check `git status` before pushing to ensure all necessary files are committed
4. **Create before import** - Create utility/constant files BEFORE updating components to use them

### Related Issues

- Similar pattern with **circular dependencies** - error looks like memory issue, root cause is dependency loop
- **Corrupted node_modules** - clear cache if previous builds cached bad state: `rm -rf node_modules package-lock.json && npm install`
- **PATH resolution** - Incorrect path aliases in tsconfig can cause import resolution to fail

## References

- [Vite Load Fallback Documentation](https://vitejs.dev/guide/troubleshooting.html)
- [Node.js Heap Documentation](https://nodejs.org/en/docs/guides/nodejs-memory-management/)
- [Webpack Module Resolution](https://webpack.js.org/concepts/module-resolution/)
- [Git Tracking Uncommitted Files](https://git-scm.com/docs/git-status)
