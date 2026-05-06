---
name: diagnose-claude-code-resume-failure
description: Diagnose "No conversation found with session ID" crashes in container-based Claude Code / Claude Agent SDK setups that use --resume. Use when agents crash with exit 1 in a retry loop, messages silently dropped, or when an orchestrator holds a sessionId pointing at a JSONL the SDK can't find.
author: Claude Code
version: 1.0.0
date: 2026-04-21
---

# Diagnose Claude Code Resume Failure

## Problem

A long-running orchestrator (e.g. nanoclaw) spawns Claude Code / Claude Agent SDK containers and passes a stored `sessionId` via `--resume` or `query({ resume })`. The SDK throws:

> `Claude Code returned an error result: No conversation found with session ID: <uuid>`

Container exits 1, orchestrator retries with exponential backoff, messages pile up, service eventually crashes. Symptoms look like "API outage" or "auth broken" but are neither.

## Context / Trigger Conditions

Invoke this skill when **all** of:

- Orchestrator uses Claude Agent SDK `query({ resume: sessionId })` or CLI `--resume <uuid>`
- Agent/container logs show `No conversation found with session ID: <uuid>`
- Error persists across container restarts (not a one-off network blip)
- The `<uuid>` in the error is identical on every retry (orchestrator isn't rotating it)

Also suspect this when channels go silent after a long period of normal operation, with exponential-backoff retry logs on the host.

## Root cause

Claude Code stores sessions as `~/.claude/projects/<cwd-hash>/<sessionId>.jsonl`. When a JSONL crosses an internal size threshold (observed at ~19 MB), Claude Code **renames it** to `<sessionId>.jsonl.archive-<unix-ts>`. The SDK can no longer load the session, and `query({ resume })` fails. An orchestrator that caches the sessionId in its own DB keeps re-sending the dead id forever.

This is NOT an auth, proxy, network, credential-vault, or API-key issue. Do not chase those first.

## Solution

### Diagnose (read-only)

1. Tail the container's stderr/stdout for `No conversation found with session ID: <UUID>`. Capture the UUID.
2. Find the session storage dir on the host (per-group/per-agent mount that maps to the container's `~/.claude`).
3. List `<claude-dir>/projects/<cwd-hash>/` — if you see `<UUID>.jsonl.archive-<ts>` instead of `<UUID>.jsonl`, confirmed.
4. Check the orchestrator's session DB (SQLite/JSON/etc.) — the dead UUID will still be the stored `session_id` for the affected group.

### Fix — three layers, pick one or more

**A. Unblock now (1 min):** null out the stored session id in the orchestrator DB (or delete the session-tracking row) and restart the orchestrator. Next spawn starts a fresh session.

```sql
UPDATE sessions SET session_id = NULL WHERE group_folder = '<affected-group>';
-- or DELETE FROM sessions WHERE ...
```

**B. Hardening — pre-flight check in the agent runner (root fix):** before calling `query({ resume })`, verify the JSONL exists. If missing, clear sessionId and start fresh.

```ts
if (sessionId) {
  const sessionJsonl =
    `${process.env.HOME}/.claude/projects/${cwdHash}/${sessionId}.jsonl`;
  if (!fs.existsSync(sessionJsonl)) {
    log(`Resume session ${sessionId} JSONL missing — starting fresh`);
    sessionId = undefined;
  }
}
```

`cwdHash` is the SDK `cwd` with `/` → `-` and leading `-` (e.g. `/workspace/group` → `-workspace-group`).

**C. Defense in depth — catch the SDK throw:** even with pre-flight, a session can be archived between check and resume. Catch the error by regex on `/No conversation found with session ID/i` and signal the orchestrator to clear the stored sessionId (emit `newSessionId: null` or equivalent).

### Prevent recurrence

- Consider proactive rotation: force a new session after N turns or when JSONL exceeds a threshold you control, rather than relying on Claude Code's silent archive.
- If the agent runner source is copy-seeded per tenant/group, ensure the copy **refreshes** on master updates — otherwise your pre-flight patch sits in the master but stale copies keep crashing.

## Verification

1. Restart the orchestrator.
2. Send a test message to the affected channel/group.
3. Tail the live container (`docker logs --tail 30 <name>`). You should see:
   - `Resume session <old-uuid> JSONL missing — starting fresh` (pre-flight fired)
   - `Starting query (session: new, resumeAt: latest)`
   - `Session initialized: <new-uuid>`
   - An actual assistant reply
4. Confirm the orchestrator's session DB now stores the **new** UUID, not the old archived one.

## Example (nanoclaw, 2026-04-21)

- Symptom: all Telegram/Slack channels silent after OneCLI vault migration; initial suspicion was OAuth/vault. Wrong.
- Found `No conversation found with session ID: ec958538-679e-4317-a8dd-6b77a9f59970` in `container-*.log`.
- Located `/opt/nanoclaw/data/sessions/telegram_main/.claude/projects/-workspace-group/ec958538-....jsonl.archive-1776729758` (19MB, archived by Claude Code).
- Orchestrator SQLite (`/opt/nanoclaw/store/messages.db`, `sessions` table) still held the dead UUID.
- Patched `container/agent-runner/src/index.ts` with pre-flight check; re-synced 6 stale per-group copies; restarted service. Telegram replied in 7s with new session `237ea242-...`.

## Notes

- Error message is **misleading**. "No conversation found" sounds like an API-side failure, but it's a local file-not-found.
- Exponential backoff on the host can make the channel look "slow" (8s, 20s, 40s, 80s, 160s) before it looks "dead" — don't dismiss slowness without checking container logs.
- The 19 MB threshold is an observation, not documented. Don't hard-code it; just check file existence.
- If you see `.jsonl.archive-<ts>` files accumulating, Claude Code is archiving silently — worth monitoring disk usage and considering proactive session rotation.
- Auth issues (OneCLI vault, OAuth token refresh, credential-proxy) produce `401` or `ECONNRESET` — **not** "No conversation found". Use the error message to pick the right rabbit hole.

## References

- Claude Agent SDK `query()` resume semantics — `@anthropic-ai/claude-agent-sdk` package docs
- Claude Code session storage convention: `~/.claude/projects/<cwd-with-slashes-replaced-by-dashes>/<session-id>.jsonl`
