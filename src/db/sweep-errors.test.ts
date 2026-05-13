/**
 * Tests for the session_sweep_errors persistence layer added alongside
 * per-session error isolation in host-sweep / delivery loops.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, initTestDb } from './connection.js';
import { runMigrations } from './migrations/index.js';
import {
  getRecentSweepErrors,
  getSweepErrorStats,
  recordSweepError,
} from './sweep-errors.js';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

describe('recordSweepError', () => {
  it('persists an Error with name, message, and a truncated stack', () => {
    const boom = new Error('boom');
    recordSweepError({
      session_id: 'sess-a',
      agent_group_id: 'ag-a',
      phase: 'host-sweep',
      error: boom,
    });

    const rows = getRecentSweepErrors('sess-a');
    expect(rows).toHaveLength(1);
    expect(rows[0].session_id).toBe('sess-a');
    expect(rows[0].agent_group_id).toBe('ag-a');
    expect(rows[0].phase).toBe('host-sweep');
    expect(rows[0].error_type).toBe('Error');
    expect(rows[0].error_message).toBe('boom');
    expect(rows[0].stack).toContain('boom');
    expect(rows[0].occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('persists a non-Error value as typeof + String(value)', () => {
    recordSweepError({
      session_id: 'sess-b',
      agent_group_id: null,
      phase: 'sweep-delivery',
      error: 'string-throw',
    });

    const rows = getRecentSweepErrors('sess-b');
    expect(rows[0].error_type).toBe('string');
    expect(rows[0].error_message).toBe('string-throw');
    expect(rows[0].stack).toBeNull();
  });

  it('returns rows ordered newest-first', () => {
    recordSweepError({ session_id: 'sess-c', agent_group_id: null, phase: 'host-sweep', error: new Error('first') });
    // Two writes inside the same millisecond would tie on occurred_at; force
    // a one-tick gap so the ordering check is deterministic.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        recordSweepError({
          session_id: 'sess-c',
          agent_group_id: null,
          phase: 'host-sweep',
          error: new Error('second'),
        });
        const rows = getRecentSweepErrors('sess-c');
        expect(rows.map((r) => r.error_message)).toEqual(['second', 'first']);
        resolve();
      }, 5);
    });
  });
});

describe('getSweepErrorStats', () => {
  it('aggregates count by (session, phase, error_type) and tracks last_occurred_at', () => {
    recordSweepError({ session_id: 'sess-x', agent_group_id: null, phase: 'host-sweep', error: new TypeError('a') });
    recordSweepError({ session_id: 'sess-x', agent_group_id: null, phase: 'host-sweep', error: new TypeError('b') });
    recordSweepError({ session_id: 'sess-x', agent_group_id: null, phase: 'sweep-delivery', error: new Error('c') });
    recordSweepError({ session_id: 'sess-y', agent_group_id: null, phase: 'host-sweep', error: new TypeError('d') });

    const stats = getSweepErrorStats(new Date(0).toISOString());
    const xTypeErr = stats.find((s) => s.session_id === 'sess-x' && s.error_type === 'TypeError');
    expect(xTypeErr?.count).toBe(2);
    const xGeneric = stats.find((s) => s.session_id === 'sess-x' && s.phase === 'sweep-delivery');
    expect(xGeneric?.count).toBe(1);
    const ySession = stats.find((s) => s.session_id === 'sess-y');
    expect(ySession?.count).toBe(1);
  });

  it('respects the since cutoff', () => {
    recordSweepError({ session_id: 'sess-old', agent_group_id: null, phase: 'host-sweep', error: new Error('old') });

    // Cutoff one hour from now → should exclude the row we just inserted.
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(getSweepErrorStats(future)).toHaveLength(0);
  });
});
