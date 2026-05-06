---
name: nanoclaw-claw-sh-chunked-upload
description: Upload files to the NanoClaw Dokploy server via claw.sh host with md5 verification. Use when deploying source file edits >~15KB to /opt/nanoclaw via Portainer — naive base64 pipes corrupt files because Portainer injects 8-byte docker log frame headers at 16KB boundaries, and /tmp does not persist across claw.sh host calls.
author: Claude Code
version: 1.0.0
date: 2026-04-21
---

# NanoClaw claw.sh Chunked Upload

## Problem

Editing source files on the NanoClaw server via `claw.sh host` fails silently for non-trivial files:
1. Files larger than ~16KB get random bytes injected when fetched via `base64 -w0 | curl ...` — Portainer's docker log stream splits output into frames with 8-byte `[01 00 00 00 SSSS SSSS]` headers, and those headers land mid-base64 when output crosses the frame boundary.
2. `/tmp` files written by one `claw.sh host` invocation are gone in the next — each call spawns a fresh `postgres:15-alpine` container.

Result: md5 mismatches, silently broken deploys, "I ran `npx tsc` and it succeeded but the behavior didn't change" confusion.

## Context / Trigger Conditions

- Working in `C:\Repo\nanoclaw\` against the NanoClaw Dokploy LXC
- Need to modify a file in `/opt/nanoclaw/src/` (or anywhere under `/opt/nanoclaw/`)
- File is larger than ~8-15KB, OR you want md5 verification regardless of size
- Symptom of the frame-header bug: `base64 -d` errors on decoded pulled files, or md5 mismatches after "successful" upload
- Symptom of the /tmp bug: `ls /tmp/myfile` returns "No such file or directory" the call after you wrote it

## Solution

**Stage on the mounted volume, not `/tmp`.** `claw.sh host` mounts `/opt/nanoclaw` → `/nanoclaw` as a bind, so writes to `/nanoclaw/.upload_stage_*` persist across invocations. Upload each file in ≤6000-byte chunks (safely under the 16KB docker frame size), verify md5, then atomically replace the target.

See `scripts/deploy-file.sh` in this skill's folder for a ready-to-use helper. Inline form:

```bash
upload_file() {
  local LOCAL="$1" REMOTE="$2"
  local STAGE="/nanoclaw/.upload_stage_$$"
  local LOCAL_MD5
  LOCAL_MD5=$(md5sum "$LOCAL" | awk '{print $1}')

  bash claw.sh host ": > ${STAGE}"
  rm -f /tmp/nc_chunk_*
  split -b 6000 "$LOCAL" "/tmp/nc_chunk_"
  for f in /tmp/nc_chunk_*; do
    local B64; B64=$(base64 -w0 < "$f")
    bash claw.sh host "printf '%s' '${B64}' | base64 -d >> ${STAGE}"
  done
  rm -f /tmp/nc_chunk_*

  local REMOTE_MD5
  REMOTE_MD5=$(bash claw.sh host "md5sum ${STAGE}" | awk 'NR==1{print $1}')
  [ "$LOCAL_MD5" = "$REMOTE_MD5" ] || { echo "md5 mismatch" >&2; return 1; }

  local TS; TS=$(date +%s)
  bash claw.sh host "cp ${REMOTE} ${REMOTE}.bak.${TS} && mv ${STAGE} ${REMOTE} && chmod 644 ${REMOTE}"
}
```

**For pulling files back out**, wrap the output in explicit markers and split the source into chunks on the server side too:

```bash
CMD='split -b 8000 /nanoclaw/src/index.ts /tmp/p_ && for f in /tmp/p_*; do
  printf "BEGIN_%s_" "$(basename $f)"; base64 -w0 "$f"; printf "_END\n";
done; rm /tmp/p_*'
B64CMD=$(echo "$CMD" | base64 -w0)
bash claw.sh host "echo $B64CMD | base64 -d | sh" > chunks.raw
# Then in Python: regex BEGIN_(\S+?)_([A-Za-z0-9+/=]+)_END and concat
```

## Verification

After upload, server-side md5 should match local md5:
```bash
bash claw.sh host "md5sum /nanoclaw/src/channels/slack.ts"
# must equal: md5sum slack.ts
```
If they match, the file is correct. Then build + restart via the privileged-container pattern in `CONNECTIVITY.md`.

## Example

Real deploy of `slack.ts` (26KB) and `index.ts` (23KB), 2026-04-21:
```
Uploading slack.ts → /nanoclaw/src/channels/slack.ts (md5=ba5a4dfc...)
remote info: ba5a4dfc...  /nanoclaw/.upload_stage_36569
OK /nanoclaw/src/channels/slack.ts (backup .bak.1776769865)
Uploading index.ts  → /nanoclaw/src/index.ts (md5=3c324a92...)
remote info: 3c324a92...  /nanoclaw/.upload_stage_36569
OK /nanoclaw/src/index.ts (backup .bak.1776769909)
--- Final md5s ---
ba5a4dfc4506c5b8db0b2b4a7ff198c0  /nanoclaw/src/channels/slack.ts
3c324a921cc0aa5f153cd3c0110407e0  /nanoclaw/src/index.ts
```

## Notes

- `$$` is the local shell PID — good enough for staging file uniqueness on a single-user server. Use `mktemp`-style if parallel uploads are a concern.
- The chunk write uses `>>` append; make sure you `: > ${STAGE}` first to truncate any stale content.
- Shell-escape the base64 payload carefully — it contains `/` and `+` which are safe inside single quotes but break inside double quotes. The `printf '%s' '${B64}'` form is known good.
- Never skip the md5 check. Silent corruption is the failure mode you're trying to prevent; a green deploy that produces a syntactically-invalid `.ts` will still `npx tsc` successfully if tsc short-circuits on an earlier module.
- Always back up with `cp ${REMOTE} ${REMOTE}.bak.${TS}` before `mv` — revert is then one command.

## References

- `C:\Repo\nanoclaw\CONNECTIVITY.md` — the in-repo reference on claw.sh and Portainer access
- Docker log stream frame format: [Docker Engine API — container logs](https://docs.docker.com/engine/api/v1.43/#tag/Container/operation/ContainerLogs) (the 8-byte header is documented there; `sed 's/^.\{8\}//'` only strips it at line starts, which is why embedded frames corrupt base64)
