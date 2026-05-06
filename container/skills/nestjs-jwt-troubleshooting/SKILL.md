---
name: nestjs-jwt-troubleshooting
description: |
  Comprehensive troubleshooting guide for NestJS JWT authentication issues.
  Covers: (1) Environment variable timing - JWT secret undefined at module load,
  use registerAsync instead of register; (2) User property mismatch - req.user
  has wrong properties because JWT strategy validate() transforms payload before
  attaching to request. Use when: 401 Unauthorized with valid tokens, database
  constraint violations with null user ID, req.user.sub undefined but token has
  sub claim, login works but protected routes fail.
author: Claude Code
version: 2.0.0
date: 2026-02-04
---

# NestJS JWT Authentication Troubleshooting Guide

## Overview

This guide covers the two most common JWT authentication issues in NestJS applications:

1. **Environment Timing Issue** - JWT module initializes with wrong/undefined secret
2. **User Property Mismatch** - req.user properties don't match expected values

Both issues can be frustrating because authentication appears to work (login succeeds, tokens are issued) but subsequent operations fail in unexpected ways.

---

## Issue 1: Environment Variable Timing

### Problem

JWT authentication fails with 401 Unauthorized responses even when:
- Login endpoint successfully returns a valid JWT token
- The token contains correct payload data
- The Authorization header is properly formatted as `Bearer <token>`

**Root cause**: `JwtModule.register()` evaluates `process.env.JWT_SECRET` at module decorator evaluation time, which happens BEFORE `dotenv.config()` runs in main.ts.

### Trigger Conditions

This issue occurs when ALL of these conditions are met:

1. **Using `JwtModule.register()` with process.env**:
   ```typescript
   JwtModule.register({
     secret: process.env.JWT_SECRET || 'fallback-secret',
     signOptions: { expiresIn: '7d' },
   }),
   ```

2. **dotenv.config() is called in main.ts AFTER imports**:
   ```typescript
   import { AppModule } from './app.module';  // <-- Module decorators evaluate here

   dotenv.config({ path: '.env' });  // <-- Too late! Modules already initialized
   ```

3. **Login works but protected routes fail**: The JwtService (for signing) might use the correct secret from process.env (loaded by the time bootstrap() runs), but the JwtStrategy (for validation) or JwtModule config used the fallback value during initialization.

### Symptoms

- Login returns valid-looking JWT token
- `/api/auth/me` or any protected route returns `{"message":"Unauthorized","statusCode":401}`
- No error messages in server logs
- Token decodes correctly in jwt.io
- Problem persists across server restarts

### Solution

#### Option 1: Use `registerAsync()` (Recommended)

Change from synchronous to asynchronous registration:

```typescript
// BEFORE (broken)
JwtModule.register({
  secret: process.env.JWT_SECRET || 'fallback-secret',
  signOptions: { expiresIn: '7d' },
}),

// AFTER (fixed)
JwtModule.registerAsync({
  useFactory: () => ({
    secret: process.env.JWT_SECRET || 'fallback-secret',
    signOptions: { expiresIn: '7d' },
  }),
}),
```

The `useFactory` function is called at runtime during application bootstrap, AFTER dotenv has loaded.

#### Option 2: Use ConfigModule (More Robust)

For production applications, use NestJS ConfigModule:

```typescript
JwtModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get<string>('JWT_SECRET'),
    signOptions: { expiresIn: '7d' },
  }),
  inject: [ConfigService],
}),
```

#### Option 3: Move dotenv.config() Before Imports (Not Recommended)

You could move dotenv.config to a separate file imported first, but this is fragile and not the NestJS-recommended approach.

### Verification

After applying the fix:

1. Restart the server completely
2. Login to get a fresh token
3. Call a protected endpoint with the new token
4. Should receive successful response instead of 401

```bash
# Test sequence
TOKEN=$(curl -s -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test"}' | jq -r '.accessToken')

curl -s http://localhost:3333/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Should return user object, not 401
```

### Complete Example

**auth.module.ts (Fixed)**:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
        signOptions: {
          expiresIn: '7d',
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

---

## Issue 2: User Property Mismatch

### Problem

After successful JWT authentication, accessing user properties in controllers fails or returns undefined, even though the JWT token contains the expected data. Common symptom: database constraint violations for user ID fields that should be set from `req.user`.

### Trigger Conditions

- Error: `null value in column "submitted_by" violates not-null constraint` (or similar)
- JWT login works and returns valid token
- Token payload contains `sub` (user ID) when decoded
- Controller accesses `req.user.sub` but gets `undefined`
- The JWT auth guard passes (no 401 error)

### Root Cause

The JWT strategy's `validate()` method transforms the payload before attaching it to the request. If the strategy returns `{ id: payload.sub }` but the controller accesses `user.sub`, it will be undefined.

**The bug is a property name mismatch between what the strategy returns and what the controller expects.**

### Solution

#### Step 1: Check the JWT Strategy

```typescript
// src/modules/auth/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  async validate(payload: JwtPayload) {
    // This object becomes req.user
    return {
      id: payload.sub,        // <-- Property is "id", not "sub"
      idNumber: payload.idNumber,
      fullName: payload.fullName,
      role: payload.role,
      branchId: payload.branchId,
    };
  }
}
```

#### Step 2: Update the Controller to Match

```typescript
// WRONG - using payload property name
@Post()
async create(@Body() data: CreateDto, @Request() req: any) {
  const userId = req.user.sub;  // undefined! Strategy returns "id", not "sub"
  return this.service.create(data, userId);
}

// CORRECT - using strategy's returned property name
@Post()
async create(@Body() data: CreateDto, @Request() req: any) {
  const userId = req.user.id;   // Works! Matches what validate() returns
  return this.service.create(data, userId);
}
```

### Verification

1. Log `req.user` in the controller to see the actual object structure
2. Verify the property names match between strategy and controller
3. Test the endpoint - database constraint errors should be resolved

### Complete Example

**Before (bug):**
```typescript
// jwt.strategy.ts
async validate(payload: JwtPayload) {
  return {
    id: payload.sub,  // Returns "id"
    role: payload.role,
    branchId: payload.branchId,
  };
}

// controller.ts
@Post()
async create(@Body() data: CreateDto, @Request() req: any) {
  return this.service.create(data, req.user.sub, req.user.branchId);
  //                                       ^^^ undefined!
}
```

**After (fixed):**
```typescript
// controller.ts
@Post()
async create(@Body() data: CreateDto, @Request() req: any) {
  return this.service.create(data, req.user.id, req.user.branchId);
  //                                       ^^ matches strategy
}
```

---

## Debugging Checklist

### For 401 Unauthorized Errors

- [ ] Is `JwtModule.register()` using `process.env` directly? Change to `registerAsync()`
- [ ] Is dotenv loaded before module imports? Check main.ts import order
- [ ] Does the token decode correctly on jwt.io?
- [ ] Is the `Authorization` header format correct? (`Bearer <token>`, not `bearer` or `JWT`)
- [ ] Is the JWT secret the same for signing and validation?
- [ ] Restart the server after env changes

### For Database Constraint / Null User ID Errors

- [ ] Log `req.user` to see actual object structure
- [ ] Compare property names: strategy `validate()` return vs controller access
- [ ] Check if using `sub` (JWT standard) vs `id` (common app convention)
- [ ] Verify the auth guard is actually applied (no 401 means it passed)

### General JWT Debugging

- [ ] Decode the token payload: `echo "<payload>" | base64 -d`
- [ ] Check token expiration (`exp` claim)
- [ ] Verify token issuer and audience if configured
- [ ] Check for clock skew between servers

---

## Testing JWT Auth Flows

### Unit Test: JWT Strategy

```typescript
describe('JwtStrategy', () => {
  it('should transform payload correctly', async () => {
    const strategy = new JwtStrategy();
    const payload = { sub: 123, role: 'ADMIN', branchId: 1 };

    const result = await strategy.validate(payload);

    expect(result).toEqual({
      id: 123,        // Not sub!
      role: 'ADMIN',
      branchId: 1,
    });
  });
});
```

### E2E Test: Protected Route

```typescript
describe('Auth Flow (e2e)', () => {
  it('should access protected route with valid token', async () => {
    // Login
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'test', password: 'test' })
      .expect(201);

    const token = loginResponse.body.accessToken;

    // Access protected route
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBeDefined();
  });
});
```

### Manual Testing Script

```bash
#!/bin/bash
# Test JWT authentication flow

BASE_URL="http://localhost:3333/api"

# Login
echo "=== Login ==="
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}')
echo "$LOGIN_RESPONSE" | jq .

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')

# Decode token payload
echo -e "\n=== Token Payload ==="
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .

# Test protected route
echo -e "\n=== Protected Route ==="
curl -s "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Common Mistakes

### Mistake 1: Using `register()` Instead of `registerAsync()`

```typescript
// WRONG
JwtModule.register({
  secret: process.env.JWT_SECRET,  // Evaluated at import time!
})

// CORRECT
JwtModule.registerAsync({
  useFactory: () => ({
    secret: process.env.JWT_SECRET,  // Evaluated at runtime
  }),
})
```

### Mistake 2: Property Name Confusion (sub vs id)

```typescript
// JWT standard uses "sub" for subject
const token = { sub: 123, role: 'USER' };

// But your app might use "id" internally
// Make sure strategy and controller agree!

// Strategy returns:
return { id: payload.sub };  // Transforms sub -> id

// Controller must use:
req.user.id  // NOT req.user.sub
```

### Mistake 3: Forgetting to Restart After Env Changes

Environment variables are read at application startup. After changing `.env`:
1. Stop the server completely
2. Start fresh (not hot reload)
3. Test with a newly issued token

### Mistake 4: Not Typing the User Object

```typescript
// BAD - using any
@Post()
async create(@Request() req: any) {
  req.user.sub;  // No type checking, easy to make mistakes
}

// GOOD - define and use types
interface AuthenticatedUser {
  id: number;
  role: string;
  branchId?: number;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Post()
async create(@Request() req: Request) {
  req.user.id;  // TypeScript catches mismatches!
}
```

### Mistake 5: Inconsistent Secret Sources

```typescript
// JwtModule config
JwtModule.registerAsync({
  useFactory: () => ({
    secret: process.env.JWT_SECRET,  // Source A
  }),
})

// JwtStrategy
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      secretOrKey: 'hardcoded-different-secret',  // Source B - MISMATCH!
    });
  }
}
```

Always use the same secret source for both signing and validation.

---

## Notes

- This issue affects ANY dynamic module that uses `process.env` in `register()`, not just JwtModule
- The JwtStrategy class reads `process.env` in its constructor, which runs at a different time
- In ES modules, decorators evaluate at import time before any code in the importing file runs
- The fallback value (e.g., `'development-secret-change-in-production'`) creates a mismatch: tokens are signed with the real secret but validated with the fallback
- This issue is more common in monorepos where dotenv paths need explicit configuration
- **Convention confusion**: JWT spec uses `sub` for subject (user ID), but your app might use `id` internally. Be consistent in your codebase.
- **Misleading errors**: Database errors point to the DB, not the actual bug in the controller/strategy mismatch. Always trace back to where the value originates.

---

## References

- [NestJS JWT Module GitHub - registerAsync discussion](https://github.com/nestjs/jwt/issues/103)
- [NestJS Configuration Documentation](https://docs.nestjs.com/techniques/configuration)
- [NestJS Authentication Documentation](https://docs.nestjs.com/security/authentication)
- [NestJS JWT Module npm package](https://www.npmjs.com/package/@nestjs/jwt)
- [Passport JWT Strategy](https://github.com/mikenicholson/passport-jwt)
- [JWT and Passport JWT Strategy for NestJS](https://www.devxperiences.com/pzwp1/2022/03/19/jwt-and-passport-jwt-strategy-for-your-nestjs-rest-api-project/)
