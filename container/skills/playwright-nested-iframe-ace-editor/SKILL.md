---
name: playwright-nested-iframe-ace-editor
description: |
  Interact with Ace editor inside nested iframes using Playwright. Use when:
  (1) File Editor or similar addon shows blank or unresponsive editor,
  (2) click/type actions timeout with "element intercepted" errors,
  (3) need to set content in Ace editor programmatically,
  (4) Home Assistant File Editor automation fails with standard Playwright methods.
  Covers frame iteration, evaluate() with editor API, and save triggers.
author: Claude Code
version: 1.0.0
date: 2026-01-22
---

# Playwright Nested Iframe Ace Editor Interaction

## Problem

Ace editor instances embedded in nested iframes (common in Home Assistant addons like File Editor)
cannot be interacted with using standard Playwright click/type methods. The editor element exists
but is covered by overlay divs, and direct text input doesn't work.

## Context / Trigger Conditions

- Home Assistant File Editor addon automation
- Any web app with Ace editor inside iframes
- Error: "element intercepted click" or "click timeout"
- Editor visible but typing has no effect
- Need to programmatically set file content

## Solution

### Step 1: Understand the Frame Structure

File Editor uses nested iframes:
```
Main page
  └── iframe (hassio-main)
       └── iframe (addon iframe)
            └── Ace editor container
```

### Step 2: Access the Correct Frame

Use `browser_run_code` to iterate through all frames:

```javascript
async (page) => {
  // Get all frames
  const frames = page.frames();

  // Find the frame containing Ace editor
  for (const frame of frames) {
    try {
      const hasEditor = await frame.evaluate(() => {
        return typeof ace !== 'undefined' && document.querySelector('.ace_editor');
      });

      if (hasEditor) {
        // Found the editor frame
        return frame.url();
      }
    } catch (e) {
      // Frame may be detached or cross-origin
      continue;
    }
  }
  return null;
}
```

### Step 3: Set Editor Content

Use the Ace editor API directly:

```javascript
async (page) => {
  const frames = page.frames();

  for (const frame of frames) {
    try {
      const result = await frame.evaluate((content) => {
        const editorElement = document.querySelector('.ace_editor');
        if (editorElement && editorElement.env && editorElement.env.editor) {
          const editor = editorElement.env.editor;
          editor.setValue(content, -1);  // -1 moves cursor to start
          return { success: true };
        }
        return { success: false, reason: 'Editor not found' };
      }, yourContent);

      if (result.success) {
        return result;
      }
    } catch (e) {
      continue;
    }
  }
  return { success: false, reason: 'No frame with editor found' };
}
```

### Step 4: Save the File

After setting content, trigger save with keyboard shortcut:

```javascript
// Use browser_press_key tool
key: "Control+s"  // or "Meta+s" on Mac
```

Or programmatically:

```javascript
async (page) => {
  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');
}
```

## Verification

1. Check that editor content changed (visual or via getValue())
2. Verify save completed (check for save indicator or file modification)
3. In HA: Check Configuration → validate YAML

## Example: Complete File Editor Workflow

```javascript
async (page) => {
  const content = `# My YAML content
sensor:
  - name: "Test Sensor"
    state: "on"
`;

  const frames = page.frames();

  for (const frame of frames) {
    try {
      // Check if this frame has the Ace editor
      const hasEditor = await frame.evaluate(() => {
        const el = document.querySelector('.ace_editor');
        return el && el.env && el.env.editor;
      });

      if (!hasEditor) continue;

      // Set the content
      await frame.evaluate((yaml) => {
        const editor = document.querySelector('.ace_editor').env.editor;
        editor.setValue(yaml, -1);
      }, content);

      return { success: true, frame: frame.url() };
    } catch (e) {
      continue;
    }
  }

  return { success: false };
}
```

## Alternative: Direct Ingress URL Navigation

When standard click actions fail with "element outside viewport" errors, bypass the nested
iframes entirely:

### Step 1: Find the Ingress URL

```javascript
async (page) => {
  const frames = page.frames();
  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('/api/hassio_ingress/')) {
      return url;  // e.g., https://ha.example.com/api/hassio_ingress/ABC123.../
    }
  }
}
```

### Step 2: Navigate Directly

```javascript
await page.goto('https://ha.example.com/api/hassio_ingress/ABC123.../');
```

### Step 3: Use JavaScript Functions Directly

File Editor exposes `listdir()` and `loadfile()` functions:

```javascript
// Navigate to folder
await page.evaluate(() => {
  listdir('/homeassistant/helpers');
});

// Open file
await page.evaluate(() => {
  loadfile('/homeassistant/helpers/template_sensors.yaml', 'template_sensors.yaml');
});
```

This approach avoids viewport/scrolling issues entirely.

## Notes

- **Frame detachment**: Frames may detach during navigation; always wrap in try-catch
- **Cross-origin**: Some frames may be cross-origin and inaccessible
- **Editor initialization**: Wait for editor to fully load before attempting setValue
- **Undo history**: setValue() clears undo history; use insert() to preserve it
- **Cursor position**: Second parameter to setValue(): -1 = start, 1 = end, omit = select all
- **Direct ingress**: When clicks fail, navigate directly to the ingress URL and use JS functions

## References

- [Ace Editor API Documentation](https://ace.c9.io/#nav=api)
- [Playwright Frame Documentation](https://playwright.dev/docs/frames)
- [Home Assistant File Editor Addon](https://github.com/home-assistant/addons/tree/master/configurator)
