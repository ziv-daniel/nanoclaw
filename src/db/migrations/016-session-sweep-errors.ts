/**
 * Persist a row per per-session sweep / delivery error so operators can
 * answer "did anything crash, and which session caused it?" after the fact.
 *
 * Context: host-sweep.ts and delivery.ts both iterate `getActiveSessions()`
 * inside a single try/catch. One bad session (e.g. an `outbound.db` with no
 * `messages_out` table) throws and aborts the entire tick — every later
 * session loses service for that interval. Wrapping each session in its own
 * try/catch keeps the rest of the loop alive; persisting the error here
 * means the post-mortem doesn't have to grep log files.
 */
import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration016: Migration = {
  version: 16,
  name: 'session-sweep-errors',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_sweep_errors (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id      TEXT    NOT NULL,
        agent_group_id  TEXT,
        phase           TEXT    NOT NULL,
        error_type      TEXT,
        error_message   TEXT,
        stack           TEXT,
        occurred_at     TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_sweep_errors_session
        ON session_sweep_errors(session_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_sweep_errors_occurred
        ON session_sweep_errors(occurred_at DESC);
    `);
  },
};
