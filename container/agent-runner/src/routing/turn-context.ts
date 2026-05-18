import fs from 'fs';
import type { EffortLevel, ModelId, RouteDecision } from './types.js';

/**
 * Module-level "current turn's routing decision," set by poll-loop after
 * routing and cleared at the end of the turn. Read by `messages-out.ts`
 * to apply the `[model,effort]` prefix to any chat content emitted
 * during the turn — including messages sent through MCP tools
 * (`send_message`, `send_file`, `edit_message`, `ask_user_question`,
 * `send_card`) which would otherwise bypass the prefix.
 *
 * The poll-loop process sets the module variable directly. MCP tool
 * subprocesses can't see it (separate V8 isolate), so the decision is
 * also persisted to a file that `formatRoutePrefix` reads as fallback.
 */
let currentDecision: RouteDecision | null = null;

const ROUTE_DECISION_PATH = '/workspace/.route-decision.json';

export function setCurrentDecision(d: RouteDecision | null): void {
  currentDecision = d;
  try {
    if (d) {
      fs.writeFileSync(ROUTE_DECISION_PATH, JSON.stringify(d));
    } else {
      fs.unlinkSync(ROUTE_DECISION_PATH);
    }
  } catch { /* ignore — file ops are best-effort */ }
}

export function getCurrentDecision(): RouteDecision | null {
  return currentDecision;
}

export function shortModelLabel(model: ModelId | string): string {
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model;
}

/**
 * Format the route prefix that gets prepended to outbound chat text.
 * Example: `[opus,high]\n`. Returns null when no decision is active.
 *
 * Falls back to the shared file when the module variable is null —
 * this is the normal path for MCP tool subprocesses.
 */
export function formatRoutePrefix(d: RouteDecision | null = currentDecision): string | null {
  let decision = d;
  if (!decision) {
    try {
      decision = JSON.parse(fs.readFileSync(ROUTE_DECISION_PATH, 'utf-8'));
    } catch { /* no file or parse error — no prefix */ }
  }
  if (!decision) return null;
  return `[${shortModelLabel(decision.model)},${decision.effort}]\n`;
}

/**
 * True if `text` already starts with our prefix shape — used by the
 * messages-out wrapper to avoid double-prefixing if a caller has
 * already applied one.
 */
const PREFIX_RE = /^\[(opus|sonnet|haiku)(?:[\w-]*),(low|medium|high|xhigh)\]\n/;

export function hasRoutePrefix(text: string): boolean {
  return PREFIX_RE.test(text);
}

/** Test helper — exposes the regex for explicit assertions. */
export function _routePrefixPattern(): RegExp {
  return PREFIX_RE;
}

// Re-export types for convenience to consumers that only import turn-context.
export type { ModelId, EffortLevel, RouteDecision };
