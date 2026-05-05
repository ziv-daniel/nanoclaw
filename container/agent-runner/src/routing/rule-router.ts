import type { Router, RouteContext, RouteDecision } from './types.js';
import { DEFAULT_DECISION } from './types.js';

/**
 * Fallback router — always returns Sonnet/medium.
 * Used when GrokRouter has no API key or times out.
 */
export class RuleRouter implements Router {
  readonly kind = 'rule' as const;

  async route(_ctx: RouteContext): Promise<RouteDecision> {
    return DEFAULT_DECISION;
  }
}
