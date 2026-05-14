#!/usr/bin/env python3
"""Auto-rotate the Claude SDK session in the agent-runner when the JSONL
transcript grows past a threshold, to prevent prompt-format drift.

Adds two new behaviours in `container/agent-runner/src/poll-loop.ts`:

  1. At poll-loop startup, after reading the stored continuation:
     - if the transcript JSONL exists and is larger than
       NANOCLAW_MAX_SESSION_BYTES (default 5 MB) OR has more than
       NANOCLAW_MAX_SESSION_TURNS lines (default 1500), clear it and
       start fresh.

  2. Periodically (every 50 polls) re-check the same condition. If the
     active session has grown past the cap mid-run, set continuation =
     undefined and clearStoredSessionId() so the next query starts a
     new SDK session.

Idempotent: re-running detects already-applied changes (looks for the
`maybeRotateSession` marker) and skips.

Run on host:
    python3 ops/patches/2026-04-29-auto-rotate-session.py /opt/nanoclaw-v2
"""
import sys
from pathlib import Path

PREFIX = sys.argv[1] if len(sys.argv) > 1 else '/opt/nanoclaw-v2'
POLL = Path(f'{PREFIX}/container/agent-runner/src/poll-loop.ts')


def patch(label: str, old: str, new: str, marker: str, path: Path = POLL) -> None:
    text = path.read_text()
    if marker in text:
        print(f'{label}: marker present, skipping')
        return
    if old not in text:
        raise SystemExit(f'{label}: anchor not found')
    path.write_text(text.replace(old, new))
    print(f'{label}: edited')


# 1. Add `import fs from 'fs'` and `import path from 'path'` if not present,
#    plus the rotation helper. Inserted right after the existing imports.
patch(
    'poll-loop.ts/imports + maybeRotateSession helper',
    "import { getStoredSessionId, setStoredSessionId, clearStoredSessionId } from './db/session-state.js';",
    "import { getStoredSessionId, setStoredSessionId, clearStoredSessionId } from './db/session-state.js';\n"
    "import fs from 'fs';\n"
    "import path from 'path';\n"
    "\n"
    "// Auto-rotate the Claude SDK session before its transcript grows past\n"
    "// the size where prompt-format drift becomes likely. Empirically a\n"
    "// 9.7 MB / 2,915-turn JSONL was severe enough that every container\n"
    "// resuming the session learned a broken response format from history.\n"
    "// Defaults: 5 MB OR 1500 turns. Tuneable via env.\n"
    "const MAX_SESSION_BYTES = parseInt(process.env.NANOCLAW_MAX_SESSION_BYTES || '', 10) || 5 * 1024 * 1024;\n"
    "const MAX_SESSION_TURNS = parseInt(process.env.NANOCLAW_MAX_SESSION_TURNS || '', 10) || 1500;\n"
    "\n"
    "function transcriptPath(continuation: string): string | null {\n"
    "  const home = process.env.HOME;\n"
    "  if (!home) return null;\n"
    "  // Claude SDK encodes the cwd into the projects dir slug: each `/`\n"
    "  // becomes `-`, leading `/` stays as a leading `-`. For a runner\n"
    "  // working in /workspace/agent that produces `-workspace-agent`.\n"
    "  const cwd = process.cwd();\n"
    "  const slug = cwd.replace(/\\//g, '-');\n"
    "  return path.join(home, '.claude', 'projects', slug, `${continuation}.jsonl`);\n"
    "}\n"
    "\n"
    "/** Returns true if the caller should clear `continuation` and start fresh. */\n"
    "function maybeRotateSession(continuation: string | undefined, log: (msg: string) => void): boolean {\n"
    "  if (!continuation) return false;\n"
    "  const tp = transcriptPath(continuation);\n"
    "  if (!tp) return false;\n"
    "  let size = 0;\n"
    "  let turns = 0;\n"
    "  try {\n"
    "    size = fs.statSync(tp).size;\n"
    "    if (size <= MAX_SESSION_BYTES / 2) return false; // fast path: small file, no need to count lines\n"
    "    // Count newlines lazily — only when we're already over half the byte budget.\n"
    "    const buf = fs.readFileSync(tp);\n"
    "    turns = 0;\n"
    "    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) turns++;\n"
    "  } catch {\n"
    "    return false;\n"
    "  }\n"
    "  if (size > MAX_SESSION_BYTES || turns > MAX_SESSION_TURNS) {\n"
    "    log(`Auto-rotating session ${continuation}: ${size} bytes / ${turns} turns exceeds cap (${MAX_SESSION_BYTES} bytes / ${MAX_SESSION_TURNS} turns)`);\n"
    "    return true;\n"
    "  }\n"
    "  return false;\n"
    "}",
    'maybeRotateSession',
)

# 2. Hook the rotation check into runPollLoop's startup, right after the
#    "Resuming agent session" log.
patch(
    'poll-loop.ts/startup rotation check',
    "  if (continuation) {\n"
    "    log(`Resuming agent session ${continuation}`);\n"
    "  }",
    "  if (continuation) {\n"
    "    log(`Resuming agent session ${continuation}`);\n"
    "    if (maybeRotateSession(continuation, log)) {\n"
    "      continuation = undefined;\n"
    "      clearStoredSessionId();\n"
    "      log('Cleared stored session ID — next query will start a fresh Claude session.');\n"
    "    }\n"
    "  }",
    'maybeRotateSession(continuation, log)',
)

# 3. Periodic mid-run check inside the poll heartbeat block.
patch(
    'poll-loop.ts/periodic rotation check',
    "    // Periodic heartbeat so we know the loop is alive\n"
    "    if (pollCount % 30 === 0) {\n"
    "      log(`Poll heartbeat (${pollCount} iterations, ${messages.length} pending)`);\n"
    "    }",
    "    // Periodic heartbeat so we know the loop is alive\n"
    "    if (pollCount % 30 === 0) {\n"
    "      log(`Poll heartbeat (${pollCount} iterations, ${messages.length} pending)`);\n"
    "    }\n"
    "\n"
    "    // Periodic rotation check: if the active session has grown past\n"
    "    // the size cap mid-run, clear it so the next query starts fresh.\n"
    "    // Skipped while a query is active (would interrupt mid-turn).\n"
    "    if (pollCount % 50 === 0 && messages.length === 0 && maybeRotateSession(continuation, log)) {\n"
    "      continuation = undefined;\n"
    "      clearStoredSessionId();\n"
    "      log('Cleared stored session ID mid-run — next query will start a fresh Claude session.');\n"
    "    }",
    'pollCount % 50',
)

print('done')
