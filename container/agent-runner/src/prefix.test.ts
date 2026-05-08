import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

import { initTestSessionDb, closeSessionDb, getOutboundDb } from './db/connection.js';
import { writeMessageOut } from './db/messages-out.js';
import { setCurrentDecision } from './routing/turn-context.js';
import type { RouteDecision } from './routing/types.js';

beforeEach(() => {
  initTestSessionDb();
});

afterEach(() => {
  closeSessionDb();
  setCurrentDecision(null);
});

function readContent(id: string): string {
  const row = getOutboundDb()
    .prepare('SELECT content FROM messages_out WHERE id = ?')
    .get(id) as { content: string } | undefined;
  if (!row) throw new Error(`no row for ${id}`);
  return row.content;
}

describe('writeMessageOut route prefix', () => {
  test('with no decision set: content is written unchanged', () => {
    setCurrentDecision(null);
    writeMessageOut({ id: 'm1', kind: 'chat', content: JSON.stringify({ text: 'hi' }) });
    const c = JSON.parse(readContent('m1'));
    expect(c.text).toBe('hi');
  });

  test('opus-4-7 / high decision prefixes chat .text with [opus,high]', () => {
    const decision: RouteDecision = { model: 'claude-opus-4-7', effort: 'high', rule: 'test' };
    setCurrentDecision(decision);
    writeMessageOut({ id: 'm1', kind: 'chat', content: JSON.stringify({ text: 'hi' }) });
    const c = JSON.parse(readContent('m1'));
    expect(c.text).toBe('[opus,high]\nhi');
  });

  test('opus-4-6 / medium decision uses short label "opus" not "opus-4-6"', () => {
    setCurrentDecision({ model: 'claude-opus-4-6', effort: 'medium', rule: 'test' });
    writeMessageOut({ id: 'm1', kind: 'chat', content: JSON.stringify({ text: 'hi' }) });
    const c = JSON.parse(readContent('m1'));
    expect(c.text).toBe('[opus,medium]\nhi');
  });

  test('sonnet-4-6 / low decision prefixes with [sonnet,low]', () => {
    setCurrentDecision({ model: 'claude-sonnet-4-6', effort: 'low', rule: 'test' });
    writeMessageOut({ id: 'm1', kind: 'chat', content: JSON.stringify({ text: 'hi' }) });
    const c = JSON.parse(readContent('m1'));
    expect(c.text).toBe('[sonnet,low]\nhi');
  });

  test('already-prefixed text is NOT double-prefixed', () => {
    setCurrentDecision({ model: 'claude-opus-4-7', effort: 'high', rule: 'test' });
    writeMessageOut({
      id: 'm1',
      kind: 'chat',
      content: JSON.stringify({ text: '[opus,high]\nalready' }),
    });
    const c = JSON.parse(readContent('m1'));
    expect(c.text).toBe('[opus,high]\nalready');
  });

  test('kind="system" is NOT prefixed (not user-facing)', () => {
    setCurrentDecision({ model: 'claude-opus-4-7', effort: 'high', rule: 'test' });
    writeMessageOut({
      id: 'm1',
      kind: 'system',
      content: JSON.stringify({ text: 'system msg' }),
    });
    const c = JSON.parse(readContent('m1'));
    expect(c.text).toBe('system msg');
  });

  test('kind="chat-sdk" with type="ask_question" prefixes the .question field', () => {
    setCurrentDecision({ model: 'claude-opus-4-7', effort: 'high', rule: 'test' });
    writeMessageOut({
      id: 'm1',
      kind: 'chat-sdk',
      content: JSON.stringify({ type: 'ask_question', question: 'do you want X?' }),
    });
    const c = JSON.parse(readContent('m1'));
    expect(c.question).toBe('[opus,high]\ndo you want X?');
  });

  test('kind="chat-sdk" structured card with no .text/.question is unchanged', () => {
    setCurrentDecision({ model: 'claude-opus-4-7', effort: 'high', rule: 'test' });
    const card = { type: 'rich_card', title: 'hello', items: [{ id: 1 }] };
    writeMessageOut({
      id: 'm1',
      kind: 'chat-sdk',
      content: JSON.stringify(card),
    });
    const c = JSON.parse(readContent('m1'));
    expect(c).toEqual(card);
  });

  test('non-JSON content is returned unchanged (no crash)', () => {
    setCurrentDecision({ model: 'claude-opus-4-7', effort: 'high', rule: 'test' });
    writeMessageOut({
      id: 'm1',
      kind: 'chat',
      content: 'not-json-at-all',
    });
    const stored = readContent('m1');
    expect(stored).toBe('not-json-at-all');
  });
});
