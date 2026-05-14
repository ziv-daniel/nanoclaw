# Deployment runbook

How to safely change live source on `/opt/nanoclaw-v2/`. Lessons from the 2026-04-28 session that almost corrupted source files.

## Golden rules

1. **Never** pipe arbitrary TypeScript through `claw.sh host "echo $BIGSTRING | base64 -d > file"`. The Portainer API JSON-encoding layer eats `})` sequences silently — you get an md5-mismatch but TS that no longer compiles. Always use ASCII-only payloads (base64 encoded scripts) in that pipe.
2. **Verify md5 after any upload.** If md5 doesn't match local, abort and investigate — do not rebuild.
3. **Back up before edit.** Every patch script in `ops/patches/` should be idempotent and detect already-applied state — but always cp to `*.bak-pre-<change>` before running for the first time.
4. **Use systemd drop-ins for env changes**, not edits to `.env`. The orchestrator gets its env from systemd, not from the application's `.env`.
5. **Always run** `tsc` cleanly **before** `systemctl restart`. A broken `dist/` will crash-loop on restart.

## Standard edit flow (small surgical change)

```bash
# 1. Write idempotent patch as ops/patches/YYYY-MM-DD-summary.py
# 2. Apply locally to a snapshot first to verify it works:
python3 ops/patches/YYYY-MM-DD-summary.py /tmp/server-src

# 3. Apply on host:
B64=$(base64 -w0 ops/patches/YYYY-MM-DD-summary.py)
bash ops/claw.sh host "echo $B64 | base64 -d > /tmp/.patch.py && python3 /tmp/.patch.py /opt/nanoclaw-v2 && rm /tmp/.patch.py"

# 4. Build:
bash ops/claw.sh host "cd /opt/nanoclaw-v2 && pnpm exec tsc"

# 5. Restart:
bash ops/claw.sh host "systemctl restart nanoclaw-v2-2e602aa0 && systemctl is-active nanoclaw-v2-2e602aa0"

# 6. Verify env vars loaded as expected:
bash ops/claw.sh host "$(cat ops/scripts/verify-env.sh)"

# 7. Snapshot the changed src/ back into the ziv/ops branch:
git checkout ziv/ops
# pull updated src/ from server, commit alongside the patch script
```

## Adding/changing a systemd env var

```bash
# edit the appropriate drop-in
bash ops/claw.sh host "cat > /etc/systemd/system/nanoclaw-v2-2e602aa0.service.d/<name>.conf <<'EOF'
[Service]
Environment=NANOCLAW_NEW_VAR=value
EOF
systemctl daemon-reload && systemctl restart nanoclaw-v2-2e602aa0"
```

Verify with `ops/scripts/verify-env.sh`.

## Recycling a stuck container

```bash
bash ops/claw.sh host "docker stop -t 5 nanoclaw-v2-telegram_main-XXXX || docker kill nanoclaw-v2-telegram_main-XXXX"
```

Next inbound message will spawn a fresh container.

## Resetting a poisoned Claude SDK session (nuclear option)

When an agent's response format has drifted catastrophically (e.g. consistently emitting `[scratchpad]` instead of `<message to="…">`), the conversation JSONL needs to be archived so the next container starts a new session.

```bash
# Replace AG_ID, SESSION_ID, etc. for your case.
SESSION_ID=78f09fd9-4f1d-4299-a6d6-69149e460bf3
AG_ROOT=/opt/nanoclaw-v2/data/v2-sessions/ag-1777150999662-ryx8n1
SHARED=$AG_ROOT/.claude-shared
ARCH=$SHARED/archived-sessions/$(date +%Y%m%d-%H%M%S)-poisoned

# 1. Stop running container
docker ps --filter name=nanoclaw-v2-telegram_main --format '{{.Names}}' | xargs -r docker stop -t 5

# 2. Archive
mkdir -p "$ARCH"
mv "$SHARED/projects/-workspace-agent/$SESSION_ID.jsonl" "$ARCH/" || true
mv "$SHARED/projects/-workspace-agent/$SESSION_ID" "$ARCH/" || true
mv "$SHARED/session-env/$SESSION_ID" "$ARCH/session-env" || true

# 3. Clear sdk_session_id from outbound.db so the agent-runner doesn't try to resume
sqlite3 "$AG_ROOT/sess-XXX/outbound.db" "DELETE FROM session_state WHERE key = 'sdk_session_id';"

# 4. Send a message to the bot — fresh session spawns.
```

The agent's persistent memory in `.claude-shared/projects/-workspace-agent/memory/*.md` is preserved.

## Diagnostics

| Question | Command |
|---|---|
| Is the orchestrator running? | `bash ops/claw.sh host "systemctl is-active nanoclaw-v2-2e602aa0"` |
| What env vars are loaded? | `bash ops/scripts/verify-env.sh` |
| Recent orchestrator log | `bash ops/claw.sh host "tail -100 /opt/nanoclaw-v2/logs/nanoclaw.log"` |
| Per-container logs | `bash ops/claw.sh logs 100` (auto-finds first nanoclaw container) |
| Listing systemd drop-ins | `bash ops/scripts/dump-dropins.sh` |
| Find stray .bak files | `bash ops/scripts/cleanup-baks.sh` |
