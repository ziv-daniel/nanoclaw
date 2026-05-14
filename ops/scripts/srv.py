#!/usr/bin/env python3
"""
Run a shell command on the Dokploy host with /opt/nanoclaw-v2 mounted at /nc.

Reads creds from ops/.env (PORTAINER_URL, PORTAINER_USER, PORTAINER_PASSWORD,
DOKPLOY_ENDPOINT_ID, NANOCLAW_INSTALL_PATH).

Usage:
  python ops/scripts/srv.py "<sh -c command>"

Stdin (if piped) is forwarded to the command's stdin via a base64-decoded heredoc.
That lets us upload files larger than the URL/arg limit without escaping headaches.
"""
import base64
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
IMAGE = "postgres:15-alpine"


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
    with urllib.request.urlopen(req, context=_ctx(), timeout=60) as resp:
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


def wait_done(token, cid, max_secs=120):
    for _ in range(max_secs * 2):
        info = _req("GET", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/json", token=token)
        if info.get("State", {}).get("Status") in ("exited", "dead"):
            return info["State"].get("ExitCode", 0)
        time.sleep(0.5)
    return -1


def run(cmd, stdin_bytes=b""):
    token = get_token()
    if stdin_bytes:
        b64 = base64.b64encode(stdin_bytes).decode()
        # Pipe stdin via a base64 file so the command can read it from /tmp/stdin
        wrapped = (
            "set -e; "
            f"echo '{b64}' | base64 -d > /tmp/stdin; "
            f"({cmd}) < /tmp/stdin"
        )
    else:
        wrapped = cmd
    body = {
        "Image": IMAGE,
        "Cmd": ["sh", "-c", wrapped],
        "HostConfig": {
            "Binds": [f"{INSTALL_PATH}:/nc"],
            "AutoRemove": False,
        },
    }
    create = _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/create", body, token)
    cid = create["Id"]
    try:
        _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/start", token=token)
        exit_code = wait_done(token, cid)
        logs = get_logs_raw(token, cid)
        sys.stdout.buffer.write(logs)
        sys.stdout.buffer.flush()
        sys.exit(exit_code if exit_code >= 0 else 1)
    finally:
        try:
            _req("DELETE", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}?force=true", token=token)
        except Exception:
            pass


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: srv.py <command>", file=sys.stderr)
        sys.exit(2)
    cmd = sys.argv[1]
    stdin = sys.stdin.buffer.read() if not sys.stdin.isatty() else b""
    run(cmd, stdin)
