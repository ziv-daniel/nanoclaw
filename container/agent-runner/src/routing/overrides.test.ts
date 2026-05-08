import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

// IMPORTANT: overrides.ts captures `process.env.NANOCLAW_ROUTING_JSON`
// at module load time (top-level const). ESM static imports are hoisted,
// so we must set the env var first AND use a dynamic import below to
// guarantee the env var is in place before the module-under-test loads.
// Shared deterministic path so this test file and composer.test.ts both
// agree on the same tmp file even when bun runs them in the same process
// and the overrides.ts module is cached across files. Whichever file
// loads first sets the env var; they both target the same path so cache
// re-reads in beforeEach are correct.
const TMP_FILE = path.join(os.tmpdir(), `nc-routing-tests-${process.pid}.json`);
process.env.NANOCLAW_ROUTING_JSON = TMP_FILE;

const overridesMod = await import('./overrides.js');
const { _resetOverridesCacheForTests, loadOverrides } = overridesMod;

function writeOverrides(content: string): void {
  fs.writeFileSync(TMP_FILE, content, 'utf8');
}

beforeEach(() => {
  if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
  _resetOverridesCacheForTests();
});

afterEach(() => {
  if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
  _resetOverridesCacheForTests();
});

describe('loadOverrides', () => {
  test('returns null when file does not exist', () => {
    expect(fs.existsSync(TMP_FILE)).toBe(false);
    expect(loadOverrides()).toBeNull();
  });

  test('returns parsed shape for mode=classify with default model+effort', () => {
    writeOverrides(
      JSON.stringify({
        mode: 'classify',
        default: { model: 'claude-sonnet-4-6', effort: 'medium' },
      }),
    );
    const result = loadOverrides();
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('classify');
    expect(result?.default).toEqual({
      model: 'claude-sonnet-4-6',
      effort: 'medium',
    });
  });

  test('returns parsed shape for mode=force with force={model,effort}', () => {
    writeOverrides(
      JSON.stringify({
        mode: 'force',
        force: { model: 'claude-opus-4-7', effort: 'high' },
      }),
    );
    const result = loadOverrides();
    expect(result?.mode).toBe('force');
    expect(result?.force).toEqual({
      model: 'claude-opus-4-7',
      effort: 'high',
    });
  });

  test('preserves valid intentRules array entries', () => {
    writeOverrides(
      JSON.stringify({
        intentRules: [
          {
            match: 'trading',
            model: 'claude-opus-4-7',
            effort: 'high',
            reason: 'trading talk',
          },
          {
            match: '^urgent',
            model: 'claude-opus-4-6',
            effort: 'medium',
          },
        ],
      }),
    );
    const result = loadOverrides();
    expect(result?.intentRules).toHaveLength(2);
    expect(result?.intentRules?.[0]).toEqual({
      match: 'trading',
      model: 'claude-opus-4-7',
      effort: 'high',
      reason: 'trading talk',
    });
    expect(result?.intentRules?.[1]).toEqual({
      match: '^urgent',
      model: 'claude-opus-4-6',
      effort: 'medium',
      reason: undefined,
    });
  });

  test('drops force section with invalid model, preserves rest', () => {
    writeOverrides(
      JSON.stringify({
        mode: 'force',
        force: { model: 'gpt-5', effort: 'high' },
        default: { model: 'claude-sonnet-4-6', effort: 'low' },
      }),
    );
    const result = loadOverrides();
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('force');
    expect(result?.force).toBeUndefined();
    expect(result?.default).toEqual({
      model: 'claude-sonnet-4-6',
      effort: 'low',
    });
  });

  test('drops intentRule with invalid effort', () => {
    writeOverrides(
      JSON.stringify({
        intentRules: [
          {
            match: 'foo',
            model: 'claude-opus-4-7',
            effort: 'ultra',
          },
          {
            match: 'bar',
            model: 'claude-opus-4-7',
            effort: 'high',
          },
        ],
      }),
    );
    const result = loadOverrides();
    expect(result?.intentRules).toHaveLength(1);
    expect(result?.intentRules?.[0]?.match).toBe('bar');
  });

  test('drops intentRule with invalid regex source', () => {
    writeOverrides(
      JSON.stringify({
        intentRules: [
          {
            match: '(unclosed',
            model: 'claude-opus-4-7',
            effort: 'high',
          },
          {
            match: 'valid',
            model: 'claude-opus-4-7',
            effort: 'high',
          },
        ],
      }),
    );
    const result = loadOverrides();
    expect(result?.intentRules).toHaveLength(1);
    expect(result?.intentRules?.[0]?.match).toBe('valid');
  });

  test('strips (?i) inline flag into flags field', () => {
    writeOverrides(
      JSON.stringify({
        intentRules: [
          {
            match: '(?i)\\b(chart|RSI|MACD)\\b',
            model: 'claude-opus-4-7',
            effort: 'high',
            reason: 'chart-analysis',
          },
        ],
      }),
    );
    const result = loadOverrides();
    expect(result?.intentRules).toHaveLength(1);
    expect(result?.intentRules?.[0]).toEqual({
      match: '\\b(chart|RSI|MACD)\\b',
      flags: 'i',
      model: 'claude-opus-4-7',
      effort: 'high',
      reason: 'chart-analysis',
    });
  });

  test('merges explicit flags field with inline (?ms) prefix', () => {
    writeOverrides(
      JSON.stringify({
        intentRules: [
          {
            match: '(?m)^breakout',
            flags: 'i',
            model: 'claude-opus-4-7',
            effort: 'high',
          },
        ],
      }),
    );
    const result = loadOverrides();
    expect(result?.intentRules).toHaveLength(1);
    const rule = result?.intentRules?.[0];
    expect(rule?.match).toBe('^breakout');
    // Both i (explicit) and m (inline) should be present.
    expect(rule?.flags?.split('').sort().join('')).toBe('im');
  });

  test('returns null for malformed JSON (does NOT throw)', () => {
    writeOverrides('{ this is not json');
    expect(() => loadOverrides()).not.toThrow();
    expect(loadOverrides()).toBeNull();
  });

  test('returns null for non-object root (string)', () => {
    writeOverrides(JSON.stringify('hello'));
    expect(loadOverrides()).toBeNull();
  });

  test('returns null for null root', () => {
    writeOverrides('null');
    expect(loadOverrides()).toBeNull();
  });

  test('preserves respectBypassRules boolean', () => {
    writeOverrides(
      JSON.stringify({
        mode: 'force',
        force: { model: 'claude-opus-4-7', effort: 'high' },
        respectBypassRules: true,
      }),
    );
    const result = loadOverrides();
    expect(result?.respectBypassRules).toBe(true);
  });

  test('caching: second call without cache reset returns same value even if file deleted', () => {
    writeOverrides(
      JSON.stringify({
        mode: 'force',
        force: { model: 'claude-opus-4-6', effort: 'medium' },
      }),
    );
    const first = loadOverrides();
    expect(first?.mode).toBe('force');

    // Delete the file
    fs.unlinkSync(TMP_FILE);
    expect(fs.existsSync(TMP_FILE)).toBe(false);

    // Without cache reset, we still get the cached value
    const second = loadOverrides();
    expect(second).toEqual(first);
  });

  test('_resetOverridesCacheForTests forces re-read', () => {
    writeOverrides(
      JSON.stringify({
        mode: 'force',
        force: { model: 'claude-opus-4-6', effort: 'medium' },
      }),
    );
    const first = loadOverrides();
    expect(first?.force?.model).toBe('claude-opus-4-6');

    // Update the file
    writeOverrides(
      JSON.stringify({
        mode: 'force',
        force: { model: 'claude-opus-4-7', effort: 'high' },
      }),
    );

    // Without reset, still cached
    expect(loadOverrides()?.force?.model).toBe('claude-opus-4-6');

    // After reset, new value
    _resetOverridesCacheForTests();
    expect(loadOverrides()?.force?.model).toBe('claude-opus-4-7');
  });
});
