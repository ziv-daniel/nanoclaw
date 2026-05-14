---
name: drizzle-modern-schema-patterns
description: |
  Modern Drizzle ORM schema design patterns for PostgreSQL (2026 standards). Use when: (1) creating new Drizzle schemas, (2) seeing "use identity columns instead of serial" warnings, (3) need reusable timestamp/audit patterns, (4) organizing schemas in large projects, (5) avoiding circular dependencies in relations. Covers identity columns (replacing serial), reusable column patterns, schema organization, performance optimization, and migration best practices.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Drizzle Modern Schema Patterns (2026)

## Problem
Drizzle ORM and PostgreSQL have evolved, with identity columns now recommended over serial types. Additionally, organizing schemas in large projects requires patterns to avoid circular dependencies, optimize performance, and maintain consistency across tables.

## Context / Trigger Conditions
Use this skill when:
- Creating new Drizzle schemas for PostgreSQL
- Seeing deprecation warnings about `serial()` types
- Need consistent timestamp/audit columns across tables
- Organizing schemas in projects with 10+ tables
- Getting circular dependency errors in table relations
- Need to optimize query performance with selective loading
- Setting up migrations for production

## Solution

### 1. Use Identity Columns (2026 Standard)

**❌ OLD WAY (Deprecated):**
```typescript
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),  // ⚠️ Serial is deprecated
  name: text('name').notNull(),
});
```

**✅ NEW WAY (2026 Standard):**
```typescript
import { pgTable, integer, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
});
```

**With Options:**
```typescript
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity({
    startWith: 1000,      // Start from 1000
    increment: 1,         // Increment by 1
    minValue: 1,          // Minimum value
    maxValue: 2147483647, // Maximum for integer
    cache: 20,            // Cache 20 values for performance
  }),
  name: text('name').notNull(),
});
```

**Why Identity Columns:**
- PostgreSQL officially recommends identity over serial (since PG 10+)
- Better SQL standard compliance
- More control over sequence behavior
- Clearer intent (generated vs provided)
- Better for multi-tenant systems

### 2. Reusable Column Patterns

**Create reusable timestamp columns:**

```typescript
// src/database/schema/columns.ts
import { timestamp } from 'drizzle-orm/pg-core';

export const timestamps = {
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
};

export const softDelete = {
  deleted_at: timestamp('deleted_at'),
};

export const auditFields = {
  ...timestamps,
  created_by: integer('created_by').references(() => users.id),
  updated_by: integer('updated_by').references(() => users.id),
};
```

**Use with spread operator:**

```typescript
// src/database/schema/users.schema.ts
import { pgTable, integer, text } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps,  // ✅ Reusable timestamps
});

export const posts = pgTable('posts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  user_id: integer('user_id').references(() => users.id),
  ...timestamps,  // ✅ Same pattern
});
```

### 3. Schema Organization (Avoid Circular Dependencies)

**Structure for large projects:**

```
src/database/schema/
├── columns.ts          # Reusable column definitions
├── users.schema.ts     # Users table
├── departments.schema.ts
├── employees.schema.ts
├── relations.ts        # ⭐ Relations in separate file
└── index.ts           # Barrel export
```

**Individual Schema Files:**

```typescript
// users.schema.ts
import { pgTable, integer, text } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull(),
  department_id: integer('department_id'),  // FK without .references()
  ...timestamps,
});
```

**Separate Relations File (Prevents Circular Dependencies):**

```typescript
// relations.ts
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { departments } from './departments.schema';
import { employees } from './employees.schema';

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, {
    fields: [users.department_id],
    references: [departments.id],
  }),
  employees: many(employees),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  users: many(users),
  employees: many(employees),
}));
```

**Barrel Export:**

```typescript
// index.ts
export * from './users.schema';
export * from './departments.schema';
export * from './employees.schema';
export * from './relations';  // Relations exported last
export * from './columns';
```

### 4. Performance Optimization Patterns

**A. Selective Field Loading:**

```typescript
// ❌ BAD: Loading large text fields unnecessarily
const allUsers = await db.select().from(users);

// ✅ GOOD: Select only needed fields
const usersList = await db
  .select({
    id: users.id,
    name: users.name,
    email: users.email,
    // Exclude large bio, profile_image_data, etc.
  })
  .from(users);
```

**B. Prepared Statements for Frequent Queries:**

```typescript
// Prepare statement once
const findUserByEmail = db
  .select()
  .from(users)
  .where(eq(users.email, placeholder('email')))
  .prepare('find_user_by_email');

// Execute multiple times (faster)
const user1 = await findUserByEmail.execute({ email: 'user1@example.com' });
const user2 = await findUserByEmail.execute({ email: 'user2@example.com' });
```

**C. Proper Indexing:**

```typescript
import { pgTable, integer, text, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull(),
  department_id: integer('department_id'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Composite index for common queries
  deptCreatedIdx: index('users_dept_created_idx').on(table.department_id, table.created_at),
  // Unique index
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
}));
```

### 5. Type-Safe Enums

```typescript
import { pgTable, pgEnum, integer, text } from 'drizzle-orm/pg-core';

// Define enum
export const roleEnum = pgEnum('role', ['admin', 'site_coordinator', 'department_coordinator']);
export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

// Use in schema
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),  // Type-safe enum
  gender: genderEnum('gender').notNull(),
});

// TypeScript will enforce valid values
// users.role can only be 'admin' | 'site_coordinator' | 'department_coordinator'
```

### 6. Migration Best Practices

**Development Workflow:**

```bash
# 1. Change schema in TypeScript
# Edit src/database/schema/users.schema.ts

# 2. Generate migration
bun run drizzle-kit generate

# 3. Review generated SQL
cat drizzle/migrations/0001_add_user_role.sql

# 4. Apply migration
bun run drizzle-kit migrate

# 5. Check with Drizzle Studio (optional)
bun run drizzle-kit studio
```

**Using `drizzle-kit push` (Development Only):**

```bash
# Quick prototyping - pushes schema changes directly without migration files
bun run drizzle-kit push

# ⚠️ WARNING: Use ONLY in development
# - No migration history
# - Dangerous for production
# - Good for rapid iteration
```

**Production Workflow:**

```bash
# Always use migrations in production
bun run drizzle-kit generate  # Generate migration
bun run drizzle-kit migrate   # Apply to production DB

# Never use 'push' in production!
```

### 7. Drizzle-Zod Integration

**Generate Zod schemas from Drizzle:**

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './users.schema';

// Auto-generate Zod schema for inserts
export const insertUserSchema = createInsertSchema(users, {
  email: (schema) => schema.email.email(),  // Add email validation
  name: (schema) => schema.name.min(2, 'Name too short'),
});

// Auto-generate Zod schema for selects
export const selectUserSchema = createSelectSchema(users);

// Infer TypeScript types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type SelectUser = z.infer<typeof selectUserSchema>;
```

**Benefits:**
- Single source of truth (Drizzle schema)
- Type safety + runtime validation
- Less duplication

## Verification

After implementing these patterns, verify:

1. **Identity columns work:**
   ```typescript
   const user = await db.insert(users).values({
     name: 'John Doe',
     email: 'john@example.com',
   }).returning();

   console.log(user.id);  // Should auto-generate (e.g., 1, 2, 3...)
   ```

2. **No circular dependency errors:**
   ```bash
   # Build should succeed
   bun run build
   ```

3. **Migrations generate correctly:**
   ```bash
   bun run drizzle-kit generate
   # Check generated SQL looks correct
   ```

4. **Prepared statements work:**
   ```typescript
   const stmt = db.select().from(users).where(eq(users.id, placeholder('id'))).prepare();
   const user = await stmt.execute({ id: 1 });
   ```

## Example: Complete Schema File

```typescript
// src/database/schema/employees.schema.ts
import { pgTable, integer, text, date, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

export const employees = pgTable('employees', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  // Foreign keys (no .references() to avoid circular deps)
  department_id: integer('department_id').notNull(),
  site_id: integer('site_id').notNull(),
  submitted_by_user_id: integer('submitted_by_user_id').notNull(),

  // Employee details
  full_name: text('full_name').notNull(),
  personal_id: text('personal_id').notNull(),  // Military ID
  id_number: text('id_number').notNull(),      // National ID
  gender: genderEnum('gender').notNull(),

  // Dates
  intake_date: date('intake_date').notNull(),
  exit_date: date('exit_date').notNull(),

  // Additional info
  needs_accommodation: boolean('needs_accommodation').notNull().default(false),
  floor: integer('floor'),
  allergies: text('allergies'),
  notes: text('notes'),

  // Status
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),

  // Audit
  ...timestamps,
}, (table) => ({
  // Indexes for common queries
  deptSiteIdx: index('employees_dept_site_idx')
    .on(table.department_id, table.site_id),
  datesIdx: index('employees_dates_idx')
    .on(table.intake_date, table.exit_date),
}));
```

## Notes

**Common Mistakes:**

1. **Using `serial()` instead of identity columns:**
   - Update to `.generatedAlwaysAsIdentity()`
   - PostgreSQL recommends identity since version 10

2. **Putting relations in schema files:**
   - Causes circular dependencies
   - Always use separate `relations.ts` file

3. **Not using prepared statements:**
   - Performance penalty for repeated queries
   - Use `.prepare()` for frequent operations

4. **Loading too much data:**
   - Use `.select({ field1, field2 })` instead of `.select()`
   - Especially important for tables with large text/blob fields

5. **Forgetting indexes:**
   - Add indexes for foreign keys
   - Add indexes for columns used in WHERE clauses
   - Use composite indexes for multi-column queries

**When to use each migration command:**

- ✅ `drizzle-kit generate + migrate`: Production, staging, any persistent environment
- ✅ `drizzle-kit push`: Local development only, rapid prototyping
- ❌ `drizzle-kit push`: NEVER in production

**TypeScript + Drizzle benefits:**

- Full type inference (no manual type annotations needed)
- Auto-completion for queries
- Compile-time errors for invalid queries
- Refactoring safety (rename columns and TS catches all usages)

## References

- [Drizzle ORM PostgreSQL Best Practices Guide (2025)](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)
- [Drizzle ORM Official Schema Documentation](https://orm.drizzle.team/docs/sql-schema-declaration)
- [3 Biggest Mistakes with Drizzle ORM](https://medium.com/@lior_amsalem/3-biggest-mistakes-with-drizzle-orm-1327e2531aff)
- [PostgreSQL Identity Columns Documentation](https://www.postgresql.org/docs/current/ddl-identity-columns.html)
- [Drizzle-Zod Integration](https://orm.drizzle.team/docs/zod)
