import {
  VALID_CATEGORIES,
  VALID_EFFORTS,
  VALID_MODELS,
  type Classifier,
  type EffortLevel,
  type MessageCategory,
  type ModelId,
  type RouteContext,
  type RouteDecision,
} from './types.js';

/**
 * HaikuClassifier — calls Anthropic Messages API with Claude Haiku 4.5,
 * forced to emit a structured tool_use response so we never have to
 * regex-parse free-form JSON.
 *
 * Auth: relies on the OneCLI proxy (HTTPS_PROXY env var set on the
 * container) injecting the Anthropic credential for `api.anthropic.com`.
 * No API key is read from process env here.
 *
 * Returns null on any error / timeout — the composer treats null as
 * "use per-agent default → global default."
 *
 * IMPORTANT: Haiku is reserved EXCLUSIVELY for classification. It is
 * never returned as a routing target. The lint test
 * `routing/haiku-guard.test.ts` enforces this invariant.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const HAIKU_MODEL = 'claude-haiku-4-5';
const TIMEOUT_MS = 5_000;

const SYSTEM_PROMPT = `You are a routing classifier for an AI agent.
Decide what model + reasoning effort to assign to the user's message.

Models available:
- claude-sonnet-4-6: balanced default. Use for greetings, simple lookups, single-step commands, home automation, day-to-day coding, analysis, multi-step work, general questions. Pair with effort=low for trivial acks/greetings.
- claude-opus-4-6: deep reasoning. Use for hard debugging, security review, multi-file refactors, anything needing broad context.
- claude-opus-4-7: best for vision/audio/video, complex media generation/orchestration, very-long-horizon planning.

Effort levels:
- low: snap reply, minimal reasoning
- medium: balanced (default)
- high: thorough reasoning — chart analysis, code debugging, investigations, screen-recording analysis
- xhigh: maximum reasoning — genuinely hard architecture / multi-file refactors only (very expensive)

Always call the classify_message tool with your decision. Reason in 10 words max.`;

const TOOL = {
  name: 'classify_message',
  description: 'Return the routing decision for the user message.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: VALID_CATEGORIES,
        description: 'Best-fit category for telemetry/observability',
      },
      model: {
        type: 'string',
        enum: VALID_MODELS,
        description: 'Target Claude model id',
      },
      effort: {
        type: 'string',
        enum: VALID_EFFORTS,
        description: 'Reasoning budget level',
      },
      reason: {
        type: 'string',
        description: 'Why this routing was picked (10 words max)',
      },
    },
    required: ['category', 'model', 'effort'],
  },
};

interface AnthropicResponse {
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  >;
}

function isModel(s: unknown): s is ModelId {
  return typeof s === 'string' && (VALID_MODELS as readonly string[]).includes(s);
}
function isEffort(s: unknown): s is EffortLevel {
  return typeof s === 'string' && (VALID_EFFORTS as readonly string[]).includes(s);
}
function isCategory(s: unknown): s is MessageCategory {
  return typeof s === 'string' && (VALID_CATEGORIES as readonly string[]).includes(s);
}

export class HaikuClassifier implements Classifier {
  readonly kind = 'haiku-classifier' as const;

  async classify(ctx: RouteContext): Promise<RouteDecision | null> {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': ANTHROPIC_VERSION,
          // OneCLI's `type=anthropic` credential injection rewrites the
          // value of an existing Authorization header for api.anthropic.com.
          // If the header is absent the proxy returns 401 instead of
          // injecting one. Same pattern the Claude SDK uses with
          // CLAUDE_CODE_OAUTH_TOKEN=placeholder.
          'Authorization': 'Bearer placeholder',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: ctx.message.slice(0, 800) }],
          tools: [TOOL],
          tool_choice: { type: 'tool', name: 'classify_message' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        console.error(`[haiku-classifier] HTTP ${res.status} — falling through`);
        return null;
      }

      const data = (await res.json()) as AnthropicResponse;
      const toolUse = data.content?.find(
        (b): b is Extract<NonNullable<AnthropicResponse['content']>[number], { type: 'tool_use' }> =>
          b.type === 'tool_use' && b.name === 'classify_message',
      );
      if (!toolUse) {
        console.error('[haiku-classifier] no tool_use block in response');
        return null;
      }

      const input = toolUse.input;
      if (!isModel(input.model) || !isEffort(input.effort)) {
        console.error(`[haiku-classifier] invalid model/effort: ${String(input.model)}/${String(input.effort)}`);
        return null;
      }

      return {
        model: input.model,
        effort: input.effort,
        category: isCategory(input.category) ? input.category : undefined,
        rule: 'haiku-classify',
        reason: typeof input.reason === 'string' ? input.reason : undefined,
      };
    } catch (e) {
      console.error('[haiku-classifier] Error:', e instanceof Error ? e.message : String(e));
      return null;
    }
  }
}
