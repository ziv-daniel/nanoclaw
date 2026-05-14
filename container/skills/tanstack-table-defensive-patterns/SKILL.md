---
description: >-
  Prevent TanStack Table runtime crashes from optional state props. Use when:
  (1) creating new table components with useReactTable,
  (2) adding optional features like row selection/filtering/grouping to existing tables,
  (3) debugging "Cannot read properties of undefined" errors in table components,
  (4) reviewing table component code for potential crashes.
---

# TanStack Table Defensive Patterns

## The Problem

When using `useReactTable`, passing optional state properties as `undefined` causes runtime crashes in TanStack Table's internal methods. The errors are cryptic and hard to trace back to the root cause.

**Example crash:**

```
TypeError: Cannot read properties of undefined (reading 'some-row-id')
```

This happens when calling methods like `row.getIsSelected()`, `row.getIsExpanded()`, or `row.getIsGrouped()` when the corresponding state prop was passed as `undefined`.

## The Root Cause

TanStack Table's internal methods assume that if a state property key exists in the `state` object, its value is a valid object/array -- not `undefined`. When you write:

```typescript
// DANGEROUS: rowSelection is undefined when the prop is not provided
useReactTable({
  state: {
    rowSelection, // undefined !== omitted!
  },
});
```

JavaScript includes the key `rowSelection` in the object with value `undefined`. TanStack Table sees the key exists, skips its internal default, and then crashes when it tries to access properties on `undefined`.

This is different from omitting the key entirely, which would let TanStack Table use its internal default value.

## The Fix Pattern

Always default optional state props with nullish coalescing (`??`):

### Before (Broken)

```typescript
const [rowSelection, setRowSelection] = useState<RowSelectionState>();

const table = useReactTable({
  data,
  columns,
  state: {
    sorting,
    rowSelection,       // undefined when not initialized!
    columnFilters,      // undefined when not initialized!
  },
  onRowSelectionChange: setRowSelection,
  onColumnFiltersChange: setColumnFilters,
});
```

### After (Safe)

```typescript
const [rowSelection, setRowSelection] = useState<RowSelectionState>();

const table = useReactTable({
  data,
  columns,
  state: {
    sorting,
    rowSelection: rowSelection ?? {},       // safe default
    columnFilters: columnFilters ?? [],     // safe default
  },
  onRowSelectionChange: setRowSelection,
  onColumnFiltersChange: setColumnFilters,
});
```

## Affected State Properties and Their Defaults

| State Property | Type | Safe Default |
|---------------|------|-------------|
| `rowSelection` | `RowSelectionState` (Record) | `{}` |
| `expanded` | `ExpandedState` (Record) | `{}` |
| `columnFilters` | `ColumnFiltersState` (Array) | `[]` |
| `globalFilter` | `string` | `''` |
| `grouping` | `GroupingState` (Array) | `[]` |
| `columnOrder` | `ColumnOrderState` (Array) | `[]` |
| `columnPinning` | `ColumnPinningState` (Object) | `{ left: [], right: [] }` |
| `rowPinning` | `RowPinningState` (Object) | `{ top: [], bottom: [] }` |
| `columnVisibility` | `VisibilityState` (Record) | `{}` |
| `pagination` | `PaginationState` (Object) | `{ pageIndex: 0, pageSize: 10 }` |
| `sorting` | `SortingState` (Array) | `[]` |

**Rule of thumb**: Object states default to `{}`, array states default to `[]`, string states default to `''`.

## Conditional Feature Pattern

When a table component optionally supports features (e.g., row selection is enabled via a prop):

```typescript
type PaginatedTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
};

const PaginatedTable = <T,>({
  data,
  columns,
  rowSelection,
  onRowSelectionChange,
}: PaginatedTableProps<T>) => {
  const table = useReactTable({
    data,
    columns,
    state: {
      // Always default, even when the feature is "disabled"
      rowSelection: rowSelection ?? {},
    },
    // Only wire up the handler if provided
    ...(onRowSelectionChange && {
      onRowSelectionChange,
      enableRowSelection: true,
    }),
  });

  return <TableRenderer table={table} />;
};
```

## Error Boundary Safety Net

Always wrap table components with error boundaries at the route level to prevent full-page crashes:

```typescript
import { ErrorBoundary } from 'react-error-boundary';

const TableErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => (
  <div className='flex flex-col items-center gap-4 p-8'>
    <p className='text-destructive'>שגיאה בטעינת הטבלה</p>
    <Button onClick={resetErrorBoundary}>נסה שוב</Button>
  </div>
);

// In route component:
<ErrorBoundary FallbackComponent={TableErrorFallback}>
  <PaginatedTable data={data} columns={columns} />
</ErrorBoundary>
```

## Review Checklist

When creating or reviewing table components, verify:

- [ ] Every optional state prop in `useReactTable({ state: {} })` has a `?? default` fallback
- [ ] No state prop can be `undefined` at runtime (check useState initializers)
- [ ] Props passed from parent components are defaulted before reaching `useReactTable`
- [ ] Error boundary wraps the table component at the route level
- [ ] Conditional features (selection, filtering, grouping) use safe defaults even when "disabled"

## Prevention

Add to code review checklist:

1. **Search for `useReactTable`** in any changed files
2. **Inspect the `state` object** -- every value must be non-undefined
3. **Check parent components** -- trace where state props originate; ensure they cannot be undefined
4. **Grep for the pattern** `state: {` near `useReactTable` to find all instances in the codebase

```bash
# Find all useReactTable state definitions to audit
grep -n "useReactTable" frontend/src/**/*.tsx
```
