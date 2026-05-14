# Live deployment architecture (snapshot 2026-04-28)

## Where things live

| Path on Dokploy LXC | What it is |
|---|---|
| `/opt/nanoclaw-v2/` | The live install. Runs `dist/index.js` as `nanoclaw` user via systemd. |
| `/opt/nanoclaw-v2/src/` | TypeScript source. Compiled to `dist/` via `pnpm exec tsc`. |
| `/opt/nanoclaw-v2/dist/` | Compiled JS. What systemd actually executes. |
| `/opt/nanoclaw-v2/.env` | Application environment. Read by app code (not by systemd). |
| `/opt/nanoclaw-v2/data/v2.db` | Central SQLite. Tables: `sessions`, `agent_groups`, `agent_destinations`, `messaging_groups`, `users`, …  |
| `/opt/nanoclaw-v2/data/v2-sessions/<ag-XXX>/` | Per-agent-group state: `sess-XXX/{inbound,outbound}.db`, `.claude-shared/` (Claude SDK conversation files). |
| `/opt/nanoclaw-v2/logs/nanoclaw.log` | Orchestrator log (stdout via systemd `StandardOutput=append:`). |
| `/opt/nanoclaw/` | **Dead v1 directory.** Empty/leftover. Don't edit. |

## Process model

- **Systemd unit**: `nanoclaw-v2-2e602aa0.service`
  - `ExecStart=/usr/bin/node /opt/nanoclaw-v2/dist/index.js`
  - Drop-ins under `/etc/systemd/system/nanoclaw-v2-2e602aa0.service.d/` add env vars (e.g. `sweep-tuning.conf`, `max-lifetime.conf`) and override `User=nanoclaw`.
- **Orchestrator** (single Node process) handles routing, channels, host sweep, scheduled tasks.
- **Agent containers** (`docker run --rm --name nanoclaw-v2-<group>-<ts>`) are spawned per agent group when there's work to do. Image: `nanoclaw-agent-v2-<install-slug>:latest`. Each runs the agent-runner from `container/agent-runner/`.

## Routing & sessions

Per agent group `ag-XXX`, the orchestrator owns `inbound.db`, the agent container owns `outbound.db`. Communication is through these two SQLite files only.

- **Inbound message** → `messages_in` row (status: pending → processing → completed)
- **Outbound message** → `messages_out` + `processing_ack` (claim/release flow)
- **Agent's Claude SDK session** → `session_state.sdk_session_id` in `outbound.db` + JSONL at `.claude-shared/projects/-workspace-agent/<uuid>.jsonl`
- **Heartbeat** → empty file `<sess>/.heartbeat` whose mtime is bumped every SDK turn. Used by host-sweep liveness checks.

## Stuck/timeout detection (host-sweep)

`src/host-sweep.ts` runs every 60s. For each running container, calls `decideStuckAction` which returns one of:

| Action | When | Default | Env var |
|---|---|---|---|
| `kill-ceiling` | heartbeat mtime older than ceiling | 30 min (server set to 15 min) | `NANOCLAW_ABSOLUTE_CEILING_MS` |
| `kill-claim` | a `processing` claim is older than tolerance and heartbeat hasn't moved since | 60 s (server set to 5 min) | `NANOCLAW_CLAIM_STUCK_MS` |
| `kill-lifetime` | container alive past wall-clock cap, regardless of heartbeat | 4 h | `NANOCLAW_MAX_LIFETIME_MS` |
| `ok` | otherwise | — | — |

`kill-lifetime` is a **hand-patch** added on 2026-04-28 — see [postmortem](postmortem-prompt-drift.md) and [patches/README.md](../patches/README.md). It exists because the heartbeat-based ceiling does **not** fire when an agent is stuck in an "active query" (heartbeat keeps refreshing but the agent's response format has drifted away from the system prompt).

## Hand-patches over upstream v2.0.11

- `src/host-sweep.ts`, `src/container-runner.ts`, `src/host-sweep.test.ts` — `MAX_LIFETIME_MS` (above).
- `src/channels/telegram.ts`, `telegram-pairing.ts`, `telegram-markdown-sanitize.ts` (+ tests) — channel adapters that upstream refactored off the v2 trunk; the server kept them.
- `src/channels/index.ts` — registers the kept `telegram.ts`.
- `src/container-config.ts` — merges `groups/_global/container.json` MCP servers into every group's config.

## Currently-known gotchas

- The `claw.sh host "<cmd>"` chunked-upload pattern can corrupt source files when payloads contain `})`-heavy TS code (Portainer JSON encoding eats characters). Always use **base64-encoded ASCII scripts** uploaded via `echo $B64 | base64 -d > file` and verify with `md5sum`. See [`deployment-runbook.md`](deployment-runbook.md).
- The orchestrator does **not** reload `.env` on `systemctl restart` — env vars come from the systemd unit and its drop-ins. To change env, edit a drop-in under `/etc/systemd/system/nanoclaw-v2-2e602aa0.service.d/`, `systemctl daemon-reload`, then restart.
- `/opt/nanoclaw/` (no `-v2`) is leftover from the v1→v2 migration. Files there are never executed; ignore.
