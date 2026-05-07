import { describe, expect, test } from 'bun:test';
import { RuleRouter } from './rule-router.js';
import { DEFAULT_DECISION } from './types.js';

describe('RuleRouter', () => {
  const router = new RuleRouter();

  test('returns default sonnet/medium for any input', async () => {
    const d = await router.route({ message: 'fix this bug', hasAttachment: false });
    expect(d).toEqual(DEFAULT_DECISION);
    expect(d.model).toBe('claude-sonnet-4-6');
    expect(d.effort).toBe('medium');
  });

  test('does not return haiku (haiku is removed)', async () => {
    const d = await router.route({ message: 'ok', hasAttachment: false });
    expect(d.model).not.toMatch(/haiku/);
  });
});
