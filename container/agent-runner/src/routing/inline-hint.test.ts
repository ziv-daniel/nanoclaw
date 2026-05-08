import { describe, expect, test } from 'bun:test';
import { parseInlineHint } from './inline-hint.js';

describe('parseInlineHint', () => {
  test('returns null when there is no hint', () => {
    expect(parseInlineHint('hello')).toBeNull();
  });

  test('parses a basic hint and strips it from the message', () => {
    const result = parseInlineHint('[route:opus-4-7,high]\nhello');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-opus-4-7');
    expect(result!.decision.effort).toBe('high');
    expect(result!.decision.rule).toBe('inline-hint');
    expect(result!.stripped).toBe('hello');
  });

  test('short alias "opus" resolves to claude-opus-4-7 (default opus)', () => {
    const result = parseInlineHint('[route:opus,medium]\nhi');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-opus-4-7');
  });

  test('short alias "sonnet" resolves to claude-sonnet-4-6', () => {
    const result = parseInlineHint('[route:sonnet,medium]\nhi');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-sonnet-4-6');
  });

  test('short alias "opus-4-6" resolves to claude-opus-4-6', () => {
    const result = parseInlineHint('[route:opus-4-6,medium]\nhi');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-opus-4-6');
  });

  test('full id "claude-opus-4-7" parses as itself', () => {
    const result = parseInlineHint('[route:claude-opus-4-7,medium]\nhi');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-opus-4-7');
  });

  test('all four effort levels are valid', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh'] as const) {
      const result = parseInlineHint(`[route:opus,${effort}]\nhi`);
      expect(result).not.toBeNull();
      expect(result!.decision.effort).toBe(effort);
    }
  });

  test('invalid model "gpt-5" returns null', () => {
    expect(parseInlineHint('[route:gpt-5,high]\nhi')).toBeNull();
  });

  test('invalid effort "ultra" returns null', () => {
    expect(parseInlineHint('[route:opus,ultra]\nhi')).toBeNull();
  });

  test('whitespace tolerance inside brackets', () => {
    const result = parseInlineHint('[ route : opus , high ]\nhi');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-opus-4-7');
    expect(result!.decision.effort).toBe('high');
  });

  test('case-insensitive parsing', () => {
    const result = parseInlineHint('[ROUTE:OPUS,HIGH]\nhi');
    expect(result).not.toBeNull();
    expect(result!.decision.model).toBe('claude-opus-4-7');
    expect(result!.decision.effort).toBe('high');
  });

  test('hint NOT at start returns null', () => {
    expect(parseInlineHint('hello [route:opus,high]')).toBeNull();
  });

  test('stripped string is the message minus hint and one trailing newline', () => {
    const result = parseInlineHint('[route:opus,high]\nthe rest of the message');
    expect(result).not.toBeNull();
    expect(result!.stripped).toBe('the rest of the message');
  });

  test('multi-line message: only first line hint is consumed; rest preserved', () => {
    const result = parseInlineHint('[route:opus,high]\nline1\nline2\nline3');
    expect(result).not.toBeNull();
    expect(result!.stripped).toBe('line1\nline2\nline3');
  });
});
