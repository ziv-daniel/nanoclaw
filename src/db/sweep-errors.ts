/**
 * Persisted statistics for per-session sweep / delivery errors.
 *
 * The host-sweep and delivery loops wrap each session iteration in its own
 * try/catch so a single bad session doesn't take down the whole tick. When
 * one of those per-session calls throws, we drop a row here so operators
 * can answer "what crashed?" without grepping rotating log files.
 *
 * Errors that are recoverable on retry (transient SQLite contention, etc.)
 * intentionally still get a row — the volume *is* the signal. If one
 * session is producing 100 errors/hour while everything else is clean,
 * the count tells you where to look.
 */
import { getDb } from './connection.js';

export interface SweepErrorInput {
  session_id: string;
  agent_group_id: string | null;
  phase: 'host-sweep' | 'active-delivery' | 'sweep-delivery';
  error: unknown;
}

export interface SweepErrorRow {
  id: number;
  session_id: string;
  agent_group_id: string | null;
  phase: string;
  error_type: string | null;
  error_message: string | null;
  stack: string | null;
  occurred_at: string;
}

const STACK_MAX_CHARS = 4000;

function describeError(err: unknown): { type: string | null; message: string | null; stack: string | null } {
  if (err instanceof Error) {
    return {
      type: err.name ?? null,
      message: err.message ?? null,
      stack: err.stack ? err.stack.slice(0, STACK_MAX_CHARS) : null,
    };
  }
  return { type: typeof err, message: String(err), stack: null };
}

export function recordSweepError(input: SweepErrorInput): void {
  const { type, message, stack } = describeError(input.error);
  getDb()
    .prepare(
      `INSERT INTO session_sweep_errors
         (session_id, agent_group_id, phase, error_type, error_message, stack, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.session_id,
      input.agent_group_id,
      input.phase,
      type,
      message,
      stack,
      new Date().toISOString(),
    );
}

/** Most recent N error rows for a session — useful for `/debug` skill output. */
export function getRecentSweepErrors(sessionId: string, limit = 20): SweepErrorRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM session_sweep_errors
        WHERE session_id = ?
        ORDER BY occurred_at DESC
        LIMIT ?`,
    )
    .all(sessionId, limit) as SweepErrorRow[];
}

export interface SweepErrorStat {
  session_id: string;
  phase: string;
  error_type: string | null;
  count: number;
  last_occurred_at: string;
}

/** Aggregate counts per (session, phase, error_type) since `since`. */
export function getSweepErrorStats(sinceIso?: string): SweepErrorStat[] {
  const cutoff = sinceIso ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return getDb()
    .prepare(
      `SELECT session_id,
              phase,
              error_type,
              COUNT(*) AS count,
              MAX(occurred_at) AS last_occurred_at
         FROM session_sweep_errors
        WHERE occurred_at >= ?
        GROUP BY session_id, phase, error_type
        ORDER BY count DESC, last_occurred_at DESC`,
    )
    .all(cutoff) as SweepErrorStat[];
}
