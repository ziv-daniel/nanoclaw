/**
 * Router selector — chooses the active router implementation based on
 * NANOCLAW_ROUTER env var. Defaults to the rule-based router (no
 * external dependencies).
 *
 * Future: when 'grok' router is implemented and the xAI secret is
 * provisioned, switching is a single env-var flip.
 */
import { RuleRouter } from './rule-router.js';
import type { Router } from './types.js';

let _router: Router | null = null;

export function getRouter(): Router {
  if (_router) return _router;
  const kind = (process.env.NANOCLAW_ROUTER || 'rules').toLowerCase();
  switch (kind) {
    case 'rules':
      _router = new RuleRouter();
      break;
    // case 'grok':  // Phase 2 — wired once xAI secret narrowed to Host: api.x.ai
    //   _router = new GrokRouter();
    //   break;
    default:
      console.error(`[routing] Unknown NANOCLAW_ROUTER='${kind}', falling back to 'rules'`);
      _router = new RuleRouter();
  }
  return _router;
}

export type { RouteContext, RouteDecision, Router, ModelId, EffortLevel, Executor } from './types.js';
