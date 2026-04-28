#!/bin/bash
# claw.sh — Portainer API wrapper for NanoClaw v2 ops on Dokploy LXC.
#
# Reads credentials from ops/.env (gitignored). Never hardcodes secrets.
#
# Usage:
#   claw.sh status         - list running NanoClaw containers
#   claw.sh logs [N]       - tail N log lines from orchestrator's main agent container
#   claw.sh exec <cmd>     - run command inside the running NanoClaw agent container
#   claw.sh host <cmd>     - run command on the host via a temp postgres:15-alpine container
#                            with /opt/nanoclaw mounted at /nanoclaw

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy ops/.env.example to ops/.env and fill in credentials." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${PORTAINER_URL:?PORTAINER_URL not set in ops/.env}"
: "${PORTAINER_USER:?PORTAINER_USER not set in ops/.env}"
: "${PORTAINER_PASSWORD:?PORTAINER_PASSWORD not set in ops/.env}"
: "${DOKPLOY_ENDPOINT_ID:?DOKPLOY_ENDPOINT_ID not set in ops/.env}"

NANOCLAW_INSTALL_PATH="${NANOCLAW_INSTALL_PATH:-/opt/nanoclaw-v2}"

# Get auth token from Portainer.
get_token() {
  curl -s -k -X POST "$PORTAINER_URL/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$PORTAINER_USER\",\"password\":\"$PORTAINER_PASSWORD\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])"
}

# Find first running container whose name contains "nanoclaw".
find_container() {
  local token=$1
  curl -s -k --max-time 15 \
    -H "Authorization: Bearer $token" \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/json?all=true" | \
    python3 -c "
import sys, json
for c in json.load(sys.stdin):
    if 'nanoclaw' in c['Names'][0].lower():
        print(c['Id'][:12])
        break
"
}

# Execute command in the running NanoClaw agent container via docker exec.
docker_exec() {
  local token=$1 cid=$2 cmd=$3
  local exec_id
  exec_id=$(curl -s -k --max-time 15 -X POST \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    -d "{\"AttachStdout\":true,\"AttachStderr\":true,\"Cmd\":[\"sh\",\"-c\",\"$cmd\"]}" \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/$cid/exec" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")
  curl -s -k --max-time 30 -X POST \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    -d '{"Detach":false,"Tty":true}' \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/exec/$exec_id/start"
}

# Execute command on the host via a temporary postgres:15-alpine container that has
# /opt/nanoclaw mounted at /nanoclaw and a few other read-only host paths.
host_exec() {
  local token=$1 cmd=$2
  local cid
  cid=$(curl -s -k --max-time 15 -X POST \
    -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
    -d "{\"Image\":\"postgres:15-alpine\",\"Cmd\":[\"sh\",\"-c\",\"$cmd\"],\"HostConfig\":{\"Binds\":[\"/opt/nanoclaw:/nanoclaw\",\"/etc:/host-etc:ro\",\"/var/run/docker.sock:/var/run/docker.sock\"]}}" \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/create" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])")
  curl -s -k -X POST -H "Authorization: Bearer $token" \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/$cid/start" >/dev/null
  sleep 3
  curl -s -k --max-time 30 -H "Authorization: Bearer $token" \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/$cid/logs?stdout=true&stderr=true&tail=2000" | \
    sed 's/^.\{8\}//'
  curl -s -k -X DELETE -H "Authorization: Bearer $token" \
    "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/$cid?force=true" >/dev/null
}

TOKEN=$(get_token)

case "$1" in
  status)
    curl -s -k --max-time 15 -H "Authorization: Bearer $TOKEN" \
      "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/json" | \
      python3 -c "
import sys, json
print('=== Nanoclaw Container Status ===')
for c in json.load(sys.stdin):
    if 'nanoclaw' in c['Names'][0].lower():
        print(f'Name:    {c[\"Names\"][0]}')
        print(f'ID:      {c[\"Id\"][:12]}')
        print(f'Image:   {c[\"Image\"]}')
        print(f'State:   {c[\"State\"]}')
        print(f'Status:  {c[\"Status\"]}')
"
    ;;
  logs)
    LINES=${2:-50}
    CID=$(find_container "$TOKEN")
    echo "=== Last $LINES log lines ==="
    curl -s -k --max-time 15 -H "Authorization: Bearer $TOKEN" \
      "$PORTAINER_URL/api/endpoints/$DOKPLOY_ENDPOINT_ID/docker/containers/$CID/logs?stdout=true&stderr=true&tail=$LINES" | \
      sed 's/^.\{8\}//'
    ;;
  exec)
    shift
    CID=$(find_container "$TOKEN")
    docker_exec "$TOKEN" "$CID" "$*"
    ;;
  host)
    shift
    host_exec "$TOKEN" "$*"
    ;;
  *)
    echo "Usage: $0 {status|logs [N]|exec <cmd>|host <cmd>}"
    exit 1
    ;;
esac
