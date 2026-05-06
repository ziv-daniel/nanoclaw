---
name: n8n-code-nodes
version: 2.0.0
date: 2026-02-04
description: Write code in n8n Code nodes (JavaScript & Python). Use when writing code in n8n, using $input/$json syntax (JS) or _input/_json syntax (Python), making HTTP requests, working with dates, troubleshooting Code node errors, or choosing between JavaScript and Python.
---

# n8n Code Nodes - Complete Guide

Expert guidance for writing JavaScript and Python code in n8n Code nodes.

---

## Overview

n8n Code nodes allow you to write custom logic using **JavaScript** or **Python**. This guide covers both languages with best practices, patterns, and error prevention.

### Language Recommendation

**Use JavaScript for 95% of use cases.** Only use Python when you have a specific reason.

| Criteria | JavaScript | Python |
|----------|------------|--------|
| **HTTP Requests** | $helpers.httpRequest() | Not available (use HTTP Request node) |
| **Date/Time** | DateTime (Luxon) - powerful | datetime - basic |
| **External Libraries** | None, but more built-ins | None (standard library only) |
| **Community Support** | Better n8n docs & examples | Limited |
| **Syntax Preference** | Use if comfortable | Use if significantly more comfortable |

### When to Use Python

- You need Python's `statistics` module for statistical operations
- You're significantly more comfortable with Python syntax
- Your logic maps well to list comprehensions
- You need specific standard library functions (re, hashlib, etc.)

---

## Quick Start

### JavaScript Template

```javascript
// Basic template for JavaScript Code nodes
const items = $input.all();

// Process data
const processed = items.map(item => ({
  json: {
    ...item.json,
    processed: true,
    timestamp: new Date().toISOString()
  }
}));

return processed;
```

### Python Template

```python
# Basic template for Python Code nodes
from datetime import datetime

items = _input.all()

# Process data
processed = []
for item in items:
    processed.append({
        "json": {
            **item["json"],
            "processed": True,
            "timestamp": datetime.now().isoformat()
        }
    })

return processed
```

### Essential Rules (Both Languages)

1. **Choose "Run Once for All Items" mode** (recommended for most use cases)
2. **CRITICAL**: Must return `[{json: {...}}]` format (array of objects with `json` key)
3. **CRITICAL**: Webhook data is under `.body` (JS) or `["body"]` (Python)
4. **Error handling**: Always validate input and handle null/undefined

---

## Decision Matrix: JavaScript vs Python

| Use Case | Recommended | Reason |
|----------|-------------|--------|
| HTTP requests in code | **JavaScript** | $helpers.httpRequest() available |
| Advanced date/time operations | **JavaScript** | DateTime (Luxon) is powerful |
| Statistical calculations | **Python** | statistics module |
| Complex regex with groups | Either | Both have good regex support |
| JSON transformation | **JavaScript** | More native, better destructuring |
| Data validation | Either | Both work well |
| String manipulation | **JavaScript** | Template literals are cleaner |
| List comprehensions | **Python** | More pythonic |
| API response processing | **JavaScript** | Better async/await support |
| Legacy Python codebase | **Python** | Easier to port |

---

## Mode Selection Guide

Both JavaScript and Python Code nodes offer two execution modes:

### Run Once for All Items (Recommended - Default)

**Use this mode for:** 95% of use cases

- **How it works**: Code executes **once** regardless of input count
- **Data access**: `$input.all()` (JS) or `_input.all()` (Python)
- **Best for**: Aggregation, filtering, batch processing, transformations
- **Performance**: Faster for multiple items (single execution)

**When to use:**
- Comparing items across the dataset
- Calculating totals, averages, or statistics
- Sorting or ranking items
- Deduplication
- Building aggregated reports
- Combining data from multiple items

### Run Once for Each Item

**Use this mode for:** Specialized cases only

- **How it works**: Code executes **separately** for each input item
- **Data access**: `$input.item` (JS) or `_input.item` (Python)
- **Best for**: Item-specific logic, independent operations, per-item validation
- **Performance**: Slower for large datasets (multiple executions)

**When to use:**
- Each item needs independent API call
- Per-item validation with different error handling
- Item-specific transformations based on item properties

**Decision Shortcut:**
- **Need to look at multiple items?** -> Use "All Items" mode
- **Each item completely independent?** -> Use "Each Item" mode
- **Not sure?** -> Use "All Items" mode (you can always loop inside)

---

## Core Data Access Patterns

### Data Access Syntax Comparison

| Pattern | JavaScript | Python (Beta) |
|---------|------------|---------------|
| Get all items | `$input.all()` | `_input.all()` |
| Get first item | `$input.first()` | `_input.first()` |
| Current item (Each mode) | `$input.item` | `_input.item` |
| Direct JSON access | `$json` | `_json` |
| Node reference | `$node["NodeName"].json` | `_node["NodeName"]["json"]` |

### Pattern 1: Get All Items (Most Common)

**JavaScript:**
```javascript
const allItems = $input.all();

const processed = allItems
  .filter(item => item.json.status === 'active')
  .map(item => ({
    json: {
      id: item.json.id,
      name: item.json.name
    }
  }));

return processed;
```

**Python:**
```python
all_items = _input.all()

processed = [
    {"json": {"id": item["json"]["id"], "name": item["json"]["name"]}}
    for item in all_items
    if item["json"].get("status") == "active"
]

return processed
```

### Pattern 2: Get First Item (Very Common)

**JavaScript:**
```javascript
const firstItem = $input.first();
const data = firstItem.json;

return [{
  json: {
    result: data.value * 2,
    processedAt: new Date().toISOString()
  }
}];
```

**Python:**
```python
from datetime import datetime

first_item = _input.first()
data = first_item["json"]

return [{
    "json": {
        "result": data.get("value", 0) * 2,
        "processed_at": datetime.now().isoformat()
    }
}]
```

### Pattern 3: Aggregation

**JavaScript:**
```javascript
const allItems = $input.all();
const total = allItems.reduce((sum, item) => sum + (item.json.amount || 0), 0);

return [{
  json: {
    total,
    count: allItems.length,
    average: total / allItems.length
  }
}];
```

**Python:**
```python
all_items = _input.all()
total = sum(item["json"].get("amount", 0) for item in all_items)

return [{
    "json": {
        "total": total,
        "count": len(all_items),
        "average": total / len(all_items) if all_items else 0
    }
}]
```

---

## Critical: Webhook Data Structure

**MOST COMMON MISTAKE**: Webhook data is nested under `.body` / `["body"]`

### Webhook Node Output Structure

```javascript
// Webhook output structure:
{
  "headers": {
    "content-type": "application/json",
    "user-agent": "..."
  },
  "params": {},
  "query": {},
  "body": {
    // YOUR DATA IS HERE
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### Correct Access

**JavaScript:**
```javascript
// WRONG
const name = $json.name;  // undefined

// CORRECT
const name = $json.body.name;  // "Alice"

// SAFER with optional chaining
const name = $json.body?.name || 'Unknown';
```

**Python:**
```python
# WRONG
name = _json["name"]  # KeyError!

# CORRECT
name = _json["body"]["name"]  # "Alice"

# SAFER with .get()
name = _json.get("body", {}).get("name", "Unknown")
```

---

## Return Format Requirements

**CRITICAL RULE**: Always return array of objects with `json` property

### Correct Formats

```javascript
// JavaScript

// Single result
return [{
  json: {
    field1: value1,
    field2: value2
  }
}];

// Multiple results
return [
  {json: {id: 1, data: 'first'}},
  {json: {id: 2, data: 'second'}}
];

// Transformed array
return $input.all().map(item => ({
  json: {
    id: item.json.id,
    processed: true
  }
}));

// Empty result (valid)
return [];
```

```python
# Python

# Single result
return [{
    "json": {
        "field1": value1,
        "field2": value2
    }
}]

# Multiple results
return [
    {"json": {"id": 1, "data": "first"}},
    {"json": {"id": 2, "data": "second"}}
]

# List comprehension
return [
    {"json": {"id": item["json"]["id"], "processed": True}}
    for item in _input.all()
]

# Empty result (valid)
return []
```

### Incorrect Formats

```javascript
// WRONG: Object without array wrapper
return {json: {field: value}};

// WRONG: Array without json wrapper
return [{field: value}];

// WRONG: Plain string
return "processed";
```

---

## Common Mistakes & Error Prevention

### Error #1: Empty Code or Missing Return (38% of failures)

**Problem:** No code or forgetting to return

**Solution:**
```javascript
// JavaScript - Always return
const items = $input.all();
// ... processing ...
return items.map(item => ({json: item.json}));  // Don't forget!
```

```python
# Python - Always return
items = _input.all()
# ... processing ...
return [{"json": item["json"]} for item in items]  # Don't forget!
```

### Error #2: Missing Null Checks (Very Common)

**JavaScript:**
```javascript
// WRONG - Crashes if field doesn't exist
const value = item.json.user.email;

// CORRECT - Optional chaining
const value = item.json?.user?.email || 'no-email@example.com';
```

**Python:**
```python
# WRONG - KeyError if missing
value = item["json"]["user"]["email"]

# CORRECT - Use .get() with defaults
value = item["json"].get("user", {}).get("email", "no-email@example.com")
```

### Error #3: Expression Syntax in Code (JavaScript)

```javascript
// WRONG - n8n expression syntax
const value = "{{ $json.field }}";

// CORRECT - JavaScript directly
const value = $json.field;

// CORRECT - Template literals
const value = `Hello, ${$json.name}!`;
```

### Error #4: External Library Import (Python-Specific)

```python
# WRONG - External libraries not available
import requests  # ModuleNotFoundError!
import pandas    # ModuleNotFoundError!

# CORRECT - Standard library only
import json
import datetime
import re
import statistics
```

### Error #5: Incorrect Return Format

```javascript
// WRONG
return {json: {result: 'success'}};

// CORRECT
return [{json: {result: 'success'}}];
```

---

## JavaScript-Specific Features

### Built-in Functions & Helpers

#### $helpers.httpRequest()

Make HTTP requests directly from Code nodes:

```javascript
const response = await $helpers.httpRequest({
  method: 'POST',
  url: 'https://api.example.com/users',
  headers: {
    'Authorization': 'Bearer token123',
    'Content-Type': 'application/json'
  },
  body: {
    name: $json.body.name,
    email: $json.body.email
  }
});

return [{json: {data: response}}];
```

#### DateTime (Luxon)

Advanced date/time operations:

```javascript
const now = DateTime.now();

return [{
  json: {
    iso: now.toISO(),
    formatted: now.toFormat('yyyy-MM-dd HH:mm:ss'),
    tomorrow: now.plus({days: 1}).toISO(),
    lastWeek: now.minus({weeks: 1}).toISO(),
    startOfMonth: now.startOf('month').toISO()
  }
}];
```

#### $jmespath()

Query JSON structures:

```javascript
const data = $input.first().json;
const adults = $jmespath(data, 'users[?age >= `18`]');
const names = $jmespath(data, 'users[*].name');

return [{json: {adults, names}}];
```

### Node.js Modules Available

```javascript
// crypto module
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('text').digest('hex');

// Buffer (built-in)
const encoded = Buffer.from('Hello').toString('base64');

// URL / URLSearchParams
const url = new URL('https://example.com/path?key=value');
```

---

## Python-Specific Features

### Python Modes: Beta vs Native

**Python (Beta)** - Recommended:
- Use: `_input`, `_json`, `_node` helper syntax
- Helpers available: `_now`, `_today`, `_jmespath()`

**Python (Native) (Beta)**:
- Use: `_items`, `_item` variables only
- More limited, no helpers

### Standard Library Reference

**Available modules:**
```python
import json          # JSON parsing
import datetime      # Date/time operations
import re            # Regular expressions
import base64        # Base64 encoding/decoding
import hashlib       # Hashing functions
import urllib.parse  # URL parsing
import math          # Math functions
import random        # Random numbers
import statistics    # Statistical functions
import collections   # defaultdict, Counter, etc.
```

**NOT available (external libraries):**
```python
# These will cause ModuleNotFoundError
import requests      # Use HTTP Request node instead
import pandas        # Use list comprehensions
import numpy         # Use math/statistics modules
import bs4           # Use HTML Extract node
```

### Safe Dictionary Access Pattern

```python
# Always use .get() to avoid KeyError
webhook = _input.first()["json"]
body = webhook.get("body", {})
name = body.get("name", "Unknown")
email = body.get("email", "no-email@example.com")

return [{
    "json": {
        "name": name,
        "email": email
    }
}]
```

---

## Best Practices

### 1. Always Validate Input Data

```javascript
// JavaScript
const items = $input.all();

if (!items || items.length === 0) {
  return [];
}

if (!items[0].json) {
  return [{json: {error: 'Invalid input format'}}];
}
```

```python
# Python
all_items = _input.all()

if not all_items:
    return []

if "json" not in all_items[0]:
    return [{"json": {"error": "Invalid input format"}}]
```

### 2. Use Try-Catch for Error Handling

```javascript
// JavaScript
try {
  const response = await $helpers.httpRequest({url: 'https://api.example.com'});
  return [{json: {success: true, data: response}}];
} catch (error) {
  return [{json: {success: false, error: error.message}}];
}
```

```python
# Python
try:
    # Processing logic
    result = process_data(_input.first()["json"])
    return [{"json": {"success": True, "data": result}}]
except Exception as e:
    return [{"json": {"success": False, "error": str(e)}}]
```

### 3. Filter Early, Process Late

```javascript
// Good: Filter first to reduce processing
const processed = $input.all()
  .filter(item => item.json.status === 'active')  // Reduce dataset first
  .map(item => expensiveTransformation(item));     // Then transform
```

### 4. Use Descriptive Variable Names

```javascript
// Good: Clear intent
const activeUsers = $input.all().filter(item => item.json.active);
const totalRevenue = activeUsers.reduce((sum, user) => sum + user.json.revenue, 0);

// Bad: Unclear purpose
const a = $input.all().filter(item => item.json.active);
const t = a.reduce((s, u) => s + u.json.revenue, 0);
```

### 5. Debug with Console/Print

```javascript
// JavaScript - appears in browser console (F12)
console.log('Processing items:', $input.all().length);
```

```python
# Python - appears in browser console (F12)
print(f"Processing {len(_input.all())} items")
```

---

## Quick Reference Checklist

Before deploying Code nodes, verify:

**Code Structure:**
- [ ] Code is not empty
- [ ] Return statement exists
- [ ] All code paths return data

**Return Format:**
- [ ] Returns array: `[...]`
- [ ] Each item has `json` property: `{json: {...}}`
- [ ] Format is `[{json: {...}}]`

**Data Access:**
- [ ] Using correct syntax for language (`$input` vs `_input`)
- [ ] Webhook data accessed via `.body` / `["body"]`
- [ ] Null/undefined checks in place

**Language-Specific (JavaScript):**
- [ ] No `{{ }}` expression syntax
- [ ] Template literals use backticks: `` `${value}` ``

**Language-Specific (Python):**
- [ ] No external imports (standard library only)
- [ ] Using `.get()` for dictionary access

---

## Additional Resources

### Reference Files
- [DATA_ACCESS.md](references/DATA_ACCESS.md) - Comprehensive data access patterns
- [COMMON_PATTERNS_JS.md](references/COMMON_PATTERNS_JS.md) - JavaScript production patterns
- [COMMON_PATTERNS_PY.md](references/COMMON_PATTERNS_PY.md) - Python production patterns
- [ERROR_PATTERNS.md](references/ERROR_PATTERNS.md) - Error prevention guide
- [BUILTIN_FUNCTIONS.md](references/BUILTIN_FUNCTIONS.md) - JavaScript built-in reference
- [STANDARD_LIBRARY.md](references/STANDARD_LIBRARY.md) - Python standard library reference

### n8n Documentation
- Code Node Guide: https://docs.n8n.io/code/code-node/
- Built-in Methods: https://docs.n8n.io/code-examples/methods-variables-reference/
- Python in n8n: https://docs.n8n.io/code/builtin/python-modules/
- Luxon Documentation: https://moment.github.io/luxon/

---

**Ready to write code in n8n Code nodes!** Start with JavaScript (95% of use cases), use the decision matrix for language choice, and reference the error patterns guide to avoid common mistakes.
