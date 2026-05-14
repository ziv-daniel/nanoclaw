import { describe, expect, test } from 'bun:test';
import { detectMediaKind } from './media-detect.js';

describe('detectMediaKind', () => {
  test('returns null for empty messages array', () => {
    expect(detectMediaKind([])).toBeNull();
  });

  test('returns null when no media tags present', () => {
    expect(detectMediaKind([{ content: 'just a plain text message' }])).toBeNull();
  });

  test('detects single [Image: ...] as image', () => {
    expect(detectMediaKind([{ content: '[Image: cat.png]' }])).toBe('image');
  });

  test('detects single [Video: ...] as video', () => {
    expect(detectMediaKind([{ content: '[Video: clip.mp4]' }])).toBe('video');
  });

  test('detects single [Voice: ...] as audio (alias normalization)', () => {
    expect(detectMediaKind([{ content: '[Voice: note.ogg]' }])).toBe('audio');
  });

  test('detects single [Audio: ...] as audio', () => {
    expect(detectMediaKind([{ content: '[Audio: track.mp3]' }])).toBe('audio');
  });

  test('detects single [Document: ...] as document', () => {
    expect(detectMediaKind([{ content: '[Document: report.pdf]' }])).toBe('document');
  });

  test('detects single [File: ...] as document (alias normalization)', () => {
    expect(detectMediaKind([{ content: '[File: archive.zip]' }])).toBe('document');
  });

  test('mixed image + video → video wins (priority)', () => {
    expect(
      detectMediaKind([
        { content: '[Image: chart.png]' },
        { content: '[Video: demo.mp4]' },
      ]),
    ).toBe('video');
  });

  test('mixed image + document → image wins', () => {
    expect(
      detectMediaKind([
        { content: '[Image: chart.png]' },
        { content: '[Document: report.pdf]' },
      ]),
    ).toBe('image');
  });

  test('mixed audio + image → image wins', () => {
    expect(
      detectMediaKind([
        { content: '[Audio: track.mp3]' },
        { content: '[Image: chart.png]' },
      ]),
    ).toBe('image');
  });

  test('mixed audio + document → document wins', () => {
    expect(
      detectMediaKind([
        { content: '[Audio: track.mp3]' },
        { content: '[Document: report.pdf]' },
      ]),
    ).toBe('document');
  });

  test('case insensitive [VIDEO: ...] still detected', () => {
    expect(detectMediaKind([{ content: '[VIDEO: clip.mp4]' }])).toBe('video');
  });

  test('Hebrew/non-Latin text in attachment label still triggers detection', () => {
    expect(detectMediaKind([{ content: '[Image: תמונה.png]' }])).toBe('image');
    expect(detectMediaKind([{ content: '[Video: 视频.mp4]' }])).toBe('video');
  });

  test('non-attachment brackets like [note: ...] do not trigger', () => {
    expect(detectMediaKind([{ content: '[note: remember to call]' }])).toBeNull();
    expect(detectMediaKind([{ content: '[todo: buy milk]' }])).toBeNull();
  });

  test('priority is taken globally across multiple messages', () => {
    expect(
      detectMediaKind([
        { content: '[Audio: voice.ogg]' },
        { content: '[Document: spec.pdf]' },
        { content: '[Image: screen.png]' },
        { content: '[Video: recording.mp4]' },
      ]),
    ).toBe('video');

    expect(
      detectMediaKind([
        { content: 'first [Audio: a.ogg]' },
        { content: 'then [Document: d.pdf]' },
      ]),
    ).toBe('document');
  });

  test('multiple tags in a single message — highest priority wins', () => {
    expect(
      detectMediaKind([
        { content: '[Image: x.png] and [Video: y.mp4]' },
      ]),
    ).toBe('video');
  });
});
