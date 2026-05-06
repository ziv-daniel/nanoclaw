---
name: prisma-ai-agent-consent
description: |
  Fix Prisma "detected that it was invoked by Claude Code" error blocking dangerous
  operations like migrate reset, db push, or migrate dev. Use when: (1) prisma migrate
  reset fails with AI agent detection message, (2) prisma commands refuse to run and
  mention PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION, (3) database reset/seed scripts
  fail in Claude Code sessions. Requires setting env var with user's consent text.
author: Claude Code
version: 1.0.0
date: 2026-02-05
---

# Prisma AI Agent Consent for Dangerous Operations

## Problem
Prisma CLI (v6+) detects when invoked by AI agents (Claude Code, Cursor, etc.) and blocks
destructive database operations. The command fails with a long message explaining that the
user must explicitly consent before the AI agent can proceed.

## Context / Trigger Conditions
- Running `prisma migrate reset` from Claude Code
- Running `prisma db push --force-reset` from any AI agent
- Any Prisma command that destroys data (reset, push with force)
- Error message includes: "Prisma Migrate detected that it was invoked by Claude Code"
- Error message mentions `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`

## Solution

### Step 1: Inform the User
Before proceeding, you MUST tell the user:
- What command you're trying to run
- That it will irreversibly destroy all data in the database
- Whether this is a development or production database
- Ask for explicit consent

### Step 2: Get Consent
The user must explicitly say something like "Yes, proceed" or "Yes, reset the database."

### Step 3: Set Environment Variable
Run the command with the env var set to the user's exact consent message:

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Yes, proceed" npm run seed-reset
```

Or for direct Prisma commands:
```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Yes, proceed" npx prisma migrate reset --force
```

### Important Notes
- The env var value should be the exact text of the user's consent message
- Do NOT set this proactively - always ask the user first
- This is a safety feature, not a bug - respect its intent
- For fresh Docker databases with no data, it's safe to proceed after user consent
- For production databases, strongly recommend against it

## Verification
After running with the env var, the command should complete normally with output like:
```
Database reset successful
Applying migration `20250615092108_init`
...
```

## Example
```
User: "run npm run seed-reset"
AI: "This will run prisma migrate reset which destroys all data. This is a local dev
     database. Do you consent?"
User: "Yes, proceed"
AI: runs PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Yes, proceed" npm run seed-reset
```

## Notes
- This feature was added in Prisma 6.x to prevent AI agents from accidentally destroying
  production databases
- The detection works by checking for AI agent environment indicators
- Only affects destructive operations, not reads or migrations
