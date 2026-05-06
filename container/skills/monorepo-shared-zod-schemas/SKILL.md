---
name: monorepo-shared-zod-schemas
description: |
  Share Zod validation schemas between frontend and backend in an Nx/Bun monorepo for end-to-end type safety. Use when: (1) need consistent validation rules across FE/BE, (2) want single source of truth for data contracts, (3) using React Hook Form on frontend and NestJS on backend, (4) setting up form validation with API validation, (5) want TypeScript types auto-generated from schemas. Covers package structure, schema organization, frontend/backend integration, and type inference patterns.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Monorepo Shared Zod Schemas

## Problem
In full-stack applications, maintaining consistent validation logic between frontend and backend is error-prone when duplicated. Zod schemas enable a single source of truth for validation rules and TypeScript types that both frontend and backend can import.

## Context / Trigger Conditions
Use this skill when:
- Building full-stack app in Nx/Bun monorepo
- Need same validation on frontend forms and backend API
- Using React Hook Form for forms
- Using NestJS with validation pipes
- Want TypeScript types automatically derived from validation
- Maintaining data contracts between teams (frontend/backend)
- Refactoring from duplicated validation logic

## Solution

### Step 1: Create Shared Schemas Package

**If not already created:**

```bash
# Create shared-schemas package in monorepo
nx g @nx/js:lib shared-schemas --directory=packages/shared-schemas
```

**Install Zod:**

```bash
# In root of monorepo
bun add zod
```

### Step 2: Organize Schema Files

**Structure:**

```
packages/shared-schemas/src/
├── index.ts                  # Barrel export
├── common/
│   ├── pagination.schema.ts  # Reusable schemas
│   └── response.schema.ts
├── auth/
│   ├── login.schema.ts
│   └── register.schema.ts
├── users/
│   ├── user-create.schema.ts
│   ├── user-update.schema.ts
│   └── user-filter.schema.ts
└── employees/
    ├── employee-create.schema.ts
    └── employee-update.schema.ts
```

### Step 3: Define Common Schemas

```typescript
// packages/shared-schemas/src/common/pagination.schema.ts
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
```

```typescript
// packages/shared-schemas/src/common/response.schema.ts
import { z } from 'zod';

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
    }).optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
};
```

### Step 4: Define Domain Schemas

```typescript
// packages/shared-schemas/src/users/user-create.schema.ts
import { z } from 'zod';

export const userCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'site_coordinator', 'department_coordinator']),
  department_id: z.number().int().positive().optional(),
});

// Infer TypeScript type from schema
export type UserCreate = z.infer<typeof userCreateSchema>;
```

```typescript
// packages/shared-schemas/src/users/user-update.schema.ts
import { z } from 'zod';

export const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).optional(),
  role: z.enum(['admin', 'site_coordinator', 'department_coordinator']).optional(),
  department_id: z.number().int().positive().nullable().optional(),
});

export type UserUpdate = z.infer<typeof userUpdateSchema>;
```

```typescript
// packages/shared-schemas/src/users/user-filter.schema.ts
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.schema';

export const userFilterSchema = paginationSchema.extend({
  role: z.enum(['admin', 'site_coordinator', 'department_coordinator']).optional(),
  department_id: z.number().int().positive().optional(),
  search: z.string().optional(),
});

export type UserFilter = z.infer<typeof userFilterSchema>;
```

### Step 5: Export from Barrel File

```typescript
// packages/shared-schemas/src/index.ts

// Common
export * from './common/pagination.schema';
export * from './common/response.schema';

// Auth
export * from './auth/login.schema';
export * from './auth/register.schema';

// Users
export * from './users/user-create.schema';
export * from './users/user-update.schema';
export * from './users/user-filter.schema';

// Employees
export * from './employees/employee-create.schema';
export * from './employees/employee-update.schema';
```

### Step 6: Use in NestJS Backend

**Install NestJS validation:**

```bash
bun add class-validator class-transformer
```

**Create Zod validation pipe:**

```typescript
// apps/api/src/common/pipes/zod-validation.pipe.ts
import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
  }
}
```

**Use in controller:**

```typescript
// apps/api/src/users/users.controller.ts
import { Controller, Post, Body, Get, Query, UsePipes } from '@nestjs/common';
import { userCreateSchema, UserCreate, userFilterSchema, UserFilter } from '@my-project/shared-schemas';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(userCreateSchema))
  async create(@Body() dto: UserCreate) {
    // dto is already validated and typed
    return await this.usersService.create(dto);
  }

  @Get()
  async findAll(@Query(new ZodValidationPipe(userFilterSchema)) filters: UserFilter) {
    // filters is validated and typed
    return await this.usersService.findAll(filters);
  }
}
```

### Step 7: Use in React Frontend

**Install React Hook Form + Zod resolver:**

```bash
bun add react-hook-form @hookform/resolvers
```

**Create form component:**

```typescript
// apps/web/src/components/forms/UserCreateForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userCreateSchema, UserCreate } from '@my-project/shared-schemas';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';

interface UserCreateFormProps {
  onSubmit: (data: UserCreate) => Promise<void>;
}

export function UserCreateForm({ onSubmit }: UserCreateFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserCreate>({
    resolver: zodResolver(userCreateSchema),  // ✅ Same validation as backend
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <Input
          {...register('email')}
          type="email"
          placeholder="Email"
        />
        {errors.email && <span className="error">{errors.email.message}</span>}
      </div>

      <div>
        <Input
          {...register('password')}
          type="password"
          placeholder="Password"
        />
        {errors.password && <span className="error">{errors.password.message}</span>}
      </div>

      <div>
        <Input
          {...register('name')}
          placeholder="Full Name"
        />
        {errors.name && <span className="error">{errors.name.message}</span>}
      </div>

      <div>
        <Select {...register('role')}>
          <option value="admin">Admin</option>
          <option value="site_coordinator">Site Coordinator</option>
          <option value="department_coordinator">Department Coordinator</option>
        </Select>
        {errors.role && <span className="error">{errors.role.message}</span>}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create User'}
      </Button>
    </form>
  );
}
```

**Use with TanStack Query:**

```typescript
// apps/web/src/api/mutations/useCreateUser.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCreate } from '@my-project/shared-schemas';
import { apiClient } from '../client';

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UserCreate) => {
      const response = await apiClient.post('/users', data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate users query to refetch
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

**Use in page:**

```typescript
// apps/web/src/pages/UsersPage.tsx
import { UserCreateForm } from '../components/forms/UserCreateForm';
import { useCreateUser } from '../api/mutations/useCreateUser';
import { toast } from 'sonner';

export function UsersPage() {
  const createUser = useCreateUser();

  const handleCreateUser = async (data: UserCreate) => {
    try {
      await createUser.mutateAsync(data);
      toast.success('User created successfully');
    } catch (error) {
      toast.error('Failed to create user');
    }
  };

  return (
    <div>
      <h1>Users</h1>
      <UserCreateForm onSubmit={handleCreateUser} />
    </div>
  );
}
```

## Advanced Patterns

### 1. Schema Composition

```typescript
// packages/shared-schemas/src/employees/employee-base.schema.ts
import { z } from 'zod';

const baseEmployeeSchema = z.object({
  full_name: z.string().min(2),
  personal_id: z.string().regex(/^\d{7}$/, 'Invalid personal ID'),
  id_number: z.string().regex(/^\d{9}$/, 'Invalid ID number'),
  gender: z.enum(['male', 'female', 'other']),
  department_id: z.number().int().positive(),
  site_id: z.number().int().positive(),
});

// Create schema extends base
export const employeeCreateSchema = baseEmployeeSchema.extend({
  intake_date: z.date(),
  exit_date: z.date(),
  needs_accommodation: z.boolean().default(false),
  allergies: z.string().optional(),
});

// Update schema makes all fields optional
export const employeeUpdateSchema = baseEmployeeSchema.partial().extend({
  intake_date: z.date().optional(),
  exit_date: z.date().optional(),
});
```

### 2. Refinements and Custom Validation

```typescript
// packages/shared-schemas/src/employees/employee-create.schema.ts
import { z } from 'zod';

export const employeeCreateSchema = z.object({
  intake_date: z.date(),
  exit_date: z.date(),
  full_name: z.string().min(2),
}).refine(
  (data) => data.exit_date > data.intake_date,
  {
    message: 'Exit date must be after intake date',
    path: ['exit_date'],  // Error will be attached to exit_date field
  }
);
```

### 3. Transform Data

```typescript
// packages/shared-schemas/src/common/date.schema.ts
import { z } from 'zod';

export const dateStringSchema = z.string().transform((str) => new Date(str));

// Usage
export const employeeFilterSchema = z.object({
  start_date: dateStringSchema,  // Automatically converts string to Date
  end_date: dateStringSchema,
});
```

### 4. Drizzle-Zod Integration

```typescript
// packages/shared-schemas/src/users/user.schema.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from '../../../apps/api/src/database/schema/users.schema';

// Auto-generate schema from Drizzle table
export const insertUserSchema = createInsertSchema(users, {
  email: (schema) => schema.email.email(),
  name: (schema) => schema.name.min(2),
});

export const selectUserSchema = createSelectSchema(users);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type SelectUser = z.infer<typeof selectUserSchema>;
```

## Verification

After setup, verify:

1. **Frontend validation works:**
   - Submit invalid form data
   - Errors should appear immediately (client-side)

2. **Backend validation works:**
   - Bypass frontend, send invalid data via API
   - Backend should return 400 with validation errors

3. **Types are consistent:**
   ```typescript
   // Frontend
   const data: UserCreate = { ... };  // Should have same type as backend

   // Backend
   async create(dto: UserCreate) { ... }  // Same type
   ```

4. **Changes propagate:**
   - Change schema (e.g., add required field)
   - Both FE and BE should show TypeScript errors

## Example: Complete Flow

**1. Define Schema:**
```typescript
// packages/shared-schemas/src/auth/login.schema.ts
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type Login = z.infer<typeof loginSchema>;
```

**2. Backend Controller:**
```typescript
@Post('login')
@UsePipes(new ZodValidationPipe(loginSchema))
async login(@Body() dto: Login) {
  return await this.authService.login(dto);
}
```

**3. Frontend Form:**
```typescript
const form = useForm<Login>({
  resolver: zodResolver(loginSchema),
});
```

**Result:** Same validation rules, same types, single source of truth!

## Notes

**Benefits:**

- ✅ Single source of truth for validation
- ✅ TypeScript types auto-generated
- ✅ Client-side AND server-side validation
- ✅ Refactoring safety (change schema, both FE/BE update)
- ✅ Consistent error messages
- ✅ Less code duplication

**Common Mistakes:**

1. **Not exporting types:**
   - Always export `export type X = z.infer<typeof xSchema>`
   - Both schema AND type should be exported

2. **Putting schemas in backend-only:**
   - Schemas must be in shared package
   - Otherwise frontend can't import them

3. **Forgetting to update barrel exports:**
   - Export from `packages/shared-schemas/src/index.ts`
   - Otherwise imports fail

4. **Using class-validator instead:**
   - class-validator is NestJS-specific
   - Zod works on both FE and BE

**When to use:**

- ✅ Full-stack TypeScript monorepo
- ✅ Need consistent validation FE/BE
- ✅ Using React Hook Form + NestJS
- ❌ Frontend and backend in separate repos (harder but possible with npm packages)

## References

- [Sharing Types with Zod in Monorepo (Leapcell)](https://leapcell.io/blog/sharing-types-and-validations-with-zod-across-a-monorepo)
- [End-to-end Typesafe APIs with Zod](https://dev.to/jussinevavuori/end-to-end-typesafe-apis-with-typescript-and-shared-zod-schemas-4jmo)
- [How to Share Zod Schemas (Tecktol)](https://tecktol.com/shared-zod-schema/)
- [React Hook Form + Zod Integration](https://react-hook-form.com/get-started#SchemaValidation)
- [Drizzle-Zod Integration](https://orm.drizzle.team/docs/zod)
