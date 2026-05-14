---
name: n8n-telegram-sessions
description: Build Telegram conversational bots with n8n and Supabase for multi-step asynchronous workflows requiring session persistence. Use when creating webhook-triggered Telegram bots that conduct surveys, forms, or multi-question conversations where state must persist between messages. Covers critical patterns like Merge node configuration for optional lookups, splitting Supabase create/update operations, and proper routing logic for session management.
---

# n8n Telegram Session Bot Pattern

Build webhook-triggered Telegram bots with session persistence using n8n and Supabase.

## Core Problem

Telegram bots are asynchronous - each user message triggers a separate webhook call with no shared memory. Multi-step conversations (surveys, forms, wizards) require external session storage.

**Anti-pattern**: Using `$getWorkflowStaticData('global')` - this does NOT persist between webhook executions.

**Solution**: Store session state in Supabase with the pattern described below.

## Architecture Overview

```
Telegram Webhook → Get Session → Merge Data → Main Logic → Session Router
                                                              ├─ Create Session
                                                              ├─ Update Session
                                                              └─ Delete Session
                                                                    ↓
                                                              Response Handler
```

**Key Components**:
1. **Get Session** - Retrieve existing session or return empty
2. **Merge Data** - Combine Telegram message + session (optional)
3. **Main Logic** - Business logic determines next action + routing flags
4. **Session Router** - Routes to Create vs Update based on flags
5. **Response Handler** - Sends Telegram message

## Critical Patterns

### 1. Merge Node Configuration

**Pattern**: Combine by Position with Include Unpaired Items

```json
{
  "mode": "combine",
  "combineBy": "combineByPosition",
  "options": {
    "includeUnpaired": true
  }
}
```

**Why This Matters**:
- Telegram Trigger: Always 1 item
- Get Session: 0 items (new user) or 1 item (existing session)
- **includeUnpaired: true** ensures Main Logic runs even for new users
- Without this, the workflow stops when no session exists

**Common Error**:
```
"You need to define at least one pair of fields in 'Fields to Match' to match on"
```
This happens when using invalid parameters like `combinationMode: "multiplex"`.

### 2. No Upsert - Split Create/Update

**Critical**: n8n's Supabase node does NOT support "upsert" operation.

**Supported Operations**: create, delete, get, getAll, update

**Solution Pattern**:

**In Main Logic** - Output routing flag:
```javascript
return [{
  json: {
    isNewSession: true,  // or false
    session: sessionData,
    response: responseData
  }
}];
```

**In Workflow** - Use IF node to route:
```
Main Logic → Session Router (IF: isNewSession === true)
             ├─ TRUE → Create Session (Supabase create)
             └─ FALSE → Update Session (Supabase update)
```

### 3. Main Logic Input Structure

The Merge node combines both inputs into one object:

```javascript
// Get merged input
const input = $input.item.json;

// Telegram data is always present
const telegramInput = input;

// Session data is present only if found (check for session-specific field)
const session = input.chat_id ? {
  chat_id: input.chat_id,
  current_question: input.current_question,
  answers: typeof input.answers === 'string' ? JSON.parse(input.answers) : input.answers
  // ... other session fields
} : null;

// Parse Telegram message
if (telegramInput.callback_query) {
  chatId = telegramInput.callback_query.message.chat.id.toString();
  messageText = telegramInput.callback_query.data;
} else if (telegramInput.message) {
  chatId = telegramInput.message.chat.id.toString();
  messageText = telegramInput.message.text || '';
}
```

### 4. Session Database Schema

```sql
CREATE TABLE sessions (
  chat_id TEXT PRIMARY KEY,
  current_question INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  username TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**Lifecycle**:
- **Create**: When user starts conversation
- **Update**: After each user response
- **Delete**: When conversation completes

## Configuration Reference

For complete working node configurations, see:
- **references/node-configurations.md** - Full parameter examples for all nodes
- **references/pitfalls.md** - Common errors and solutions
- **references/validation-checklist.md** - Mandatory validation steps

## Quick Start Workflow

1. **Create sessions table** in Supabase (use schema above)
2. **Configure Get Session node**:
   - Operation: getAll
   - Filter: `chat_id` = `eq` = `{{ $json.message.chat.id.toString() }}`
   - Use `service_role` key (not `anon`)
3. **Configure Merge Data node**:
   - Mode: combine
   - Combine By: combineByPosition
   - Options: includeUnpaired = true
4. **Write Main Logic code** (see input structure pattern above)
5. **Add Session Router IF node**:
   - Condition: `{{ $json.isNewSession }}` equals `true` (boolean)
6. **Configure Create Session node**:
   - Operation: create
   - Map all fields from `{{ $json.session }}`
   - Use `{{ new Date().toISOString() }}` for timestamps
7. **Configure Update Session node**:
   - Operation: update
   - Filter: `chat_id` = `eq` = `{{ $json.session.chat_id }}`
   - Map changed fields only
8. **Configure Telegram Send Message node**:
   - Resource: message
   - Operation: sendMessage
   - Chat ID: `{{ $('Main Logic').item.json.response.chatId }}`
   - Text: `{{ $('Main Logic').item.json.response.text }}`

## Critical Rules

### Always Validate After Changes

```javascript
// 1. Validate workflow structure
mcp__n8n-mcp__n8n_validate_workflow({ id: "workflow_id" })

// 2. Check recent executions
mcp__n8n-mcp__n8n_executions({ action: "list", workflowId: "workflow_id", limit: 3 })

// 3. Get error details if needed
mcp__n8n-mcp__n8n_executions({ action: "get", id: "execution_id", mode: "error" })
```

**Required**: Valid: true, errorCount: 0

### Use service_role Key

Always use Supabase `service_role` key, not `anon` key. RLS with `anon` key returns empty results instead of errors.

### Expression Syntax

**Wrong**: `{{ $now.toISO() }}`
**Right**: `{{ new Date().toISOString() }}`

### Filter Operators

**Wrong**: `"condition": "equals"`
**Right**: `"condition": "eq"`

## Common Errors

See **references/pitfalls.md** for detailed troubleshooting:
- Merge node "fields to match" error
- Null constraint violations
- Empty session results
- Missing Telegram operation parameters
- Upsert not supported errors

## Testing Pattern

1. Send `/start` command → Should create session and respond with first question
2. Send answer → Should update session and advance to next question
3. Send final answer → Should delete session and save final data
4. Verify in Supabase:
   ```sql
   -- Session should be deleted
   SELECT * FROM sessions WHERE chat_id = 'test_id';

   -- Entry should be saved
   SELECT * FROM your_entries_table ORDER BY created_at DESC LIMIT 1;
   ```

## When NOT to Use This Pattern

- **Simple one-shot commands** - Use direct webhook processing, no sessions needed
- **Stateless bots** - If each message is independent, skip session storage
- **Real-time bots** - Long-polling bots can use in-memory state

## Next Steps

After implementing the basic pattern:
1. Add error recovery (what if database write fails?)
2. Implement session timeout cleanup
3. Add /cancel command to delete abandoned sessions
4. Consider session encryption for sensitive data
