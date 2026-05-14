---
name: hebrew-label-centralization
description: |
  Centralize all hardcoded Hebrew UI text into a single constants file. Use when:
  (1) React/TypeScript app has 50+ components with scattered Hebrew strings,
  (2) Need single-point-of-change label management for UI text,
  (3) Planning language/terminology changes across entire application,
  (4) Want TypeScript type safety and autocomplete for all labels,
  (5) Building accessibility features that require consistent terminology.
  Covers: Label structure design, migration patterns, TypeScript const patterns,
  template functions for dynamic content, refactoring existing hardcoded strings.
author: Claude Code
version: 1.0.0
date: 2026-02-08
---

# Hebrew Label Centralization Pattern

## Problem

In React applications with Hebrew UI text, labels are often scattered across 50+ component files:

```typescript
// ❌ BAD: Hardcoded in multiple files
export const DeleteDialog = ({ name }) => (
  <Dialog>
    <Title>מחיקת פריט</Title>
    <Description>האם למחוק את "{name}"?</Description>
    <Button>מחק</Button>
  </Dialog>
);

export const EditForm = () => (
  <Form>
    <Button>ערוך</Button>
    <Button>ביטול</Button>
  </Form>
);

export const List = () => (
  <div>
    <h1>ניהול פריטים</h1>
    <Button>צור חדש</Button>
  </div>
);
```

**Problems**:
- Changing terminology requires editing 60+ files
- No way to translate entire app at once
- Typos spread across multiple components
- No autocomplete for label names
- Inconsistent translation of similar concepts

## Context / Trigger Conditions

Use this pattern when you have ANY of these situations:
- React app with 20+ components using hardcoded Hebrew text
- Planning label/terminology changes across app
- Need TypeScript type safety for UI strings
- Building multi-language support later
- Want to audit all UI text in one place

## Solution

### Step 1: Design Label Structure

Create `shared/src/constants/labels.ts` with nested `const` objects:

```typescript
// Base structure for any category
export const CATEGORY_LABELS = {
  // Singular/plural noun forms
  singular: 'word',
  plural: 'words',
  withArticle: 'the-word',

  // CRUD actions
  crud: {
    create: 'Create word',
    edit: 'Edit word',
    delete: 'Delete word',
    update: 'Update word',
  },

  // Form labels and placeholders
  form: {
    label: 'Label text',
    placeholder: 'Placeholder text',
    nameRequired: 'Name is required',
  },

  // Messages: success/error/loading
  messages: {
    success: 'Word created successfully',
    error: 'Error creating word',
    loading: 'Creating word...',
  },

  // Validation errors
  validation: {
    required: 'This field is required',
    tooShort: 'Text is too short',
    duplicate: 'This word already exists',
  },

  // Dynamic content (template functions)
  dynamic: {
    deleted: (name: string) => `Word "${name}" deleted successfully`,
    confirmation: (count: number) => `Delete ${count} words?`,
  },
} as const;  // ← CRITICAL: as const makes all strings literal types
```

### Step 2: Create Labels for Your Categories

```typescript
// Example: Guest management labels
export const GUEST_LABELS = {
  title: 'ניהול חיילים',

  sections: {
    personalInfo: 'פרטים אישיים',
    militaryInfo: 'פרטים צבאיים',
  },

  columns: {
    name: 'שם',
    id: 'מזהה',
    phone: 'טלפון',
  },

  actions: {
    info: 'פרטי חייל',
    edit: 'עריכת חייל',
    delete: 'מחיקת חייל',
  },

  form: {
    fullName: 'שם מלא',
    phone: 'טלפון',
    updateGroup: (name: string) => `עדכון ענף עבור ${name}`,
  },

  confirmations: {
    deleteTitle: 'מחיקת חייל',
    deleteMessage: (name: string) => `האם למחוק את ${name}?`,
  },

  messages: {
    created: 'חייל נוצר בהצלחה',
    updated: 'חייל עודכן בהצלחה',
    deleted: 'חייל נמחק בהצלחה',
    deleteError: 'שגיאה במחיקת חייל',
  },
} as const;
```

### Step 3: Import and Use in Components

**Before**:
```typescript
export const GuestForm = ({ guestName, onDelete }) => (
  <div>
    <h1>ניהול חיילים</h1>
    <form>
      <label>שם מלא</label>
      <input placeholder='הזן שם' />
      <button>שמור</button>
    </form>
    <button onClick={onDelete}>מחיקת חייל</button>
  </div>
);
```

**After**:
```typescript
import { GUEST_LABELS } from '@shared/constants/labels';

export const GuestForm = ({ guestName, onDelete }) => (
  <div>
    <h1>{GUEST_LABELS.title}</h1>
    <form>
      <label>{GUEST_LABELS.form.fullName}</label>
      <input placeholder={GUEST_LABELS.form.placeholder} />
      <button>{COMMON_LABELS.actions.save}</button>
    </form>
    <button onClick={onDelete}>{GUEST_LABELS.actions.delete}</button>
  </div>
);
```

### Step 4: Handle Dynamic Content

Use template functions for strings with variables:

```typescript
// Define as function in labels.ts
export const GUEST_LABELS = {
  confirmations: {
    releaseDescription: (name: string, date: string) =>
      `תאריך: ${date}\nהאם לשחרר את ${name}?`,
  },
  messages: {
    exportedCount: (count: number) => `ייצוא ${count} חיילים בוצע בהצלחה`,
  },
} as const;

// Use in component
const handleRelease = () => {
  const message = GUEST_LABELS.confirmations.releaseDescription(
    'אברהם כהן',
    '2026-02-08'
  );
  showDialog(message);
};
```

## Verification

### 1. Find All Hardcoded Hebrew Strings
```bash
# Search for Hebrew text in component files
grep -r "['\"]\s*[א-ת]" frontend/src --include="*.tsx" | wc -l

# Should return 0 after migration
```

### 2. Verify All Labels Are Imported
```bash
# Count label imports
grep -r "GUEST_LABELS\|FACILITY_LABELS\|SITE_LABELS" frontend/src | wc -l

# Should match number of files that need labels
```

### 3. Check TypeScript Compilation
```bash
npm run typecheck

# Should show 0 errors (TypeScript validates label usage)
```

### 4. Hot Reload Verification
- Edit a label value in `labels.ts`
- Save and watch dev server output
- All components should instantly reflect change
- No page refresh needed (HMR)

## Example: Complete Refactoring

**Original scattered code**:
```typescript
// file1.tsx
const DeleteDialog = () => (
  <Dialog title='מחיקת חייל' confirmText='מחק חייל' />
);

// file2.tsx
const EditForm = () => (
  <Form title='עריכת חייל' submitLabel='שמור' />
);

// file3.tsx
const GuestList = () => (
  <div>
    <h1>ניהול חיילים</h1>
    <Button>צור חייל חדש</Button>
  </div>
);
```

**After centralization**:
```typescript
// shared/src/constants/labels.ts
export const GUEST_LABELS = {
  title: 'ניהול חיילים',
  actions: {
    create: 'צור חייל חדש',
    edit: 'עריכת חייל',
    delete: 'מחיקת חייל',
  },
  confirmations: {
    deleteTitle: 'מחיקת חייל',
    deleteConfirm: 'מחק חייל',
  },
  common: {
    save: 'שמור',
  },
} as const;

// file1.tsx
import { GUEST_LABELS } from '@shared/constants/labels';
const DeleteDialog = () => (
  <Dialog
    title={GUEST_LABELS.confirmations.deleteTitle}
    confirmText={GUEST_LABELS.confirmations.deleteConfirm}
  />
);

// file2.tsx
import { GUEST_LABELS } from '@shared/constants/labels';
const EditForm = () => (
  <Form
    title={GUEST_LABELS.actions.edit}
    submitLabel={GUEST_LABELS.common.save}
  />
);

// file3.tsx
import { GUEST_LABELS } from '@shared/constants/labels';
const GuestList = () => (
  <div>
    <h1>{GUEST_LABELS.title}</h1>
    <Button>{GUEST_LABELS.actions.create}</Button>
  </div>
);
```

**Benefits**:
- Change "ניהול חיילים" → "ניהול אנשי הכוח" in ONE place
- All 3 files instantly update
- TypeScript autocomplete for all label names
- Can easily see all UI text in one file

## Implementation Checklist

- [ ] Create `shared/src/constants/labels.ts` with nested structure
- [ ] Define label categories (GUEST_LABELS, FACILITY_LABELS, etc.)
- [ ] Use `as const` on all label objects for type safety
- [ ] Create template functions for dynamic content
- [ ] Search for all hardcoded Hebrew strings: `grep -r "[א-ת]"`
- [ ] Import labels into each component that uses them
- [ ] Replace hardcoded strings with label references
- [ ] Run `npm run typecheck` to verify
- [ ] Test that HMR works (edit label, save, verify instant update)
- [ ] Verify no console errors
- [ ] Create test for label coverage (optional)

## Common Mistakes to Avoid

❌ **NOT using `as const`**:
```typescript
// Bad: loses type information
export const LABELS = {
  title: 'Title',
};
// TypeScript treats as: { title: string }
```

✅ **Use `as const` always**:
```typescript
// Good: preserves literal types
export const LABELS = {
  title: 'Title',
} as const;
// TypeScript treats as: { readonly title: "Title" }
```

---

❌ **Not grouping related labels**:
```typescript
// Bad: flat structure is hard to navigate
export const LABELS = {
  deleteTitle: 'Delete',
  deleteConfirm: 'Confirm Delete',
  deleteError: 'Delete failed',
  editTitle: 'Edit',
};
```

✅ **Group by feature/concept**:
```typescript
// Good: organized structure
export const LABELS = {
  delete: {
    title: 'Delete',
    confirm: 'Confirm Delete',
    error: 'Delete failed',
  },
  edit: {
    title: 'Edit',
  },
} as const;
```

---

❌ **Using string concatenation for dynamic content**:
```typescript
// Bad: mix of constants and strings
const message = LABELS.confirm + ' ' + guestName + '?';
```

✅ **Use template functions**:
```typescript
// Good: single source of truth
const message = LABELS.confirmations.delete(guestName);
```

## Performance Implications

✅ **Zero runtime overhead**:
- All labels are compile-time constants
- No runtime label lookups or database queries
- No module re-exports (direct import)
- Tree-shaking removes unused labels in production

✅ **Bundle size**:
- ~2-5KB gzipped for typical label file
- Far less than alternative i18n libraries
- No runtime dependencies required

## Notes

- This pattern works for any language, not just Hebrew
- Extend to backend API error messages for consistency
- Consider creating a design system for label naming
- Can evolve into proper i18n system later if needed
- Works great with TypeScript's strict mode

## References

- [TypeScript `as const` documentation](https://www.typescriptlang.org/docs/handbook/const-assertions.html)
- [React internationalization patterns](https://react.i18next.com/)
- [Type-safe constants pattern](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-object-literal-types)
