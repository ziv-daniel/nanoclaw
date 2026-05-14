import { describe, expect, test } from 'bun:test';
import { applyBypassRules } from './bypass-rules.js';
import type { RouteContext } from './types.js';

const ctx = (
  message: string,
  mediaKind: RouteContext['mediaKind'] = null,
): RouteContext => ({ message, mediaKind });

describe('applyBypassRules', () => {
  test('mediaKind=null + non-media message → null', () => {
    expect(applyBypassRules(ctx('what time is it'))).toBeNull();
  });

  test("mediaKind='image' → opus-4-7 / high, rule='attachment-media'", () => {
    const decision = applyBypassRules(ctx('check this', 'image'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('high');
    expect(decision!.rule).toBe('attachment-media');
  });

  test("mediaKind='video' → opus-4-7 / high, rule='attachment-media'", () => {
    const decision = applyBypassRules(ctx('look at this', 'video'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('high');
    expect(decision!.rule).toBe('attachment-media');
  });

  test("mediaKind='audio' → sonnet-4-6 / medium, rule='attachment-audio'", () => {
    const decision = applyBypassRules(ctx('listen', 'audio'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-sonnet-4-6');
    expect(decision!.effort).toBe('medium');
    expect(decision!.rule).toBe('attachment-audio');
  });

  test("mediaKind='document' → opus-4-6 / medium, rule='attachment-document'", () => {
    const decision = applyBypassRules(ctx('summarize', 'document'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-6');
    expect(decision!.effort).toBe('medium');
    expect(decision!.rule).toBe('attachment-document');
  });

  test("media-intent: 'create an image of a sunset' → opus-4-7 / medium", () => {
    const decision = applyBypassRules(ctx('create an image of a sunset'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('medium');
    expect(decision!.rule).toBe('media-intent');
  });

  test("media-intent: 'generate a poster' → opus-4-7 / medium", () => {
    const decision = applyBypassRules(ctx('generate a poster'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('medium');
    expect(decision!.rule).toBe('media-intent');
  });

  test("media-intent: 'voice message of the news' → opus-4-7 / medium", () => {
    const decision = applyBypassRules(ctx('voice message of the news'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('medium');
    expect(decision!.rule).toBe('media-intent');
  });

  test("media-intent: 'make a song' → opus-4-7 / medium", () => {
    const decision = applyBypassRules(ctx('make a song'));
    expect(decision).not.toBeNull();
    expect(decision!.model).toBe('claude-opus-4-7');
    expect(decision!.effort).toBe('medium');
    expect(decision!.rule).toBe('media-intent');
  });

  test("plain 'what time is it' → null", () => {
    expect(applyBypassRules(ctx('what time is it'))).toBeNull();
  });

  test("attachment beats media-intent: image + 'create an image' → 'attachment-media' high", () => {
    const decision = applyBypassRules(ctx('create an image of this please', 'image'));
    expect(decision).not.toBeNull();
    expect(decision!.rule).toBe('attachment-media');
    expect(decision!.effort).toBe('high');
    expect(decision!.model).toBe('claude-opus-4-7');
  });

  test('regex is case-insensitive', () => {
    const upper = applyBypassRules(ctx('CREATE AN IMAGE of a sunset'));
    expect(upper).not.toBeNull();
    expect(upper!.rule).toBe('media-intent');

    const mixed = applyBypassRules(ctx('Generate A Poster please'));
    expect(mixed).not.toBeNull();
    expect(mixed!.rule).toBe('media-intent');
  });
});
