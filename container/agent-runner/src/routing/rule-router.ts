/**
 * Default rule-based router. Pure function over message text + channel —
 * no I/O, no API calls, instant. Replace with the Grok router (Phase 2)
 * once the xAI secret is provisioned in OneCLI.
 *
 * Rules are evaluated in priority order; the first match wins. The
 * matrix is intentionally small and explicit so it's easy to reason
 * about and audit.
 */
import type { RouteContext, RouteDecision, Router } from './types.js';

interface Rule {
  id: string;
  match: (text: string, ctx: RouteContext) => boolean;
  decision: Omit<RouteDecision, 'rule'>;
  reason: string;
}

const ACK_RE = /^(?:ok(?:ay)?|thanks?|thank you|thx|ty|ping|pong|got it|sure|yes|no|👍|👎|✅|❌|\?+|!+)$/i;
const STATUS_RE = /^(?:status|ping|health|alive|are you (?:there|alive|up))/i;
const SHORT_LOOKUP_RE = /^(?:what(?:'s| is) (?:the )?(?:time|date|weather|status))|^(?:show me|list|get)\s/i;

const PLANNING_RE = /\b(?:plan|design|architect(?:ure)?|approach|strategy|roadmap|outline)\b/i;
const HARD_DEBUG_RE = /\b(?:why is|why does|investigate|root cause|deep dive|analy[sz]e|diagnose|debug.*?(?:hard|stuck|complex))\b/i;
const SECURITY_RE = /\b(?:audit|security review|threat model|vulnerab|cve|leak|exploit|sanitize|secure(?:ly)?)\b/i;

const RULES: Rule[] = [
  {
    id: 'short-ack',
    match: (text) => ACK_RE.test(text.trim()),
    decision: { model: 'claude-haiku-4-5', effort: 'low', executor: 'anthropic' },
    reason: 'Trivial ack/short reply — fast, cheap.',
  },
  {
    id: 'status-check',
    match: (text) => STATUS_RE.test(text.trim()),
    decision: { model: 'claude-haiku-4-5', effort: 'medium', executor: 'anthropic' },
    reason: 'Status/health check — quick, low reasoning.',
  },
  {
    id: 'short-lookup',
    match: (text) => text.trim().length < 60 && SHORT_LOOKUP_RE.test(text.trim()),
    decision: { model: 'claude-haiku-4-5', effort: 'medium', executor: 'anthropic' },
    reason: 'Brief factual lookup — Haiku is enough.',
  },
  {
    id: 'planning',
    match: (text) => PLANNING_RE.test(text),
    decision: { model: 'claude-opus-4-6', effort: 'high', executor: 'anthropic' },
    reason: 'Planning/design task — Opus for deeper reasoning.',
  },
  {
    id: 'hard-debug',
    match: (text) => HARD_DEBUG_RE.test(text),
    decision: { model: 'claude-opus-4-6', effort: 'high', executor: 'anthropic' },
    reason: 'Investigation/root-cause work — Opus high effort.',
  },
  {
    id: 'security-review',
    match: (text) => SECURITY_RE.test(text),
    decision: { model: 'claude-opus-4-6', effort: 'high', executor: 'anthropic' },
    reason: 'Security review/audit — Opus high effort, multi-step verification.',
  },
];

export function ruleRoute(ctx: RouteContext): RouteDecision {
  const text = ctx.message ?? '';
  for (const rule of RULES) {
    if (rule.match(text, ctx)) {
      return { ...rule.decision, rule: rule.id, reason: rule.reason };
    }
  }
  return {
    model: 'claude-sonnet-4-6',
    effort: 'medium',
    executor: 'anthropic',
    rule: 'default',
    reason: 'Default workhorse — Sonnet medium handles general conversation and code edits.',
  };
}

export class RuleRouter implements Router {
  readonly kind = 'rules' as const;
  route(ctx: RouteContext): RouteDecision {
    return ruleRoute(ctx);
  }
}
