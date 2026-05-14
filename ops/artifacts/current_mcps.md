---
name: Current MCP inventory and add_mcp_server rules
description: What MCPs are already configured in this container, and the procedure to check before proposing add_mcp_server
type: feedback
---

Before issuing `add_mcp_server`, ALWAYS check `./container.json` first. The current MCPs already wired into this agent group are:

- **dokploy** — custom-filtered server at `/opt/nanoclaw-v2/dokploy-mcp-filtered.mjs`, real `DOKPLOY_API_KEY` already in env. Do NOT propose adding `@dokploy/mcp` or any other dokploy variant.
- **qdrant-memory** — local stdio MCP at `/workspace/agent/mcp-qdrant-stdio.mjs` for memory persistence.
- **nodered** — `mcp-remote` against `https://mcp-nodered.danielshaprvt.work/mcp` (streamable-http). Basic auth is injected automatically by the OneCLI proxy from the vault credential matching that host pattern. Do NOT propose adding nodered again.

**Why:** Earlier today four `add_mcp_server` approval cards stacked up because the agent kept proposing duplicates of MCPs that were already configured (dokploy) or proposing them with `"placeholder"` env values that would never work (`DOKPLOY_API_KEY: "placeholder"`, `NODE_RED_PASSWORD: "PLACEHOLDER_FROM_VAULT"`). All four were superseded without ever applying.

**How to apply:**
1. Before *every* `add_mcp_server` request, read `./container.json#mcpServers` and confirm the proposed name is not already in the list. If it is, abort and tell the user "the X MCP is already configured" — do not request approval.
2. Never put literal placeholders (`"placeholder"`, `"PLACEHOLDER_FROM_VAULT"`, `"YOUR_KEY_HERE"`) in the env. If a credential is needed at runtime, check OneCLI Vault for a secret whose `hostPattern` matches the MCP host — if one exists, leave that env var out entirely and rely on proxy injection. If no matching credential exists, tell the user and ask for the secret value via DM, do not request the MCP add with a fake value.
3. For HTTP/streamable-http MCPs, prefer `mcp-remote <url>` over inventing wrapper scripts; OneCLI handles auth header injection when the container's `https_proxy` is left at its default (do NOT set `http_proxy=""` or `https_proxy=""` in the env block, that disables the proxy).
