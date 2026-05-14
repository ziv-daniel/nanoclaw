---
name: missing-imported-file-monorepo-docker
description: |
  Fix "Could not load [path]" or "ENOENT: no such file or directory" errors
  in Docker builds for monorepos when components import from files that don't exist yet.
  Use when: (1) Local dev works fine but Docker build fails with Vite/webpack "Could not load",
  (2) Components reference new constants/utilities not yet created, (3) Files were imported
  before being committed. Covers npm workspaces, Lerna, Turborepo with TypeScript/Vite.
author: Claude Code
version: 1.0.0
date: 2026-02-08
---

# Missing Imported File in Monorepo Docker Builds

## Problem

In monorepos, developers often update components to import from new constant files or utility modules before those files are actually created/committed. This works fine in local development (since uncommitted files exist on disk), but fails spectacularly in Docker builds:

```
error during build:
[vite:load-fallback] Could not load /app/shared/src/constants/labels
(imported by src/components/management/tabs/facility/index.tsx):
ENOENT: no such file or directory
```

The error message is clear but doesn't immediately indicate the root cause: **the imported file simply doesn't exist**.

## Context / Trigger Conditions

- **Environment**: Docker build of monorepo fails while local `npm run dev` works perfectly
- **Error message**: `Could not load [path]` (Vite), `ENOENT: no such file or directory`
- **File doesn't exist**: Check with `git ls-files` or `ls` - the imported file is genuinely missing
- **Common pattern**:
  - Components updated to use new constants file
  - Imports added: `import { LABELS } from '@shared/constants/labels'`
  - But `labels.ts` was never created or committed
- **Build tools**: Affects Vite, webpack, and similar bundlers

## Solution

### Step 1: Identify Missing Files

Check which imports are failing:

```bash
# From error message, extract the missing path
# Example: /app/shared/src/constants/labels

# Verify it doesn't exist
ls -la shared/src/constants/labels.ts

# Or use git to check if it was ever committed
git ls-files | grep labels
```

### Step 2: Create the Missing Files

Create all missing files that are being imported. The file should contain the exports expected by the importing components.

**Example**: If components import:
```typescript
import { FACILITY_LABELS, MANAGEMENT_LABELS } from '@shared/constants/labels';
```

Create `shared/src/constants/labels.ts`:
```typescript
export const FACILITY_LABELS = {
  singular: 'אתר',
  plural: 'אתרים',
  // ... rest of labels
} as const;

export const MANAGEMENT_LABELS = {
  tabs: { /* ... */ },
  userForm: { /* ... */ },
  // ... rest of labels
} as const;
```

### Step 3: Commit the Files

```bash
git add shared/src/constants/labels.ts
git commit -m "feat: create [file] with [exports]"
git push origin [branch]
```

### Step 4: Retry Docker Build

The Docker build should now find all imported files and complete successfully.

## Verification

After creating and committing the file:

1. **Local verification**:
   ```bash
   npm run build  # Should complete without import errors
   npm run typecheck  # TypeScript should resolve imports
   ```

2. **Docker verification**:
   - The build should progress past the bundle step
   - No `Could not load` or `ENOENT` errors
   - Final Docker image successfully created

## Example

**Scenario**: React components were updated to use centralized Hebrew labels:

```typescript
// frontend/src/components/management/tabs/facility/index.tsx
import { MANAGEMENT_LABELS } from '@shared/constants/labels';  // ← This import exists in code
```

But the file didn't exist:
```bash
$ ls shared/src/constants/labels.ts
ls: cannot access 'shared/src/constants/labels.ts': No such file or directory
```

**Fix**: Create the file with all expected exports:

```typescript
// shared/src/constants/labels.ts
export const MANAGEMENT_LABELS = {
  tabs: {
    facilities: 'ניהול אתרים',
    sites: 'ניהול מקומות לינה',
  },
  userForm: {
    roleLabel: 'תפקיד',
    facilitiesLabel: 'אתרים',
  },
  // ... more labels
} as const;
```

Then commit and rebuild.

## Notes

- **Why local dev works**: Your local `node_modules` and file system contain the uncommitted file
- **Why Docker fails**: Docker `git clone` gets only committed files - uncommitted changes don't exist
- **Prevention**: Use `git status` or CI pre-commit checks to catch uncommitted imports before pushing
- **Related issue**: Ensure imported exports match what components expect (TypeScript will catch type mismatches)
- **Monorepo context**: This is especially common when migrating to path aliases (`@shared/*`) or refactoring exports

## Prevention Strategies

1. **Pre-commit hook**: Validate all imports are resolvable
2. **TypeScript check**: Run `tsc --noEmit` locally before committing
3. **Import organization**: Create constants/utilities BEFORE updating components to use them
4. **Git status verification**: Always check `git status` includes all necessary files

## References

- [Vite - Load Fallback Documentation](https://vitejs.dev/)
- [Node.js fs.promises.readFile](https://nodejs.org/api/fs.html#fs_fspromises_readfile_path_encoding)
- [npm workspaces best practices](https://docs.npmjs.com/cli/v7/using-npm/workspaces)
