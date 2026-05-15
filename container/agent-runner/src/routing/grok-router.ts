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

const SYSTEM_PROMPT = `You are a routing classifier for an AI agent. Given a user message, decide the best model and effort level.

IMPORTANT: Default to claude-sonnet-4-6 unless there is a clear reason not to.

Models available (in order of preference):
- claude-sonnet-4-6: THE DEFAULT. Use for: all general tasks, conversations, code help, analysis, summaries, Hebrew responses, trading data formatting, status reports, multi-step work, and anything not explicitly listed below.
- claude-haiku-4-5-20251001: ONLY for clearly trivial tasks: single-word lookups, one-line factual answers, very short Hebrew questions (under 30 characters), simple yes/no questions. When in doubt, use Sonnet instead.
- claude-opus-4-7: EXTREMELY RARE. Use ONLY when: (a) the task explicitly requires vision/image analysis with MULTIPLE images, OR (b) the context is extremely large (>80k tokens) and needs maximum capability, OR (c) the user explicitly requests Opus by name. Never select Opus just because a task seems complex — Sonnet handles complex tasks well.

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
    // Attachments go to Sonnet by default — sufficient for single-image analysis
    if (ctx.hasAttachment) {
      return { model: 'claude-sonnet-4-6', effort: 'medium', rule: 'attachment' };
    }

    const apiKey = getXaiKey();
    if (!apiKey) {
      console.error('[grok-router] No xAI API key found, falling back to rules');
      return this.fallback.route(ctx);
    }

    try {
      const res = await fetch(XAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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

      const validModels = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'];
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
