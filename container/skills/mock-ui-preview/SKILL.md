---
name: mock-ui-preview
description: |
  Generate and preview UI mockups as self-contained HTML files during Claude Code sessions.
  Use when the user says 'mock', 'mockup', 'preview UI', 'show me how X would look',
  'design preview', 'UI preview', 'mock the page', 'show me a mock', or wants to
  visualize a component/page before writing real code.
  Renders HTML with Tailwind CDN in a browser via Playwright MCP and takes a screenshot.
version: 1.0.0
---

# Mock UI Preview

Generate self-contained HTML mockups and preview them in the browser — see UI before coding.

## Workflow

### Step 1: Understand what to mock

Ask clarifying questions if needed:
- Which page/component? (e.g., guest table, filter sidebar, room assignment form)
- Desktop or mobile viewport?
- Which role sees this? (ADMIN, MASHAN, GROUP_MANAGER, etc.)
- Any specific data to show? (use realistic Hebrew placeholder data)

### Step 2: Generate the HTML mock

Create a **single self-contained HTML file** at `.temp/mock.html` (or `.temp/mock-{name}.html` for multiple mocks).

**CRITICAL rules for the HTML file:**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mock: [Component Name]</title>
  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            border: '#e4e4e7',
            ring: '#CECCCC',
            background: '#ffffff',
            foreground: '#09090b',
            input: '#e4e4e7',
            primary: {
              DEFAULT: '#FF385D',
              foreground: '#fcfcfc',
              50: '#FFF0F1',
              100: '#FFDDE0',
              200: '#FFBEC4',
              300: '#FF99A3',
              350: '#FF5671',
              400: '#FF7485',
              500: '#FF385D',
              600: '#DA0040',
              700: '#A3002D',
              800: '#74001E',
              900: '#44000E',
              950: '#310007',
            },
            secondary: { DEFAULT: '#507FBC', text: '#525252' },
            destructive: { DEFAULT: '#e6000b', foreground: '#e6000b' },
            muted: { DEFAULT: '#f4f4f5', foreground: '#71717a' },
            accent: { DEFAULT: '#f4f4f5', foreground: '#18181b' },
            popover: { DEFAULT: '#ffffff', foreground: '#09090b' },
            card: { DEFAULT: '#ffffff', foreground: '#09090b' },
            table: { header: '#B6CAEE', cell: '#ffffff' },
          },
          borderRadius: {
            lg: '0.625rem',
            md: 'calc(0.625rem - 2px)',
            sm: 'calc(0.625rem - 4px)',
          },
        },
      },
    };
  </script>
  <!-- Google Fonts: Rubik -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <!-- Lucide Icons CDN -->
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; border-color: #e4e4e7; outline-color: #d4d4d8; }
    body { font-family: 'Rubik', sans-serif; -webkit-font-smoothing: antialiased; background: #ffffff; color: #09090b; }
  </style>
</head>
<body>
  <!-- MOCK CONTENT HERE -->

  <!-- Initialize Lucide icons -->
  <script>lucide.createIcons();</script>
</body>
</html>
```

**Design system rules:**
- **RTL layout** (`dir="rtl"`, `lang="he"`) — always
- **Font**: Rubik (via Google Fonts CDN)
- **Icons**: Lucide (via CDN) — use `<i data-lucide="icon-name"></i>` syntax
- **Colors**: Use the exact Tailwind config above (matches the real app)
- **Hebrew text**: Use realistic Hebrew placeholder data relevant to the domain
  - Guest names: "יוסי כהן", "דנה לוי", "אבי מזרחי"
  - Facilities: "אתר צפון", "אתר דרום", "אתר מרכז"
  - Sites: "מקום לינה א׳", "מקום לינה ב׳"
  - Structures: "מבנה 1", "מבנה 2"
  - Rooms: "חדר 101", "חדר 202"
  - Groups: "קבוצה א׳", "פלוגה ג׳"
  - Statuses: "פעיל", "מושהה", "שוחרר"
- **Component style**: Match shadcn/ui look — clean borders, rounded-md/lg, subtle shadows
- **Table headers**: Use `bg-[#B6CAEE]` for table header rows
- **Buttons**: Primary = `bg-primary text-primary-foreground`, Secondary = outlined
- **Cards**: White background, border, rounded-lg, subtle shadow
- **Spacing**: Consistent `p-4`, `gap-4`, `space-y-4` patterns
- **Page layout**: Include a mock header/navbar if mocking a full page
- **NO external dependencies** beyond the CDNs listed above

### Step 3: Write the file

```
Write the HTML to: .temp/mock.html
```

Create the `.temp/` directory if it doesn't exist (`mkdir -p .temp`). This directory is gitignored.

### Step 4: Start HTTP server + Preview in browser

The Playwright MCP blocks `file://` URLs. Use a temporary HTTP server instead:

```bash
# Start http-server in background on port 8888
cd .temp && npx -y http-server -p 8888 --cors -c-1 &

# Wait for server to be ready
sleep 2
```

Then use Playwright MCP to open and screenshot:

```
1. mcp__playwright__browser_navigate → http://localhost:8888/mock.html
2. mcp__playwright__browser_take_screenshot → save to .temp/mock-screenshot.png (use fullPage: true)
3. The screenshot is automatically displayed to the user
```

**Port 8888** is used to avoid conflicts with the app's dev servers (3000, 8000, 8080).

**IMPORTANT**: If port 8888 is already in use (from a previous mock session), skip the server start — it's already running. Check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/mock.html`.

### Step 5: Iterate

After showing the screenshot:
- Ask the user if they want changes
- Edit the HTML file and re-screenshot
- Repeat until the user is satisfied

### Step 6: Cleanup

When done, remind the user that:
- The mock HTML is at `.temp/mock.html` — they can keep it as reference
- The screenshot is at `.temp/mock-screenshot.png`
- Both are gitignored and won't be committed
- Delete screenshots from repo root if any leaked there

## Examples

### Example 1: Mock a data table

User: "mock me the guest table page"

Generate a full-page HTML with:
- Header bar with logo area + navigation tabs
- Filter bar with search input + dropdown filters
- Data table with columns: שם, קבוצה, אתר, מקום לינה, חדר, סטטוס
- Table header row with `bg-[#B6CAEE]`
- 8-10 rows of realistic Hebrew data
- Pagination controls at bottom

### Example 2: Mock a form/dialog

User: "mock the add guest dialog"

Generate a modal dialog overlay with:
- Semi-transparent backdrop
- Centered card with form fields
- Hebrew labels, RTL input alignment
- Action buttons (ביטול / שמירה)

### Example 3: Mock a dashboard card

User: "show me how the room occupancy card would look"

Generate a card component with:
- Title, subtitle
- Stats/numbers
- Maybe a simple chart placeholder
- Consistent with shadcn card style

## Multiple Mocks

When mocking multiple pages or variants:
- Use descriptive filenames: `.temp/mock-guest-table.html`, `.temp/mock-add-guest-dialog.html`
- Screenshot each one separately
- Present them in sequence to the user

## Viewport Sizes

- **Desktop** (default): 1280x800
- **Tablet**: 768x1024
- **Mobile**: 375x667

Use `mcp__playwright__browser_resize` if the user requests a specific viewport.

## Notes

- This is for PREVIEWING ideas, not generating production code
- The mock uses CDN resources (needs internet) — it's a throwaway file
- After approval, implement the real component using the project's actual dependencies
- Never commit mock files — they live in `.temp/` which is gitignored
