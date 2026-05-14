---
name: hebrew-rtl-setup
description: |
  Comprehensive guide for Hebrew/RTL web application setup and conversion. Use when:
  (1) building Hebrew-first web applications, (2) converting English LTR interfaces
  to Hebrew RTL, (3) adding RTL support to existing components, (4) fixing layout
  issues in Hebrew interfaces, (5) team needs consistent Hebrew labeling. Covers
  HTML/CSS configuration, Tailwind v3.3+ logical properties, CSS property flips,
  Hebrew constants organization, font selection, and RTL-specific UI considerations.
author: Claude Code
version: 2.0.0
date: 2026-02-04
---

# Hebrew RTL Web Application Setup

## Overview

### What is RTL?

RTL (Right-to-Left) is the text direction used by Hebrew, Arabic, and other Semitic languages. Unlike English (LTR - Left-to-Right), Hebrew text flows from right to left, which affects:

- Text alignment and direction
- Layout element positioning (sidebars, navigation)
- Margin, padding, and border directions
- Icon orientations (arrows, chevrons)
- Table column ordering
- Form field layouts

### When to Use This Skill

1. **Building Hebrew Interface:**
   - Primary language is Hebrew (עברית)
   - All UI text must be in Hebrew
   - Users expect RTL layout

2. **Converting LTR to RTL:**
   - Transforming existing English mockups/components to Hebrew
   - Adding internationalization (i18n) support for RTL languages
   - Fixing "backwards" or misaligned layouts in Hebrew interfaces

3. **Experiencing RTL Issues:**
   - Content aligns left instead of right
   - Icons or arrows point wrong direction
   - Forms have labels on left side (should be right)
   - Tables read left-to-right (should be right-to-left)
   - Padding/margin on wrong side
   - Elements appearing on wrong side of containers

4. **Team Needs:**
   - Multiple developers need consistent Hebrew labels
   - Single source of truth for all Hebrew text
   - Easy to update labels across entire application

---

## Part 1: Project Setup

### 1.1 HTML Configuration

**File:** `index.html` (or `public/index.html`)

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>שם האפליקציה</title>

    <!-- Hebrew Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Critical attributes:**
- `lang="he"` - Declares Hebrew language (enables proper font rendering, screen readers)
- `dir="rtl"` - Sets text direction to right-to-left (affects entire layout)
- `<title>` in Hebrew

### 1.2 CSS Base Setup

**File:** `src/index.css` (or global CSS file)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  direction: rtl;
  text-align: right;
  font-family: 'Heebo', 'Assistant', 'Arial', sans-serif;
}

/* Fix Tailwind defaults for RTL */
* {
  text-align: inherit;
}
```

**Why this matters:**
- `direction: rtl` - Sets default text direction
- `text-align: right` - Default alignment for Hebrew text
- Hebrew fonts: Use `Heebo`, `Assistant`, or other Hebrew-optimized fonts
- `text-align: inherit` - Prevents Tailwind from overriding with left alignment

### 1.3 Font Selection

Replace Latin fonts with Hebrew-compatible fonts:

| Original Font | Hebrew Alternative |
|--------------|-------------------|
| Inter | Heebo |
| Public Sans | Heebo |
| Roboto | Assistant |
| Open Sans | Open Sans (has Hebrew) |

**Google Fonts link:**
```html
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
```

### 1.4 Tailwind v3.3+ RTL Configuration

**File:** `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'Assistant', 'Arial', 'sans-serif'],
        display: ['Heebo', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

**Tailwind CSS v3.3.0+ Logical Properties:**

Tailwind CSS v3.3.0+ uses **logical properties** that automatically work in both LTR and RTL:

| Old (LTR-specific) | New (Logical) | Meaning |
|-------------------|---------------|---------|
| `ml-4` | `ms-4` | Margin start (right in RTL) |
| `mr-4` | `me-4` | Margin end (left in RTL) |
| `pl-4` | `ps-4` | Padding start (right in RTL) |
| `pr-4` | `pe-4` | Padding end (left in RTL) |
| `left-0` | `start-0` | Position start (right in RTL) |
| `right-0` | `end-0` | Position end (left in RTL) |
| `text-left` | `text-start` | Text align start (right in RTL) |
| `text-right` | `text-end` | Text align end (left in RTL) |

**Example usage:**

```tsx
// ❌ Bad: LTR-specific
<div className="ml-4 pr-8 text-left">
  <button className="float-right">Click</button>
</div>

// ✅ Good: Logical properties (works in RTL automatically)
<div className="ms-4 pe-8 text-start">
  <button className="float-end">לחץ</button>
</div>
```

**For manual RTL adjustments, use the `rtl:` variant:**

```tsx
<div className="ml-4 rtl:mr-4 rtl:ml-0">
  {/* Reverses margin in RTL */}
</div>
```

---

## Part 2: CSS Property Conversion

When converting existing LTR components to RTL, use these property flip tables.

### 2.1 Complete Property Flip Table

**Margins and Paddings:**

| LTR | RTL |
|-----|-----|
| `ml-*` | `mr-*` |
| `mr-*` | `ml-*` |
| `pl-*` | `pr-*` |
| `pr-*` | `pl-*` |

**Borders:**

| LTR | RTL |
|-----|-----|
| `border-l` | `border-r` |
| `border-r` | `border-l` |
| `rounded-l-lg` | `rounded-r-lg` |
| `rounded-r-lg` | `rounded-l-lg` |
| `rounded-tl-*` | `rounded-tr-*` |
| `rounded-tr-*` | `rounded-tl-*` |
| `rounded-bl-*` | `rounded-br-*` |
| `rounded-br-*` | `rounded-bl-*` |

**Text Alignment:**

| LTR | RTL |
|-----|-----|
| `text-left` | `text-right` |
| `text-right` | `text-left` |

**Positioning:**

| LTR | RTL |
|-----|-----|
| `left-*` | `right-*` |
| `right-*` | `left-*` |

### 2.2 Logical Properties (Modern CSS / Tailwind v3.3+)

For new projects, prefer logical properties that automatically flip:

| Physical Property | Logical Property |
|------------------|------------------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `left` | `inset-inline-start` |
| `right` | `inset-inline-end` |

**Tailwind equivalents:**
- `ms-*` = margin-inline-start
- `me-*` = margin-inline-end
- `ps-*` = padding-inline-start
- `pe-*` = padding-inline-end
- `start-*` = inset-inline-start
- `end-*` = inset-inline-end

### 2.3 Component Conversion Examples

**Sidebars:**
```html
<!-- LTR: border on right side -->
<aside class="border-r border-slate-200">

<!-- RTL: border on left side (visually still the "inner" edge) -->
<aside class="border-l border-slate-200">

<!-- Modern: Use logical property -->
<aside class="border-e border-slate-200">
```

**Nested Navigation (indented submenu):**
```html
<!-- LTR -->
<div class="ml-6 border-l">

<!-- RTL -->
<div class="mr-6 border-r">

<!-- Modern: Logical -->
<div class="ms-6 border-s">
```

**Select Dropdown Icons:**
```html
<!-- LTR: icon on right -->
<span class="absolute right-3">expand_more</span>

<!-- RTL: icon on left -->
<span class="absolute left-3">expand_more</span>

<!-- Modern: Logical -->
<span class="absolute end-3">expand_more</span>
```

**Input with Icon Addon:**
```html
<!-- LTR -->
<input class="rounded-l-lg"/>
<div class="rounded-r-lg">icon</div>

<!-- RTL -->
<input class="rounded-r-lg"/>
<div class="rounded-l-lg">icon</div>

<!-- Modern: Logical -->
<input class="rounded-s-lg"/>
<div class="rounded-e-lg">icon</div>
```

**Action Buttons (in tables/lists):**
```html
<!-- LTR: actions aligned right -->
<td class="text-right">
  <div class="flex justify-end gap-2">

<!-- RTL: actions aligned left (opposite side) -->
<td class="text-left">
  <div class="flex justify-start gap-2">

<!-- Modern: Logical -->
<td class="text-end">
  <div class="flex justify-end gap-2">
```

**Pagination:**
```html
<!-- LTR: previous arrow on left, next on right -->
<button>chevron_left (previous)</button>
<button>chevron_right (next)</button>

<!-- RTL: previous arrow on right, next on left -->
<button>chevron_right (previous)</button>
<button>chevron_left (next)</button>
```

**Toast/Notification Position:**
```html
<!-- LTR -->
<div class="fixed top-4 right-4">

<!-- RTL -->
<div class="fixed top-4 left-4">

<!-- Modern: Logical -->
<div class="fixed top-4 end-4">
```

**Table Headers:**
For RTL tables, keep `text-right` as the default alignment:
```html
<table class="w-full text-right">
```

**Form Layouts:**
```tsx
// ✅ Good: Label aligns right in RTL
<div className="flex flex-col gap-2">
  <label className="text-start font-medium">
    {HEBREW.FULL_NAME}
  </label>
  <input
    type="text"
    className="border rounded px-4 py-2 text-start"
  />
</div>
```

**Flexbox Direction:**
```tsx
// ❌ Bad: Manual reversal not needed
<div className="flex flex-row-reverse">
  <button>{HEBREW.CANCEL}</button>
  <button>{HEBREW.SUBMIT}</button>
</div>

// ✅ Good: Natural order, dir="rtl" handles reversal
<div className="flex gap-2">
  <button>{HEBREW.SUBMIT}</button>  {/* Appears on right */}
  <button>{HEBREW.CANCEL}</button>  {/* Appears on left */}
</div>
```

**Before/After Full Example:**

```html
<!-- Before (English LTR): -->
<html lang="en">
<body>
  <aside class="border-r ml-0">
    <nav class="ml-6">
      <a class="text-left">Dashboard</a>
    </nav>
  </aside>
</body>
</html>

<!-- After (Hebrew RTL): -->
<html lang="he" dir="rtl">
<body>
  <aside class="border-l mr-0">
    <nav class="mr-6">
      <a class="text-right">לוח בקרה</a>
    </nav>
  </aside>
</body>
</html>
```

---

## Part 3: Hebrew Constants & Localization

### 3.1 Hebrew Constants File

**File:** `src/constants/hebrew.ts`

**Purpose:** Single source of truth for all Hebrew labels.

```typescript
export const HEBREW = {
  // Actions
  SUBMIT: 'שלח',
  CANCEL: 'בטל',
  EDIT: 'ערוך',
  DELETE: 'מחק',
  SAVE: 'שמור',
  SEARCH: 'חיפוש',
  EXPORT: 'ייצא',
  APPROVE: 'אשר',
  REJECT: 'דחה',
  ADD: 'הוסף',
  CLOSE: 'סגור',
  CONFIRM: 'אשר',
  BACK: 'חזור',
  NEXT: 'הבא',
  PREVIOUS: 'הקודם',

  // Navigation
  DASHBOARD: 'לוח בקרה',
  REQUESTS: 'בקשות',
  NEW_REQUEST: 'בקשה חדשה',
  ROOMS: 'חדרים',
  QUOTAS: 'מכסות',
  APPROVALS: 'אישורים',
  LOGOUT: 'התנתק',
  HOME: 'בית',
  SETTINGS: 'הגדרות',
  HISTORY: 'היסטוריה',

  // Form Fields
  FULL_NAME: 'שם מלא',
  NAME: 'שם',
  ID_NUMBER: 'תעודת זהות',
  EMAIL: 'דוא"ל',
  PHONE: 'טלפון',
  ADDRESS: 'כתובת',
  DATE: 'תאריך',
  TIME: 'שעה',
  DESCRIPTION: 'תיאור',
  NOTES: 'הערות',
  BRANCH: 'ענף',
  SITE: 'אתר',

  // Status
  STATUS: 'סטטוס',
  PENDING: 'ממתין לאישור',
  APPROVED: 'אושר',
  REJECTED: 'נדחה',
  ACTIVE: 'פעיל',
  INACTIVE: 'לא פעיל',
  OK_VALID: 'תקין',
  FULL: 'מלא',
  VIOLATION: 'חריגה',

  // Gender
  MALE: 'גברים',
  FEMALE: 'נשים',

  // Table Headers
  ACTIONS: 'פעולות',
  FILTER: 'סינון',

  // Messages
  LOADING: 'טוען...',
  NO_DATA: 'אין נתונים להצגה',
  ERROR_OCCURRED: 'אירעה שגיאה',
  OPERATION_SUCCESS: 'הפעולה בוצעה בהצלחה',
  OPERATION_FAILED: 'הפעולה נכשלה',
  REQUIRED_FIELD: 'שדה חובה',
  INVALID_FORMAT: 'פורמט לא תקין',

  // System
  SYSTEM_TITLE: 'שם המערכת',
  VERSION: 'גרסה',
} as const;

export type HebrewKey = keyof typeof HEBREW;
```

**Usage in components:**

```tsx
import { HEBREW } from '../constants/hebrew';

export const LoginPage = () => {
  return (
    <div>
      <h1>{HEBREW.SYSTEM_TITLE}</h1>
      <button>{HEBREW.SUBMIT}</button>
      <p>{HEBREW.LOADING}</p>
    </div>
  );
};
```

**Benefits:**
- Single source of truth for all Hebrew text
- Easy to update labels globally
- TypeScript autocomplete for label keys
- Find all usages of a label
- No hardcoded Hebrew strings scattered across codebase

### 3.2 Font Considerations

**Recommended Hebrew Fonts:**

1. **Heebo** - Most versatile, excellent for UI
   - Weights: 100-900
   - Google Fonts URL: `https://fonts.google.com/specimen/Heebo`

2. **Assistant** - Clean, modern feel
   - Weights: 200-800
   - Good for body text

3. **Open Sans** - Has Hebrew glyphs
   - Good fallback option

**Font Loading Performance:**
- Hebrew fonts add ~100KB
- Use `display=swap` for better UX
- Preconnect to Google Fonts

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

### 3.3 Date and Number Formatting

Hebrew uses Western numerals (1, 2, 3) but different date format:

```tsx
// Date format: dd/MM/yyyy (not MM/dd/yyyy)
const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('he-IL').format(date);
  // Example: "20/01/2026"
};

// Numbers: Use Western numerals
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('he-IL').format(num);
  // Example: "1,234.56"
};
```

### 3.4 Validation Messages

All validation messages should be in Hebrew:

```typescript
// Using Zod for validation
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'השם חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת דוא"ל לא תקינה'),
  phone: z.string().regex(/^\d{10}$/, 'מספר טלפון חייב להכיל 10 ספרות'),
});
```

---

## Verification Checklist

### HTML/CSS Configuration

- [ ] `<html>` has `lang="he"` attribute
- [ ] `<html>` has `dir="rtl"` attribute
- [ ] `<body>` has `direction: rtl` CSS
- [ ] `<body>` has `text-align: right` CSS
- [ ] Hebrew font (Heebo/Assistant) is loaded
- [ ] Font preconnect links are added

### Layout Testing

- [ ] All text aligns right
- [ ] Sidebar appears on the correct side (usually right)
- [ ] Forms have labels on right side
- [ ] Tables read right-to-left (first column on right)
- [ ] Action buttons appear on the left side of rows
- [ ] Pagination arrows are reversed
- [ ] Modal close buttons on correct corner
- [ ] Dropdown menus open in correct direction
- [ ] Tooltips appear on correct side
- [ ] No horizontal scroll caused by RTL

### Component Testing

- [ ] Navigation arrows point correct direction
- [ ] Checkboxes/radio buttons have labels on correct side
- [ ] Progress indicators flow right-to-left
- [ ] Breadcrumbs flow right-to-left
- [ ] Cards and list items are properly aligned

### Responsive Design

- [ ] RTL works on mobile devices
- [ ] Responsive breakpoints don't break RTL layout
- [ ] Hamburger menu opens from correct side

### Browser Verification

1. Open app in Chrome/Firefox
2. Right-click → Inspect
3. Verify `dir="rtl"` on `<html>`
4. Check computed styles show `direction: rtl`
5. Test on actual device if possible

---

## Notes

### Important Considerations

1. **Numbers**: Numbers in Hebrew are still written left-to-right, even within RTL text. Browsers handle this automatically via the Unicode Bidirectional Algorithm.

2. **Mixed Content**: When mixing English and Hebrew text, browsers handle bidirectional text automatically.

3. **Testing**: Test with actual Hebrew text, not just placeholder text. Character width and kerning differ from Latin fonts.

4. **Icons**: Most icons don't need flipping. Exceptions:
   - Arrows and chevrons for navigation (not expand/collapse)
   - Directional indicators
   - Progress/timeline icons

### Common Gotchas

1. **Old Tailwind CSS Versions:**
   - Tailwind < v3.3.0 doesn't have logical properties
   - Upgrade to v3.3.0+ or use `tailwindcss-rtl` plugin
   - Check version: `npx tailwindcss --version`

2. **Third-Party Components:**
   - Some libraries (e.g., date pickers) don't support RTL
   - Check library docs for RTL support
   - May need custom CSS overrides

3. **Icon Libraries:**
   - Font Awesome, Heroicons work fine in RTL
   - Some custom icons may need manual flipping
   - Test navigation icons carefully

4. **CSS Frameworks:**
   - Bootstrap has RTL support via `dir="rtl"` on `<html>`
   - Material-UI requires theme configuration
   - Ant Design has built-in RTL support

### Browser Support

- All modern browsers support `dir="rtl"` (IE11+)
- Logical properties (margin-inline-start) work in Chrome 87+, Firefox 66+, Safari 14.1+
- For older browsers, Tailwind CSS compiles to compatible CSS

### Performance

- No performance impact from RTL
- Hebrew fonts add ~100KB (preload for better performance)
- Logical properties compile to standard CSS

### Multilingual Apps

For apps supporting both Hebrew and English:

```tsx
import { useState, useEffect } from 'react';

const App = () => {
  const [language, setLanguage] = useState<'he' | 'en'>('he');

  useEffect(() => {
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div>
      <button onClick={() => setLanguage('he')}>עברית</button>
      <button onClick={() => setLanguage('en')}>English</button>
      {/* App content */}
    </div>
  );
};
```

---

## References

- [MDN: RTL Languages](https://developer.mozilla.org/en-US/docs/Web/CSS/direction)
- [MDN: dir attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/dir)
- [MDN: CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties)
- [Tailwind CSS RTL Support](https://tailwindcss.com/docs/hover-focus-and-other-states#rtl-support)
- [Tailwind CSS Logical Properties (v3.3.0+)](https://tailwindcss.com/blog/tailwindcss-v3-3#simplified-rtl-support-with-logical-properties)
- [Tailwind CSS RTL Support (Flowbite)](https://flowbite.com/docs/customize/rtl/)
- [Implementing RTL Support in Web Applications](https://www.melvinliu.com/blog/implement-rtl-support-in-web-application)
- [RTL Support in React with Tailwind](https://medium.com/@20lives/multilingual-bidirectional-rtl-websites-with-tailwind-and-nuxt-bca6ccd2494d)
- [Tailwind RTL Troubleshooting Guide](https://tailkits.com/blog/tailwind-rtl-not-working/)
- [Google Fonts: Heebo](https://fonts.google.com/specimen/Heebo)
