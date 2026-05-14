/**
 * agent_usage — captures token usage from every SDK `result` event.
 * Source of truth for "how much have we spent today, by model".
 *
 * Reads come via mcp__nanoclaw__get_usage so the bot can self-monitor.
 */
import { getOutboundDb } from './connection.js';

export interface AgentUsageRow {
  id?: number;
  ts: string;
  session_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
}

// CREATE IF NOT EXISTS per call (no module-level cache) — see model-decisions.ts.
export function ensureAgentUsageTable(): void {
  getOutboundDb().exec(`
    CREATE TABLE IF NOT EXISTS agent_usage (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      ts                  TEXT    NOT NULL,
      session_id          TEXT,
      model               TEXT    NOT NULL,
      input_tokens        INTEGER NOT NULL DEFAULT 0,
      output_tokens       INTEGER NOT NULL DEFAULT 0,
      cache_create_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_agent_usage_ts ON agent_usage(ts);
    CREATE INDEX IF NOT EXISTS idx_agent_usage_model ON agent_usage(model);
  `);
}

export function recordUsage(row: Omit<AgentUsageRow, 'id'>): void {
  ensureAgentUsageTable();
  getOutboundDb()
    .prepare(
      `INSERT INTO agent_usage
        (ts, session_id, model, input_tokens, output_tokens, cache_create_tokens, cache_read_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.ts,
      row.session_id,
      row.model,
      row.input_tokens,
      row.output_tokens,
      row.cache_create_tokens,
      row.cache_read_tokens,
    );
}

export type Window = 'today' | 'week' | 'all';

export interface UsageSummaryRow {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  turns: number;
}

function windowCutoff(window: Window): string | null {
  const now = Date.now();
  switch (window) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'week': {
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    case 'all':
      return null;
  }
}

export function getUsageSummary(window: Window, byModel = true): UsageSummaryRow[] {
  ensureAgentUsageTable();
  const cutoff = windowCutoff(window);
  const where = cutoff ? 'WHERE ts >= ?' : '';
  const groupBy = byModel ? 'GROUP BY model' : '';
  const select = byModel ? 'model' : `'all' AS model`;
  const sql = `
    SELECT ${select},
           COALESCE(SUM(input_tokens), 0)        AS input_tokens,
           COALESCE(SUM(output_tokens), 0)       AS output_tokens,
           COALESCE(SUM(cache_create_tokens), 0) AS cache_create_tokens,
           COALESCE(SUM(cache_read_tokens), 0)   AS cache_read_tokens,
           COALESCE(SUM(input_tokens + output_tokens + cache_create_tokens + cache_read_tokens), 0) AS total_tokens,
           COUNT(*)                              AS turns
    FROM agent_usage
    ${where}
    ${groupBy}
    ORDER BY total_tokens DESC
  `;
  const stmt = getOutboundDb().prepare(sql);
  const rows = (cutoff ? stmt.all(cutoff) : stmt.all()) as UsageSummaryRow[];
  return rows;
}
