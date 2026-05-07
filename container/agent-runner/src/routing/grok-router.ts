/**
 * GrokRouter — LLM-based router using xAI grok-3-mini.
 *
 * Classifies the incoming message and returns a RouteDecision.
 * Falls back to RuleRouter on any error or timeout.
 *
 * Enable with: NANOCLAW_ROUTER=grok
 * Requires: XAI_API_KEY (also checks GROK_API_KEY as fallback)
 */

import { RuleRouter } from './rule-router.js';
import type { Router, RouteContext, RouteDecision } from './types.js';
import { DEFAULT_DECISION } from './types.js';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-3-mini';
const TIMEOUT_MS = 10_000;

const MEDIA_INTENT_RE =
  /\b(create|generate|make|render|draw|design|produce|send)\s+(a\s+|an\s+|the\s+)?(poster|image|picture|photo|illustration|logo|banner|video|clip|voice|audio|speech|narration|tts|song|sound)\b|\bvoice\s+message\b|\btext[- ]to[- ]speech\b/i;

const SYSTEM_PROMPT = `You are a routing classifier for an AI agent. Given a user message, decide the best model and effort level.

Models available:
- claude-sonnet-4-6: balanced default. Use for most tasks — greetings, simple lookups, single-step commands, home automation, coding, analysis, multi-step work, general questions. Pair with effort=low for trivial acks/greetings.
- claude-opus-4-6: powerful reasoning. Use for hard debugging, security review, multi-file refactors, anything needing deep reasoning across many context items.
- claude-opus-4-7: newest, best at vision/audio/video and complex multi-step work. Prefer for any media generation/consumption (images, audio, video) and the most complex architecture/planning tasks.

Effort levels:
- low: minimal reasoning, fast
- medium: balanced (default)
- high: thorough reasoning
- xhigh: maximum reasoning, very expensive — only for genuinely hard problems

Reply with ONLY valid JSON (no markdown):
{"model":"<model-id>","effort":"<effort>","reason":"<10 words max>"}`;

function getXaiKey(): string | null {
  return (
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY ??
    null
  );
}

export class GrokRouter implements Router {
  readonly kind = 'grok' as const;
  private fallback = new RuleRouter();

  async route(ctx: RouteContext): Promise<RouteDecision> {
    // Inbound media (image/audio/video attachments) → Opus 4.7
    if (ctx.hasAttachment) {
      return { model: 'claude-opus-4-7', effort: 'high', rule: 'attachment-media' };
    }

    // Outbound media intent — user is asking the agent to PRODUCE
    // image/audio/video. Route to Opus 4.7 before the LLM classifier
    // so we never miss it on classifier latency or quota.
    if (MEDIA_INTENT_RE.test(ctx.message)) {
      return { model: 'claude-opus-4-7', effort: 'high', rule: 'media-intent' };
    }

    const apiKey = getXaiKey();
    const authHeaders: Record<string, string> = {};
    if (apiKey) authHeaders['Authorization'] = `Bearer ${apiKey}`;
    // If apiKey absent, OneCLI proxy injects Authorization for api.x.ai

    try {
      const res = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: ctx.message.slice(0, 800) },
          ],
          max_tokens: 80,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        console.error(`[grok-router] HTTP ${res.status}, falling back`);
        return this.fallback.route(ctx);
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
      const json = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(json) as {
        model?: string;
        effort?: string;
        reason?: string;
      };

      const validModels = ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-opus-4-7'];
      const validEfforts = ['low', 'medium', 'high', 'xhigh'];

      const model = validModels.includes(parsed.model ?? '')
        ? (parsed.model as RouteDecision['model'])
        : DEFAULT_DECISION.model;
      const effort = validEfforts.includes(parsed.effort ?? '')
        ? (parsed.effort as RouteDecision['effort'])
        : DEFAULT_DECISION.effort;

      return {
        model,
        effort,
        rule: 'grok-classify',
        reason: parsed.reason,
      };
    } catch (e) {
      console.error('[grok-router] Error, falling back:', e);
      return this.fallback.route(ctx);
    }
  }
}
