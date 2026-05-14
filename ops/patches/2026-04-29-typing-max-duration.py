#!/usr/bin/env python3
"""Add a hard wall-clock cap to the typing-indicator refresh.

The existing logic in src/modules/typing/index.ts stops automatically when
the heartbeat goes stale, but if an agent is stuck "alive" (heartbeat
fresh because SDK is still grinding, but no message ever delivered),
typing keeps refreshing forever. After today's MAX_LIFETIME_MS host-sweep
fix the underlying stuck case is much rarer, but a defense-in-depth cap
on the typing refresh itself prevents the symptom regardless of cause.

Adds:
  - TYPING_MAX_DURATION_MS const (default 10 min, env NANOCLAW_TYPING_MAX_MS)
  - Inside the interval callback: if Date.now() - entry.startedAt > cap,
    stop refreshing.

Idempotent.

Run on host:
    python3 ops/patches/2026-04-29-typing-max-duration.py /opt/nanoclaw-v2
"""
import sys
from pathlib import Path

PREFIX = sys.argv[1] if len(sys.argv) > 1 else '/opt/nanoclaw-v2'
TYPING = Path(f'{PREFIX}/src/modules/typing/index.ts')


def patch(label: str, old: str, new: str, marker: str, path: Path = TYPING) -> None:
    text = path.read_text()
    if marker in text:
        print(f'{label}: marker present, skipping')
        return
    if old not in text:
        raise SystemExit(f'{label}: anchor not found')
    path.write_text(text.replace(old, new))
    print(f'{label}: edited')


# 1. Add the cap constant near the other typing constants.
patch(
    'typing/index.ts/TYPING_MAX_DURATION_MS const',
    "const POST_DELIVERY_PAUSE_MS = 10000;",
    "const POST_DELIVERY_PAUSE_MS = 10000;\n"
    "/**\n"
    " * Hard wall-clock cap on a single typing-refresh lifetime. The\n"
    " * existing heartbeat-based stop is the primary signal, but if an\n"
    " * agent is stuck \"alive\" (heartbeat fresh, no delivery ever) typing\n"
    " * would otherwise refresh forever. 10 min is well above legitimate\n"
    " * long-thinking turns and tight enough that a runaway is visibly\n"
    " * bounded.\n"
    " */\n"
    "const TYPING_MAX_DURATION_MS = parseInt(process.env.NANOCLAW_TYPING_MAX_MS || '', 10) || 10 * 60 * 1000;",
    'TYPING_MAX_DURATION_MS',
)

# 2. Inside the interval callback: add the cap check before the heartbeat /
#    grace logic so it always wins when crossed.
patch(
    'typing/index.ts/cap check in interval callback',
    "    // Inside a post-delivery pause: skip setTyping but keep the\n"
    "    // interval running so we resume automatically once the pause\n"
    "    // expires.\n"
    "    if (entry.pausedUntil > Date.now()) return;\n"
    "\n"
    "    const withinGrace = Date.now() - entry.startedAt < TYPING_GRACE_MS;",
    "    // Inside a post-delivery pause: skip setTyping but keep the\n"
    "    // interval running so we resume automatically once the pause\n"
    "    // expires.\n"
    "    if (entry.pausedUntil > Date.now()) return;\n"
    "\n"
    "    // Hard wall-clock cap: even if heartbeat keeps refreshing,\n"
    "    // never let a single typing session run past the cap.\n"
    "    if (Date.now() - entry.startedAt > TYPING_MAX_DURATION_MS) {\n"
    "      clearInterval(entry.interval);\n"
    "      typingRefreshers.delete(sessionId);\n"
    "      return;\n"
    "    }\n"
    "\n"
    "    const withinGrace = Date.now() - entry.startedAt < TYPING_GRACE_MS;",
    'TYPING_MAX_DURATION_MS)',
)

print('done')
