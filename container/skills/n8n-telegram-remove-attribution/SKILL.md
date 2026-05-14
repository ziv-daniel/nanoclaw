---
name: n8n-telegram-remove-attribution
description: |
  Remove the "This message was sent automatically with n8n" footer from Telegram
  bot messages. Use when: (1) Telegram messages include unwanted n8n attribution
  text, (2) you want cleaner bot messages without the automatic signature,
  (3) updating Telegram node configuration in n8n workflows. Covers the
  appendAttribution setting and common pitfalls when updating node parameters.
author: Claude Code
version: 1.0.0
date: 2026-02-04
---

# Remove n8n Attribution from Telegram Messages

## Problem

By default, n8n's Telegram node appends "This message was sent automatically with n8n"
to all outgoing messages. This footer is often unwanted for production bots or
professional use cases.

## Context / Trigger Conditions

- Telegram bot messages show "This message was sent automatically with n8n" at the end
- User wants cleaner, more professional bot messages
- Working with n8n Telegram nodes (sendMessage operation)

## Solution

Add `appendAttribution: false` to the `additionalFields` of each Telegram node:

### Via n8n API (n8n_update_partial_workflow)

```javascript
{
  "type": "updateNode",
  "nodeId": "telegram-node-id",
  "updates": {
    "parameters": {
      "resource": "message",           // REQUIRED - must include
      "operation": "sendMessage",       // REQUIRED - must include
      "chatId": "={{ $json.chatId }}", // Keep existing expression
      "text": "={{ $json.text }}",     // Keep existing expression
      "additionalFields": {
        "appendAttribution": false      // This removes the footer
      }
    }
  }
}
```

### Via n8n UI

1. Open the Telegram node
2. Scroll to "Additional Fields" / "Options"
3. Add field "Append n8n Attribution"
4. Set to `false`

## Critical Gotcha

**When updating via API, you MUST include ALL required parameters:**

The `parameters` object in `updates` completely replaces existing parameters. If you
only set `additionalFields`, you'll lose `operation`, `chatId`, `text`, etc., causing
validation errors like:

```
Invalid value for 'operation'. Must be one of: sendMessage, ...
```

**Always include:**
- `resource: "message"`
- `operation: "sendMessage"`
- `chatId` (with the original expression)
- `text` (with the original expression)
- Any other existing parameters

## Verification

1. Run `n8n_validate_workflow` - should show no new errors
2. Send a test message through the bot
3. Verify the footer text is no longer present

## Example

Before:
```
היי! איך אני יכול לעזור?

This message was sent automatically with n8n
```

After:
```
היי! איך אני יכול לעזור?
```

## Notes

- This setting exists in Telegram node version 1.2+
- Each Telegram node needs to be updated separately
- The setting only affects new messages; existing messages remain unchanged
- Some n8n validators may show warnings about chatId format (resource locator) -
  these are non-critical and the node still works

## References

- n8n Telegram Node Documentation: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/
