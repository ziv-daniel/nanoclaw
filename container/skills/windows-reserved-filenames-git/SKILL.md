---
name: windows-reserved-filenames-git
description: |
  Fix git add/commit failures caused by Windows reserved filenames (nul, con, prn, aux, com1-9, lpt1-9).
  Use when: (1) git add fails with "error: unable to index file 'nul'" or "error: invalid path",
  (2) git clone fails with "Filename is reserved" on Windows, (3) repository clones on Linux/Mac but
  fails on Windows. Applies to cross-platform repositories where files created on Unix systems contain
  Windows-reserved names.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Windows Reserved Filenames in Git

## Problem
Git operations fail on Windows when files use reserved Windows filenames (nul, con, prn, aux, com1-9, lpt1-9),
even though these names are valid on Linux and macOS. This causes cross-platform repository issues.

## Context / Trigger Conditions
**Exact error messages:**
- `error: open("path/nul"): No such file or directory`
- `error: unable to index file 'nul'`
- `fatal: adding files failed`
- `error: invalid path` during git clone on Windows
- Operations succeed on Linux/Mac but fail on Windows

**When this occurs:**
- Files named nul, con, prn, aux, com1-9, lpt1-9 (case-insensitive)
- Files with these names plus extensions (e.g., nul.txt, con.log)
- Accidentally created by shell redirects (e.g., `command > nul` on Unix creates a file)
- Repository created on Unix systems, cloned on Windows

## Solution

### 1. Identify Reserved Filename Files
```bash
# Find reserved filenames in repository
find . -iname "nul" -o -iname "con" -o -iname "prn" -o -iname "aux"
find . -iregex ".*/(com[0-9]|lpt[0-9])$"
```

### 2. Remove Reserved Filename Files
```bash
# Remove the problematic files
rm ./nul                    # Unix/Mac/Git Bash
rm docs/nul                # Specific path
```

### 3. Stage and Commit Changes
```bash
git add .
git commit -m "fix: remove Windows reserved filenames"
```

### 4. Push to Remote (if applicable)
If the file already exists in remote repository:
```bash
git push
```

## Prevention

### Pre-commit Hook
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
RESERVED_NAMES="^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)"

if git diff --cached --name-only | grep -iE "$RESERVED_NAMES"; then
    echo "Error: Commit contains Windows reserved filenames"
    exit 1
fi
```

### .gitignore Patterns
```
# Windows reserved filenames (case-insensitive)
[Nn][Uu][Ll]
[Cc][Oo][Nn]
[Pp][Rr][Nn]
[Aa][Uu][Xx]
[Cc][Oo][Mm][0-9]
[Ll][Pp][Tt][0-9]
```

## Complete List of Reserved Names

**DOS Device Names (case-insensitive):**
- CON (console)
- PRN (printer)
- AUX (auxiliary)
- NUL (null device)
- COM1, COM2, COM3, COM4, COM5, COM6, COM7, COM8, COM9 (serial ports)
- LPT1, LPT2, LPT3, LPT4, LPT5, LPT6, LPT7, LPT8, LPT9 (parallel ports)

**Important:** These are reserved with or without extensions (e.g., nul.txt is also invalid)

## Verification
After removal:
```bash
git status              # Should show no errors
git add .               # Should complete successfully
git commit -m "test"    # Should create commit
```

## Example
**Scenario:** Running `git add .` fails on Windows with "unable to index file 'nul'"

```bash
# 1. Find the file
$ find . -name "nul"
./docs/nul
./nul

# 2. Remove it
$ rm ./docs/nul ./nul

# 3. Try again
$ git add .
warning: LF will be replaced by CRLF...  # Normal Windows warning
$ git commit -m "fix: remove reserved filenames"
[master abc123] fix: remove reserved filenames
```

## Notes
- **Cross-platform consideration:** Always avoid these names in repositories that might be used on Windows
- **Common cause:** Unix shell redirections like `command > nul` create files instead of discarding output (use `/dev/null` on Unix)
- **Git protection:** Windows Git has `core.protectNTFS=true` by default (since CVE-2019-1353) to prevent security issues
- **Cannot rename on Windows:** If the file exists on Windows, you cannot rename it directly—must be fixed from Linux/Mac or deleted
- **Case insensitive:** CON, con, Con, etc. are all invalid
- **LF/CRLF warnings:** Normal on Windows git, unrelated to reserved filename issues

## References
- [Naming Files, Paths, and Namespaces - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Atlassian: Git cannot create directory with Windows reserved words](https://support.atlassian.com/bamboo/kb/git-can-not-create-directory-invalid-argument-when-using-windows-reserved-word-nul-aux-con/)
- [Windows Reserved File Names - HelpNDoc](https://www.helpndoc.com/documentation/html/Windowsreservedfilenames.html)
- [Reserved file names forever](https://davidroessli.com/logs/2024/04/reserved-file-names-forever/)
