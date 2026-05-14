import { applyBypassRules } from './bypass-rules.js';
import { DefaultRouter } from './default-router.js';
import { parseInlineHint } from './inline-hint.js';
import { loadOverrides } from './overrides.js';
import type {
  Classifier,
  RouteContext,
  RouteDecision,
  Router,
} from './types.js';

/**
 * ComposedRouter — the 7-step routing pipeline. First non-null decision
 * wins. Order:
 *
 *   1. Inline hint              `[route:<model>,<effort>]` at message start
 *   2. Bypass rules             attachment / media-intent (skipped under
 *                               force mode unless `respectBypassRules:true`)
 *   3. Intent rules             from `routing.json` `intentRules[]` —
 *                               run BEFORE force so per-agent escalations
 *                               (e.g. chart keywords → opus-4-7/high) can
 *                               win over a force-mode floor
 *   4. Force mode               from `routing.json` `mode:"force"`
 *   5. Classifier               Haiku-based remote call
 *   6. Per-agent default        from `routing.json` `default`
 *   7. Global default           sonnet/medium
 */
export class ComposedRouter implements Router {
  readonly kind = 'composed' as const;
  private fallback: Router;

  constructor(
    private classifier: Classifier,
    fallback: Router = new DefaultRouter(),
  ) {
    this.fallback = fallback;
  }

  async route(ctx: RouteContext): Promise<RouteDecision> {
    // 1. Inline hint — beats everything (incl. force)
    const hint = parseInlineHint(ctx.message);
    if (hint) return hint.decision;

    const overrides = loadOverrides();
    const isForce = overrides?.mode === 'force';
    // Default for force mode is to ignore bypass rules ("force is hard").
    // Default for classify mode is to honor them.
    const respectBypass = overrides?.respectBypassRules ?? !isForce;

    // 2. Bypass rules
    if (respectBypass) {
      const bypass = applyBypassRules(ctx);
      if (bypass) return bypass;
    }

    // 3. Intent rules — run before force so per-agent escalations can
    //    upgrade above a force-mode floor (e.g. chart-keyword → opus-4-7).
    if (overrides?.intentRules) {
      for (const rule of overrides.intentRules) {
        try {
          if (new RegExp(rule.match, rule.flags ?? '').test(ctx.message)) {
            return {
              model: rule.model,
              effort: rule.effort,
              rule: 'intent-rule',
              reason: rule.reason ?? `match: ${rule.match}`,
            };
          }
        } catch {
          // Invalid regex was already filtered by loadOverrides, but keep
          // defensive in case the cache holds a bad rule somehow.
        }
      }
    }

    // 4. Force mode
    if (isForce && overrides?.force) {
      return {
        model: overrides.force.model,
        effort: overrides.force.effort,
        rule: 'force',
        reason: 'agent override mode=force',
      };
    }

    // 5. Classifier
    const classified = await this.classifier.classify(ctx);
    if (classified) return classified;

    // 6. Per-agent default
    if (overrides?.default) {
      return {
        model: overrides.default.model,
        effort: overrides.default.effort,
        rule: 'agent-default',
        reason: 'classifier null → agent default',
      };
    }

    // 7. Global default
    return this.fallback.route(ctx);
  }
}
