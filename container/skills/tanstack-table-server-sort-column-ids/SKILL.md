---
name: tanstack-table-server-sort-column-ids
description: |
  Fix server-side sorting failures in TanStack Table (React Table v8). Use when:
  (1) clicking a column header does nothing (no sort request sent),
  (2) sort request is sent but backend rejects/ignores the sortBy value,
  (3) column ID contains underscores instead of dots (Guest_name vs Guest.name),
  (4) SortableHeader component is missing on sortable columns.
  Covers accessorKey dot-path bug and SortableHeader requirement.
author: Claude Code
version: 1.0.0
date: 2026-03-01
---

# TanStack Table Server-Side Sort Column IDs

## Problem
Two common gotchas silently break server-side sorting in TanStack Table:

1. **Dot-path column ID bug**: `accessorKey: 'Guest.name'` generates column ID `Guest_name`
   (dots replaced with underscores). If the backend expects `Guest.name` as sortBy, sorting
   silently fails — no error, just unsorted data.

2. **Missing SortableHeader**: Using a plain string `header: 'Column Name'` does NOT render
   a clickable sort button. The column appears sortable in config but clicking does nothing.

## Context / Trigger Conditions
- Using TanStack Table v8 with server-side sorting (manualSorting: true)
- Column headers don't respond to clicks (no sort arrow, no request)
- Backend receives sortBy values with underscores (e.g., `Guest_name`) instead of dots
- Sort works for some columns (direct fields) but not others (nested/relation fields)
- Backend validateSortField rejects the sortBy value silently

## Solution

### Fix 1: Use explicit `id` + `accessorFn` for nested paths

```typescript
// BAD: generates column ID "Guest_name" (dots → underscores)
{
  accessorKey: 'Guest.name',
  header: 'Name',
}

// GOOD: explicit ID preserves dots, accessorFn handles data access
{
  id: 'Guest.name',
  accessorFn: (row) => row.Guest.name,
  header: ({ column }) => <SortableHeader column={column} title='Name' />,
}
```

**Rule of thumb:**
- Direct fields (no dots) are safe with `accessorKey`: `{ accessorKey: 'name' }`
- Nested paths MUST use `id` + `accessorFn`: `{ id: 'Guest.Group.name', accessorFn: ... }`

### Fix 2: Always use SortableHeader component

```typescript
// BAD: plain text — column is not clickable for sorting
{
  accessorKey: 'name',
  header: 'Name',
}

// GOOD: SortableHeader renders clickable sort button with arrow indicator
{
  accessorKey: 'name',
  header: ({ column }) => <SortableHeader column={column} title='Name' />,
}
```

### Complete column definition pattern

```typescript
// Direct scalar field
{
  accessorKey: 'name',
  header: ({ column }) => <SortableHeader column={column} title='Name' />,
  cell: ({ row }) => row.original.name || '-',
},

// Nested relation field
{
  id: 'Guest.Group.name',
  accessorFn: (row) => row.Guest.Group?.name,
  header: ({ column }) => <SortableHeader column={column} title='Group' />,
  cell: ({ row }) => row.original.Guest.Group?.name || '-',
},

// Non-sortable column (actions, icons)
{
  id: 'actions',
  enableHiding: false,
  enableSorting: false,
  cell: ({ row }) => <ActionsMenu row={row} />,
},
```

## Debugging

When sorting doesn't work, check these in order:

1. **Console.log the sort state**: `console.log(table.getState().sorting)` — verify the
   column ID matches what the backend expects
2. **Network tab**: Check the sortBy parameter in the API request URL
3. **Backend logs**: Check if validateSortField is rejecting the value
4. **Column definition**: Verify `SortableHeader` is used (not plain string)
5. **Column ID**: Verify no underscores where dots are expected

## Verification
1. Click a column header → sort arrow appears
2. Network request shows correct `sortBy=Field.name` (dots, not underscores)
3. Response data is actually sorted by the expected field
4. Clicking again toggles to descending (arrow changes direction)
5. Clicking a third time removes sort (returns to default)

## Notes
- This is a TanStack Table v8 behavior, not a bug — `accessorKey` intentionally sanitizes
  dots to create valid JavaScript identifiers for internal use
- The `id` property always takes precedence over the auto-generated ID from `accessorKey`
- For tables with `manualSorting: true`, the `sorting` state's `id` value is sent to the
  backend as-is — it must match the backend's expected field name exactly
- Related skill: `tanstack-table-defensive-patterns` covers crash prevention for undefined
  state props (separate issue from sorting)
