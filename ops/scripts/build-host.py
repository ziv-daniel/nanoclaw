#!/usr/bin/env python3
"""
Build the NanoClaw host (compile src/ -> dist/) by spawning a node:20-alpine
container on the Dokploy host with /opt/nanoclaw-v2 mounted at /nc.

Reuses creds from ops/.env (PORTAINER_URL, PORTAINER_USER, PORTAINER_PASSWORD,
NANOCLAW_ENDPOINT_ID, NANOCLAW_INSTALL_PATH).

Mirrors srv.py's auth/exec/poll pattern but uses node:20-alpine instead of
postgres:15-alpine, and writes build output to /nc/tmp/build.log so it can
be inspected after the container exits.
"""
import json
import os
import ssl
import sys
import time
import urllib.request

ENV = {}
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()

PORTAINER_URL = ENV["PORTAINER_URL"]
PORTAINER_USER = ENV["PORTAINER_USER"]
PORTAINER_PASS = ENV["PORTAINER_PASSWORD"]
ENDPOINT_ID = int(ENV.get("NANOCLAW_ENDPOINT_ID", "16"))
INSTALL_PATH = ENV.get("NANOCLAW_INSTALL_PATH", "/opt/nanoclaw-v2")
IMAGE = "node:20-alpine"


def _ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _req(method, path, body=None, token=None):
    url = f"{PORTAINER_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=_ctx(), timeout=300) as resp:
        body = resp.read()
        if not body:
            return None
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return body


def get_token():
    return _req("POST", "/api/auth", {"username": PORTAINER_USER, "password": PORTAINER_PASS})["jwt"]


def get_logs_raw(token, cid):
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/logs?stdout=true&stderr=true"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"})
    with urllib.request.urlopen(req, context=_ctx(), timeout=60) as resp:
        raw = resp.read()
    out = b""
    i = 0
    while i < len(raw):
        if i + 8 > len(raw):
            break
        size = int.from_bytes(raw[i + 4:i + 8], "big")
        out += raw[i + 8:i + 8 + size]
        i += 8 + size
    return out


def wait_done(token, cid, max_secs=300):
    last_log = 0
    for i in range(max_secs * 2):
        info = _req("GET", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/json", token=token)
        if info.get("State", {}).get("Status") in ("exited", "dead"):
            return info["State"].get("ExitCode", 0)
        secs = i // 2
        if secs - last_log >= 60:
            print(f"… still running ({secs}s)", file=sys.stderr, flush=True)
            last_log = secs
        time.sleep(0.5)
    return -1


def ensure_image(token, image):
    """POST /images/create?fromImage=name&tag=tag — idempotent, returns 200 even if already present."""
    if ":" in image:
        from_image, tag = image.split(":", 1)
    else:
        from_image, tag = image, "latest"
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/images/create?fromImage={from_image}&tag={tag}"
    req = urllib.request.Request(
        url,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"},
    )
    with urllib.request.urlopen(req, context=_ctx(), timeout=300) as resp:
        # Stream the pull progress, discard
        while resp.read(8192):
            pass


def run(cmd, image=IMAGE, privileged=False, pid_host=False, max_secs=300):
    token = get_token()
    ensure_image(token, image)
    host_cfg = {
        "Binds": [f"{INSTALL_PATH}:/nc"],
        "AutoRemove": False,
    }
    if privileged:
        host_cfg["Privileged"] = True
    if pid_host:
        host_cfg["PidMode"] = "host"
    body = {
        "Image": image,
        "Cmd": ["sh", "-c", cmd],
        "HostConfig": host_cfg,
    }
    create = _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/create", body, token)
    cid = create["Id"]
    try:
        _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/start", token=token)
        exit_code = wait_done(token, cid, max_secs=max_secs)
        logs = get_logs_raw(token, cid)
        sys.stdout.buffer.write(logs)
        sys.stdout.buffer.flush()
        return exit_code
    finally:
        try:
            _req("DELETE", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}?force=true", token=token)
        except Exception:
            pass


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "build"
    if action == "build":
        # tsc-only build. node_modules already exists on the host.
        cmd = "cd /nc && node node_modules/typescript/bin/tsc -p . 2>&1 && echo BUILD_OK || echo BUILD_FAILED"
        ec = run(cmd)
        sys.exit(ec if ec >= 0 else 1)
    elif action == "restart":
        # Privileged container with PidMode:host so nsenter can reach pid 1's namespaces.
        cmd = "nsenter -t 1 -m -u -i -n -p -- systemctl restart nanoclaw-v2-2e602aa0 && echo RESTARTED || (echo RESTART_FAILED; nsenter -t 1 -m -u -i -n -p -- systemctl status nanoclaw-v2-2e602aa0 --no-pager | head -30)"
        ec = run(cmd, image="alpine:3.19", privileged=True, pid_host=True)
        sys.exit(ec if ec >= 0 else 1)
    elif action == "build-agent":
        # Rebuild the nanoclaw-agent docker image on the host. Runs build.sh via
        # nsenter into pid 1 so `docker build` reaches the host daemon. Up to 20 min.
        cmd = "nsenter -t 1 -m -u -i -n -p -- bash -c 'cd /opt/nanoclaw-v2/container && bash build.sh 2>&1 | tail -80' && echo BUILD_AGENT_OK || echo BUILD_AGENT_FAILED"
        ec = run(cmd, image="alpine:3.19", privileged=True, pid_host=True, max_secs=1200)
        sys.exit(ec if ec >= 0 else 1)
    elif action == "service-name":
        # Probe for the unit name
        cmd = "nsenter -t 1 -m -u -i -n -p -- systemctl list-units --type=service --all 'nanoclaw*' --no-pager"
        ec = run(cmd, image="alpine:3.19", privileged=True, pid_host=True)
        sys.exit(ec if ec >= 0 else 1)
    else:
        print(f"unknown action: {action}", file=sys.stderr)
        sys.exit(2)
