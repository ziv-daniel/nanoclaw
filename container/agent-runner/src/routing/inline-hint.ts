import {
  VALID_EFFORTS,
  VALID_MODELS,
  type EffortLevel,
  type ModelId,
  type RouteDecision,
} from './types.js';

/**
 * Inline routing hint syntax: `[route:<model>,<effort>]` at the start
 * of a message. Beats every other rule (incl. force mode) — explicit
 * overrides everything. Useful when the agent schedules a task and
 * wants to pre-declare the model/effort for that task's wake-up.
 *
 * Accepts both full ids (`claude-opus-4-7`) and short forms
 * (`opus-4-7`, `opus`, `sonnet`) for ergonomics.
 */
const HINT_RE = /^\s*\[\s*route\s*:\s*([^,\]]+?)\s*,\s*([^\]]+?)\s*\]\s*\n?/i;

const MODEL_ALIASES: Record<string, ModelId> = {
  sonnet: 'claude-sonnet-4-6',
  'sonnet-4-6': 'claude-sonnet-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
  'opus-4-6': 'claude-opus-4-6',
  'claude-opus-4-6': 'claude-opus-4-6',
  'opus-4-7': 'claude-opus-4-7',
  'claude-opus-4-7': 'claude-opus-4-7',
};

function normalizeModel(raw: string): ModelId | null {
  const lower = raw.toLowerCase().trim();
  return MODEL_ALIASES[lower] ?? (VALID_MODELS.includes(lower as ModelId) ? (lower as ModelId) : null);
}

function normalizeEffort(raw: string): EffortLevel | null {
  const lower = raw.toLowerCase().trim();
  return VALID_EFFORTS.includes(lower as EffortLevel) ? (lower as EffortLevel) : null;
}

export interface ParsedHint {
  decision: RouteDecision;
  /** The message with the hint prefix stripped — safe to pass to the model. */
  stripped: string;
}

export function parseInlineHint(message: string): ParsedHint | null {
  const m = message.match(HINT_RE);
  if (!m) return null;
  const model = normalizeModel(m[1]);
  const effort = normalizeEffort(m[2]);
  if (!model || !effort) return null;
  return {
    decision: {
      model,
      effort,
      rule: 'inline-hint',
      reason: `inline [route:${m[1]},${m[2]}]`,
    },
    stripped: message.slice(m[0].length),
  };
}
