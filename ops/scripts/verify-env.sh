#!/bin/bash
# Verify the running NanoClaw orchestrator has the expected env vars loaded.
# Run on host as: bash ops/scripts/verify-env.sh
# Or via claw.sh: bash ops/claw.sh host "$(cat ops/scripts/verify-env.sh)"

set -e
PID=$(pgrep -f 'node /opt/nanoclaw-v2/dist/index.js' | head -1)
echo "orchestrator PID: $PID"
if [ -z "$PID" ]; then
  echo "ERROR: orchestrator process not found" >&2
  exit 1
fi

echo "--- NANOCLAW_* env vars in running process ---"
tr '\0' '\n' < "/proc/$PID/environ" | grep -E '^NANOCLAW_' || echo "(no NANOCLAW_ vars found)"

echo "--- agent containers ---"
docker ps --format '{{.Names}} {{.Status}}' | grep nanoclaw-v2 || echo "(no agent containers running)"
