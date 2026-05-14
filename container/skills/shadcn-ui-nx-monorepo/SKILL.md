---
name: shadcn-ui-nx-monorepo
description: |
  Install and configure shadcn/ui components in Nx monorepo workspace. Use when:
  (1) Adding shadcn/ui to existing Nx React/Next.js app, (2) CLI installation
  fails or installs to wrong path, (3) Need to manually add components with
  proper path aliases, (4) Setting up shared UI library in monorepo, (5) Getting
  import errors for shadcn components. Covers components.json configuration,
  manual component installation, Tailwind integration, and path alias setup for
  2026.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# shadcn/ui + Nx Monorepo Integration (2026)

## Problem
shadcn/ui's CLI is optimized for standalone projects and can struggle with Nx monorepo structures. The CLI may install components to the wrong path, fail to resolve tsconfig paths, or create incorrect import statements in Nx workspaces.

## Context / Trigger Conditions
Use this skill when:
- Adding shadcn/ui to Nx React or Next.js application
- Error: "Cannot find module '@/components/ui/button'"
- CLI installs components to wrong directory (root instead of app)
- Need shared UI library for multiple apps in monorepo
- Manual component installation required due to CLI issues
- Setting up Tailwind CSS with shadcn/ui in Nx workspace

## Solution

### Approach 1: Official Monorepo Support (2026)

As of 2026, shadcn/ui has official monorepo support. For **new projects**:

```bash
npx shadcn@latest init
# Select "Next.js (Monorepo)" option
# Creates monorepo with Turborepo, web app, and ui workspace
```

This creates:
```
project/
├── apps/
│   └── web/          # Next.js app
├── packages/
│   └── ui/           # shadcn components
└── turbo.json
```

### Approach 2: Manual Setup in Existing Nx Workspace (Recommended)

For existing Nx workspaces, manual setup provides more control.

#### Step 1: Install Dependencies

In your Nx workspace root or app directory:

```bash
bun add tailwindcss-animate class-variance-authority clsx tailwind-merge
bun add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu
bun add @radix-ui/react-select @radix-ui/react-label lucide-react
```

**Key packages:**
- `class-variance-authority`: For component variants
- `clsx` + `tailwind-merge`: Utility class merging
- `@radix-ui/*`: Unstyled accessible primitives
- `lucide-react`: Icon library

#### Step 2: Configure Tailwind CSS

**File:** `apps/web/tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

#### Step 3: Add CSS Variables

**File:** `apps/web/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

#### Step 4: Create Utility Helper

**File:** `apps/web/src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

This `cn()` function is used by all shadcn components to merge Tailwind classes.

#### Step 5: Configure Path Aliases

**File:** `apps/web/vite.config.ts` (for Vite) or `apps/web/tsconfig.json`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**AND in tsconfig.json:**

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

#### Step 6: Create components.json

**File:** `apps/web/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Critical for Nx:**
- `tailwind.config`: Relative to app root
- `css`: Path to your CSS file
- `aliases`: Must match your tsconfig paths

#### Step 7: Create Component Directory

```bash
mkdir -p apps/web/src/components/ui
```

#### Step 8A: Add Components via CLI (if working)

```bash
cd apps/web
npx shadcn@latest add button
```

**Set environment variable for Nx:**
```bash
export TS_NODE_PROJECT=../../tsconfig.base.json
npx shadcn@latest add button
```

#### Step 8B: Add Components Manually (if CLI fails)

For Button component:

**File:** `apps/web/src/components/ui/button.tsx`

```typescript
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

Get other components from: [shadcn/ui Components](https://ui.shadcn.com/docs/components/button)

### Approach 3: Shared UI Library (Advanced)

For sharing components across multiple apps in monorepo:

#### Step 1: Create Shared UI Package

```bash
nx g @nx/react:library ui --directory=packages/ui
```

#### Step 2: Install shadcn Components in UI Package

```bash
cd packages/ui
# Add components here
```

#### Step 3: Export Components

**File:** `packages/ui/src/index.ts`

```typescript
export { Button } from './components/button';
export { Input } from './components/input';
// Export all ui components
```

#### Step 4: Use in Apps

**File:** `apps/web/src/App.tsx`

```typescript
import { Button } from '@your-org/ui';

function App() {
  return <Button>Click me</Button>;
}
```

## Verification

1. **Test component import:**
   ```typescript
   import { Button } from '@/components/ui/button';
   // Should not throw module not found error
   ```

2. **Test component rendering:**
   ```tsx
   <Button variant="default">Test Button</Button>
   // Should render with proper styles
   ```

3. **Test Tailwind classes:**
   ```tsx
   <Button className="mt-4">Button</Button>
   // Custom classes should merge properly
   ```

4. **Check component variants:**
   ```tsx
   <Button variant="destructive" size="lg">Large Destructive</Button>
   // Should apply variant styles
   ```

## Common Components to Add

```bash
# Core components
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add select
npx shadcn@latest add table
npx shadcn@latest add form

# Advanced components
npx shadcn@latest add toast
npx shadcn@latest add sheet
npx shadcn@latest add tabs
npx shadcn@latest add calendar
npx shadcn@latest add date-picker
```

## Notes

### Nx vs Turborepo
- shadcn/ui's official monorepo template uses Turborepo
- Nx has more features but requires manual shadcn setup
- Both work well once properly configured

### Windows Path Issues
- Use forward slashes in path.resolve even on Windows
- Ensure tsconfig paths use forward slashes
- Vite requires forward slashes in alias configuration

### Common Errors

**Error: "Cannot find module '@/components/ui/button'"**
- Check `@/*` path alias in tsconfig.json
- Verify vite.config.ts (or webpack config) has alias
- Ensure component file exists at correct path

**Error: "cn is not defined"**
- Missing `src/lib/utils.ts` file
- Import missing in component file
- Check `@/lib/utils` path alias

**Error: "Module not found: @radix-ui/react-slot"**
- Missing Radix UI dependencies
- Run: `bun add @radix-ui/react-slot`

**Error: "Tailwind classes not applying"**
- Check Tailwind config content paths include component files
- Ensure CSS file is imported in main.tsx
- Verify PostCSS configuration

### Performance Tips
- Import only components you need (tree-shaking works)
- Use `asChild` prop to avoid extra DOM elements
- Components are already optimized for production builds

## Example Project Structure

```
nx-monorepo/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   └── ui/           # shadcn components
│       │   │       ├── button.tsx
│       │   │       ├── input.tsx
│       │   │       └── dialog.tsx
│       │   ├── lib/
│       │   │   └── utils.ts      # cn() helper
│       │   ├── index.css         # Tailwind + CSS vars
│       │   └── main.tsx
│       ├── tailwind.config.ts
│       ├── components.json
│       └── vite.config.ts
├── packages/
│   └── ui/                       # Optional: shared UI
│       └── src/
│           └── components/
└── nx.json
```

## References

- [shadcn/ui Official Monorepo Documentation](https://ui.shadcn.com/docs/monorepo)
- [Tomas Pustelnik: Adding shadcn/ui to Nx Monorepo](https://pustelto.com/blog/adding-shadcnui-to-nx-monorepo/)
- [Medium: Building Scalable React Monorepo with NX and shadcn/ui](https://medium.com/@sakshijaiswal0310/building-a-scalable-react-monorepo-with-nx-and-shadcn-ui-a-complete-implementation-guide-96c2bb1b42e8)
- [Medium: Setting Up NX Monorepo with Next.js, Shadcn, and TailwindCSS](https://medium.com/@hasanthikagamage/setting-up-nx-monorepo-with-next-js-shadcn-and-tailwindcss-ba08ce02a2f0)
- [GitHub: nxmonorepo-shadcn-ui Example](https://github.com/matheralvs/nxmonorepo-shadcn-ui)
- [DEV Community: Nx Workspace Guide with shadcn Integration](https://dev.to/dgamer007/nx-workspace-guidev20-nextjs-react-component-library-shadcn-integration-tailwindcss-v4-1908)
