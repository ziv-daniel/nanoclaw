---
name: nanoclaw-v2-bun-bind-mount-no-rebuild
description: Patch the live NanoClaw v2 agent-runner without rebuilding the Docker image. Use when editing files under `/opt/nanoclaw-v2/container/agent-runner/src/` — Bun runs the TypeScript directly and the directory is bind-mounted into every agent container, so edits take effect on next container respawn. Saves the 5–10 min Docker image rebuild and avoids the bun-install network step that hung overnight.
author: Claude Code
version: 1.0.0
date: 2026-04-29
---

# NanoClaw v2 — Patch agent-runner without Docker rebuild

## Problem

Patching the agent-runner code on the live NanoClaw v2 deployment seems to require a full Docker image rebuild (`bash /opt/nanoclaw-v2/container/build.sh latest`). That build:

- Takes 5–10 min on the Dokploy LXC
- Has hung mid-step (`pnpm install -g agent-browser` / bun install) when the LXC's network is slow
- Risks leaving the install in a broken state if the build fails partway

So you sit there waiting on a `docker build` you don't actually need.

## Context / Trigger Conditions

- Editing any file under `/opt/nanoclaw-v2/container/agent-runner/src/` (poll-loop.ts, providers/claude.ts, db/session-state.ts, etc.)
- About to run `container/build.sh latest` or `docker build` "to deploy" the change
- Fixing a bug, applying a patch, adding a feature in agent-runner code
- Tempted to wait for a long Docker build before testing

## Solution

**You don't need to rebuild.** Two facts make image rebuild unnecessary for agent-runner source edits:

1. The agent-runner package.json `start` script is `bun src/index.ts` — Bun executes TypeScript directly, no compile step.
2. Every agent container has the host directory bind-mounted in:
   ```
   /opt/nanoclaw-v2/container/agent-runner/src  →  /app/src   (read-only)
   ```
   Verify with `docker inspect <container> --format '{{json .Mounts}}'`.

So an edit on the host's `.ts` file is read by Bun in the next container that gets spawned.

### Workflow

```bash
# 1. Edit the .ts file on the host (via your usual deploy chain — for NanoClaw
#    that's the base64 ASCII script pattern from `nanoclaw-claw-sh-chunked-upload`).
#    Idempotent Python edit scripts in ops/patches/ are the standard pattern.

# 2. Verify the edit landed:
grep -n yourMarker /opt/nanoclaw-v2/container/agent-runner/src/<file>.ts

# 3. Recycle the running agent container so the change takes effect:
docker stop -t 5 nanoclaw-v2-telegram_main-XXXXX

# 4. Send a message — orchestrator's host-sweep spawns a fresh container
#    that reads the bind-mounted (now-patched) source on next start.
```

No `docker build`, no `systemctl restart nanoclaw-v2-*`, no waiting.

### When you DO still need to rebuild

- Editing the **orchestrator** source (`/opt/nanoclaw-v2/src/`) — that compiles via `pnpm exec tsc` to `dist/` and the orchestrator is a long-lived Node process; needs `systemctl restart nanoclaw-v2-2e602aa0`.
- Editing the agent-runner's `package.json` (changes deps, requires `bun install`).
- Editing the Dockerfile or anything pre-CMD (entrypoint, base image, system deps).

For pure agent-runner `.ts` source changes — never rebuild.

## Verification

After patching and recycling the container, confirm the new code path runs:

```bash
# 1. Wait for next inbound message OR force a wake by sending a test message.
# 2. Tail the agent container's logs:
docker logs --tail 50 nanoclaw-v2-telegram_main-<latest-ts>

# 3. Look for log lines that prove your patched code ran (e.g. for the
#    auto-rotate-session patch you'd see "Auto-rotating session ..." or
#    "Cleared stored session ID — next query will start a fresh Claude session").
```

If the new code never logs, the patch didn't land. Re-grep the source file to confirm the edit, recheck the bind-mount target, and verify the container was actually killed (so a fresh one was spawned, not the old one reused).

## Example

Yesterday's session shipped two patches this way:

- `ops/patches/2026-04-29-auto-rotate-session.py` — edits `container/agent-runner/src/poll-loop.ts` to add a transcript-size check.
- After running the patch script on the host (idempotent Python with anchor-based replacement), the new code was live the moment `nanoclaw-v2-telegram_main` was killed and respawned by the next host-sweep tick.
- A failed image rebuild was running in parallel (hung on bun install) and was completely unnecessary.

## Notes

- The bind-mount is **read-only**: agent containers cannot write to the source. Edits must go through the host, not via `docker exec` into the agent.
- Bun caches some module-level state per-process. A patch that changes module-level constants only takes effect on a fresh container — not on subsequent turns of an existing process.
- This DOES mean the source on disk and the source in any pre-built image can drift. Run `bash ops/patches/<latest>.py` after rebuilding the image to ensure both surfaces are in sync.
- Don't confuse with the orchestrator path: orchestrator src compiles to `dist/`, and the orchestrator process loads from `dist/` — a host edit there requires `pnpm exec tsc && systemctl restart nanoclaw-v2-2e602aa0`.

## References

- Bun executes `.ts` directly: https://bun.sh/docs/runtime/typescript
- Verified via `docker inspect <container>` showing `/app/src` mount of type `bind` from `/opt/nanoclaw-v2/container/agent-runner/src` with `RW: false`.
