import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

// IMPORTANT: overrides.ts captures `process.env.NANOCLAW_ROUTING_JSON`
// at module load time. ESM static imports are hoisted, so we use a
// dynamic import below to ensure env var is set first.
// Shared deterministic path with overrides.test.ts (see comment there).
const TMP_FILE = path.join(os.tmpdir(), `nc-routing-tests-${process.pid}.json`);
process.env.NANOCLAW_ROUTING_JSON = TMP_FILE;

const composerMod = await import('./composer.js');
const overridesMod = await import('./overrides.js');
const typesMod = await import('./types.js');
const { ComposedRouter } = composerMod;
const { _resetOverridesCacheForTests } = overridesMod;
type Classifier = import('./types.js').Classifier;
type RouteContext = import('./types.js').RouteContext;
type RouteDecision = import('./types.js').RouteDecision;
void typesMod;

class StubClassifier implements Classifier {
  readonly kind = 'stub';
  public callCount = 0;
  public lastCtx: RouteContext | null = null;

  constructor(private response: RouteDecision | null = null) {}

  async classify(ctx: RouteContext): Promise<RouteDecision | null> {
    this.callCount += 1;
    this.lastCtx = ctx;
    return this.response;
  }
}

function writeOverrides(content: object): void {
  fs.writeFileSync(TMP_FILE, JSON.stringify(content), 'utf8');
}

function pointAtNonexistentFile(): void {
  if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
}

beforeEach(() => {
  if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
  _resetOverridesCacheForTests();
});

afterEach(() => {
  if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
  _resetOverridesCacheForTests();
});

describe('ComposedRouter pipeline', () => {
  test('1. inline hint beats force mode', async () => {
    writeOverrides({
      mode: 'force',
      force: { model: 'claude-opus-4-6', effort: 'medium' },
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: '[route:sonnet,low]\nhi',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-sonnet-4-6');
    expect(decision.effort).toBe('low');
    expect(decision.rule).toBe('inline-hint');
    expect(classifier.callCount).toBe(0);
  });

  test('2. bypass rules: image attachment with no overrides → opus-4-7/high', async () => {
    pointAtNonexistentFile();
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'check this',
      mediaKind: 'image',
    });
    expect(decision.model).toBe('claude-opus-4-7');
    expect(decision.effort).toBe('high');
    expect(decision.rule).toBe('attachment-media');
    expect(classifier.callCount).toBe(0);
  });

  test('3. force mode: plain message → force decision', async () => {
    writeOverrides({
      mode: 'force',
      force: { model: 'claude-opus-4-6', effort: 'medium' },
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'hi',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-opus-4-6');
    expect(decision.effort).toBe('medium');
    expect(decision.rule).toBe('force');
    expect(classifier.callCount).toBe(0);
  });

  test('4. force mode skips bypass by default (image → force, NOT image bypass)', async () => {
    writeOverrides({
      mode: 'force',
      force: { model: 'claude-sonnet-4-6', effort: 'medium' },
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'look at this',
      mediaKind: 'image',
    });
    expect(decision.model).toBe('claude-sonnet-4-6');
    expect(decision.effort).toBe('medium');
    expect(decision.rule).toBe('force');
    expect(classifier.callCount).toBe(0);
  });

  test('5. force mode + respectBypassRules=true → bypass wins for image', async () => {
    writeOverrides({
      mode: 'force',
      force: { model: 'claude-sonnet-4-6', effort: 'medium' },
      respectBypassRules: true,
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'look at this',
      mediaKind: 'image',
    });
    expect(decision.model).toBe('claude-opus-4-7');
    expect(decision.effort).toBe('high');
    expect(decision.rule).toBe('attachment-media');
    expect(classifier.callCount).toBe(0);
  });

  test('5b. force mode + matching intent rule → intent rule wins', async () => {
    writeOverrides({
      mode: 'force',
      force: { model: 'claude-opus-4-6', effort: 'medium' },
      intentRules: [
        {
          match: 'chart',
          flags: 'i',
          model: 'claude-opus-4-7',
          effort: 'high',
          reason: 'chart-analysis',
        },
      ],
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'analyze this CHART please',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-opus-4-7');
    expect(decision.effort).toBe('high');
    expect(decision.rule).toBe('intent-rule');
    expect(classifier.callCount).toBe(0);
  });

  test('5c. force mode + non-matching intent rule → force still wins', async () => {
    writeOverrides({
      mode: 'force',
      force: { model: 'claude-opus-4-6', effort: 'medium' },
      intentRules: [
        {
          match: 'chart',
          flags: 'i',
          model: 'claude-opus-4-7',
          effort: 'high',
        },
      ],
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'how is the weather',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-opus-4-6');
    expect(decision.effort).toBe('medium');
    expect(decision.rule).toBe('force');
  });

  test('6. intent rule fires before classifier', async () => {
    writeOverrides({
      intentRules: [
        {
          match: 'trading',
          model: 'claude-opus-4-7',
          effort: 'high',
        },
      ],
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier({
      model: 'claude-sonnet-4-6',
      effort: 'low',
      rule: 'haiku-classify',
    });
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'trading update',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-opus-4-7');
    expect(decision.effort).toBe('high');
    expect(decision.rule).toBe('intent-rule');
    expect(classifier.callCount).toBe(0);
  });

  test('7. intent rule does not fire → falls to classifier', async () => {
    writeOverrides({
      intentRules: [
        {
          match: 'trading',
          model: 'claude-opus-4-7',
          effort: 'high',
        },
      ],
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier({
      model: 'claude-sonnet-4-6',
      effort: 'low',
      rule: 'haiku-classify',
    });
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'something unrelated',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-sonnet-4-6');
    expect(decision.effort).toBe('low');
    expect(decision.rule).toBe('haiku-classify');
    expect(classifier.callCount).toBe(1);
  });

  test('8. classifier returns decision → returned with its rule', async () => {
    pointAtNonexistentFile();
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier({
      model: 'claude-opus-4-6',
      effort: 'medium',
      rule: 'haiku-classify',
      reason: 'classified as code',
    });
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'refactor this function',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-opus-4-6');
    expect(decision.effort).toBe('medium');
    expect(decision.rule).toBe('haiku-classify');
    expect(decision.reason).toBe('classified as code');
    expect(classifier.callCount).toBe(1);
  });

  test('9. classifier returns null + per-agent default → uses default with rule=agent-default', async () => {
    writeOverrides({
      mode: 'classify',
      default: { model: 'claude-opus-4-6', effort: 'low' },
    });
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'hello',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-opus-4-6');
    expect(decision.effort).toBe('low');
    expect(decision.rule).toBe('agent-default');
    expect(classifier.callCount).toBe(1);
  });

  test('10. classifier null + no overrides → DEFAULT_DECISION (sonnet/medium)', async () => {
    pointAtNonexistentFile();
    _resetOverridesCacheForTests();

    const classifier = new StubClassifier(null);
    const router = new ComposedRouter(classifier);
    const decision = await router.route({
      message: 'hi',
      mediaKind: null,
    });
    expect(decision.model).toBe('claude-sonnet-4-6');
    expect(decision.effort).toBe('medium');
    expect(decision.rule).toBe('default');
    expect(classifier.callCount).toBe(1);
  });
});
