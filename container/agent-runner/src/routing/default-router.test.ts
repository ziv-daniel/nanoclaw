import { describe, expect, test } from 'bun:test';
import { DefaultRouter } from './default-router.js';
import { DEFAULT_DECISION } from './types.js';

describe('DefaultRouter', () => {
  test('kind is "default"', () => {
    const router = new DefaultRouter();
    expect(router.kind).toBe('default');
  });

  test('route returns DEFAULT_DECISION (sonnet-4-6 / medium / rule:default)', async () => {
    const router = new DefaultRouter();
    const decision = await router.route({ message: 'hello', mediaKind: null });
    expect(decision).toEqual(DEFAULT_DECISION);
    expect(decision.model).toBe('claude-sonnet-4-6');
    expect(decision.effort).toBe('medium');
    expect(decision.rule).toBe('default');
  });

  test('route ignores ctx contents — image media still gets default (last fallback)', async () => {
    const router = new DefaultRouter();
    const decision = await router.route({ message: 'look at this', mediaKind: 'image' });
    expect(decision).toEqual(DEFAULT_DECISION);
    expect(decision.model).toBe('claude-sonnet-4-6');
  });

  test('default model is NOT haiku (lint guard)', async () => {
    const router = new DefaultRouter();
    const decision = await router.route({ message: 'x', mediaKind: null });
    expect(decision.model).not.toMatch(/haiku/i);
    expect(DEFAULT_DECISION.model).not.toMatch(/haiku/i);
  });
});
