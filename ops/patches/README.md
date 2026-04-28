# Live-source patches

Idempotent edit scripts that have been applied to `/opt/nanoclaw-v2/src/` on the live server. Each is a Python script that:
- detects whether the patch is already applied (by checking for a marker)
- bails out cleanly if applied
- otherwise replaces specific anchor strings with the patched version

After running a patch, rebuild + restart on the host:
```bash
cd /opt/nanoclaw-v2 && pnpm exec tsc && systemctl restart nanoclaw-v2-2e602aa0
```

## History

| Date       | Patch | Why |
|------------|-------|-----|
| 2026-04-28 | [`2026-04-28-max-lifetime.py`](2026-04-28-max-lifetime.py) | Add wall-clock `MAX_LIFETIME_MS` cap to `host-sweep.ts` so containers stuck in active query (heartbeat fresh, but format drifted) get recycled. Default 4h, env var `NANOCLAW_MAX_LIFETIME_MS`. See [`docs/postmortem-prompt-drift.md`](../docs/postmortem-prompt-drift.md). |

## Workflow when adding a new patch

1. Write the patch as an idempotent Python script in this directory, named `YYYY-MM-DD-summary.py`.
2. Apply it on the server (via `claw.sh host` or directly).
3. Rebuild + restart.
4. Add an entry to the table above.
5. Commit both the patch script and the snapshotted `src/` change to the `ziv/ops` branch — the script is the recipe, the `src/` change is the result.
