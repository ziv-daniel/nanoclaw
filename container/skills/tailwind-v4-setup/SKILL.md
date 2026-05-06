---
name: tailwind-v4-setup
description: |
  Comprehensive Tailwind CSS v4 setup and migration guide. Use when: (1) Tailwind styles not applying
  but no build errors, (2) error "It looks like you're trying to use tailwindcss directly as a PostCSS
  plugin", (3) error "Cannot apply unknown utility class 'bg-background'", (4) migrating from Tailwind
  v3 to v4, (5) custom colors/theme from JS config aren't working, (6) @apply directives failing with
  CSS variables. Covers CSS-first configuration with @theme directive, PostCSS plugin setup, Vite
  plugin setup, and @apply migration.
author: Claude Code
version: 2.0.0
date: 2026-02-04
---

# Tailwind CSS v4 Setup & Migration Guide

## Overview: What Changed in Tailwind v4

Tailwind CSS v4 introduced a **CSS-first configuration** approach - a significant architectural change, not just a version bump.

**Key Changes:**
- Configuration moved from `tailwind.config.ts` (JavaScript) to CSS via `@theme` directive
- PostCSS plugin moved to separate package: `@tailwindcss/postcss`
- New Vite-specific plugin: `@tailwindcss/vite` (recommended for Vite projects)
- CSS import syntax changed from `@tailwind base/components/utilities` to `@import "tailwindcss"`
- `@apply` with CSS variable utilities often fails - requires different approach
- Theme values use CSS custom properties internally

---

## Problem 1: Styles Not Applying (Silent Failure)

### Symptoms

- Tailwind CSS classes have no effect
- Build succeeds without errors
- `tailwind.config.ts` exists but styles don't match config
- Custom colors/theme defined in JS config are ignored
- Page looks unstyled or uses only default Tailwind values

### Trigger Conditions

- `postcss.config.js` uses `@tailwindcss/postcss` plugin (indicates Tailwind v4)
- `tailwind.config.ts` or `tailwind.config.js` exists with custom theme
- Package.json shows `@tailwindcss/postcss: "4.x.x"` or `tailwindcss: "4.x.x"`
- CSS file uses old `@tailwind base; @tailwind components; @tailwind utilities;` syntax

### Root Cause

In Tailwind v4 with `@tailwindcss/postcss`, the JavaScript config file (`tailwind.config.ts`) is **not used by default**. Configuration must be in CSS.

### Solution: Migrate to CSS-First Configuration

**Step 1: Identify Tailwind Version**

```bash
# Check package.json or lockfile
cat package.json | grep -E "tailwindcss|@tailwindcss"
```

If you see `@tailwindcss/postcss` or `tailwindcss: "4.x"`, you're on v4.

**Step 2: Update CSS File**

Replace the old v3 syntax:
```css
/* OLD (v3) - Won't work with v4 */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

With the new v4 syntax:
```css
/* NEW (v4) */
@import "tailwindcss";

@theme {
  /* Define your custom theme here */
  --color-primary: #2463eb;
  --color-background: #f6f6f8;
  --color-foreground: #111827;
  --color-card: #ffffff;
  --color-muted-foreground: #6b7280;
  --color-border: #e5e7eb;

  --font-sans: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;

  --radius-lg: 0.5rem;
  --radius-md: 0.375rem;
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }
}
```

**Step 3: Update Class Names**

In v4, custom theme colors use the token name directly:
- `--color-primary` -> `bg-primary`, `text-primary`, `border-primary`
- `--color-background` -> `bg-background`
- `--color-muted-foreground` -> `text-muted-foreground`

**Step 4: Handle JS Config**

The `tailwind.config.ts` file is **not used by default** in v4 with `@tailwindcss/postcss`.
Options:
1. Delete it (use CSS-only config via `@theme`)
2. Keep it for reference but know it's ignored
3. Import it explicitly if you want JS config (advanced)

---

## Problem 2: PostCSS/Vite Errors

### Error Messages

**Error 1: PostCSS Plugin Location**
```
[vite] Internal server error: [postcss] It looks like you're trying to use
`tailwindcss` directly as a PostCSS plugin. The PostCSS plugin has moved to
a separate package...
```

**Error 2: @apply Failing**
```
Cannot apply unknown utility class `bg-background`. Are you using CSS modules
or similar and missing `@reference`?
```

### Trigger Conditions

- Using Tailwind CSS v4.x (not v3.x)
- Vite as build tool
- PostCSS for CSS processing
- Custom CSS variables in `@layer base`
- `@apply` directives with Tailwind utilities

### Solution A: PostCSS Approach

**Step 1: Install Separate PostCSS Package**

```bash
bun add -D @tailwindcss/postcss
# or: npm install -D @tailwindcss/postcss
```

**Step 2: Create/Update postcss.config.js**

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

**Note**: Remove `postcss-import` and old `tailwindcss` plugins if present.

**Step 3: Fix @apply Directives**

In v4, `@apply` with utilities that reference CSS variables (like `bg-background`) often fails. Replace with direct CSS:

**Before (doesn't work in v4):**
```css
@layer base {
  * {
    @apply border-border;  /* ERROR */
  }
  body {
    @apply bg-background text-foreground;  /* ERROR */
  }
}
```

**After (works in v4):**
```css
@layer base {
  * {
    border-color: hsl(var(--border));
  }
  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
  }
}
```

### Solution B: Vite Plugin (Recommended for Vite Projects)

For better performance, use the official Vite plugin instead of PostCSS:

**Step 1: Install Vite Plugin**

```bash
bun add -D @tailwindcss/vite
```

**Step 2: Configure vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
});
```

**Step 3: Update CSS File**

```css
@import "tailwindcss";

/* Your custom styles with @theme */
```

---

## Decision Tree: Which Approach to Use

```
Is your project using Vite?
├── YES -> Use @tailwindcss/vite plugin (Solution B)
│          - Better performance
│          - Simpler setup
│          - Recommended by Tailwind team
│
└── NO -> Use @tailwindcss/postcss (Solution A)
          - Works with any build tool
          - Standard PostCSS integration

Are you seeing @apply errors with CSS variables?
├── YES -> Replace @apply with direct CSS properties
│          - @apply bg-background -> background-color: hsl(var(--background))
│          - This is a known v4 limitation
│
└── NO -> Continue with standard setup

Is your tailwind.config.ts being ignored?
├── YES -> Normal behavior in v4
│          - Move config to CSS via @theme directive
│          - JS config is not auto-loaded
│
└── NO -> You may be on v3 or have explicit JS config import
```

---

## Migration Checklist

### Pre-Migration

- [ ] Identify current Tailwind version (`npm list tailwindcss`)
- [ ] Backup existing `tailwind.config.ts` content
- [ ] Note all custom theme values (colors, fonts, spacing, etc.)
- [ ] List files using `@apply` with custom utilities

### Configuration Migration

- [ ] Install correct package:
  - [ ] Vite projects: `@tailwindcss/vite`
  - [ ] Other projects: `@tailwindcss/postcss`
- [ ] Update `postcss.config.js` or `vite.config.ts`
- [ ] Replace `@tailwind base/components/utilities` with `@import "tailwindcss"`
- [ ] Add `@theme` block with custom CSS variables
- [ ] Convert theme values from JS syntax to CSS variable syntax

### @apply Migration

- [ ] Find all `@apply` usages: `grep -r "@apply" src/`
- [ ] Replace `@apply bg-{custom}` with `background-color: var(--color-{custom})`
- [ ] Replace `@apply text-{custom}` with `color: var(--color-{custom})`
- [ ] Replace `@apply border-{custom}` with `border-color: var(--color-{custom})`
- [ ] Standard Tailwind utilities in @apply still work (e.g., `@apply flex items-center`)

### Class Name Updates

- [ ] Custom colors: `--color-primary` maps to `bg-primary`, `text-primary`
- [ ] Font families: `--font-sans` maps to `font-sans`
- [ ] Border radius: `--radius-lg` maps to `rounded-lg`
- [ ] Note: `size-*` utility may not work - use explicit `w-* h-*`

### Verification

- [ ] Kill and restart dev server
- [ ] Check browser DevTools -> Elements -> Computed styles
- [ ] Verify custom colors appear in computed values
- [ ] Verify no console/terminal errors
- [ ] Test all pages/components using custom theme

---

## Full Working Example

### With @tailwindcss/postcss

**postcss.config.js:**
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

**index.css:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
  }
}

@layer base {
  * {
    border-color: hsl(var(--border));
  }
  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: system-ui, sans-serif;
  }
}
```

### With @tailwindcss/vite

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
});
```

**index.css:**
```css
@import "tailwindcss";

@theme {
  --color-primary: #2463eb;
  --color-background: #f6f6f8;
  --color-foreground: #111827;
  --color-card: #ffffff;
  --color-muted-foreground: #6b7280;
  --color-border: #e5e7eb;

  --font-sans: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;

  --radius-lg: 0.5rem;
  --radius-md: 0.375rem;
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }
}
```

**Component usage:**
```tsx
// Using theme tokens properly
<div className="bg-primary text-white rounded-lg">
  Content
</div>
```

---

## Notes

- **@apply limitations**: In v4, @apply with utilities referencing CSS variables (like `bg-background`) often fails. Use direct CSS properties instead.
- **@reference directive**: If you have multiple CSS files, you may need `@reference "./main.css"` at the top of files using @apply.
- **Vite plugin vs PostCSS**: The @tailwindcss/vite plugin is faster and recommended over PostCSS for Vite projects.
- **size-* utility**: May not work in all v4 setups; use explicit `w-8 h-8` instead.
- **DevTools debugging**: v4 uses CSS custom properties internally, making debugging easier in DevTools.
- **JS config import**: If you need the old JS config behavior, you can import it in CSS, but CSS-first is recommended.

---

## References

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind CSS v4.0 Official Announcement](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind v4 @apply Issue #15778](https://github.com/tailwindlabs/tailwindcss/issues/15778)
- [Install Tailwind CSS with Vite](https://tailwindcss.com/docs)
- [Nx: Configure Tailwind 4 with Vite](https://nx.dev/blog/setup-tailwind-4-npm-workspace)
