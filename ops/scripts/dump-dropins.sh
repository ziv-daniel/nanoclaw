#!/bin/bash
# Dump all systemd unit drop-ins for the NanoClaw v2 service so you can see
# which env vars and overrides are layered on top of the upstream unit file.

UNIT="${1:-nanoclaw-v2-2e602aa0}"
DIR="/etc/systemd/system/${UNIT}.service.d"

if [ ! -d "$DIR" ]; then
  echo "No drop-in dir at $DIR" >&2
  exit 1
fi

for f in "$DIR"/*.conf; do
  echo "=== $f ==="
  cat "$f"
  echo ""
done
