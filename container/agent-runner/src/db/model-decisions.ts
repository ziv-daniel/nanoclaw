/**
 * model_decisions — one row per routing call. Lets the bot self-explain
 * ("why did you pick opus here?") via mcp__nanoclaw__get_routing_history,
 * and lets us A/B router rules over time.
 *
 * Stored in outbound.db (the container is the sole writer).
 */
import { getOutboundDb } from './connection.js';

export interface ModelDecisionRow {
  id?: number;
  ts: string;
  message_id: string | null;
  channel_type: string | null;
  model: string;
  effort: string;
  executor: string;
  rule: string;
  reason: string | null;
  message_excerpt: string;
  decided_by: 'rules' | 'grok';
}

// CREATE IF NOT EXISTS is cheap; we run it per-call rather than caching
// a "_initDone" flag because tests open + close session DBs repeatedly
// and a stale module-level flag would skip table creation on the new DB.
export function ensureModelDecisionsTable(): void {
  getOutboundDb().exec(`
    CREATE TABLE IF NOT EXISTS model_decisions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ts              TEXT    NOT NULL,
      message_id      TEXT,
      channel_type    TEXT,
      model           TEXT    NOT NULL,
      effort          TEXT    NOT NULL,
      executor        TEXT    NOT NULL,
      rule            TEXT    NOT NULL,
      reason          TEXT,
      message_excerpt TEXT    NOT NULL,
      decided_by      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_model_decisions_ts ON model_decisions(ts);
  `);
}

export function recordModelDecision(row: Omit<ModelDecisionRow, 'id'>): void {
  ensureModelDecisionsTable();
  getOutboundDb()
    .prepare(
      `INSERT INTO model_decisions
        (ts, message_id, channel_type, model, effort, executor, rule, reason, message_excerpt, decided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.ts,
      row.message_id,
      row.channel_type,
      row.model,
      row.effort,
      row.executor,
      row.rule,
      row.reason,
      row.message_excerpt,
      row.decided_by,
    );
}

export interface RoutingHistoryRow {
  ts: string;
  model: string;
  effort: string;
  rule: string;
  reason: string | null;
  message_excerpt: string;
  channel_type: string | null;
  decided_by: string;
}

export function getRoutingHistory(limit = 25): RoutingHistoryRow[] {
  ensureModelDecisionsTable();
  return getOutboundDb()
    .prepare(
      `SELECT ts, model, effort, rule, reason, message_excerpt, channel_type, decided_by
       FROM model_decisions
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(limit) as RoutingHistoryRow[];
}
