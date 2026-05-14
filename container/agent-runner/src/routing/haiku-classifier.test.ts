import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { HaikuClassifier } from './haiku-classifier.js';

const origFetch = globalThis.fetch;

interface MockResponse {
  status?: number;
  body?: unknown;
  throwError?: Error;
  signal?: 'timeout';
}

function mockFetch(response: MockResponse) {
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (response.throwError) throw response.throwError;
    if (response.signal === 'timeout') {
      // Simulate timeout — wait until the abort signal fires.
      await new Promise((_resolve, reject) => {
        const sig = init?.signal;
        sig?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  // No-op; each test sets its own mock.
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe('HaikuClassifier', () => {
  test('kind is "haiku-classifier"', () => {
    const c = new HaikuClassifier();
    expect(c.kind).toBe('haiku-classifier');
  });

  test('happy path — returns RouteDecision matching tool_use input', async () => {
    mockFetch({
      status: 200,
      body: {
        content: [
          {
            type: 'tool_use',
            name: 'classify_message',
            input: {
              model: 'claude-opus-4-6',
              effort: 'high',
              category: 'code',
              reason: 'debug',
            },
          },
        ],
      },
    });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'fix this bug', mediaKind: null });
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-6');
    expect(decision!.effort).toBe('high');
    expect(decision!.category).toBe('code');
    expect(decision!.reason).toBe('debug');
    expect(decision!.rule).toBe('haiku-classify');
  });

  test('HTTP 401 → returns null', async () => {
    mockFetch({ status: 401, body: { error: 'unauthorized' } });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('HTTP 500 → returns null', async () => {
    mockFetch({ status: 500, body: { error: 'internal' } });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('network error → returns null', async () => {
    mockFetch({ throwError: new Error('ECONNREFUSED') });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('response missing tool_use block → returns null', async () => {
    mockFetch({
      status: 200,
      body: {
        content: [{ type: 'text', text: 'I think you should use opus.' }],
      },
    });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('tool_use with invalid model "gpt-5" → returns null', async () => {
    mockFetch({
      status: 200,
      body: {
        content: [
          {
            type: 'tool_use',
            name: 'classify_message',
            input: { model: 'gpt-5', effort: 'high', category: 'code' },
          },
        ],
      },
    });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('tool_use with invalid effort "ultra" → returns null', async () => {
    mockFetch({
      status: 200,
      body: {
        content: [
          {
            type: 'tool_use',
            name: 'classify_message',
            input: { model: 'claude-opus-4-6', effort: 'ultra', category: 'code' },
          },
        ],
      },
    });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('valid model + effort + invalid category → decision returned with category undefined', async () => {
    mockFetch({
      status: 200,
      body: {
        content: [
          {
            type: 'tool_use',
            name: 'classify_message',
            input: {
              model: 'claude-sonnet-4-6',
              effort: 'medium',
              category: 'not-a-real-category',
              reason: 'idk',
            },
          },
        ],
      },
    });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-sonnet-4-6');
    expect(decision!.effort).toBe('medium');
    expect(decision!.category).toBeUndefined();
    expect(decision!.reason).toBe('idk');
    expect(decision!.rule).toBe('haiku-classify');
  });

  test('timeout (AbortError thrown) → returns null', async () => {
    // Simulate what AbortSignal.timeout does when the deadline fires:
    // fetch rejects with a DOMException-like AbortError. We don't actually
    // need to wait the full 5s — we just need to verify classify() returns
    // null for any abort/throw on the fetch call.
    const abortError = new Error('The operation was aborted due to timeout');
    abortError.name = 'TimeoutError';
    mockFetch({ throwError: abortError });
    const c = new HaikuClassifier();
    const decision = await c.classify({ message: 'hi', mediaKind: null });
    expect(decision).toBeNull();
  });

  test('ctx.message > 800 chars still works (server-side truncation)', async () => {
    mockFetch({
      status: 200,
      body: {
        content: [
          {
            type: 'tool_use',
            name: 'classify_message',
            input: {
              model: 'claude-opus-4-7',
              effort: 'xhigh',
              category: 'complex-reasoning',
              reason: 'long input',
            },
          },
        ],
      },
    });
    const c = new HaikuClassifier();
    const longMessage = 'x'.repeat(5_000);
    const decision = await c.classify({ message: longMessage, mediaKind: null });
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('xhigh');
    expect(decision!.category).toBe('complex-reasoning');
  });
});
