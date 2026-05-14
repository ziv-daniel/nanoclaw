# Postmortem: Andy main session prompt drift (2026-04-28)

## Summary

The main Telegram channel agent ("Andy", agent group `ag-1777150999662-ryx8n1`) stopped replying to messages. The fresh-spawned containers were emitting `[scratchpad]`-prefixed text without the required `<message to="…">` block, so the dispatcher silently dropped every reply. Cause: a 9.7 MB / 2,915-turn Claude SDK conversation JSONL had accumulated hundreds of malformed-output examples, and every container that resumed the session learned the wrong pattern from history.

## Timeline (UTC)

| Time | Event |
|---|---|
| ongoing for hours | User sees typing indicator on main channel, no replies |
| 21:35 | Investigation: container logs show `WARNING: agent output had no <message to="..."> blocks — nothing was sent` repeating |
| 21:50 | Identified: heartbeat-based `ABSOLUTE_CEILING_MS` (set to 90 min via systemd drop-in) doesn't fire because the agent is "alive but stuck" — heartbeat keeps refreshing |
| 21:55 | Shipped `MAX_LIFETIME_MS` patch: wall-clock cap independent of heartbeat, default 4 h. Loaded into running orchestrator. |
| 22:00 | Even with new code, fresh containers kept resuming the same poisoned session and producing the same broken output |
| 22:10 | Root cause located: 9.7 MB JSONL of poisoned history teaching the agent to drop the `<message>` wrapper |
| 22:12 | Reset: archived JSONL + resume dir + session-env, cleared `sdk_session_id` from `outbound.db`, archived `.claude-shared/sessions/{24,26}.json` checkpoints |
| 22:15 | Fresh container spawned → new session `324d1e0c-…` → output uses `<message to="unnamed">` correctly |
| 22:25 | Discovered the destination was misconfigured: `agent_destinations.local_name = 'unnamed'` for telegram_main since initial setup. Renamed to `'main'` |

## Root causes

1. **Unbounded session growth.** The Claude SDK session JSONL grew without rotation. At ~10 MB / 2,900 turns it became a teaching corpus for whatever malformed pattern it accumulated.
2. **Heartbeat-only liveness.** Existing `ABSOLUTE_CEILING_MS` only fires on stale heartbeat. An agent stuck in active query (heartbeat fresh, output broken) is invisible to it.
3. **Misconfigured destination from setup**: `local_name='unnamed'` for `telegram_main`'s channel destination since 2026-04-25 initial install. Hidden by the broken-format bug — once the agent started emitting `<message to=…>`, the ugliness surfaced.

## What we shipped

1. **`MAX_LIFETIME_MS` in host-sweep.ts** — wall-clock cap, default 4 h. Catches stuck-active-query containers regardless of heartbeat. Skipped while a Bash tool with declared timeout is running so legit long jobs aren't interrupted. Patch lives at [`ops/patches/2026-04-28-max-lifetime.py`](../patches/2026-04-28-max-lifetime.py).
2. **Lowered `NANOCLAW_ABSOLUTE_CEILING_MS`** from 90 min → 15 min via systemd drop-in.
3. **Reset Andy's poisoned session** — archived to `…/archived-sessions/20260428-215834-poisoned-format/`. Restorable if needed.
4. **Renamed `unnamed` → `main`** in `agent_destinations`.

## Still open

### Shipped 2026-04-29

- **Auto-rotate sessions** — [`ops/patches/2026-04-29-auto-rotate-session.py`](../patches/2026-04-29-auto-rotate-session.py). Agent-runner now checks the transcript JSONL at poll-loop startup and every 50 polls; if it exceeds 5 MB or 1500 turns, the stored session id is cleared and the next provider call starts fresh. Defaults tuneable via `NANOCLAW_MAX_SESSION_BYTES` / `NANOCLAW_MAX_SESSION_TURNS`. The durable counterpart to today's manual reset.
- **Typing-indicator wall-clock cap** — [`ops/patches/2026-04-29-typing-max-duration.py`](../patches/2026-04-29-typing-max-duration.py). `src/modules/typing/index.ts` now hard-stops a refresher after `NANOCLAW_TYPING_MAX_MS` (default 10 min), so even if heartbeat stays fresh and host-sweep doesn't intervene, the UI typing indicator can't run forever.

### Still open

- **Detect format drift symptoms.** When the orchestrator sees N consecutive `WARNING: agent output had no <message to=…> blocks` for a session, that's a clear signal to recycle the SDK session. Currently the warning is logged but not actioned. With auto-rotate in place this is lower priority but still a useful early-warning signal.

## Lessons

- Container recycling alone doesn't fix conversation-level bugs. State at the right layer matters.
- Heartbeat-based liveness is a leaky abstraction. Wall-clock caps need to coexist.
- Setup-time defaults persist forever silently if no one uses them out loud (`unnamed` since April 25).
