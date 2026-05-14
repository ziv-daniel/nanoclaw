---
name: portainer-base64-file-deploy
description: |
  Deploy files to remote servers via Portainer API using base64 encoding when SSH/SCP is unavailable.
  Use when: (1) need to write or update files on a server with only Portainer access,
  (2) SCP/SFTP/SSH are unavailable, (3) file content has special characters that break
  shell escaping through API chains, (4) deploying code changes to production via Portainer.
  Covers both small edits (sed) and full file transfers (base64).
author: Claude Code
version: 1.0.0
date: 2026-04-03
---

# Portainer: File Deployment via Base64

## Problem

When Portainer API is the only access method to a server (no SSH), deploying file changes
requires passing content through multiple shell layers (local bash -> curl JSON -> container sh).
Special characters, quotes, angle brackets, and pipes break at each layer. Base64 encoding
bypasses all escaping issues.

## Context / Trigger Conditions

- SSH/SCP unavailable for file transfer
- Need to write multi-line files through Portainer API
- `sed` commands fail due to special characters in content (TypeScript generics `<T>`, pipes `|`, backticks)
- Python/JSON escaping errors when passing code through Portainer create-container API
- `claw.sh host` command fails with `KeyError: 'Id'` on complex commands

## Solution

### Strategy 1: Small edits — sed through base64-encoded commands

For simple line insertions or replacements:

```bash
# 1. Create the sed command locally
CMD='sed -i "/pattern/a\\  new line content here" /path/to/file.ts'

# 2. Base64 encode it
B64=$(echo "$CMD" | base64 -w0)

# 3. Execute via Portainer host
bash claw.sh host "echo $B64 | base64 -d | sh"
```

### Strategy 2: Multi-line content — base64-encoded file blocks

For methods, functions, or config blocks:

```bash
# 1. Write content to a local temp file
cat > /tmp/new_method.ts << 'EOF'

  async myMethod(): Promise<void> {
    const result = await something<Type>();
    return result;
  }
EOF

# 2. Base64 encode
B64=$(base64 -w0 /tmp/new_method.ts)

# 3. On server: decode to temp file, then use sed to insert at specific line
bash claw.sh host "echo '$B64' | base64 -d > /tmp/block.ts && sed -i '${LINE_NUMBER}r /tmp/block.ts' /path/to/target.ts && rm /tmp/block.ts && echo DONE"
```

### Strategy 3: Full file replacement — base64-encoded entire file

For complete file writes (under ~50KB base64):

```bash
B64=$(base64 -w0 local_file.ts)
bash claw.sh host "echo '$B64' | base64 -d > /server/path/file.ts && echo DONE"
```

### Strategy 4: Append to file

For adding new functions/exports to the end of a file:

```bash
B64=$(base64 -w0 /tmp/additions.ts)
bash claw.sh host "echo '$B64' | base64 -d >> /server/path/file.ts && echo DONE"
```

## Size Limits

| Method | Max size | Notes |
|--------|----------|-------|
| sed command via base64 | ~2KB command | Shell arg limit |
| Content block insert | ~30KB base64 | Portainer API body limit |
| Full file replace | ~50KB base64 | Single shell argument limit |
| Larger files | Split into chunks | Append in sequence |

## Verification

Always verify after deployment:

```bash
# Check specific content was added
bash claw.sh exec "grep -n 'functionName' /workspace/project/src/file.ts"

# Check line count matches expectations
bash claw.sh host "wc -l /path/to/file.ts"

# Read specific lines
bash claw.sh host "sed -n '100,120p' /path/to/file.ts"
```

## Gotchas

- **sed with /g matches**: `sed -i '/pattern/a\\text'` inserts after EVERY matching line. Use line numbers (`sed -i '42a\\text'`) for precision.
- **Pipe characters in grep**: `grep 'foo|bar'` through Portainer often fails. Use `claw.sh exec` for reads or base64-encode the grep command.
- **base64 -w0**: The `-w0` flag disables line wrapping — critical for single-line output that can be embedded in shell commands. On macOS use `base64` (no flag needed).
- **Heredoc quoting**: Use `<< 'EOF'` (quoted) not `<< EOF` to prevent variable expansion in the content.
- **Empty output**: Portainer `host` commands that succeed often return no output. Add `&& echo DONE` to confirm execution.
- **Double insertion**: If using sed pattern match (not line number), verify the pattern is unique first with `grep -c`.

## Example: Deploy a TypeScript method

```bash
# Write the method locally
cat > /tmp/sendFile.ts << 'ENDMETHOD'

  async sendFile(jid: string, path: string): Promise<void> {
    const ext = path.extname(path).toLowerCase();
    if (ext === '.mp4') {
      await this.api.sendVideo(jid, new InputFile(path));
    } else {
      await this.api.sendDocument(jid, new InputFile(path));
    }
  }
ENDMETHOD

# Find insertion line (after sendMessage closing brace)
bash claw.sh exec "grep -n 'message sent' /workspace/project/src/channel.ts"
# Output: 425:      logger.info('message sent');
# sendMessage closes at line 428

# Deploy
B64=$(base64 -w0 /tmp/sendFile.ts)
bash claw.sh host "echo '$B64' | base64 -d > /tmp/m.ts && sed -i '428r /tmp/m.ts' /server/src/channel.ts && rm /tmp/m.ts && echo DONE"

# Verify
bash claw.sh exec "grep -n 'sendFile' /workspace/project/src/channel.ts"
```

## Notes

- Prefer surgical insertions (sed + base64 block) over full file replacement — less risk of losing content
- Always read the target file first to find the correct line numbers
- Use `claw.sh exec` for reading (agent container, read-only) and `claw.sh host` for writing (temp container, read-write)

## References

- [base64 encoding](https://linux.die.net/man/1/base64)
- [sed insert/append](https://www.gnu.org/software/sed/manual/sed.html)
