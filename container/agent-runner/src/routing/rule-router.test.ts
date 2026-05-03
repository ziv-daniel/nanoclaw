import { describe, expect, test } from 'bun:test';
import { ruleRoute } from './rule-router.js';

describe('ruleRoute', () => {
  test('default sonnet medium for general chat', () => {
    const d = ruleRoute({ message: 'fix this bug in the login form' });
    expect(d.model).toBe('claude-sonnet-4-6');
    expect(d.effort).toBe('medium');
    expect(d.rule).toBe('default');
  });

  test('haiku low for trivial acks', () => {
    for (const text of ['ok', 'thanks', 'ping', '👍', '?', 'got it']) {
      const d = ruleRoute({ message: text });
      expect(d.model).toBe('claude-haiku-4-5');
      expect(d.effort).toBe('low');
      expect(d.rule).toBe('short-ack');
    }
  });

  test('opus high for planning words', () => {
    for (const text of [
      'can you plan the migration to v3?',
      'I need to design a new caching layer',
      'what is the best approach here?',
    ]) {
      const d = ruleRoute({ message: text });
      expect(d.model).toBe('claude-opus-4-6');
      expect(d.effort).toBe('high');
      expect(d.rule).toBe('planning');
    }
  });

  test('opus high for hard debugging', () => {
    const d = ruleRoute({ message: 'why does the websocket keep dropping after 5 minutes?' });
    expect(d.model).toBe('claude-opus-4-6');
    expect(d.effort).toBe('high');
    expect(d.rule).toBe('hard-debug');
  });

  test('opus high for security review', () => {
    const d = ruleRoute({ message: 'do a security audit of the auth flow' });
    expect(d.model).toBe('claude-opus-4-6');
    expect(d.effort).toBe('high');
    expect(d.rule).toBe('security-review');
  });

  test('always returns a decision (no undefined)', () => {
    const d = ruleRoute({ message: '' });
    expect(d.model).toBeDefined();
    expect(d.effort).toBeDefined();
    expect(d.rule).toBe('default');
  });
});
