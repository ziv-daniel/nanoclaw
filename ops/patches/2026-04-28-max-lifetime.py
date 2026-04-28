#!/usr/bin/env python3
"""Apply MAX_LIFETIME wall-clock cap to v2 host-sweep + container-runner.

Idempotent: re-running detects already-applied changes and skips.

Run on host:
    python3 ops/patches/2026-04-28-max-lifetime.py /opt/nanoclaw-v2
"""
import sys
from pathlib import Path

PREFIX = sys.argv[1] if len(sys.argv) > 1 else '/opt/nanoclaw-v2'
RUNNER = Path(f'{PREFIX}/src/container-runner.ts')
SWEEP = Path(f'{PREFIX}/src/host-sweep.ts')


def patch(path: Path, label: str, old: str, new: str, marker: str) -> None:
    text = path.read_text()
    if marker in text:
        print(f'{label}: marker present, skipping')
        return
    if old not in text:
        raise SystemExit(f'{label}: anchor not found')
    path.write_text(text.replace(old, new))
    print(f'{label}: edited')


# 1a. extend the activeContainers Map value type + add a getter export
patch(
    RUNNER,
    'container-runner.ts/activeContainers type',
    'const activeContainers = new Map<string, { process: ChildProcess; containerName: string }>();',
    'const activeContainers = new Map<string, { process: ChildProcess; containerName: string; startedAt: number }>();\n\n'
    '/** Wall-clock time when the container was spawned. Returns null if not running. */\n'
    'export function getContainerStartedAt(sessionId: string): number | null {\n'
    '  return activeContainers.get(sessionId)?.startedAt ?? null;\n'
    '}',
    'getContainerStartedAt',
)

# 1b. record startedAt at the .set() call
patch(
    RUNNER,
    'container-runner.ts/activeContainers.set',
    'activeContainers.set(session.id, { process: container, containerName });',
    'activeContainers.set(session.id, { process: container, containerName, startedAt: Date.now() });',
    'startedAt: Date.now()',
)

# 2a. add MAX_LIFETIME_MS const near ABSOLUTE_CEILING_MS
patch(
    SWEEP,
    'host-sweep.ts/MAX_LIFETIME_MS const',
    "export const ABSOLUTE_CEILING_MS = parseInt(process.env.NANOCLAW_ABSOLUTE_CEILING_MS || '', 10) || 30 * 60 * 1000;",
    "export const ABSOLUTE_CEILING_MS = parseInt(process.env.NANOCLAW_ABSOLUTE_CEILING_MS || '', 10) || 30 * 60 * 1000;\n"
    "// Wall-clock max-lifetime for any running container, regardless of\n"
    "// heartbeat or activity. Prevents long-lived containers from drifting\n"
    "// out of their system prompt / response format. 0 disables the cap.\n"
    "export const MAX_LIFETIME_MS = parseInt(process.env.NANOCLAW_MAX_LIFETIME_MS || '', 10) || 4 * 60 * 60 * 1000;",
    'MAX_LIFETIME_MS',
)

# 2b. extend the StuckDecision union
patch(
    SWEEP,
    'host-sweep.ts/StuckDecision union',
    "export type StuckDecision =\n"
    "  | { action: 'ok' }\n"
    "  | { action: 'kill-ceiling'; heartbeatAgeMs: number; ceilingMs: number }\n"
    "  | { action: 'kill-claim'; messageId: string; claimAgeMs: number; toleranceMs: number };",
    "export type StuckDecision =\n"
    "  | { action: 'ok' }\n"
    "  | { action: 'kill-ceiling'; heartbeatAgeMs: number; ceilingMs: number }\n"
    "  | { action: 'kill-claim'; messageId: string; claimAgeMs: number; toleranceMs: number }\n"
    "  | { action: 'kill-lifetime'; lifetimeMs: number; capMs: number };",
    'kill-lifetime',
)

# 2c. extend decideStuckAction signature + add lifetime check
patch(
    SWEEP,
    'host-sweep.ts/decideStuckAction',
    "export function decideStuckAction(args: {\n"
    "  now: number;\n"
    "  heartbeatMtimeMs: number; // 0 when heartbeat file absent\n"
    "  containerState: ContainerState | null;\n"
    "  claims: Array<{ message_id: string; status_changed: string }>;\n"
    "}): StuckDecision {\n"
    "  const { now, heartbeatMtimeMs, containerState, claims } = args;\n"
    "  const declaredBashMs = bashTimeoutMs(containerState);",
    "export function decideStuckAction(args: {\n"
    "  now: number;\n"
    "  heartbeatMtimeMs: number; // 0 when heartbeat file absent\n"
    "  containerState: ContainerState | null;\n"
    "  claims: Array<{ message_id: string; status_changed: string }>;\n"
    "  containerStartedAtMs: number | null;\n"
    "}): StuckDecision {\n"
    "  const { now, heartbeatMtimeMs, containerState, claims, containerStartedAtMs } = args;\n"
    "  const declaredBashMs = bashTimeoutMs(containerState);\n"
    "\n"
    "  // Wall-clock max-lifetime check. Fires even when the container is\n"
    "  // actively working — prevents prompt drift on long-lived containers.\n"
    "  // Skipped while a Bash tool with declared timeout is running, so we\n"
    "  // don't interrupt user-declared long jobs.\n"
    "  if (\n"
    "    MAX_LIFETIME_MS > 0 &&\n"
    "    containerStartedAtMs !== null &&\n"
    "    declaredBashMs === null\n"
    "  ) {\n"
    "    const lifetime = now - containerStartedAtMs;\n"
    "    if (lifetime > MAX_LIFETIME_MS) {\n"
    "      return { action: 'kill-lifetime', lifetimeMs: lifetime, capMs: MAX_LIFETIME_MS };\n"
    "    }\n"
    "  }",
    'containerStartedAtMs',
)

# 2d. import the new getter
patch(
    SWEEP,
    'host-sweep.ts/import getContainerStartedAt',
    "import { isContainerRunning, killContainer, wakeContainer } from './container-runner.js';",
    "import { isContainerRunning, killContainer, wakeContainer, getContainerStartedAt } from './container-runner.js';",
    'getContainerStartedAt',
)

# 2e. wire enforceRunningContainerSla to pass containerStartedAtMs + handle new action
patch(
    SWEEP,
    'host-sweep.ts/enforceRunningContainerSla',
    "  const decision = decideStuckAction({\n"
    "    now: Date.now(),\n"
    "    heartbeatMtimeMs: heartbeatMtimeMs(agentGroupId, session.id),\n"
    "    containerState: getContainerState(outDb),\n"
    "    claims: getProcessingClaims(outDb),\n"
    "  });\n"
    "\n"
    "  if (decision.action === 'ok') return;\n"
    "\n"
    "  if (decision.action === 'kill-ceiling') {",
    "  const decision = decideStuckAction({\n"
    "    now: Date.now(),\n"
    "    heartbeatMtimeMs: heartbeatMtimeMs(agentGroupId, session.id),\n"
    "    containerState: getContainerState(outDb),\n"
    "    claims: getProcessingClaims(outDb),\n"
    "    containerStartedAtMs: getContainerStartedAt(session.id),\n"
    "  });\n"
    "\n"
    "  if (decision.action === 'ok') return;\n"
    "\n"
    "  if (decision.action === 'kill-lifetime') {\n"
    "    log.warn('Killing container past max lifetime', {\n"
    "      sessionId: session.id,\n"
    "      lifetimeMs: decision.lifetimeMs,\n"
    "      capMs: decision.capMs,\n"
    "    });\n"
    "    killContainer(session.id, 'max-lifetime');\n"
    "    resetStuckProcessingRows(inDb, outDb, session, 'max-lifetime');\n"
    "    return;\n"
    "  }\n"
    "\n"
    "  if (decision.action === 'kill-ceiling') {",
    'getContainerStartedAt(session.id)',
)

print('done')
