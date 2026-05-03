/**
 * Per-message model + effort routing.
 *
 * The router decides which Claude model and reasoning effort level to use
 * for each incoming message. Sonnet 4.6 / medium is the workhorse default;
 * Haiku handles cheap/short tasks; Opus handles planning, hard debugging,
 * and security review. A future router type ('grok') can replace the
 * rule-based default with an LLM classifier when an xAI key is provisioned.
 */

export type ModelId =
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh';

export type Executor = 'anthropic' | 'grok';

export interface RouteDecision {
  model: ModelId;
  effort: EffortLevel;
  executor: Executor;
  /** Short identifier for the matching rule, e.g. 'planning-keyword' or 'default'. */
  rule: string;
  /** Optional free-form reason for logs / debugging. */
  reason?: string;
}

export interface RouteContext {
  message: string;
  channel?: string | null;
  /** Used by per-channel overrides (e.g. trading channel → Grok executor). */
  channelType?: string | null;
}

export interface Router {
  readonly kind: 'rules' | 'grok';
  route(ctx: RouteContext): Promise<RouteDecision> | RouteDecision;
}

export const DEFAULT_DECISION: RouteDecision = {
  model: 'claude-sonnet-4-6',
  effort: 'medium',
  executor: 'anthropic',
  rule: 'default',
};
