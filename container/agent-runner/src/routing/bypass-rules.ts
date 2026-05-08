import type { RouteContext, RouteDecision } from './types.js';

/**
 * Outbound media-intent regex — the user is asking the agent to
 * PRODUCE an image / video / audio / poster. Lower effort than
 * inbound media analysis: producing media is a tool-call + prompt-
 * craft job, not deep reasoning.
 */
const MEDIA_INTENT_RE =
  /\b(create|generate|make|render|draw|design|produce|send)\s+(a\s+|an\s+|the\s+)?(poster|image|picture|photo|illustration|logo|banner|video|clip|voice|audio|speech|narration|tts|song|sound)\b|\bvoice\s+message\b|\btext[- ]to[- ]speech\b/i;

/**
 * Hard bypass rules — short-circuit the classifier when the routing
 * decision is determined by message shape rather than content nuance.
 *
 * Asymmetry note: inbound media (user attached an image / screen
 * recording / PDF) goes high-effort because we're reasoning OVER the
 * media. Outbound media production (user asks the agent to MAKE one)
 * goes medium — capability matters, deep reasoning rarely does.
 *
 * Returns null when no rule fires (let the composer continue with
 * per-agent overrides / classifier).
 */
export function applyBypassRules(ctx: RouteContext): RouteDecision | null {
  switch (ctx.mediaKind) {
    case 'image':
    case 'video':
      return {
        model: 'claude-opus-4-7',
        effort: 'high',
        rule: 'attachment-media',
        reason: `inbound ${ctx.mediaKind} → opus-4-7/high`,
      };
    case 'audio':
      return {
        model: 'claude-sonnet-4-6',
        effort: 'medium',
        rule: 'attachment-audio',
        reason: 'voice message → sonnet/medium',
      };
    case 'document':
      return {
        model: 'claude-opus-4-6',
        effort: 'medium',
        rule: 'attachment-document',
        reason: 'document attachment → opus-4-6/medium',
      };
  }

  if (MEDIA_INTENT_RE.test(ctx.message)) {
    return {
      model: 'claude-opus-4-7',
      effort: 'medium',
      rule: 'media-intent',
      reason: 'outbound media production → opus-4-7/medium',
    };
  }

  return null;
}
