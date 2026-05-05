#!/usr/bin/env python3
"""
Pull current live server state into container/agent-runner/src/.

Use this when the server has drifted ahead of the local repo
(e.g. Claw applied a self-mod patch, or you deployed a fix directly).

After pulling, review `git diff`, commit what you want to keep,
then push to origin.

Usage:
  python ops/scripts/pull-server-state.py          # pull entire src/
  python ops/scripts/pull-server-state.py src/poll-loop.ts  # pull one file
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import ssl

PORTAINER_URL = "https://portainer.danielshaprvt.work"
PORTAINER_USER = "admin"
PORTAINER_PASS = "Z5877029admin"
ENDPOINT_ID = 16
IMAGE = "postgres:15-alpine"
AGENT_RUNNER_LOCAL = os.path.join(os.path.dirname(__file__), "../../container/agent-runner")
SERVER_SRC = "/opt/nanoclaw-v2/container/agent-runner/src"


def _ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

def _req(method, path, body=None, token=None):
    url = f"{PORTAINER_URL}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=_ctx(), timeout=30) as resp:
        return json.loads(resp.read())

def get_token():
    r = _req("POST", "/api/auth", {"username": PORTAINER_USER, "password": PORTAINER_PASS})
    return r["jwt"]

def run_container(token, cmd_str, binds=None):
    b64 = base64.b64encode(cmd_str.encode()).decode()
    body = {
        "Image": IMAGE,
        "Cmd": ["sh", "-c", f"echo '{b64}' | base64 -d | sh"],
        "HostConfig": {"Binds": binds or []},
    }
    r = _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/create", body, token)
    cid = r["Id"]
    _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/start", token=token)
    return cid

def get_logs_raw(token, cid):
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/logs?stdout=true&stderr=true"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, context=_ctx(), timeout=30) as resp:
        raw = resp.read()
    out = b""
    i = 0
    while i < len(raw):
        if i + 8 > len(raw): break
        size = int.from_bytes(raw[i+4:i+8], "big")
        out += raw[i+8:i+8+size]
        i += 8 + size
    return out

def delete_container(token, cid):
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}?force=true"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="DELETE")
    try:
        urllib.request.urlopen(req, context=_ctx(), timeout=10)
    except Exception:
        pass

def pull_file(token, rel_path, local_base):
    """Download one file from server and write to local_base/rel_path."""
    cmd = f"base64 /src/{rel_path}"
    cid = run_container(token, cmd, binds=[f"{SERVER_SRC}:/src"])
    time.sleep(2)
    raw_logs = get_logs_raw(token, cid)
    delete_container(token, cid)
    try:
        content = base64.b64decode(raw_logs)
    except Exception as e:
        print(f"  ERROR decoding {rel_path}: {e}")
        return False
    local_path = os.path.join(local_base, rel_path.replace("/", os.sep))
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(content)
    print(f"  ✓ {rel_path} ({len(content)} bytes)")
    return True

def list_server_files(token, prefix=""):
    """List all files under src/ on server, optionally filtered by prefix."""
    path_filter = f"/src/{prefix}" if prefix else "/src"
    cmd = f"find {path_filter} -type f | sed 's|/src/||' | sort"
    cid = run_container(token, cmd, binds=[f"{SERVER_SRC}:/src"])
    time.sleep(3)
    raw = get_logs_raw(token, cid)
    delete_container(token, cid)
    return [line for line in raw.decode("utf-8", errors="replace").strip().splitlines() if line]

def main():
    parser = argparse.ArgumentParser(description="Pull live server state into local repo")
    parser.add_argument("target", nargs="?", help="File or dir relative to src/ (default: entire src/)")
    args = parser.parse_args()

    print("Authenticating with Portainer...")
    token = get_token()
    print("OK")

    local_src = os.path.join(AGENT_RUNNER_LOCAL, "src")

    print("Listing files on server...")
    files = list_server_files(token, args.target or "")
    print(f"Found {len(files)} file(s)")

    print("\nDownloading...")
    errors = 0
    for rel in files:
        if not pull_file(token, rel, local_src):
            errors += 1

    if errors:
        print(f"\n{errors} file(s) failed to download.")
        sys.exit(1)

    print("\nPull complete. Review changes with:")
    print("  git -C C:/Repo/nanoclaw-clean diff container/agent-runner/src/")
    print("Then commit what you want to keep.")

if __name__ == "__main__":
    main()
