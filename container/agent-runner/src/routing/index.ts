import { GrokRouter } from './grok-router.js';
import type { Router } from './types.js';

let _router: Router | null = null;

/**
 * Returns the shared router instance.
 * Always GrokRouter — which falls back to RuleRouter internally if no XAI_API_KEY.
 */
export function getRouter(): Router {
  if (!_router) _router = new GrokRouter();
  return _router;
}
