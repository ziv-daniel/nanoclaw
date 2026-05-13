import type { MediaKind, RouteDecision } from './types.js';

/**
 * Cap Opus effort at medium system-wide to prevent runaway quota burn.
 *
 * Context: a classifier retry loop emitting Opus/high decisions consumed
 * a full daily API quota in ~22 minutes. `effort=high|xhigh` on Opus is
 * disallowed unless one of:
 *   - the decision came from `force` mode (explicit per-agent override
 *     in `routing.json` — operator already opted in), OR
 *   - the batch carries a video attachment (analysis OVER a video is the
 *     one case where deep reasoning is justified).
 *
 * Runs after the full routing pipeline so it sees the final decision
 * regardless of which step (inline hint, bypass rule, intent rule,
 * classifier, default) produced it.
 */
export function enforceOpusEffortCap(
  decision: RouteDecision,
  mediaKind: MediaKind | null,
): RouteDecision {
  if (decision.rule === 'force') return decision;

  const isOpus =
    decision.model === 'claude-opus-4-6' ||
    decision.model === 'claude-opus-4-7';
  const isHighEffort =
    decision.effort === 'high' || decision.effort === 'xhigh';

  if (!isOpus || !isHighEffort) return decision;
  if (mediaKind === 'video') return decision;

  const note = `opus-effort-capped from ${decision.effort}`;
  return {
    ...decision,
    effort: 'medium',
    reason: decision.reason ? `${decision.reason} [${note}]` : note,
  };
}
