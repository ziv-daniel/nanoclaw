---
name: nestjs-drizzle-integration
description: |
  Integrate Drizzle ORM into NestJS applications using repository pattern, dynamic modules, and dependency injection. Use when: (1) starting a new NestJS + Drizzle project, (2) need to inject Drizzle database instance into services, (3) implementing repository pattern for data access, (4) setting up connection pooling, (5) need type-safe database queries in NestJS modules. Covers custom providers, ConfigService integration, and repository abstraction patterns for 2026.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# NestJS + Drizzle ORM Integration

## Problem
Integrating Drizzle ORM into NestJS requires understanding dependency injection, creating custom providers, and implementing repository patterns that work well with NestJS's module system. The 2026 approach uses dynamic modules and proper connection management.

## Context / Trigger Conditions
Use this skill when:
- Starting a new NestJS project with Drizzle ORM
- Need to inject Drizzle database instance into services
- Implementing repository pattern for clean data access layer
- Setting up PostgreSQL connection with pooling
- Want type-safe queries with NestJS dependency injection
- Migrating from TypeORM or Prisma to Drizzle
- Need to configure database credentials from environment variables

## Solution

### Approach 1: Custom Drizzle Provider (Recommended)

This approach gives you full control and works perfectly with NestJS's DI system.

#### Step 1: Install Dependencies

```bash
# Install Drizzle and PostgreSQL driver
bun add drizzle-orm postgres
bun add -d drizzle-kit @types/postgres
```

#### Step 2: Create Database Module

```typescript
// src/database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');

        // Create postgres connection with pooling
        const client = postgres(databaseUrl, {
          max: 10,           // Maximum connections in pool
          idle_timeout: 20,  // Close idle connections after 20s
          connect_timeout: 10, // Connection timeout 10s
        });

        // Create Drizzle instance with schema
        const db = drizzle(client, { schema });

        return db;
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
```

**Why `@Global()`:**
- Makes DRIZZLE provider available to all modules without importing DatabaseModule everywhere
- Cleaner code, less boilerplate

#### Step 3: Use in Services

```typescript
// src/users/users.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import { users } from '../database/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async findAll() {
    return await this.db.select().from(users);
  }

  async findById(id: number) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user;
  }

  async create(data: typeof users.$inferInsert) {
    const [user] = await this.db
      .insert(users)
      .values(data)
      .returning();

    return user;
  }

  async update(id: number, data: Partial<typeof users.$inferInsert>) {
    const [user] = await this.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();

    return user;
  }

  async delete(id: number) {
    await this.db
      .delete(users)
      .where(eq(users.id, id));
  }
}
```

#### Step 4: Register in App Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,  // Import once
    UsersModule,
  ],
})
export class AppModule {}
```

---

### Approach 2: Repository Pattern (Advanced)

For larger projects, implement repository pattern to abstract data access.

#### Step 1: Create Base Repository

```typescript
// src/database/repository/base.repository.ts
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../database.module';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';

export abstract class BaseRepository {
  constructor(
    @Inject(DRIZZLE) protected readonly db: PostgresJsDatabase<typeof schema>,
  ) {}
}
```

#### Step 2: Create Specific Repository

```typescript
// src/users/users.repository.ts
import { Injectable } from '@nestjs/common';
import { eq, and, gte, lte } from 'drizzle-orm';
import { BaseRepository } from '../database/repository/base.repository';
import { users } from '../database/schema';

@Injectable()
export class UsersRepository extends BaseRepository {
  async findAll() {
    return await this.db.select().from(users);
  }

  async findById(id: number) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  async findByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  async findByDepartment(departmentId: number) {
    return await this.db
      .select()
      .from(users)
      .where(eq(users.department_id, departmentId));
  }

  async create(data: typeof users.$inferInsert) {
    const [user] = await this.db
      .insert(users)
      .values(data)
      .returning();

    return user;
  }

  async update(id: number, data: Partial<typeof users.$inferInsert>) {
    const [user] = await this.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();

    return user ?? null;
  }

  async delete(id: number): Promise<void> {
    await this.db
      .delete(users)
      .where(eq(users.id, id));
  }

  // Complex query example
  async findActiveUsers(startDate: Date, endDate: Date) {
    return await this.db
      .select()
      .from(users)
      .where(
        and(
          gte(users.created_at, startDate),
          lte(users.created_at, endDate),
        ),
      );
  }
}
```

#### Step 3: Use Repository in Service

```typescript
// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  async findAll() {
    return await this.usersRepo.findAll();
  }

  async findById(id: number) {
    const user = await this.usersRepo.findById(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async create(data: CreateUserDto) {
    // Business logic here
    return await this.usersRepo.create(data);
  }

  async update(id: number, data: UpdateUserDto) {
    const user = await this.usersRepo.update(id, data);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async delete(id: number) {
    await this.findById(id);  // Check exists
    await this.usersRepo.delete(id);
  }
}
```

#### Step 4: Register in Module

```typescript
// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,  // Register repository
  ],
  exports: [UsersService],
})
export class UsersModule {}
```

---

### Approach 3: Using Pre-built Library (Fastest Setup)

Use `@knaadh/nestjs-drizzle` for quick setup.

#### Step 1: Install

```bash
bun add @knaadh/nestjs-drizzle drizzle-orm postgres
bun add -d drizzle-kit @types/postgres
```

#### Step 2: Configure Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@knaadh/nestjs-drizzle';
import * as schema from './database/schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        driver: 'postgres-js',
        url: configService.getOrThrow<string>('DATABASE_URL'),
        options: {
          max: 10,
          idle_timeout: 20,
        },
        schema,
      }),
    }),
  ],
})
export class AppModule {}
```

#### Step 3: Inject in Service

```typescript
// src/users/users.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE_ORM } from '@knaadh/nestjs-drizzle';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../database/schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE_ORM) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  // Same query methods as before
}
```

---

### Best Practices

#### 1. Use Transactions for Multiple Operations

```typescript
async createUserWithProfile(userData: CreateUserDto, profileData: CreateProfileDto) {
  return await this.db.transaction(async (tx) => {
    // Both operations succeed or both fail
    const [user] = await tx
      .insert(users)
      .values(userData)
      .returning();

    const [profile] = await tx
      .insert(profiles)
      .values({ ...profileData, user_id: user.id })
      .returning();

    return { user, profile };
  });
}
```

#### 2. Use Prepared Statements for Performance

```typescript
// In repository class
private readonly findByIdStmt = this.db
  .select()
  .from(users)
  .where(eq(users.id, placeholder('id')))
  .prepare('find_user_by_id');

async findById(id: number) {
  const [user] = await this.findByIdStmt.execute({ id });
  return user ?? null;
}
```

#### 3. Handle Errors Gracefully

```typescript
async create(data: CreateUserDto) {
  try {
    const [user] = await this.db
      .insert(users)
      .values(data)
      .returning();

    return user;
  } catch (error) {
    // Check for unique constraint violation
    if (error.code === '23505') {
      throw new ConflictException('User with this email already exists');
    }

    throw new InternalServerErrorException('Failed to create user');
  }
}
```

#### 4. Environment Configuration

```typescript
// src/config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '20', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10', 10),
  },
}));
```

## Verification

After setup, verify integration:

1. **Database connection works:**
   ```bash
   bun run start:dev
   # Should start without database connection errors
   ```

2. **Queries execute:**
   ```bash
   curl http://localhost:3333/api/users
   # Should return users array (empty or with data)
   ```

3. **Type inference works:**
   ```typescript
   const user = await this.db.select().from(users).limit(1);
   // user should have full type inference in IDE
   ```

4. **Transactions work:**
   ```typescript
   // Test transaction rollback
   try {
     await this.db.transaction(async (tx) => {
       await tx.insert(users).values({ ... });
       throw new Error('Rollback test');
     });
   } catch (error) {
     // Verify no user was created
   }
   ```

## Example: Complete Module Structure

```
src/
├── app.module.ts
├── database/
│   ├── database.module.ts        # Drizzle provider
│   ├── schema/
│   │   ├── index.ts
│   │   ├── users.schema.ts
│   │   └── relations.ts
│   └── repository/
│       └── base.repository.ts    # Base class
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts          # Business logic
│   ├── users.repository.ts       # Data access
│   └── dto/
│       ├── create-user.dto.ts
│       └── update-user.dto.ts
└── config/
    └── database.config.ts
```

## Notes

**Which approach to use:**

- ✅ **Approach 1 (Custom Provider)**: Best for most projects, full control
- ✅ **Approach 2 (Repository Pattern)**: Best for large projects (50+ tables)
- ✅ **Approach 3 (Pre-built Library)**: Fastest setup, good for prototypes
- ❌ Mixing approaches in same project (choose one)

**Common Mistakes:**

1. **Not using `@Global()` on DatabaseModule:**
   - Results in importing DatabaseModule in every feature module
   - Use `@Global()` to make DRIZZLE available everywhere

2. **Forgetting to inject ConfigService:**
   - Database URL should come from environment variables
   - Never hardcode credentials

3. **Not handling connection errors:**
   - Add try-catch in useFactory
   - Fail fast if database is unavailable

4. **Using wrong driver:**
   - `postgres-js` for Bun/Node (recommended)
   - `node-postgres` for older Node.js projects
   - Check Drizzle docs for driver compatibility

**Performance Tips:**

- Use connection pooling (max: 10-20 connections)
- Use prepared statements for frequent queries
- Use transactions for multiple related operations
- Close idle connections (idle_timeout: 20s)
- Use indexes on frequently queried columns

**Type Safety:**

```typescript
// Drizzle provides excellent type inference
const user = await this.db.select().from(users).limit(1);
// user is automatically typed as:
// {
//   id: number;
//   email: string;
//   name: string;
//   created_at: Date;
// }[]
```

## References

- [NestJS & DrizzleORM: A Great Match (Trilon)](https://trilon.io/blog/nestjs-drizzleorm-a-great-match)
- [How to integrate Drizzle ORM with Nest JS](https://dev.to/anooop102910/how-to-integrate-drizzle-orm-with-nest-js-gdc)
- [Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [@knaadh/nestjs-drizzle GitHub](https://github.com/knaadh/nestjs-drizzle)
- [Best ORM for NestJS in 2025](https://dev.to/sasithwarnakafonseka/best-orm-for-nestjs-in-2025-drizzle-orm-vs-typeorm-vs-prisma-229c)
