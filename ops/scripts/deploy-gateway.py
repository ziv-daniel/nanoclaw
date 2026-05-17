#!/usr/bin/env python3
"""
Deploy the MCP Gateway to /opt/mcp-gateway/ on the Dokploy host.

Steps:
  1. Create /opt/mcp-gateway/ on the host (via container with /opt bind-mount).
  2. Upload all files as a tar archive via stdin.
  3. Write /opt/mcp-gateway/.env with live credentials.
  4. Run `docker compose up --build -d` on the host via nsenter.

Reads credentials from ops/.env (never hardcoded in this script).
"""
import base64
import io
import json
import os
import ssl
import sys
import tarfile
import time
import urllib.request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ENV = {}
# Walk up the directory tree from this script to find ops/.env (handles worktrees).
def _find_env():
    here = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        candidate = os.path.join(here, "ops", ".env")
        if os.path.exists(candidate):
            return candidate
        # Also check the directory itself as ops/
        candidate2 = os.path.join(here, ".env")
        if os.path.exists(candidate2) and os.path.basename(here) == "ops":
            return candidate2
        here = os.path.dirname(here)
    raise FileNotFoundError("ops/.env not found — run from within the nanoclaw-clean repo")
env_path = _find_env()
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
# Match srv.py convention: NANOCLAW_ENDPOINT_ID → default 16.
# DOKPLOY_ENDPOINT_ID is a different concept (Portainer app endpoint, not Docker).
ENDPOINT_ID = int(ENV.get("NANOCLAW_ENDPOINT_ID", "16"))

GATEWAY_DIR = "/opt/mcp-gateway"

def _require(key):
    val = ENV.get(key, "").strip()
    if not val:
        raise RuntimeError(f"{key} missing from ops/.env — required to deploy the gateway")
    return val


# Live secrets injected into .env on the server. Sourced from ops/.env so nothing
# sensitive is ever committed to the repo.
GATEWAY_ENV = {
    "GITHUB_TOKEN": _require("GITHUB_TOKEN"),
    "N8N_API_URL": ENV.get("N8N_API_URL", "https://n8n.danielshaprvt.work"),
    "N8N_API_KEY": _require("N8N_API_KEY"),
    "HA_URL": ENV.get("HA_URL", "https://home.danielshaprvt.work"),
    "HA_TOKEN": _require("HA_TOKEN"),
    "DOKPLOY_URL": ENV.get("DOKPLOY_URL", "https://dokploy.danielshaprvt.work"),
    "DOKPLOY_API_KEY": ENV.get("DOKPLOY_API_KEY", "placeholder"),
}

# Source files relative to ops/mcp-gateway/.
THIS_DIR = os.path.dirname(__file__)
GATEWAY_SRC = os.path.join(THIS_DIR, "..", "mcp-gateway")

# ---------------------------------------------------------------------------
# Portainer helpers
# ---------------------------------------------------------------------------

def _ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _req(method, path, body=None, token=None, timeout=120):
    url = f"{PORTAINER_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=_ctx(), timeout=timeout) as resp:
        raw = resp.read()
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw


def get_token():
    return _req("POST", "/api/auth", {"username": PORTAINER_USER, "password": PORTAINER_PASS})["jwt"]


def get_logs_raw(token, cid):
    url = f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/logs?stdout=true&stderr=true"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"},
    )
    with urllib.request.urlopen(req, context=_ctx(), timeout=60) as resp:
        raw = resp.read()
    out = b""
    i = 0
    while i < len(raw):
        if i + 8 > len(raw):
            break
        size = int.from_bytes(raw[i + 4 : i + 8], "big")
        out += raw[i + 8 : i + 8 + size]
        i += 8 + size
    return out


def wait_done(token, cid, max_secs=600):
    last_log = 0
    for i in range(max_secs * 2):
        info = _req(
            "GET",
            f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/json",
            token=token,
        )
        if info.get("State", {}).get("Status") in ("exited", "dead"):
            return info["State"].get("ExitCode", 0)
        secs = i // 2
        if secs - last_log >= 30:
            print(f"  … still running ({secs}s)", flush=True)
            last_log = secs
        time.sleep(0.5)
    return -1


def ensure_image(token, image):
    if ":" in image:
        from_image, tag = image.rsplit(":", 1)
    else:
        from_image, tag = image, "latest"
    url = (
        f"{PORTAINER_URL}/api/endpoints/{ENDPOINT_ID}/docker/images/create"
        f"?fromImage={from_image}&tag={tag}"
    )
    req = urllib.request.Request(
        url,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 nanoclaw-deploy"},
    )
    with urllib.request.urlopen(req, context=_ctx(), timeout=300) as resp:
        while resp.read(8192):
            pass


def run_container(token, cmd, binds, image="alpine:3.20", stdin_bytes=b"",
                  privileged=False, pid_host=False, max_secs=600):
    """Run a one-shot container, stream logs, return exit code."""
    ensure_image(token, image)

    if stdin_bytes:
        b64 = base64.b64encode(stdin_bytes).decode()
        wrapped = f"set -e; echo '{b64}' | base64 -d > /tmp/stdin; ({cmd}) < /tmp/stdin"
    else:
        wrapped = cmd

    host_cfg = {"Binds": binds, "AutoRemove": False}
    if privileged:
        host_cfg["Privileged"] = True
    if pid_host:
        host_cfg["PidMode"] = "host"

    body = {"Image": image, "Cmd": ["sh", "-c", wrapped], "HostConfig": host_cfg}
    create = _req(
        "POST",
        f"/api/endpoints/{ENDPOINT_ID}/docker/containers/create",
        body,
        token,
        timeout=60,
    )
    cid = create["Id"]
    try:
        _req("POST", f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}/start", token=token)
        ec = wait_done(token, cid, max_secs=max_secs)
        logs = get_logs_raw(token, cid)
        sys.stdout.buffer.write(logs)
        sys.stdout.buffer.flush()
        return ec
    finally:
        try:
            _req(
                "DELETE",
                f"/api/endpoints/{ENDPOINT_ID}/docker/containers/{cid}?force=true",
                token=token,
            )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Build tar from local source files
# ---------------------------------------------------------------------------

def build_tar():
    """Return a gzipped tar of ops/mcp-gateway/ with the live .env included."""
    buf = io.BytesIO()
    files_added = []
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for fname in ("Dockerfile", "gateway.mjs", "docker-compose.yml"):
            fpath = os.path.join(GATEWAY_SRC, fname)
            if not os.path.exists(fpath):
                raise FileNotFoundError(f"Missing source file: {fpath}")
            tar.add(fpath, arcname=fname)
            files_added.append(fname)

        # Write live .env from GATEWAY_ENV dict.
        env_content = "\n".join(f"{k}={v}" for k, v in GATEWAY_ENV.items()) + "\n"
        env_bytes = env_content.encode()
        info = tarfile.TarInfo(name=".env")
        info.size = len(env_bytes)
        tar.addfile(info, io.BytesIO(env_bytes))
        files_added.append(".env")

    print(f"  Packed {len(files_added)} files: {', '.join(files_added)}")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"[1/3] Authenticating to Portainer (endpoint {ENDPOINT_ID})...")
    token = get_token()
    print("      OK")

    # Step 1 — create directory + upload all files in one container run.
    print(f"[2/3] Uploading gateway files to {GATEWAY_DIR}...")
    tar_bytes = build_tar()
    print(f"      Archive size: {len(tar_bytes):,} bytes")
    ec = run_container(
        token,
        "mkdir -p /opt-host/mcp-gateway && tar -xzf /tmp/stdin -C /opt-host/mcp-gateway && echo UPLOAD_OK",
        binds=["/opt:/opt-host"],
        stdin_bytes=tar_bytes,
    )
    if ec != 0:
        print(f"ERROR: file upload failed (exit {ec})", file=sys.stderr)
        sys.exit(1)
    print("      OK")

    # Upload proxy script to /opt/nanoclaw-v2/shared/ (for Phase 2 agent config).
    proxy_path = os.path.join(GATEWAY_SRC, "mcp-gateway-proxy.mjs")
    if os.path.exists(proxy_path):
        print("[2b/3] Uploading proxy script to /opt/nanoclaw-v2/shared/...")
        with open(proxy_path, "rb") as f:
            proxy_bytes = f.read()
        ec = run_container(
            token,
            "mkdir -p /nc/shared && cat /tmp/stdin > /nc/shared/mcp-gateway-proxy.mjs && chmod +x /nc/shared/mcp-gateway-proxy.mjs && echo PROXY_OK",
            binds=["/opt/nanoclaw-v2:/nc"],
            stdin_bytes=proxy_bytes,
        )
        if ec != 0:
            print(f"      WARNING: proxy upload failed (exit {ec}) — continuing", file=sys.stderr)
        else:
            print("      OK")

    # Step 2 — docker compose build + up on the host via nsenter.
    # nsenter reaches the host Docker daemon from inside the privileged container.
    # set -e inside bash ensures the exit code propagates on first failure.
    print("[3/3] Building and starting MCP Gateway container (this takes ~5-10 min)...")
    nsenter = "nsenter -t 1 -m -u -i -n -p --"
    ec = run_container(
        token,
        f"{nsenter} bash -c 'set -e; cd {GATEWAY_DIR}; docker compose build --no-cache 2>&1; docker compose up -d 2>&1; echo COMPOSE_OK'",
        binds=[],
        image="alpine:3.19",
        privileged=True,
        pid_host=True,
        max_secs=900,
    )
    if ec != 0:
        print(f"ERROR: docker compose failed (exit {ec})", file=sys.stderr)
        sys.exit(1)
    print("      OK")

    print()
    print("MCP Gateway deployed!")
    print("  Health:  (internal-only — check docker logs mcp-gateway)")
    print("  GitHub:  curl -N http://<host>:3001/sse")
    print("  n8n:     curl -N http://<host>:3002/sse")
    print("  hass:    curl -N http://<host>:3005/sse  (3003 was taken)")
    print("  dokploy: curl -N http://<host>:3004/sse")


if __name__ == "__main__":
    main()
