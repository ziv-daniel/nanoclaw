---
name: vitest-class-mock-injection
description: |
  Fix Vitest class mocking issues where vi.mock factory functions don't properly
  replace class constructors. Use when: (1) mocked class methods return undefined
  or "is not a function", (2) vi.mock with mockImplementation doesn't work for
  classes, (3) need to mock dependencies injected into constructors, (4) ES module
  mocking fails silently. Solution: pass mock objects directly instead of relying
  on vi.mock for class replacement.
author: Claude Code
version: 1.0.0
date: 2026-01-22
---

# Vitest Class Mock Injection Pattern

## Problem
When testing classes that depend on other classes (dependency injection),
`vi.mock()` with factory functions often fails to properly replace class
constructors. The mock factory runs but the instantiated object doesn't
have the expected methods.

## Context / Trigger Conditions
- Error: `mockInstance.someMethod is not a function`
- Methods on mocked class instances return `undefined`
- Using `vi.mock('./some-class.js', () => ({ SomeClass: vi.fn().mockImplementation(() => mockObj) }))`
- Testing classes that create instances of other classes in their constructor
- ES modules with class exports

## Solution

### Pattern: Direct Mock Injection

Instead of mocking the module, pass mock objects directly to the class under test:

```typescript
// Test file
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassUnderTest } from './class-under-test.js';
import type { DependencyClass } from './dependency-class.js';

describe('ClassUnderTest', () => {
  let mockDependency: DependencyClass;

  beforeEach(() => {
    // Create mock with all required methods
    mockDependency = {
      getData: vi.fn(() => Promise.resolve({ data: 'test' })),
      getStatus: vi.fn(() => ({ isReady: true })),
      // ... other methods
    } as unknown as DependencyClass;
  });

  it('should work with injected mock', () => {
    // Pass mock directly instead of relying on vi.mock
    const instance = new ClassUnderTest(mockDependency);

    expect(instance).toBeDefined();
    expect(mockDependency.getData).not.toHaveBeenCalled();
  });
});
```

### When vi.mock is Still Needed

If the class internally imports and instantiates dependencies, use `vi.hoisted()`:

```typescript
// Create mocks in vi.hoisted to ensure they exist before vi.mock runs
const { mockDependency } = vi.hoisted(() => {
  return {
    mockDependency: {
      getData: vi.fn(() => Promise.resolve({ data: 'test' })),
      getStatus: vi.fn(() => ({ isReady: true })),
    },
  };
});

// Mock the module - but this may still have issues
vi.mock('./dependency-class.js', () => ({
  DependencyClass: vi.fn().mockImplementation(() => mockDependency),
}));
```

### Best Practice: Constructor Injection

Design classes to accept dependencies via constructor for easier testing:

```typescript
// Production code - accepts dependency via constructor
class MyService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }
}

// Test - easy to inject mocks
const mockClient = { fetch: vi.fn() } as unknown as ApiClient;
const service = new MyService(mockClient);
```

## Verification
1. Mock methods are callable without "is not a function" errors
2. `vi.fn()` assertions work (toHaveBeenCalled, toHaveBeenCalledWith)
3. Mock return values are received by the class under test

## Example

**Problematic Code (doesn't work reliably):**
```typescript
vi.mock('./mcp-server.js', () => ({
  McpNodeRedServer: vi.fn().mockImplementation(() => mockMcpServer),
}));

// In test
const mcpServer = new McpNodeRedServer(config);
// ERROR: mcpServer.getSSEHandler is not a function
```

**Working Code:**
```typescript
// Define mock with all methods
const mockMcpServer = {
  getSSEHandler: vi.fn(() => mockSSEHandler),
  getNodeRedClient: vi.fn(() => mockNodeRedClient),
  listTools: vi.fn(() => Promise.resolve({ tools: [] })),
};

// Pass directly to dependent class
const expressApp = new ExpressApp(
  mockMcpServer as unknown as McpNodeRedServer,
  config
);
```

## Notes
- The `as unknown as Type` cast is necessary for TypeScript
- Ensure mock objects have ALL methods the class under test will call
- Mock method return values at definition time, not in beforeEach when using vi.hoisted
- vi.clearAllMocks() in beforeEach resets call counts but preserves implementations
- For complex mocks, consider creating a factory function

## Related Patterns
- Factory functions for creating consistent mocks
- Partial mocks using spread: `{ ...realInstance, methodToMock: vi.fn() }`
- Using `vi.spyOn()` for methods on real instances

## References
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
- [Vitest vi.hoisted](https://vitest.dev/api/vi.html#vi-hoisted)
