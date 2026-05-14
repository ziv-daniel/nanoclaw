---
name: n8n-multiple-input-blocking
description: |
  Diagnose and fix n8n nodes receiving 0 items when multiple input connections exist.
  Use when: (1) Node shows 0 items but execution logs show data in one input path,
  (2) Node has multiple input connections visible in workflow editor, (3) One or more
  input connections comes from disabled nodes, (4) Data flows correctly to one
  connection but node still processes 0 items. Critical n8n behavior: nodes with
  multiple inputs WAIT for ALL connections, and disabled nodes with connections still
  block execution indefinitely.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# n8n Multiple Input Connection Blocking

## Problem

In n8n, when a node has multiple input connections and one of those connections comes
from a disabled node, the enabled path will still cause the node to wait indefinitely
for data from the disabled connection. This results in the node processing 0 items
even though execution logs clearly show data flowing through one of the input paths.

This is a critical but poorly documented n8n behavior that can waste hours of debugging.

## Context / Trigger Conditions

**Symptoms:**
- Node receives 0 items despite execution showing data in one input path
- Workflow execution appears to complete but target node never runs
- No error messages - just silent failure with 0 items processed

**Look for these conditions:**
1. Node has multiple input connections (check workflow canvas for multiple arrows pointing to the node)
2. Execution logs show data successfully reaching one of the input connections
3. One or more of the input connections originates from a disabled node
4. The connection from the disabled node is still visible as a line in the workflow editor

**Common scenarios:**
- Telegram/webhook bots where response handling has multiple branches
- Workflows where nodes were disabled during debugging but connections weren't removed
- Conditional routing (IF nodes) with multiple downstream paths merging into one node

## Solution

**Quick Fix:**
1. Identify all nodes with connections to the problematic node
2. Completely REMOVE (not just disable) any nodes that are disabled or no longer needed
3. Verify connections are gone in the workflow editor - no connection lines should remain

**Detailed Steps:**

### Step 1: Identify Multiple Inputs
```javascript
// In n8n UI, look at the node receiving 0 items
// Count how many connection lines lead INTO this node
// If > 1 input connection exists, proceed to Step 2
```

### Step 2: Check Execution Logs
```javascript
// In execution view, trace data flow backwards:
// - Click on nodes BEFORE the problematic node
// - Verify at least one path has data flowing through
// - Note which input path(es) have data vs which don't
```

### Step 3: Identify Disabled Nodes
```javascript
// In workflow editor:
// - Look for nodes with gray/disabled appearance
// - Check if ANY disabled nodes have connections to the problematic node
// - Even if the disabled node is far upstream, check the entire path
```

### Step 4: Remove Disabled Nodes
```javascript
// DO NOT just disable nodes - completely remove them:
// 1. Click the disabled node
// 2. Press Delete key (or right-click → Delete)
// 3. Verify the connection line disappears from the workflow canvas
// 4. Repeat for ALL disabled nodes in the chain
```

### Step 5: Validate Workflow
```javascript
// After removing disabled nodes:
// 1. Use n8n validation tool: n8n_validate_workflow({ id: "workflow_id" })
// 2. Check for reduced connection count
// 3. Test with a new execution
// 4. Verify target node now receives items
```

## Root Cause: n8n's Wait-for-All-Inputs Behavior

**Core n8n Execution Model:**
- When ANY node has multiple input connections, n8n waits for ALL connections to send data
- This applies to ALL nodes, not just Merge nodes
- Disabled nodes do NOT execute, so they never send data
- Connections from disabled nodes remain active in the workflow graph
- Result: Node waits forever for data that will never arrive

**Why disabling isn't enough:**
- Disabling a node prevents its code from running
- But the workflow graph structure (connections) remains unchanged
- n8n's execution engine still sees the connection and waits for it
- Only removing the node deletes the connection from the graph

## Verification

After removing disabled nodes, verify the fix:

1. **Connection count decreased**: Check validation output for lower connection count
2. **Execution succeeds**: New webhook/trigger execution reaches the previously blocked node
3. **Items > 0**: Node that was receiving 0 items now shows data
4. **No more silent failures**: All expected nodes execute in the flow

## Example: Real-World Telegram Bot Case

**Scenario:**
- Telegram bot workflow with webhook trigger
- Response Router (IF node) with two outputs: output[0] → Save Entry, output[1] → Send Message
- Analysis Check node also connected to Send Message (for AI analysis feature)
- Analysis Check node disabled during debugging

**Symptom:**
- Response Router successfully routes data to output[1]
- Execution logs show data present: `"action": "ask", "chatId": "303098987"`
- Send Message node receives 0 items and doesn't execute

**Diagnosis:**
```
Send Message has TWO input connections:
  1. Response Router output[1] → ✅ Has data
  2. Analysis Check output[0]  → ❌ Disabled node, never sends data

n8n waits for BOTH connections → Send Message processes 0 items
```

**Fix:**
```javascript
// Remove Analysis Check and all related nodes:
n8n_update_partial_workflow({
  id: "workflow_id",
  operations: [
    { type: "removeNode", nodeId: "analysis-check" },
    { type: "removeNode", nodeId: "get-user-entries" },
    { type: "removeNode", nodeId: "call-grok-api" },
    { type: "removeNode", nodeId: "format-analysis" },
    { type: "removeNode", nodeId: "send-analysis" }
  ]
})

// Result: Send Message now has only ONE input connection
// Node count: 23 → 18, Connection count: 27 → 22
// Send Message now receives data correctly
```

## Notes

**Prevention Tips:**
- When disabling nodes for debugging, remove connections too
- Use IF nodes with proper routing instead of disabling branches
- Document which nodes are experimental vs production-ready
- Regularly audit workflows for disabled nodes with connections

**Alternative Solutions:**
- Instead of disabling, route around unwanted nodes using IF conditions
- Use workflow versioning to test experimental branches
- Create separate test workflows instead of disabling nodes in production

**Related n8n Behaviors:**
- Merge node explicitly waits for all inputs (this is by design)
- IF node outputs can safely have one branch with 0 items (doesn't block)
- Wait node has specific timeout behavior that's different
- Disabled trigger nodes DO block webhook registration

**Known Issues:**
- GitHub Issue #14640: "Disabled execution data node causes execution to be stuck"
- This blocking behavior is by design but poorly documented
- No warning in n8n UI when disabled nodes have active connections

## References

- [n8n Community: How to handle multiple input nodes](https://community.n8n.io/t/how-to-handle-multiple-input-nodes-combining-branches-in-a-workflow/72229)
- [GitHub Issue #14640: Disabled execution data node causes execution to be stuck](https://github.com/n8n-io/n8n/issues/14640)
- [n8n Community: Node execution order / wait for both inputs](https://community.n8n.io/t/node-execution-order-wait-for-both-inputs-before-node-execution/14184)
- [n8n Docs: Merge Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)
- [n8n Community: How to Avoid Waiting for All Inputs](https://community.n8n.io/t/how-to-avoid-waiting-for-all-inputs-in-a-node-with-multiple-branches/64316)
