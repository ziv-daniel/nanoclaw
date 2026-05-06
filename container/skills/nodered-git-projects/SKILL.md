---
name: nodered-git-projects
description: |
  Enable and configure Node-RED Projects feature for Git version control. Use when:
  (1) Setting up Git backup for Node-RED flows, (2) flows.json not being tracked,
  (3) exec node git approach failing silently, (4) need automatic commits on deploy,
  (5) Home Assistant Node-RED addon git integration. Covers Projects feature setup,
  SSH key configuration, credential encryption, and troubleshooting backup failures.
author: Claude Code
version: 1.0.0
date: 2026-02-01
---

# Node-RED Git Projects Integration

## Problem

Backing up Node-RED flows to Git using exec nodes often fails silently:
- `flows.json` path varies by installation
- Change detection (`git diff-index`) may not work correctly
- Credentials in exec nodes are security risks
- No integration with Node-RED's deploy cycle

## Solution: Node-RED Projects Feature

The built-in Projects feature (v0.18+) provides native Git integration:
- Knows exact file locations
- Commits on deploy (optional)
- UI for staging, commits, history
- Encrypted credential handling
- SSH key management

## Home Assistant Setup

### Step 1: Add System Packages

In HA → Add-ons → Node-RED → Configuration:

```yaml
system_packages:
  - git
  - openssh-keygen
```

### Step 2: Set Credential Secret

```yaml
credential_secret: "your-long-random-secret-phrase-here"
```

**Warning**: Never change this after setting or encrypted credentials will be lost.

### Step 3: Enable Projects in settings.js

Access via SAMBA (`\\<HA_IP>\config\node-red\settings.js`) or SSH:

```javascript
module.exports = {
    // ... existing config ...

    editorTheme: {
        projects: {
            enabled: true,
            workflow: {
                mode: "manual"  // "auto" for auto-commit on deploy
            }
        }
    },
}
```

### Step 4: Restart and Initialize

1. Restart Node-RED addon
2. First launch shows Projects welcome screen
3. Choose "Clone Repository" or "Create New"
4. Configure remote URL and credentials

## SSH Key Setup for Push

1. In Node-RED: Settings → Git Config → Generate SSH Keys
2. Copy public key from `~/.node-red/projects/.sshkeys/`
3. Add to GitHub: Settings → SSH and GPG keys → New SSH key
4. Test with: `git push origin main`

## Workflow Modes

### Manual Mode (Recommended)

```javascript
workflow: { mode: "manual" }
```

- Review changes before committing
- Write meaningful commit messages
- Control when to push

### Auto Mode

```javascript
workflow: { mode: "auto" }
```

- Commits automatically on every deploy
- Messages are timestamps
- Good for single-user setups

## Troubleshooting

### Projects Tab Not Visible

1. Verify `editorTheme.projects.enabled: true` in settings.js
2. Check Node-RED version >= 0.18
3. Restart addon completely (not just reload)

### Push Fails with Permission Denied

1. Verify SSH key was added to GitHub
2. Check key permissions in `~/.node-red/projects/.sshkeys/`
3. Test SSH: `ssh -T git@github.com`

### Clone Fails

1. Use HTTPS URL for initial clone if SSH not configured
2. Format: `https://github.com/user/repo.git`
3. For private repos, use PAT in URL

### Credentials Lost After Enable

This happens if credential_secret wasn't set before enabling Projects.
Solution: Re-enter credentials in nodes, they'll be encrypted properly.

## File Structure with Projects

```
~/.node-red/projects/
├── your-project/
│   ├── package.json      # Project dependencies
│   ├── flows.json        # All flows
│   ├── flows_cred.json   # Encrypted credentials
│   ├── settings.js       # Project-specific settings (optional)
│   └── .git/             # Git repository
└── .sshkeys/
    ├── id_rsa            # Private key
    └── id_rsa.pub        # Public key (add to GitHub)
```

## Migration from Exec Node Approach

If you have an existing exec-node backup flow:

1. Export your flows first (Menu → Export → All flows)
2. Enable Projects feature
3. Clone your existing repo (if it has flows)
4. Import flows into the project
5. Commit and push
6. Disable/delete the old exec-node flow

## Alternative: Fix Exec Node Approach

If Projects isn't available, debug the exec approach:

### Find Correct flows.json Path

```bash
# In Home Assistant SSH addon
find /config -name "flows*.json" 2>/dev/null
```

Common paths:
- HA Addon: `/config/node-red/flows.json`
- Docker: `/data/flows.json`
- Standalone: `~/.node-red/flows.json`

### Verify Git is Working

```bash
cd /config/node-red
git status
git log --oneline -5
```

### Check for Silent Failures

Remove `2>/dev/null` from exec commands to see errors:

```bash
cd /config/node-red && git diff-index --quiet HEAD --
echo "Exit code: $?"  # 0 = no changes, 1 = has changes
```

## References

- [Node-RED Projects Documentation](https://nodered.org/docs/user-guide/projects/)
- [HA Community: Enable Node-RED Projects](https://community.home-assistant.io/t/how-to-enable-node-red-projects-github-git-integration/511880)
- [HA Node-RED Addon Docs](https://github.com/hassio-addons/addon-node-red/blob/main/node-red/DOCS.md)
