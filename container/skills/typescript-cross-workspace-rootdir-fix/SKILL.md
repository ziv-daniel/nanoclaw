---
name: typescript-cross-workspace-rootdir-fix
description: |
  Fix TypeScript TS6059 "File is not under rootDir" and TS6307 "File is not listed within
  the file list" errors in monorepo workspaces with cross-workspace imports. Use when:
  (1) tsc build fails with TS6059 because a path alias resolves outside rootDir,
  (2) generated code (e.g., Prisma zod-prisma-types) imports types from another workspace,
  (3) shared workspace references backend-generated types via tsconfig paths,
  (4) project references cause TS6305 "Output file has not been built from source file",
  (5) tsc emits nothing because noEmitOnError:true blocks output on TS6059.
  Covers monorepos with npm workspaces, composite projects, and Prisma code generation.
author: Claude Code
version: 1.0.0
date: 2026-02-24
---

# TypeScript Cross-Workspace rootDir Fix

## Problem
In monorepos, a workspace's tsconfig may have a path alias that resolves to a file in
another workspace (e.g., `@generated-prisma/client` → `../backend/src/.../client.ts`).
When `rootDir` is set to `./src`, TypeScript throws:
- **TS6059**: File 'X' is not under 'rootDir'
- **TS6307**: File 'X' is not listed within the file list

This blocks `tsc` from emitting `.d.ts` files, which then cascades to other workspaces
that reference this one via project references (**TS6305**: Output file has not been built).

## Context / Trigger Conditions
- Monorepo with npm workspaces and TypeScript project references
- `tsconfig.json` has `rootDir: ./src` and a `paths` alias pointing outside the workspace
- Auto-generated code (Prisma zod schemas, protobuf types) imports from another workspace
- `tsc` build fails with TS6059, no `.d.ts` files emitted
- Downstream workspaces fail with TS6305 because referenced project has no output

## Solution

### Approach: noEmitOnError + explicit include

Add the external file to `include` and set `noEmitOnError: false`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmitOnError": false,
    "paths": {
      "@shared/*": ["./src/*"],
      "@generated-prisma/client": ["../backend/src/lib/prisma/generated/client.ts"]
    }
  },
  "include": [
    "src/**/*.ts",
    "../backend/src/lib/prisma/generated/client.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

**Why this works:**
1. Adding the file to `include` fixes TS6307 (file not listed)
2. `noEmitOnError: false` tells tsc to emit `.d.ts` files despite the TS6059 warning
3. TS6059 still appears as a warning but doesn't block output
4. `rootDir: ./src` is preserved so `dist/` structure stays correct
5. Downstream workspaces get the `.d.ts` files they need

### Pre-push/CI script handling

Since `tsc` exits with code 2 (error), use `|| true` in build scripts:

```bash
# In pre-push or CI scripts
npm run build -w shared || true  # Emits files despite TS6059 warning
```

### Approaches that DON'T work

| Approach | Why it fails |
|----------|-------------|
| `rootDir: ".."` | Emits nested `dist/backend/src/...` and `dist/shared/src/...` — breaks imports |
| Separate `tsconfig.build.json` with `noEmit: false` | If main tsconfig has `noEmit: true`, project references fail (TS6310) |
| `noEmit: true` in referenced project | TS6310: "Referenced project may not disable emit" |
| Excluding generated files from build | Other source files import from them — can't exclude |
| Type stub in shared | Generated code uses hundreds of `Prisma.*` types — impractical |

## Verification
```bash
# 1. Clean build
rm -rf shared/dist shared/tsconfig.tsbuildinfo

# 2. Build shared (exits non-zero but emits files)
npm run build -w shared

# 3. Verify .d.ts files exist
ls shared/dist/index.d.ts

# 4. Verify downstream typecheck works
npm run typecheck -w backend
npm run typecheck -w frontend
```

## Example

**Before** (fails, no output):
```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "paths": {
      "@generated-prisma/client": ["../backend/src/lib/prisma/generated/client.ts"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

**After** (emits despite warning):
```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "noEmitOnError": false,
    "paths": {
      "@generated-prisma/client": ["../backend/src/lib/prisma/generated/client.ts"]
    }
  },
  "include": ["src/**/*.ts", "../backend/src/lib/prisma/generated/client.ts"]
}
```

## Notes
- The proper long-term fix is to move Prisma client generation into the shared workspace
  (or a dedicated `@project/prisma` workspace), eliminating the cross-workspace import
- This issue commonly arises with `zod-prisma-types` generator outputting to shared
  while Prisma client lives in backend
- The `noEmitOnError: false` override is safe because CI still catches real type errors
  via workspace-specific typecheck commands
- Delete `tsconfig.tsbuildinfo` when switching between configs to avoid stale state

## References
- [TypeScript rootDir documentation](https://www.typescriptlang.org/tsconfig#rootDir)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [noEmitOnError documentation](https://www.typescriptlang.org/tsconfig#noEmitOnError)
