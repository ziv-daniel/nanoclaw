export type ModelId =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh';

export interface RouteContext {
  message: string;
  hasAttachment: boolean;
}

export interface RouteDecision {
  model: ModelId;
  effort: EffortLevel;
  rule?: string;
  reason?: string;
}

export const DEFAULT_DECISION: RouteDecision = {
  model: 'claude-sonnet-4-6',
  effort: 'medium',
  rule: 'default',
};

export interface Router {
  readonly kind: string;
  route(ctx: RouteContext): Promise<RouteDecision>;
}
