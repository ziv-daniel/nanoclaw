#!/usr/bin/env python3
"""
Install a host-side systemd timer that rebuilds the NanoClaw agent image
if it has been pruned. Idempotent — re-running upgrades the unit files.

Cadence: 2 min after boot, then every 5 min. Each tick is a cheap
`docker image inspect`; the heavy `container/build.sh` only fires when
the image is actually missing.

Uses build-host.py's nsenter-into-pid-1 pattern so we can write to /etc
and drive systemctl from inside a privileged Portainer container.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location("build_host", os.path.join(HERE, "build-host.py"))
bh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bh)

HEAL_SCRIPT = r"""#!/bin/bash
# nanoclaw-agent-image-heal — rebuild the agent image if it has been pruned.
# Installed by ops/scripts/install-self-heal.py. Safe to run by hand.
set -euo pipefail

INSTALL="/opt/nanoclaw-v2"
# install-slug.sh reads $PROJECT_ROOT (falling back to $PWD) — under
# systemd CWD is /, which yields the wrong slug, so pin it explicitly.
export PROJECT_ROOT="$INSTALL"
# shellcheck source=/dev/null
source "$INSTALL/setup/lib/install-slug.sh"
IMAGE="$(container_image_base):latest"

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    exit 0
fi

logger -t nanoclaw-self-heal "Agent image $IMAGE missing — rebuilding"
cd "$INSTALL/container"
if bash build.sh latest 2>&1 | logger -t nanoclaw-self-heal; then
    logger -t nanoclaw-self-heal "Rebuild OK"
else
    logger -t nanoclaw-self-heal "Rebuild FAILED (exit $?)"
    exit 1
fi
"""

SERVICE_UNIT = """[Unit]
Description=NanoClaw agent image self-heal (rebuild if pruned)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nanoclaw-agent-image-heal
# Build can take 10+ min on a cold cache
TimeoutStartSec=1800
"""

TIMER_UNIT = """[Unit]
Description=Periodic check that NanoClaw agent image still exists

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=nanoclaw-agent-image-heal.service
AccuracySec=30s

[Install]
WantedBy=timers.target
"""


def _heredoc_install(path: str, content: str, mode: str) -> str:
    """Build a shell snippet that writes `content` to `path` with `mode`.

    Uses a single-quoted base64 payload so any quotes/backticks/$ in the
    content survive the trip through `sh -c` unchanged.
    """
    import base64
    b64 = base64.b64encode(content.encode()).decode()
    return (
        f"echo '{b64}' | base64 -d > {path} && "
        f"chmod {mode} {path}"
    )


def main() -> int:
    parts = [
        _heredoc_install("/usr/local/bin/nanoclaw-agent-image-heal", HEAL_SCRIPT, "0755"),
        _heredoc_install("/etc/systemd/system/nanoclaw-agent-image-heal.service", SERVICE_UNIT, "0644"),
        _heredoc_install("/etc/systemd/system/nanoclaw-agent-image-heal.timer", TIMER_UNIT, "0644"),
        "systemctl daemon-reload",
        "systemctl enable --now nanoclaw-agent-image-heal.timer",
        "systemctl list-timers nanoclaw-agent-image-heal.timer --no-pager",
    ]
    inner = " && ".join(parts)
    # nsenter into pid 1 so writes hit the real host filesystem and
    # systemctl drives the host's systemd, not the temp container's.
    cmd = f"nsenter -t 1 -m -u -i -n -p -- bash -c {repr(inner)}"
    ec = bh.run(cmd, image="alpine:3.19", privileged=True, pid_host=True, max_secs=120)
    return ec if ec >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
