import fs from 'fs';

import {
  VALID_EFFORTS,
  VALID_MODELS,
  type EffortLevel,
  type ModelId,
  type RoutingOverrides,
} from './types.js';

/**
 * Per-agent routing overrides loaded from the file mounted into the
 * container at `/workspace/agent/routing.json` (corresponds to
 * `groups/<folder>/routing.json` on the host).
 *
 * `NANOCLAW_ROUTING_JSON` env var overrides the path for tests / non-
 * default deployments. Read fresh on each `loadOverrides()` call so the
 * test setup can mutate it after module load.
 */
const DEFAULT_ROUTING_JSON_PATH = '/workspace/agent/routing.json';

function routingJsonPath(): string {
  return process.env.NANOCLAW_ROUTING_JSON ?? DEFAULT_ROUTING_JSON_PATH;
}

let cached: { path: string; value: RoutingOverrides | null } | null = null;

function log(msg: string): void {
  console.error(`[routing-overrides] ${msg}`);
}

const VALID_REGEX_FLAGS = new Set(['i', 'm', 's', 'u', 'y', 'g']);

/**
 * JS RegExp doesn't accept Python/Perl-style inline flag groups like `(?i)`.
 * Strip a leading `(?<flags>)` token off the pattern and merge it with any
 * explicit `flags` field. Unknown flag chars are dropped silently — the
 * subsequent `new RegExp(...)` call will throw if the residual is invalid.
 */
function stripInlineFlags(rawMatch: string, explicitFlags: string): { pattern: string; flags: string } {
  const flagSet = new Set<string>();
  for (const c of explicitFlags) if (VALID_REGEX_FLAGS.has(c)) flagSet.add(c);
  let pattern = rawMatch;
  const inline = pattern.match(/^\(\?([a-z]+)\)/i);
  if (inline) {
    for (const c of inline[1].toLowerCase()) if (VALID_REGEX_FLAGS.has(c)) flagSet.add(c);
    pattern = pattern.slice(inline[0].length);
  }
  return { pattern, flags: Array.from(flagSet).join('') };
}

function isModel(s: unknown): s is ModelId {
  return typeof s === 'string' && (VALID_MODELS as readonly string[]).includes(s);
}

function isEffort(s: unknown): s is EffortLevel {
  return typeof s === 'string' && (VALID_EFFORTS as readonly string[]).includes(s);
}

function validateOverrides(raw: unknown, source: string): RoutingOverrides | null {
  if (!raw || typeof raw !== 'object') {
    log(`${source}: not an object — ignoring`);
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const out: RoutingOverrides = {};

  if (obj.mode === 'force' || obj.mode === 'classify') {
    out.mode = obj.mode;
  } else if (obj.mode !== undefined) {
    log(`${source}: invalid mode "${String(obj.mode)}" — ignoring (expected force|classify)`);
  }

  for (const key of ['default', 'force'] as const) {
    const v = obj[key];
    if (!v || typeof v !== 'object') continue;
    const vv = v as Record<string, unknown>;
    if (isModel(vv.model) && isEffort(vv.effort)) {
      out[key] = { model: vv.model, effort: vv.effort };
    } else {
      log(`${source}: invalid ${key}.model/effort (${String(vv.model)}/${String(vv.effort)}) — ignoring this section`);
    }
  }

  if (Array.isArray(obj.intentRules)) {
    const rules: NonNullable<RoutingOverrides['intentRules']> = [];
    for (const r of obj.intentRules) {
      if (!r || typeof r !== 'object') continue;
      const rr = r as Record<string, unknown>;
      const rawMatch = typeof rr.match === 'string' ? rr.match : '';
      if (!rawMatch || !isModel(rr.model) || !isEffort(rr.effort)) {
        log(`${source}: skipping invalid intent rule (match=${rawMatch}, model=${String(rr.model)}, effort=${String(rr.effort)})`);
        continue;
      }
      const explicitFlags = typeof rr.flags === 'string' ? rr.flags : '';
      const { pattern, flags } = stripInlineFlags(rawMatch, explicitFlags);
      try {
        new RegExp(pattern, flags);
      } catch {
        log(`${source}: invalid regex "${rawMatch}" — skipping`);
        continue;
      }
      rules.push({
        match: pattern,
        ...(flags ? { flags } : {}),
        model: rr.model,
        effort: rr.effort,
        reason: typeof rr.reason === 'string' ? rr.reason : undefined,
      });
    }
    if (rules.length > 0) out.intentRules = rules;
  }

  if (typeof obj.respectBypassRules === 'boolean') {
    out.respectBypassRules = obj.respectBypassRules;
  }

  return out;
}

export function loadOverrides(): RoutingOverrides | null {
  const path = routingJsonPath();
  if (cached && cached.path === path) return cached.value;
  try {
    if (!fs.existsSync(path)) {
      cached = { path, value: null };
      return null;
    }
    const raw = fs.readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = validateOverrides(parsed, path);
    cached = { path, value: validated };
    if (validated) {
      log(
        `Loaded overrides from ${path}: mode=${validated.mode ?? '(none)'} rules=${validated.intentRules?.length ?? 0}`,
      );
    }
    return validated;
  } catch (e) {
    log(`Failed to load ${path}: ${e instanceof Error ? e.message : String(e)}`);
    cached = { path, value: null };
    return null;
  }
}

/** Reset the cache — for tests only. */
export function _resetOverridesCacheForTests(): void {
  cached = null;
}
