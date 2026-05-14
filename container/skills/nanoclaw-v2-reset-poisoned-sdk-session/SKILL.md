---
name: nanoclaw-v2-reset-poisoned-sdk-session
description: Reset a NanoClaw v2 agent's Claude SDK session when its conversation transcript has grown so large that the agent has learned a malformed response shape from history. Use when an agent's recent log entries repeat `WARNING: agent output had no <message to="..."> blocks — nothing was sent` and the agent appears to "talk to itself" via `[scratchpad]` lines but never delivers replies. Step-by-step archive + clear procedure that preserves persistent memory files while wiping the poisoned conversation.
author: Claude Code
version: 1.0.0
date: 2026-04-29
---

# NanoClaw v2 — Reset poisoned Claude SDK session

## Problem

A NanoClaw v2 agent stops delivering replies even though its container is alive and the SDK is producing output. The container's log shows the agent producing reasonable-looking text but every turn ends with:

```
WARNING: agent output had no <message to="..."> blocks — nothing was sent
```

The agent has "drifted out" of its system prompt's required response format. Recycling the container doesn't help — the new container resumes the same Claude SDK session via `--resume <id>`, loads the entire transcript JSONL into context, sees hundreds of prior malformed turns, and confidently repeats the broken pattern as if it were the right one.

This was first observed on 2026-04-28 with Andy's main session (`78f09fd9-…`): a 9.7 MB / 2,915-turn transcript had accumulated so many `[scratchpad]`-only outputs that every fresh container "learned" the wrong format from history.

## Context / Trigger Conditions

- Agent appears responsive in logs (heartbeat fresh, container running, query active) but **no `Message delivered` events** appear in `/opt/nanoclaw-v2/logs/nanoclaw.log` for that group
- Agent container's logs show `[poll-loop] Result: …` lines with content, but each is followed by `WARNING: agent output had no <message to="..."> blocks`
- The transcript JSONL for the affected session is large:
  ```bash
  ls -lah /opt/nanoclaw-v2/data/v2-sessions/<ag-id>/.claude-shared/projects/-workspace-agent/<session-uuid>.jsonl
  # Anything > ~5 MB is suspect; > 9 MB is almost certainly drifted
  ```
- The host-sweep `MAX_LIFETIME_MS` patch (4 h cap, see `ops/patches/2026-04-28-max-lifetime.py`) **does not help** because it only recycles containers, not sessions. The new container resumes the poisoned session.

## Solution

Archive the conversation files (so the reset is reversible) and clear the stored session ID so the next provider call starts a fresh Claude session. Persistent memory files (`memory/*.md`) are preserved.

### Step 1 — Identify the affected session

```bash
# In v2.db, look up the v2-session ID for the agent group:
sqlite3 /opt/nanoclaw-v2/data/v2.db \
  "SELECT id FROM sessions WHERE agent_group_id = 'ag-XXX';"
# → e.g. sess-1777150999664-5y9mnf

# Then look up the SDK session ID stored in outbound.db:
sqlite3 /opt/nanoclaw-v2/data/v2-sessions/ag-XXX/sess-YYY/outbound.db \
  "SELECT value FROM session_state WHERE key = 'sdk_session_id';"
# → e.g. 78f09fd9-4f1d-4299-a6d6-69149e460bf3
```

### Step 2 — Run the reset script

Save as `/opt/nanoclaw-v2/.reset-session.sh` and execute on the host (via the privileged-container + nsenter pattern):

```bash
#!/bin/bash
set -e

SESSION_ID=78f09fd9-4f1d-4299-a6d6-69149e460bf3   # from step 1
AG_ID=ag-1777150999662-ryx8n1                      # from step 1
SESS=sess-1777150999664-5y9mnf                     # from step 1

AG_ROOT=/opt/nanoclaw-v2/data/v2-sessions/$AG_ID
SHARED=$AG_ROOT/.claude-shared
PROJ=$SHARED/projects/-workspace-agent
ARCH=$SHARED/archived-sessions/$(date +%Y%m%d-%H%M%S)-poisoned-format
OUTDB=$AG_ROOT/$SESS/outbound.db

# 1. Stop the running agent container.
docker ps --filter name=nanoclaw-v2-<group> --format '{{.Names}}' | \
  xargs -r docker stop -t 5

# 2. Archive transcript + resume dir + session-env (mv = atomic).
mkdir -p "$ARCH"
[ -f "$PROJ/$SESSION_ID.jsonl" ] && mv "$PROJ/$SESSION_ID.jsonl" "$ARCH/"
[ -d "$PROJ/$SESSION_ID" ]       && mv "$PROJ/$SESSION_ID" "$ARCH/"
# session-env is a non-empty dir — cp + rm, not mv, since target may exist:
[ -d "$SHARED/session-env/$SESSION_ID" ] && \
  cp -r "$SHARED/session-env/$SESSION_ID" "$ARCH/session-env" && \
  rm -rf "$SHARED/session-env/$SESSION_ID"

# 3. Archive any sessions/{N}.json checkpoint files referencing this session.
for f in $SHARED/sessions/*.json; do
  [ -f "$f" ] && grep -lq "$SESSION_ID" "$f" 2>/dev/null && \
    mv "$f" "$ARCH/$(basename $f)"
done

# 4. Clear sdk_session_id and the (now-stale) processing claims.
sqlite3 "$OUTDB" "DELETE FROM session_state WHERE key = 'sdk_session_id';"
sqlite3 "$OUTDB" "DELETE FROM processing_ack;"

echo "Reset complete. Send a fresh message — a new SDK session will spawn."
```

### Step 3 — Verify

```bash
# Confirm the stored ID is gone:
sqlite3 $OUTDB "SELECT * FROM session_state;"
# → empty result

# Send a Telegram message to the affected channel.
# Watch the orchestrator log for a fresh container and a NEW session id:
tail -f /opt/nanoclaw-v2/logs/nanoclaw.log | grep -E 'Spawning|Session:|delivered'

# In the agent container's logs, expect:
#   [agent-runner] Starting v2 agent-runner (provider: claude)
#   [poll-loop] Session: <NEW_UUID>     ← different from the archived one
#   [poll-loop] Result: <message to="...">  ← properly formatted now
```

## Verification

The reset succeeded when:

1. The first turn after the reset emits a `<message to="…">` block (visible in container logs).
2. The orchestrator log shows `Message delivered` shortly after.
3. The new session UUID is different from the archived one.
4. The user receives the reply on Telegram.

## Example — 2026-04-28 incident

- Agent: `ag-1777150999662-ryx8n1` (Andy main, telegram_main)
- Poisoned session: `78f09fd9-4f1d-4299-a6d6-69149e460bf3`
- Transcript size at reset: 10,387,819 bytes (≈10 MB), 2,915 lines
- Archived to: `…/.claude-shared/archived-sessions/20260428-215834-poisoned-format/`
- Result: Fresh session `324d1e0c-f6ef-4a56-be4f-39e25670de1a` spawned, first reply delivered correctly within seconds.

## Notes

- **What's preserved**: `memory/*.md` files in `.claude-shared/projects/-workspace-agent/memory/` (the agent's intentional cross-session memory). The agent loses in-conversation context but keeps long-term remembered facts.
- **What's lost**: The full conversation history with that channel. For chat agents this can be acceptable (the user often only cares about recent context); for context-heavy agents that have been doing multi-turn deep work, consider a JSONL-aware compact instead of a full reset.
- **Reversibility**: Archive lives at `…/archived-sessions/<timestamp>-poisoned-format/`. To restore: stop container, move files back, set `session_state.sdk_session_id` back. But test the reset first; restoring re-poisons the session.
- **Don't clear `processing_ack` rows that are status='processing'** if you have legitimate in-flight work. The 2026-04-28 reset cleared completed rows too — that proved harmless because inbound.db is the authoritative source for "is this message done", but a tighter version would `DELETE FROM processing_ack WHERE status = 'processing'`.
- **Durable counterpart**: After this manual reset, also apply `ops/patches/2026-04-29-auto-rotate-session.py` (or verify it's already applied). That patch makes the agent-runner auto-rotate sessions at 5 MB / 1500 turns, so this manual surgery shouldn't be needed again.

## References

- Postmortem: `ops/docs/postmortem-prompt-drift.md` on the `ziv/ops` branch of `ziv-daniel/nanoclaw`.
- Auto-rotate patch: `ops/patches/2026-04-29-auto-rotate-session.py` (durable fix).
- MAX_LIFETIME patch (related but not sufficient on its own): `ops/patches/2026-04-28-max-lifetime.py`.
