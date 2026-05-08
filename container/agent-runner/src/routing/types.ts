export type ModelId =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-6'
  | 'claude-opus-4-7';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh';

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

export type MessageCategory =
  | 'greeting'
  | 'simple-task'
  | 'ha-control'
  | 'code'
  | 'complex-reasoning'
  | 'media'
  | 'research'
  | 'followup'
  | 'other';

export interface RouteContext {
  message: string;
  mediaKind: MediaKind | null;
}

export interface RouteDecision {
  model: ModelId;
  effort: EffortLevel;
  rule?: string;
  reason?: string;
  category?: MessageCategory;
}

export const DEFAULT_DECISION: RouteDecision = {
  model: 'claude-sonnet-4-6',
  effort: 'medium',
  rule: 'default',
};

export const VALID_MODELS: ModelId[] = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-7',
];

export const VALID_EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh'];

export const VALID_CATEGORIES: MessageCategory[] = [
  'greeting',
  'simple-task',
  'ha-control',
  'code',
  'complex-reasoning',
  'media',
  'research',
  'followup',
  'other',
];

export interface Router {
  readonly kind: string;
  route(ctx: RouteContext): Promise<RouteDecision>;
}

/**
 * A classifier returns null when it cannot make a determination
 * (transport error, parse failure, timeout). The composer treats
 * null as "fall through to per-agent default → global default."
 */
export interface Classifier {
  readonly kind: string;
  classify(ctx: RouteContext): Promise<RouteDecision | null>;
}

/**
 * Per-agent override config loaded from `groups/<folder>/routing.json`,
 * which is mounted into the container at `/workspace/agent/routing.json`.
 */
export interface RoutingOverrides {
  /**
   * `force` — always use `force.{model,effort}`. Bypass rules are skipped
   * unless `respectBypassRules` is explicitly true. Inline hint still wins.
   * `classify` — run the classifier; `default.{model,effort}` is the
   * fallback if the classifier returns null.
   */
  mode?: 'classify' | 'force';
  default?: { model: ModelId; effort: EffortLevel };
  force?: { model: ModelId; effort: EffortLevel };
  /**
   * Pattern-based escalation rules evaluated AFTER bypass rules and
   * AFTER force mode (so force is hard) but BEFORE the classifier.
   * Each rule is `match` (regex source) + decision.
   */
  intentRules?: Array<{
    match: string;
    flags?: string;
    model: ModelId;
    effort: EffortLevel;
    reason?: string;
  }>;
  /**
   * If `mode === 'force'`, controls whether bypass rules are still
   * evaluated. Default is `false` — force is hard.
   */
  respectBypassRules?: boolean;
}
