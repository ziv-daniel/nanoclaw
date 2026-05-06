---
name: zod-v4-partial-refinement-fix
description: |
  Fix for ".partial() cannot be used on object schemas containing refinements" error in Zod v4.
  Use when: (1) upgrading from Zod v3 to v4, (2) calling .partial(), .omit(), .pick(), or .extend()
  on a schema that has .refine() or .superRefine(), (3) error message mentions "refinements" and
  "partial". Solution: separate base schema from refinements, apply refinements only to final
  create/validation schema.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Zod v4: .partial() Cannot Be Used on Schemas with Refinements

## Problem

In Zod v4, calling `.partial()`, `.omit()`, `.pick()`, or `.extend()` on an object schema that
has refinements (`.refine()` or `.superRefine()`) throws an error:

```
Error: .partial() cannot be used on object schemas containing refinements
```

This is a breaking change from Zod v3, where refinements lived in a wrapper class (`ZodEffects`)
and didn't interfere with schema transformations.

## Context / Trigger Conditions

- Upgrading from Zod v3 to Zod v4
- Error message: `.partial() cannot be used on object schemas containing refinements`
- Code pattern like:
  ```typescript
  const schema = z.object({...}).refine(...);
  const partialSchema = schema.partial(); // FAILS in Zod v4
  ```
- Using `.omit()`, `.pick()`, `.extend()` on refined schemas

## Solution

**Separate the base schema from refinements:**

1. Create a base schema WITHOUT refinements
2. Apply refinements only to schemas that need validation (e.g., create schema)
3. Use the base schema for transformations like `.partial()`

### Before (Zod v3 style - breaks in v4):

```typescript
import { z } from 'zod';

// This worked in v3 but FAILS in v4
const requestSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  allergies: z.boolean(),
  allergiesDetails: z.string().optional(),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: 'End date must be after start date', path: ['endDate'] }
).refine(
  (data) => !data.allergies || data.allergiesDetails,
  { message: 'Please provide allergy details', path: ['allergiesDetails'] }
);

// This throws: ".partial() cannot be used on object schemas containing refinements"
const updateSchema = requestSchema.partial().extend({ id: z.number() });
```

### After (Zod v4 compatible):

```typescript
import { z } from 'zod';

// Step 1: Create BASE schema WITHOUT refinements
const baseRequestSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  allergies: z.boolean(),
  allergiesDetails: z.string().optional(),
});

// Step 2: Apply refinements ONLY to schemas that need full validation
const createRequestSchema = baseRequestSchema.refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: 'End date must be after start date', path: ['endDate'] }
).refine(
  (data) => !data.allergies || data.allergiesDetails,
  { message: 'Please provide allergy details', path: ['allergiesDetails'] }
);

// Step 3: Use BASE schema for transformations
const updateRequestSchema = baseRequestSchema.partial().extend({
  id: z.number().int().positive(),
});

// Types still work correctly
type CreateRequest = z.infer<typeof createRequestSchema>;
type UpdateRequest = z.infer<typeof updateRequestSchema>;
```

## Verification

1. Server/application starts without the "refinements" error
2. Create schema validates with refinements (cross-field validation works)
3. Update/partial schema allows partial fields without refinement errors
4. TypeScript types infer correctly from both schemas

## Example: Real-World Implementation

From a request management system:

```typescript
// packages/shared-schemas/src/request.schema.ts

import { z } from 'zod';

export const genderEnum = z.enum(['MALE', 'FEMALE']);

// Base schema without refinements (for partial/extend operations)
const baseRequestSchema = z.object({
  siteId: z.number().int().positive('Site is required'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  idNumber: z.string().regex(/^\d{9}$/, 'ID must be 9 digits'),
  gender: genderEnum,
  admissionDate: z.string(),
  departureDate: z.string(),
  needAccommodation: z.boolean(),
  allergies: z.boolean(),
  allergiesDetails: z.string().optional(),
});

// Create schema with cross-field validation refinements
export const createRequestSchema = baseRequestSchema.refine(
  (data) => new Date(data.departureDate) >= new Date(data.admissionDate),
  { message: 'Departure date must be after admission date', path: ['departureDate'] }
).refine(
  (data) => !data.allergies || (data.allergiesDetails?.trim().length ?? 0) > 0,
  { message: 'Please specify allergy details', path: ['allergiesDetails'] }
);

// Update schema uses base (no refinements needed for partial updates)
export const requestUpdateSchema = baseRequestSchema.partial().extend({
  id: z.number().int().positive(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type RequestUpdate = z.infer<typeof requestUpdateSchema>;
```

## Notes

- **Zod v4 architectural change**: Refinements now live inside schemas themselves instead of
  a wrapper class, which is why transformations can't preserve them
- **Design consideration**: Decide if partial/update schemas actually need refinements. Often
  they don't, since partial updates may only touch some fields
- **Alternative**: Zod v4 provides `safeExtend` for extending schemas WITH refinements, but
  there's no equivalent for `.partial()` or `.omit()` that preserves refinements
- **Related issues**: Same pattern applies to `.omit()`, `.pick()`, and `.exclude()`

## References

- [Zod v4 Migration Guide](https://zod.dev/v4/changelog)
- [GitHub Issue #5425: Refinements not applied after using omit/partial/exclude](https://github.com/colinhacks/zod/issues/5425)
- [GitHub Issue #5192: No way to Pick/Omit Fields but keep refinements](https://github.com/colinhacks/zod/issues/5192)
- [Zod v4 Release Notes](https://zod.dev/v4)
