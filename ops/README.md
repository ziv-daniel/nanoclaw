# NanoClaw Ops Tooling

Private operations layer for **Ziv's** NanoClaw v2 deployment on Dokploy via Portainer.

This directory is **not** part of upstream NanoClaw and lives only on the `ziv/ops` branch. Everything outside this directory mirrors upstream and can be `git pull`-ed cleanly.

## Layout

```
ops/
├── README.md             ← this file
├── .env.example          ← Portainer credentials template
├── claw.sh               ← Portainer API wrapper (status/logs/exec/host)
├── scripts/              ← one-shot operational scripts
│   ├── verify-env.sh
│   ├── dump-dropins.sh
│   ├── cleanup-baks.sh
│   └── setup-systemd-env.sh
├── patches/              ← idempotent edit scripts ever applied to live src
│   ├── README.md         ← log of when each was applied + why
│   └── 2026-04-28-max-lifetime.py
└── docs/
    ├── v2-architecture.md       ← honest doc of the live deployment
    ├── deployment-runbook.md    ← step-by-step ops procedures
    └── postmortem-prompt-drift.md
```

## Quick start

```bash
cp ops/.env.example ops/.env
# edit ops/.env with your Portainer URL + credentials

bash ops/claw.sh status      # list running NanoClaw containers
bash ops/claw.sh logs 100    # tail orchestrator logs
bash ops/claw.sh host "ls /nanoclaw/src"   # run command on host with /opt/nanoclaw mounted
```

## Why a separate branch (`ziv/ops`)

`main` tracks upstream `qwibitai/nanoclaw`. The `ziv/ops` branch holds:
1. The server's hand-patches over upstream (kept channel adapters, MCP global merging, MAX_LIFETIME).
2. This `ops/` tooling directory (Portainer scripts, deployment patches, runbooks).

To absorb upstream changes:
```bash
git fetch upstream
git checkout ziv/ops
git merge upstream/main   # resolve conflicts in src/, ops/ stays untouched
```

## Critical: never commit secrets

`ops/.env` is gitignored. `ops/claw.sh` reads credentials from there, never hardcodes.
