---
name: bcrypt-arm64-docker-fix
description: Fix bcrypt native module errors on ARM64/Raspberry Pi Docker containers.
author: Claude Code
version: 1.0.0
date: 2026-01-25
---

# bcrypt ARM64 Docker Fix

## Problem
When deploying Node.js/Bun applications to ARM64 architecture (Raspberry Pi, AWS Graviton),
the native `bcrypt` module fails at runtime because it wasn't compiled for the target
architecture during Docker build.

## Context / Trigger Conditions

**Error message:**
```
Cannot find module '/app/node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node'
```

**Symptoms:**
- Docker build succeeds without errors
- Container crashes immediately on startup
- Service shows as FATAL in supervisord
- Error only appears on ARM64, works fine on x86_64

**Common scenarios:**
- Deploying to Raspberry Pi (ARM64)
- Using AWS Graviton instances
- Multi-arch Docker builds
- Any ARM-based edge deployment

## Root Cause

The `bcrypt` package includes native C++ code that must be compiled for the target
architecture. When building Docker images:
- If building on x86_64 for ARM64 (cross-compilation), the native module may not compile correctly
- The `napi-v3` binding isn't found because it was built for the wrong architecture
- Even with `--platform linux/arm64`, native modules can fail

## Solution

Replace `bcrypt` with `bcryptjs` - a pure JavaScript implementation with identical API.

### Step 1: Update package.json

```diff
- "bcrypt": "^5.1.1",
- "@types/bcrypt": "^6.0.0",
+ "bcryptjs": "^2.4.3",
+ "@types/bcryptjs": "^2.4.6",
```

### Step 2: Update imports in all files

```typescript
// Before
import bcrypt from 'bcrypt';

// After
import bcrypt from 'bcryptjs';
```

### Step 3: Find all affected files

```bash
# Find files importing bcrypt
grep -r "from 'bcrypt'" src/
grep -r "require('bcrypt')" src/
```

Common locations:
- Password service/utility files
- Authentication services
- OAuth services
- Seed files
- Test files

### Step 4: Rebuild and deploy

```bash
# Remove lock file to ensure fresh dependency resolution
rm -f bun.lock package-lock.json

# Rebuild Docker image
docker build --platform linux/arm64 -t myapp:latest .

# Restart container
docker compose up -d --force-recreate
```

## Verification

```bash
# Check service status
docker exec container-name supervisorctl status

# Should show RUNNING instead of FATAL
# Check logs for successful startup
docker logs container-name --tail 20
```

## Example

**Before (fails on ARM64):**
```typescript
// src/services/PasswordService.ts
import bcrypt from 'bcrypt';

export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

**After (works on all architectures):**
```typescript
// src/services/PasswordService.ts
import bcrypt from 'bcryptjs';  // Only this line changes!

export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

## Performance Considerations

- `bcryptjs` is ~30% slower than native `bcrypt`
- For most applications, this difference is negligible
- If performance is critical, consider:
  - Building natively on ARM64 hardware
  - Using multi-stage builds with architecture-specific compilation
  - Using argon2 with WebAssembly bindings instead

## Notes

- The API is 100% compatible - no code changes needed beyond the import
- TypeScript types are available via `@types/bcryptjs`
- This also fixes similar issues with other native modules (sharp, sqlite3, etc.)
- For production at scale, consider native builds on ARM64 CI runners

## Related Issues

Other native modules with similar ARM64 issues:
- `sharp` - Use `sharp` with `--platform` flag or pre-built binaries
- `sqlite3` - Use `better-sqlite3` or `sql.js`
- `canvas` - Use `@napi-rs/canvas`

## References
- [bcryptjs npm package](https://www.npmjs.com/package/bcryptjs)
- [Node.js native modules on ARM](https://nodejs.org/api/n-api.html)
