---
name: express5-wildcard-route-migration
description: |
  Fix "Missing parameter name at position X" errors in Express 5 applications.
  Use when: (1) upgrading from Express 4 to Express 5, (2) seeing path-to-regexp
  errors with wildcard routes like app.use('*') or app.all('*'), (3) catch-all
  routes suddenly breaking after dependency updates. Express 5 uses path-to-regexp
  v8 which requires named wildcards instead of bare asterisks.
author: Claude Code
version: 1.0.0
date: 2026-01-22
---

# Express 5 Wildcard Route Migration

## Problem
Express 5 upgraded to path-to-regexp v8, which has breaking changes for wildcard
route patterns. Routes using `*` or `/*` that worked in Express 4 will throw
"Missing parameter name" errors in Express 5.

## Context / Trigger Conditions
- Error: `Missing parameter name at position 1` or similar
- Error: `Missing parameter name at 2: https://git.new/pathToRegexpError`
- Using Express 5.x (check with `npm ls express`)
- Routes with patterns like:
  - `app.use('*', handler)`
  - `app.all('*', handler)`
  - `app.get('/*', handler)`

## Solution

### Quick Fix
Replace bare wildcards with named wildcards:

```javascript
// Express 4 (broken in Express 5)
app.use('*', (req, res) => { ... });
app.all('*', handler);
app.get('/*', handler);

// Express 5 (path-to-regexp v8)
app.use('/{*splat}', (req, res) => { ... });
app.all('/{*splat}', handler);
app.get('/{*splat}', handler);
```

### Accessing the Wildcard Value
The named parameter is accessible via `req.params`:

```javascript
app.use('/{*splat}', (req, res) => {
  console.log(req.params.splat); // The matched path
});
```

### Alternative: Match Root Path Too
Use `{*splat}` without leading slash to also match the root path `/`:

```javascript
// Matches / and all paths
app.all('{*splat}', handler);

// Matches only paths with content after /
app.all('/{*splat}', handler);
```

## Verification
1. Run the application - no path-to-regexp errors on startup
2. Test the catch-all route responds correctly
3. Verify `req.params.splat` contains expected path segments

## Example

Before (Express 4):
```javascript
// Catch-all for 404s
this.app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});
```

After (Express 5):
```javascript
// Catch-all for 404s (Express 5 with path-to-regexp v8)
this.app.use('/{*splat}', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});
```

## Notes
- The parameter name (`splat`) can be any valid identifier
- This change affects Express 5.0.0+ with path-to-regexp 8.x
- Optional parameters also changed: `:name?` becomes `{/:name}` in Express 5
- Regular expressions in routes have different escaping rules
- Test thoroughly as route matching behavior may differ subtly

## Related Changes in Express 5
Other path-to-regexp v8 breaking changes to watch for:
- Optional params: `:id?` → `{/:id}`
- Custom regex: `:id(\\d+)` → `:id` with separate validation
- Escaping: literal braces need escaping `\\{\\}`

## References
- [Express 5.x Migration Guide](https://expressjs.com/en/guide/migrating-5.html)
- [path-to-regexp Breaking Changes](https://github.com/pillarjs/path-to-regexp/releases)
- [GitHub Issue: Using wildcard * in Express v5](https://github.com/expressjs/express/issues/6606)
- [Express Routing Documentation](https://expressjs.com/en/guide/routing.html)
