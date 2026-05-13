import { describe, expect, test } from 'bun:test';
import { enforceOpusEffortCap } from './opus-effort-cap.js';
import type { RouteDecision } from './types.js';

const base = (over: Partial<RouteDecision> = {}): RouteDecision => ({
  model: 'claude-opus-4-7',
  effort: 'high',
  rule: 'haiku-classify',
  reason: 'classifier picked high',
  ...over,
});

describe('enforceOpusEffortCap', () => {
  test('opus-4-7 / high (no video) → capped to medium', () => {
    const out = enforceOpusEffortCap(base(), null);
    expect(out.model).toBe('claude-opus-4-7');
    expect(out.effort).toBe('medium');
    expect(out.reason).toContain('opus-effort-capped from high');
  });

  test('opus-4-6 / xhigh (no video) → capped to medium', () => {
    const out = enforceOpusEffortCap(
      base({ model: 'claude-opus-4-6', effort: 'xhigh' }),
      null,
    );
    expect(out.effort).toBe('medium');
    expect(out.reason).toContain('opus-effort-capped from xhigh');
  });

  test('opus + high with video attachment → NOT capped', () => {
    const out = enforceOpusEffortCap(base(), 'video');
    expect(out.effort).toBe('high');
    expect(out.reason).toBe('classifier picked high');
  });

  test('opus + high with image attachment → still capped (only video exempt)', () => {
    const out = enforceOpusEffortCap(base(), 'image');
    expect(out.effort).toBe('medium');
  });

  test('opus + high with audio attachment → capped', () => {
    const out = enforceOpusEffortCap(base(), 'audio');
    expect(out.effort).toBe('medium');
  });

  test('opus + high with document attachment → capped', () => {
    const out = enforceOpusEffortCap(base(), 'document');
    expect(out.effort).toBe('medium');
  });

  test('opus + high from force mode → NOT capped', () => {
    const out = enforceOpusEffortCap(base({ rule: 'force' }), null);
    expect(out.effort).toBe('high');
  });

  test('sonnet / high → NOT capped (cap is opus-only)', () => {
    const out = enforceOpusEffortCap(
      base({ model: 'claude-sonnet-4-6' }),
      null,
    );
    expect(out.effort).toBe('high');
  });

  test('opus / medium → NOT capped (already at cap)', () => {
    const out = enforceOpusEffortCap(base({ effort: 'medium' }), null);
    expect(out.effort).toBe('medium');
    expect(out.reason).toBe('classifier picked high');
  });

  test('opus / low → NOT capped', () => {
    const out = enforceOpusEffortCap(base({ effort: 'low' }), null);
    expect(out.effort).toBe('low');
  });

  test('decision without reason → cap adds a reason', () => {
    const out = enforceOpusEffortCap(
      { model: 'claude-opus-4-7', effort: 'high', rule: 'haiku-classify' },
      null,
    );
    expect(out.effort).toBe('medium');
    expect(out.reason).toBe('opus-effort-capped from high');
  });

  test('returned decision is a new object (immutable)', () => {
    const input = base();
    const out = enforceOpusEffortCap(input, null);
    expect(out).not.toBe(input);
    expect(input.effort).toBe('high'); // input untouched
  });
});
