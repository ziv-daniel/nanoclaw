---
name: n8n-telegram-trigger-testing
description: |
  Test and debug n8n Telegram bot workflows when the Telegram Trigger node cannot be triggered via API. Use when: (1) n8n_test_workflow fails with "Workflow does not have a webhook trigger", (2) You need to validate Telegram bot workflow without sending real messages, (3) You need to debug execution errors from Telegram webhooks. Covers alternative testing strategies, execution log analysis, and stale session cleanup.
author: Claude Code
version: 1.0.0
date: 2026-02-01
---

# n8n Telegram Trigger Testing

## Problem

The n8n `n8n_test_workflow` tool cannot trigger Telegram Trigger nodes because they're specialized webhook nodes that only respond to Telegram's webhook format, not generic HTTP requests.

**Error when attempting API test:**
```json
{
  "success": false,
  "error": "Workflow does not have a webhook trigger",
  "details": {
    "hint": "Workflow has no externally-triggerable triggers (webhook, form, or chat)."
  }
}
```

## Context / Trigger Conditions

Use this skill when:
- You need to test a Telegram bot workflow but can't send real Telegram messages
- The workflow has a Telegram Trigger node as its entry point
- You're debugging execution errors from past Telegram webhook calls
- You need to verify workflow logic before asking users to test

## Solution

### Strategy 1: Analyze Execution Logs

Use the n8n executions API to debug past runs:

```javascript
// List recent executions
mcp__n8n-mcp__n8n_executions({
  action: "list",
  workflowId: "YOUR_WORKFLOW_ID",
  limit: 5
})

// Get detailed error info from a failed execution
mcp__n8n-mcp__n8n_executions({
  action: "get",
  id: "EXECUTION_ID",
  mode: "error",
  includeStackTrace: true
})
```

**Key Fields to Check:**
- `errorInfo.primaryError.message` - The actual error
- `errorInfo.executionPath` - Which nodes ran and their status
- `errorInfo.upstreamContext` - Data from the node before the error

### Strategy 2: Validate Workflow Configuration

Always validate before testing:

```javascript
mcp__n8n-mcp__n8n_validate_workflow({
  id: "YOUR_WORKFLOW_ID",
  options: {
    profile: "runtime",
    validateExpressions: true
  }
})
```

**Critical Checks:**
- `valid: true` and `errorCount: 0`
- No expression warnings about optional chaining (`?.` not supported)
- No missing parameter errors

### Strategy 3: Clean Up Stale Sessions

Stale sessions in the database can cause restart/routing issues:

```sql
-- Check for stale sessions
SELECT * FROM sessions WHERE updated_at < NOW() - INTERVAL '24 hours';

-- Delete stale sessions for a specific user
DELETE FROM sessions WHERE chat_id = 'CHAT_ID';

-- Delete all stale sessions
DELETE FROM sessions WHERE updated_at < NOW() - INTERVAL '24 hours';
```

### Strategy 4: Manual Telegram Testing

When you must test the actual flow:

1. **Send `/start`** - Creates new session
2. **Answer questions** - Updates session
3. **Complete survey** - Deletes session, saves data
4. **Check execution logs** - Verify each step succeeded

### Strategy 5: Create Test Webhook Workflow

For complex logic, create a parallel test workflow:

1. Copy the Main Logic code to a new workflow
2. Add a regular Webhook node (instead of Telegram Trigger)
3. Simulate Telegram payloads:

```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 100,
    "from": {"id": 999999999, "username": "test_user"},
    "chat": {"id": 999999999, "type": "private"},
    "date": 1738368000,
    "text": "/start"
  }
}
```

4. Test via API:
```javascript
mcp__n8n-mcp__n8n_test_workflow({
  workflowId: "TEST_WORKFLOW_ID",
  triggerType: "webhook",
  httpMethod: "POST",
  data: simulatedPayload
})
```

## Common Issues

### "Cannot return primitive values directly"

This validator error often appears for Code nodes but is frequently a **false positive** if your code properly returns `[{json: {...}}]` format.

**Check your code:**
```javascript
// WRONG - primitive return
return "hello";
return 123;

// CORRECT - item format
return [{ json: { message: "hello" } }];
```

### Optional Chaining Not Supported

n8n expressions don't support `?.` syntax:

```javascript
// WRONG
{{ $json.response?.chatId }}

// CORRECT
{{ $json.response.chatId }}
```

### Response Router Outputs 0 Items

If an IF node routes 0 items to a Telegram Send node, the node fails with "chat not found" because `$json` is undefined.

**Solution:** Ensure data flows correctly through all routing paths, especially after Supabase operations that replace the original input data.

## Verification

After making changes, verify:

1. **Validation passes:**
   ```javascript
   // Should show valid: true
   mcp__n8n-mcp__n8n_validate_workflow({ id: "ID" })
   ```

2. **No stale sessions:**
   ```sql
   SELECT COUNT(*) FROM sessions;
   -- Should be 0 or only active conversations
   ```

3. **Recent executions succeed:**
   ```javascript
   mcp__n8n-mcp__n8n_executions({
     action: "list",
     workflowId: "ID",
     status: "error",
     limit: 1
   })
   // Should return empty or only old errors
   ```

## Example: Debugging a Failed Execution

```javascript
// 1. Get the failed execution
const exec = await mcp__n8n-mcp__n8n_executions({
  action: "get",
  id: "15700",
  mode: "error"
});

// 2. Check the error path
console.log(exec.data.errorInfo.executionPath);
// [
//   { nodeName: "Telegram Trigger", status: "success" },
//   { nodeName: "Main Logic", status: "success" },
//   { nodeName: "Response Router", status: "success", itemCount: 0 }, // <- Problem!
//   { nodeName: "Send Message", status: "error" }
// ]

// 3. The issue: Response Router passed 0 items to Send Message
// Fix: Check the routing condition and data flow
```

## Notes

- Telegram Trigger credentials are stored in n8n, not accessible via API
- For production testing, use a test Telegram bot with a different token
- Always clean up test data from Supabase after testing

## References

- [n8n Telegram Trigger Node](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/)
- [n8n Expression Syntax](n8n-expression-syntax skill)
- [n8n Telegram Sessions Pattern](n8n-telegram-sessions skill)
