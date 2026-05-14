import type { RouteContext, RouteDecision, Router } from './types.js';
import { DEFAULT_DECISION } from './types.js';

/**
 * Final fallback router — always returns `DEFAULT_DECISION` (sonnet/medium).
 * Used when the classifier returns null and no per-agent default is set.
 */
export class DefaultRouter implements Router {
  readonly kind = 'default' as const;

  async route(_ctx: RouteContext): Promise<RouteDecision> {
    return DEFAULT_DECISION;
  }
}
