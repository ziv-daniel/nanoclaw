---
name: prisma-mssql-relation-sort-workaround
description: |
  Fix silent sorting failures when using Prisma with SQL Server (MSSQL adapter).
  Use when: (1) orderBy on relation fields produces unsorted results with no error,
  (2) `{ Group: { name: 'asc' } }` in orderBy is silently ignored,
  (3) NULL values appear first in ASC sort order (SQL Server nulls-first),
  (4) sorting by fields from a one-to-many related model (e.g., latest visit date).
  Covers the two-step in-memory sort pattern for Prisma MSSQL.
author: Claude Code
version: 1.0.0
date: 2026-03-01
---

# Prisma MSSQL Relation Sort Workaround

## Problem
Prisma's MSSQL adapter silently ignores `orderBy` on relation fields. There is NO error,
NO warning — results come back in an arbitrary order. This affects all relation sorts
(e.g., `{ Group: { name: 'asc' } }`, `{ Facility: { name: 'desc' } }`).

Additionally, SQL Server puts NULLs first in ASC order, which is often undesirable
(you want nulls-last for pending/empty statuses).

## Context / Trigger Conditions
- Using Prisma with `@prisma/adapter-mssql` (SQL Server provider)
- Sorting by a field on a related model (e.g., `Guest.Group.name`)
- Sorting by a nullable field where nulls-last is expected
- Sorting by a field from a one-to-many relation (e.g., latest GuestVisit.visitDate)
- Data appears unsorted despite `orderBy` being set — no error thrown

## Solution: Two-Step In-Memory Sort

### Step 1: Count guard (memory safety)
```typescript
const MAX_IN_MEMORY_SORT = 10_000;
const total = await prisma.model.count({ where });
if (total > MAX_IN_MEMORY_SORT) {
  // Fall back to default scalar sort (e.g., createdAt desc)
  return prisma.model.findMany({ where, orderBy: defaultOrderBy, skip, take });
}
```

### Step 2: Fetch IDs with sort field only
```typescript
const allItems = await prisma.model.findMany({
  where,
  select: {
    id: true,
    // For relation: include nested select
    Group: { select: { name: true } },
    // For nullable scalar: include directly
    // clearanceStatus: true,
  },
});
```

### Step 3: Sort in memory + paginate
```typescript
// Generic sort helper with nulls-last and Hebrew locale
const sorted = [...allItems].sort((a, b) => {
  const aVal = getNestedValue(a, sortField); // e.g., a.Group?.name
  const bVal = getNestedValue(b, sortField);
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;  // nulls last
  if (bVal == null) return -1; // nulls last
  if (typeof aVal === 'string') {
    const cmp = aVal.localeCompare(bVal as string, 'he');
    return sortOrder === 'desc' ? -cmp : cmp;
  }
  const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
  return sortOrder === 'desc' ? -cmp : cmp;
});

const pageIds = sorted.slice((page - 1) * pageSize, page * pageSize).map(r => r.id);
```

### Step 4: Fetch full records and reorder
```typescript
const records = await prisma.model.findMany({
  where: { id: { in: pageIds } },
  include: FULL_INCLUDE,
});
// Reorder to match sorted IDs (Prisma returns in arbitrary order)
const idOrder = new Map(pageIds.map((id, i) => [id, i]));
return records.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
```

### Special Case: One-to-Many Relation Fields
When sorting by a field from a one-to-many relation (e.g., latest visit date):

```typescript
const allItems = await prisma.guest.findMany({
  where,
  select: {
    id: true,
    GuestVisits: {
      where: { deletedAt: null },
      take: 1,
      orderBy: { visitDate: 'desc' },
      select: { visitDate: true },
    },
  },
});
// Flatten the nested value
const withFlattened = allItems.map(g => ({
  id: g.id,
  visitDate: g.GuestVisits[0]?.visitDate ?? null,
}));
// Then sort withFlattened by visitDate using the helper above
```

## Detection: When to Use Two-Step Sort

```typescript
// Relation fields contain a dot
const isRelationSortField = (field: string) => field.includes('.');

// Nullable fields need nulls-last handling
const needsTwoStepSort = (field: string, nullableFields: ReadonlySet<string>) =>
  isRelationSortField(field) || nullableFields.has(field);
```

## Validation: Always Whitelist Sort Fields

```typescript
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  'name', 'createdAt', 'status',      // direct scalars
  'Group.name', 'Facility.name',       // relations
]);

const validateSortField = (
  sortBy: string | undefined,
  validFields: ReadonlySet<string>,
): string | undefined => {
  if (!sortBy) return undefined;
  return validFields.has(sortBy) ? sortBy : undefined;
};
```

## Verification
1. Click a relation column header in the UI
2. Verify the network request includes the correct `sortBy` parameter
3. Verify the response data is actually sorted (check first/last items)
4. Check that page 2+ maintains sort order (not re-sorted per page)

## Notes
- Direct scalar fields (name, createdAt, status) work fine with Prisma orderBy on MSSQL
- This issue is specific to the MSSQL adapter; PostgreSQL handles relation orderBy correctly
- The memory guard (MAX_IN_MEMORY_SORT) prevents OOM on large datasets — falls back gracefully
- Always validate sortBy against a whitelist to prevent injection
- `String.prototype.localeCompare('he')` ensures correct Hebrew alphabetical ordering
