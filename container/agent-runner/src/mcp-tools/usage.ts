/**
 * Usage MCP tools — let the bot self-monitor token spend and explain
 * its own routing decisions.
 *
 * - get_usage: aggregate token usage by model for a window (today / week / all).
 * - get_routing_history: most recent routing decisions with the rule that fired.
 *
 * Both read from outbound.db (which the container owns); no external API
 * calls, instant responses.
 */
import { getUsageSummary, type UsageSummaryRow } from '../db/agent-usage.js';
import { getRoutingHistory } from '../db/model-decisions.js';
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function summarizeUsage(rows: UsageSummaryRow[]): string {
  if (rows.length === 0) return 'No usage recorded.';
  const lines: string[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalCacheCreate = 0;
  let totalCacheRead = 0;
  let totalTurns = 0;
  for (const r of rows) {
    lines.push(
      `  ${r.model}: ${fmt(r.input_tokens)} in / ${fmt(r.output_tokens)} out` +
        ` (cache: ${fmt(r.cache_create_tokens)} create, ${fmt(r.cache_read_tokens)} read)` +
        ` — ${r.turns} turns`,
    );
    totalIn += r.input_tokens;
    totalOut += r.output_tokens;
    totalCacheCreate += r.cache_create_tokens;
    totalCacheRead += r.cache_read_tokens;
    totalTurns += r.turns;
  }
  lines.push('');
  lines.push(`Total: ${fmt(totalIn)} in / ${fmt(totalOut)} out / ${fmt(totalCacheCreate + totalCacheRead)} cached, ${totalTurns} turns`);
  return lines.join('\n');
}

export const getUsage: McpToolDefinition = {
  tool: {
    name: 'get_usage',
    description:
      'Report this agent\'s token usage from the local outbound.db. Use when the user asks "how much have I used", "what model is burning quota", or wants a quick spend report. Does not query Anthropic — only what this container has logged.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        window: {
          type: 'string',
          enum: ['today', 'week', 'all'],
          description: 'Time window to aggregate over. Defaults to "today".',
        },
        by_model: {
          type: 'boolean',
          description: 'If true (default), break out totals per model. If false, return one combined row.',
        },
      },
    },
  },
  async handler(args) {
    const window = (args.window as 'today' | 'week' | 'all') || 'today';
    const byModel = args.by_model === undefined ? true : Boolean(args.by_model);
    const rows = getUsageSummary(window, byModel);
    return ok(`Usage (${window}):\n${summarizeUsage(rows)}`);
  },
};

export const getRoutingHistoryTool: McpToolDefinition = {
  tool: {
    name: 'get_routing_history',
    description:
      'Show the most recent model+effort routing decisions made by this agent. Use to explain "why did you pick opus for this question" or to audit whether the router is making sensible choices.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent decisions to return. Defaults to 10, max 100.',
        },
      },
    },
  },
  async handler(args) {
    const limitIn = typeof args.limit === 'number' ? args.limit : 10;
    const limit = Math.max(1, Math.min(100, Math.floor(limitIn)));
    const rows = getRoutingHistory(limit);
    if (rows.length === 0) return ok('No routing decisions logged yet.');
    const lines = rows.map(
      (r) =>
        `${r.ts}  ${r.model} · ${r.effort}  rule=${r.rule}  by=${r.decided_by}` +
        (r.channel_type ? `  ch=${r.channel_type}` : '') +
        `\n    "${r.message_excerpt.slice(0, 120).replace(/\n/g, ' ')}"` +
        (r.reason ? `\n    why: ${r.reason}` : ''),
    );
    return ok(`Recent routing decisions (newest first):\n\n${lines.join('\n\n')}`);
  },
};

registerTools([getUsage, getRoutingHistoryTool]);
