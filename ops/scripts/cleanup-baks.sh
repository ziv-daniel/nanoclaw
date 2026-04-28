#!/bin/bash
# Sweep all *.bak* files from the NanoClaw install. Old hand-edits leave bak
# files behind (timestamped, e.g. *.bak.1777384641 or *.bak-pre-port-X);
# this clears them.
#
# Run via: bash ops/claw.sh host "$(cat ops/scripts/cleanup-baks.sh)"

set -e
ROOT="${NANOCLAW_INSTALL_PATH:-/opt/nanoclaw-v2}"

echo "=== bak files BEFORE ==="
find "$ROOT" -maxdepth 4 -name '*.bak*' 2>/dev/null || echo "(none)"

echo ""
echo "=== removing ==="
find "$ROOT" -maxdepth 4 -name '*.bak*' -print -delete 2>/dev/null || true

echo ""
echo "=== AFTER ==="
find "$ROOT" -maxdepth 4 -name '*.bak*' 2>/dev/null || echo "(clean — no baks)"
