import type { EffortLevel, ModelId, RouteDecision } from './types.js';

/**
 * Module-level "current turn's routing decision," set by poll-loop after
 * routing and cleared at the end of the turn. Read by `messages-out.ts`
 * to apply the `[model,effort]` prefix to any chat content emitted
 * during the turn — including messages sent through MCP tools
 * (`send_message`, `send_file`, `edit_message`, `ask_user_question`,
 * `send_card`) which would otherwise bypass the prefix.
 *
 * The poll-loop is single-threaded (one `processQuery` at a time per
 * container), so a plain module variable is sufficient — no
 * AsyncLocalStorage needed.
 */
let currentDecision: RouteDecision | null = null;

export function setCurrentDecision(d: RouteDecision | null): void {
  currentDecision = d;
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
 */
export function formatRoutePrefix(d: RouteDecision | null = currentDecision): string | null {
  if (!d) return null;
  return `[${shortModelLabel(d.model)},${d.effort}]\n`;
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
