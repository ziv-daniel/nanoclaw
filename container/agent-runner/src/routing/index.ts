import { ComposedRouter } from './composer.js';
import { HaikuClassifier } from './haiku-classifier.js';
import type { Router } from './types.js';

let _router: Router | null = null;

/**
 * Returns the shared router instance.
 *
 * Pipeline: ComposedRouter wraps the HaikuClassifier with the full
 * 7-step decision pipeline (inline hint → bypass rules → force → intent
 * rules → Haiku classifier → per-agent default → global default).
 *
 * Haiku is used for classification only — it is never returned as a
 * routing target.
 */
export function getRouter(): Router {
  if (!_router) _router = new ComposedRouter(new HaikuClassifier());
  return _router;
}

/** Test helper: replace the router instance (e.g. with a stub classifier). */
export function _setRouterForTests(router: Router): void {
  _router = router;
}

/** Test helper: reset the router so the next `getRouter()` rebuilds it. */
export function _resetRouterForTests(): void {
  _router = null;
}
