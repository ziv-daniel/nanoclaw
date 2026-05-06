---
name: nx-bun-monorepo-setup
description: |
  Complete setup guide for Nx monorepo with Bun as package manager. Use when:
  (1) Creating new Nx workspace with Bun runtime, (2) Setting up TypeScript
  monorepo with Bun workspaces, (3) Configuring NestJS backend + React frontend
  in Nx with Bun, (4) Need to configure path aliases and shared packages in
  Bun + Nx context. Covers bunfig.toml configuration, nx.json plugin setup,
  workspace structure, and tsconfig.base.json path mappings. Provides 2026
  best practices for performance and dependency management.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Nx + Bun Monorepo Setup (2026)

## Problem
Setting up an Nx monorepo with Bun as the package manager requires specific configuration that differs from npm/yarn/pnpm setups. Official Nx documentation primarily covers Node.js package managers, and Bun-specific nuances aren't well documented.

## Context / Trigger Conditions
Use this skill when:
- Creating a new Nx workspace and want to use Bun for faster builds/installs
- Migrating existing Nx workspace from npm/yarn to Bun
- Setting up TypeScript monorepo with shared packages and Bun workspaces
- Need 30-400% performance improvement over npm/yarn
- Configuring NestJS + React apps in single monorepo with Bun

## Solution

### Step 1: Initialize Root Configuration

Create `package.json` with Bun workspaces:

```json
{
  "name": "your-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev:api": "nx serve api",
    "dev:web": "nx serve web",
    "dev:all": "nx run-many -t serve",
    "build:all": "nx run-many -t build",
    "test": "nx run-many -t test"
  },
  "devDependencies": {
    "@nx/nest": "latest",
    "@nx/react": "latest",
    "@nx/vite": "latest",
    "nx": "latest",
    "typescript": "^5.3.0"
  }
}
```

### Step 2: Configure Nx for Bun

Create `nx.json`:

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "npmScope": "your-org",
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"]
    },
    "test": {
      "cache": true
    },
    "serve": {
      "cache": false
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*"],
    "production": [
      "!{projectRoot}/**/*.spec.ts",
      "!{projectRoot}/tsconfig.spec.json"
    ]
  },
  "plugins": [
    "@nx/vite/plugin",
    "@nx/nest/plugin"
  ]
}
```

**Key points:**
- `plugins` array enables automatic task inference
- `dependsOn: ["^build"]` ensures dependencies build first
- `cache: true` enables Nx intelligent caching for builds/tests

### Step 3: Configure Bun Runtime

Create `bunfig.toml`:

```toml
[install]
# Use exact versions for reproducible builds
exact = true

# Faster installations
registry = "https://registry.npmjs.org/"

# Symlink node_modules for better performance
linkNativeModules = true

[run]
# Auto-load .env files
env = [".env", ".env.local"]

[test]
# Test configuration
preload = ["./test/setup.ts"]
```

**Key settings:**
- `exact = true`: Locks dependencies to exact versions (recommended for monorepos)
- `linkNativeModules = true`: Better performance for native Node modules
- `env`: Automatic environment variable loading

### Step 4: Configure TypeScript Path Aliases

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM"],
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "paths": {
      "@your-org/shared-schemas": ["packages/shared-schemas/src/index.ts"],
      "@your-org/shared-types": ["packages/shared-types/src/index.ts"],
      "@your-org/shared-utils": ["packages/shared-utils/src/index.ts"]
    },
    "baseUrl": "."
  }
}
```

**Critical settings for Bun:**
- `moduleResolution: "bundler"`: Modern resolution for Bun/Vite
- `experimentalDecorators`: Required for NestJS decorators
- `emitDecoratorMetadata`: Required for NestJS dependency injection
- `paths`: Enable clean imports like `import { schema } from '@your-org/shared-schemas'`

### Step 5: Create Directory Structure

```bash
mkdir -p apps/api/src apps/web/src
mkdir -p packages/shared-schemas/src
mkdir -p packages/shared-types/src
mkdir -p packages/shared-utils/src
```

### Step 6: Configure Individual Apps

**NestJS API** (`apps/api/project.json`):

```json
{
  "name": "api",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/api/src",
  "projectType": "application",
  "targets": {
    "serve": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": "api:build",
        "runBuildTargetDependencies": false
      }
    },
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/api",
        "main": "apps/api/src/main.ts",
        "tsConfig": "apps/api/tsconfig.json"
      }
    }
  }
}
```

**React + Vite** (`apps/web/project.json`):

```json
{
  "name": "web",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/web/src",
  "projectType": "application",
  "targets": {
    "serve": {
      "executor": "@nx/vite:dev-server",
      "options": {
        "buildTarget": "web:build",
        "port": 3000
      }
    },
    "build": {
      "executor": "@nx/vite:build",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/web",
        "configFile": "apps/web/vite.config.ts"
      }
    }
  }
}
```

### Step 7: Configure Shared Packages

Each package needs `package.json`:

```json
{
  "name": "@your-org/shared-schemas",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "latest"
  }
}
```

**Note**: Use `workspace:*` for internal dependencies in apps:

```json
{
  "dependencies": {
    "@your-org/shared-schemas": "workspace:*"
  }
}
```

### Step 8: Install Dependencies with Bun

```bash
bun install
```

**Expected output:**
- Resolving dependencies
- Downloaded and extracted [N packages]
- Saved lockfile (creates `bun.lockb`)

## Verification

1. **Check workspace linking:**
   ```bash
   bun run nx graph
   # Should show all apps and packages with dependencies
   ```

2. **Test builds:**
   ```bash
   bun run build:all
   # All projects should build successfully
   ```

3. **Verify path aliases:**
   ```typescript
   // In apps/api/src/main.ts
   import { someSchema } from '@your-org/shared-schemas';
   // Should resolve without errors
   ```

4. **Check development servers:**
   ```bash
   bun run dev:all
   # Both api and web should start
   ```

## Performance Benchmarks (2026)

- **Installation speed**: 5 seconds vs 32 seconds (npm)
- **Build performance**: 30% faster for simple projects
- **Production builds**: Up to 4x speed improvement
- **Test execution**: 2-3x faster than npm/yarn

## Example Project Structure

```
monorepo/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   ├── project.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── web/                    # React + Vite frontend
│       ├── src/
│       ├── vite.config.ts
│       ├── project.json
│       └── package.json
├── packages/
│   ├── shared-schemas/         # Zod validation
│   ├── shared-types/           # TypeScript types
│   └── shared-utils/           # Utilities
├── nx.json
├── package.json
├── bunfig.toml
├── tsconfig.base.json
└── bun.lockb                   # Auto-generated
```

## Notes

### Windows Considerations
- Bun works on Windows but WSL2 is recommended for best performance
- Path resolution may differ on Windows vs Unix systems
- Use forward slashes in paths even on Windows

### Nx Plugin Compatibility
- Not all Nx plugins are fully tested with Bun (as of 2026)
- `@nx/nest`, `@nx/react`, `@nx/vite` are well-supported
- Test thoroughly when using community plugins

### Migration from npm/yarn
1. Delete `node_modules/` and lock files
2. Run `bun install` to regenerate `bun.lockb`
3. Update CI/CD scripts to use `bun` instead of `npm`/`yarn`

### Common Issues

**Issue: "Cannot find module @your-org/shared-schemas"**
- Check `tsconfig.base.json` paths are correct
- Ensure package has `main` and `types` in package.json
- Try `bun install` to refresh workspace links

**Issue: Nx cache not working**
- Ensure `nx.json` has `cache: true` for build/test targets
- Check `.nx/cache` directory exists and is writable

**Issue: Build fails with decorator errors**
- Ensure `experimentalDecorators` and `emitDecoratorMetadata` are true
- Check NestJS app's tsconfig extends from tsconfig.base.json

## Best Practices (2026)

1. **Keep packages small and domain-focused**: One concern per package
2. **Use barrel files (index.ts)**: Curate exports for clean imports
3. **Enforce boundaries with Nx**: Use `depConstraints` in nx.json
4. **Avoid circular dependencies**: Nx graph command helps detect these
5. **Use TypeScript project references**: Better editor support
6. **Pin Bun version in CI/CD**: Avoid unexpected breaking changes

## References

- [Nx Official Documentation: Monorepo Architecture](https://nx.dev/blog/new-nx-experience-for-typescript-monorepos)
- [Bun Workspaces Guide](https://bun.com/docs/guides/install/workspaces)
- [Nx 19.5 Release Notes - Bun Support](https://nx.dev/blog/nx-19-5-adds-stackblitz-new-features-and-more)
- [GitHub Discussion: Native Bun Support in Nx](https://github.com/nrwl/nx/issues/21075)
- [Medium: Setting Up a Bun Workspace](https://medium.com/@oluijks/setting-up-a-bun-workspace-23543df61e52)
