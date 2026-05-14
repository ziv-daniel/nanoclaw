---
name: nestjs-bun-nx-dotenv-loading
description: |
  Fix environment variable loading in NestJS applications running with Bun in Nx monorepos. Use when: (1) error "Invalid environment variables: DATABASE_URL expected string, received undefined", (2) process.env variables are undefined in main.ts or bootstrap, (3) NestJS app in Nx workspace with root .env file, (4) using Bun as runtime. Covers explicit dotenv.config() with correct path resolution in monorepo structure.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# NestJS + Bun + Nx: Environment Variable Loading Fix

## Problem

When running a NestJS application with Bun in an Nx monorepo, environment variables from the root `.env` file are not loaded, causing errors like:

```
Invalid environment variables: DATABASE_URL expected string, received undefined
```

Or variables in `process.env` are undefined even though `.env` exists.

## Context / Trigger Conditions

**Error symptoms:**
```
Error: Invalid environment variables: DATABASE_URL expected string, received undefined
Error: JWT_SECRET not configured
```

**Environment:**
- Nx monorepo structure: `apps/api/`, `apps/web/`, `packages/`
- NestJS backend in `apps/api/`
- Root `.env` file at project root
- Using Bun as runtime: `bun run src/main.ts`
- Environment validation with Zod or class-validator

**When this occurs:**
- Running API from `apps/api/` directory
- `.env` file exists at root but isn't loaded
- Works with `nx serve api` but not with direct Bun command
- ConfigModule or validation runs before dotenv loads

## Solution

### Step 1: Install dotenv Package

```bash
cd apps/api
bun add dotenv
```

### Step 2: Load .env Early in main.ts

Add explicit dotenv loading **at the very top** of `main.ts`, before any imports that depend on environment variables:

```typescript
// apps/api/src/main.ts
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from root .env file
// CRITICAL: Must be before NestFactory.create()
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  const env = validateEnv(); // Now process.env has variables loaded

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  });

  await app.listen(env.PORT);
  console.log(`API running on http://localhost:${env.PORT}/api`);
}

bootstrap();
```

### Step 3: Understand Path Resolution in Nx Monorepo

**Monorepo structure:**
```
project-root/
├── .env                          ← Root .env file
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts          ← Your entry point
│   │   │   └── ...
│   │   └── project.json
│   └── web/
└── packages/
```

**Path resolution:**
- `__dirname` when running from `apps/api/src/main.ts` points to build output location
- For TypeScript: `__dirname` is `/path/to/project/apps/api/src/`
- To reach root: `../../../.env` (up 3 levels: src → api → apps → root)

**Alternative using process.cwd():**
```typescript
dotenv.config({ path: path.join(process.cwd(), '.env') });
```

This works if you run from project root: `bun run apps/api/src/main.ts`

### Step 4: Verify Environment Loading

Add debug logging to confirm variables load:

```typescript
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Debug: Verify loading (remove in production)
console.log('Environment loaded:', {
  DATABASE_URL: process.env.DATABASE_URL ? '✓' : '✗',
  JWT_SECRET: process.env.JWT_SECRET ? '✓' : '✗',
  PORT: process.env.PORT || 'undefined',
});
```

## Verification

1. **Ensure .env exists at project root:**
   ```bash
   ls -la .env
   # Should show .env file with contents
   ```

2. **Start API server:**
   ```bash
   cd apps/api
   bun run src/main.ts
   ```

3. **Check output:**
   ```
   Environment loaded: { DATABASE_URL: '✓', JWT_SECRET: '✓', PORT: '3333' }
   [Nest] Starting Nest application...
   [Nest] AppModule dependencies initialized
   API running on http://localhost:3333/api
   ```

4. **Test API endpoint:**
   ```bash
   curl http://localhost:3333/api/health
   # Should respond without "DATABASE_URL undefined" error
   ```

## Example

**Complete main.ts with dotenv loading:**

```typescript
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function bootstrap() {
  // Validate environment before creating app
  const env = validateEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global configuration
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.enableCors({
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  });

  await app.listen(env.PORT);
  console.log(`✓ API running on http://localhost:${env.PORT}/api`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
```

**Environment validation with Zod:**

```typescript
// apps/api/src/config/env.validation.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.string().default('3333').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:', error);
    throw new Error('Environment validation failed');
  }
}
```

## Notes

- **Order matters**: dotenv.config() must run before any code that reads process.env
- **Path resolution**: In Nx monorepo, calculate relative path from entry point to root .env
- **Bun native dotenv**: Bun has built-in dotenv support, but explicit loading is more reliable
- **ConfigModule**: NestJS ConfigModule.forRoot() can load .env, but explicit early loading prevents bootstrap issues
- **Multiple .env files**: You can have both root `.env` and `apps/api/.env`. Root loads first, app-specific overrides.

**Alternative: Use Bun's automatic loading:**
```bash
# Bun automatically loads .env from current directory
cd project-root
bun run apps/api/src/main.ts
```

But explicit dotenv.config() is more portable and works consistently regardless of working directory.

## References

- [NestJS Configuration Module](https://docs.nestjs.com/techniques/configuration)
- [dotenv NPM Package](https://www.npmjs.com/package/dotenv)
- [Bun Environment Variables](https://bun.sh/docs/runtime/env)
- [Nx Monorepo Best Practices](https://nx.dev/concepts/more-concepts/monorepo-best-practices)
