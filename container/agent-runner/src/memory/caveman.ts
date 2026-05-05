/**
 * Caveman — lightweight context pre-processor.
 *
 * Calls Haiku with a short prompt to classify the incoming message and
 * produce a behavioral directive that gets injected into system instructions.
 * The directive shapes HOW the agent responds (not just routing metadata).
 *
 * Budget: ~200 input tokens + 80 output tokens. 4 s timeout, null on failure.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CAVEMAN_MODEL = 'claude-haiku-4-5-20251001';
const CAVEMAN_TIMEOUT_MS = 4000;

export type TaskType =
  | 'continuation'
  | 'new-task'
  | 'short-question'
  | 'status-check'
  | 'command'
  | 'unclear';

export interface CavemanSummary {
  taskType: TaskType;
  /** One-line behavioral directive injected into system instructions. */
  directive: string;
  /** Optional compressed context hint for routing / logging. */
  hint?: string;
}

const DIRECTIVE_MAP: Record<TaskType, string> = {
  'continuation':
    'Respond directly — context is already known, skip re-establishing background.',
  'new-task':
    'This is a fresh task. State your plan briefly, then execute.',
  'short-question':
    'Answer concisely. One paragraph max. No preamble.',
  'status-check':
    'Give a compact status summary. Bullets preferred, no narrative padding.',
  'command':
    'Execute the command. Report result only — no commentary unless something failed.',
  'unclear':
    'Request is ambiguous. Ask the single clarifying question that unblocks you most.',
};

const CLASSIFY_PROMPT = `Classify the user message into exactly one task type:
- continuation: follows directly from prior context (references "it", "that", "the thing", continuation words)
- new-task: starts a distinct new piece of work
- short-question: a factual or quick lookup question
- status-check: asking for current state, progress, or health
- command: a direct imperative (deploy, restart, send, delete, etc.)
- unclear: too vague to classify confidently

Reply with ONLY a JSON object: {"taskType":"<type>","hint":"<10 words max describing what they want>"}
No markdown, no explanation.`;

export async function runCaveman(
  message: string,
  apiKey: string,
): Promise<CavemanSummary | null> {
  const truncated = message.slice(0, 600);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CAVEMAN_MODEL,
        max_tokens: 80,
        messages: [
          { role: 'user', content: `${CLASSIFY_PROMPT}\n\nMessage: ${truncated}` },
        ],
      }),
      signal: AbortSignal.timeout(CAVEMAN_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = data.content?.find(c => c.type === 'text')?.text?.trim() ?? '';

    // Strip markdown fences if model misbehaves
    const json = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(json) as { taskType?: string; hint?: string };
    const taskType = (parsed.taskType ?? 'unclear') as TaskType;

    return {
      taskType,
      directive: DIRECTIVE_MAP[taskType] ?? DIRECTIVE_MAP.unclear,
      hint: parsed.hint,
    };
  } catch {
    return null;
  }
}
