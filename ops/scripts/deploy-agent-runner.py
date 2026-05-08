#!/usr/bin/env python3
"""
Deploy agent-runner source changes to the live server via Portainer API.

Usage:
  python ops/scripts/deploy-agent-runner.py              # deploy all changed files
  python ops/scripts/deploy-agent-runner.py src/poll-loop.ts   # deploy one file
  python ops/scripts/deploy-agent-runner.py src/routing/ # deploy a directory

Compares local container/agent-runner/src/ against the server, uploads diffs.
After upload, runs `bun tsc --noEmit` to verify types.
Does NOT restart the running container — kill it manually so the orchestrator
spawns a fresh one on the next message.
"""

import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

PORTAINER_URL = "https://portainer.danielshaprvt.work"
PORTAINER_USER = "admin"
PORTAINER_PASS = "Z5877029admin"
ENDPOINT_ID = 16
IMAGE = "postgres:15-alpine"
AGENT_RUNNER_LOCAL = os.path.join(os.path.dirname(__file__), "../../container/agent-runner")
SERVER_SRC = "/opt/nanoclaw-v2/container/agent-runner/src"

# ------------------------------------------------------------------
# Portainer helpers
# ------------------------------------------------------------------

def _req(method, path, body=None, token=None):
    url = f"{PORTAINER_URL}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {
        "Content-Type": "application/json",
        # Some upstreams (Cloudflare, WAF) reject the default Python urllib UA
        # with 403 — provide a generic browser-like UA so auth goes through.
        "User-Agent": "Mozilla/5.0 nanoclaw-deploy",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        raw = resp.read()
    # Some endpoints (container start, delete) return 204 No Content with an
    # empty body. Don't crash trying to JSON-parse an empty response.
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None

def get_token():
    r = _req("POST", "/api/auth", {"username": PORTAINER_USER, "password": PORTAINER_PASS})
    return r["jwt"]

def run_container(token, cmd_str, binds=None, privileged=False, pid_mode=None):
    host_config = {"Binds": binds or []}
    if privileged:
        host_config["Privileged"] = True
    if pid_mode:
        host_config["PidMode"] = pid_mode
    b64 = base64.b64encode(cmd_str.encode()).decode()
    body = {
        "Image": IMAGE,
        "Cmd": ["sh", "-c", f"echo '{b64}' | base64 -d | sh"],
        "HostConfig": host_config,
    }
    r = _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/create", body, token)
    cid = r["Id"]
    _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/start", token=token)
    return cid

def get_logs(token, cid, tail=200):
    import ssl, urllib.parse
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/logs?stdout=true&stderr=true&tail={tail}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"})
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        raw = resp.read()
    # Strip Docker log frame headers (8 bytes each)
    out = b""
    i = 0
    while i < len(raw):
        if i + 8 > len(raw): break
        size = int.from_bytes(raw[i+4:i+8], "big")
        out += raw[i+8:i+8+size]
        i += 8 + size
    return out.decode("utf-8", errors="replace")

def delete_container(token, cid):
    import ssl
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}?force=true"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"}, method="DELETE")
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        urllib.request.urlopen(req, context=ctx, timeout=10)
    except Exception:
        pass

def wait_for_exit(token, cid, timeout=60):
    import ssl
    deadline = time.time() + timeout
    while time.time() < deadline:
        url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/json"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"})
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            state = json.loads(resp.read())["State"]
        if state["Status"] == "exited":
            return state["ExitCode"]
        time.sleep(2)
    return None

# ------------------------------------------------------------------
# Upload logic
# ------------------------------------------------------------------

def upload_file(token, local_path, remote_rel):
    """Upload a single file. remote_rel is relative to SERVER_SRC, e.g. 'poll-loop.ts'"""
    with open(local_path, "rb") as f:
        content = f.read()
    b64 = base64.b64encode(content).decode()
    remote_path = f"/dst/{remote_rel}"
    remote_dir = os.path.dirname(remote_path)
    cmd = f"mkdir -p {remote_dir} && printf '%s' '{b64}' | base64 -d > {remote_path} && wc -c {remote_path} && echo UPLOAD_OK"
    cid = run_container(token, cmd, binds=[f"{SERVER_SRC}:/dst"])
    time.sleep(3)
    logs = get_logs(token, cid)
    delete_container(token, cid)
    if "UPLOAD_OK" not in logs:
        print(f"  ERROR uploading {remote_rel}: {logs[:200]}")
        return False
    print(f"  OK {remote_rel} ({len(content)} bytes)")
    return True

def get_server_md5(token, files):
    """Get md5 checksums of files on the server. Returns dict {rel_path: md5}."""
    paths = " ".join(f"/src/{f}" for f in files)
    cmd = f"md5sum {paths} 2>/dev/null || true"
    cid = run_container(token, cmd, binds=[f"{SERVER_SRC}:/src"])
    time.sleep(3)
    logs = get_logs(token, cid)
    delete_container(token, cid)
    result = {}
    for line in logs.strip().splitlines():
        parts = line.split()
        if len(parts) == 2:
            md5, path = parts
            rel = path.replace("/src/", "")
            result[rel] = md5
    return result

def local_md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

def collect_files(target=None):
    """Return list of (local_path, rel_path) for files to consider deploying."""
    src_dir = os.path.join(AGENT_RUNNER_LOCAL, "src")
    results = []
    if target:
        target_path = os.path.join(src_dir, target)
        if os.path.isfile(target_path):
            results.append((target_path, target))
        elif os.path.isdir(target_path):
            for root, _, fnames in os.walk(target_path):
                for fname in fnames:
                    full = os.path.join(root, fname)
                    rel = os.path.relpath(full, src_dir).replace("\\", "/")
                    results.append((full, rel))
        else:
            print(f"ERROR: {target} not found in local src")
            sys.exit(1)
    else:
        for root, _, fnames in os.walk(src_dir):
            for fname in fnames:
                full = os.path.join(root, fname)
                rel = os.path.relpath(full, src_dir).replace("\\", "/")
                results.append((full, rel))
    return results

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Deploy agent-runner source to server")
    parser.add_argument("target", nargs="?", help="File or directory relative to src/ (default: all changed)")
    parser.add_argument("--force", action="store_true", help="Upload all files, not just changed ones")
    parser.add_argument("--skip-tsc", action="store_true", help="Skip tsc verification after upload")
    args = parser.parse_args()

    print("Authenticating with Portainer...")
    token = get_token()
    print("OK")

    files = collect_files(args.target)
    rel_paths = [r for _, r in files]

    if not args.force:
        print(f"Checking {len(files)} file(s) against server...")
        server_md5s = get_server_md5(token, rel_paths)
        to_upload = []
        for local_path, rel in files:
            local_m = local_md5(local_path)
            server_m = server_md5s.get(rel)
            if server_m is None:
                print(f"  + {rel} (new)")
                to_upload.append((local_path, rel))
            elif local_m != server_m:
                print(f"  ~ {rel} (changed)")
                to_upload.append((local_path, rel))
        if not to_upload:
            print("Nothing to deploy — server is already up to date.")
        else:
            print(f"\nDeploying {len(to_upload)} file(s)...")
            ok = all(upload_file(token, lp, rel) for lp, rel in to_upload)
            if not ok:
                print("\nDeploy had errors — check output above.")
                sys.exit(1)
    else:
        print(f"Force uploading {len(files)} file(s)...")
        ok = all(upload_file(token, lp, rel) for lp, rel in files)
        if not ok:
            print("\nDeploy had errors.")
            sys.exit(1)

    if not args.skip_tsc:
        print("\nRunning bun tsc --noEmit on server...")
        cmd = 'nsenter -t 1 -m -u -n -p -- sh -c "cd /opt/nanoclaw-v2/container/agent-runner && bun tsc --noEmit 2>&1; echo TSC_EXIT:$?"'
        cid = run_container(token, cmd, privileged=True, pid_mode="host")
        exit_code = wait_for_exit(token, cid, timeout=90)
        logs = get_logs(token, cid, tail=100)
        delete_container(token, cid)
        print(logs)
        if "TSC_EXIT:0" in logs:
            print("OK tsc passed - no type errors.")
        else:
            print("FAIL tsc failed - fix errors before deploying.")
            sys.exit(1)

    print("\nDone. Kill the running agent container so the next message picks up the new code:")
    print("  docker stop -t 5 nanoclaw-v2-telegram_main-<latest>")

if __name__ == "__main__":
    main()
