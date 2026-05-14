---
name: cloudflare-email-routing
description: Add a forwarding email address on a Cloudflare-managed domain (danielshaprvt.work) using the Cloudflare API. Use when the user asks to "create an email", "set up forwarding", "add an alias", "make me a new address at danielshaprvt.work", or anything that should land in their Gmail. Wraps scripts/setup-email-routing.sh — collects the local-part and destination, then runs the idempotent script.
---

# Cloudflare Email Routing

Add or update a forwarding rule on `danielshaprvt.work` via the Cloudflare API. No dashboard clicks. Idempotent — safe to re-run.

## When to use

- User wants a new email address like `<something>@danielshaprvt.work` that forwards to a real inbox.
- User wants to update where an existing address forwards to.
- User wants to enable Email Routing on the zone for the first time.

## Inputs to collect

Ask the user for whatever you don't already know. Defaults are fine if they don't care.

| Input | Required | Default | Notes |
|---|---|---|---|
| `ROUTE_EMAIL` | yes | — | Full address, e.g. `claw.agent@danielshaprvt.work`. Just ask for the local-part if the zone is fixed. |
| `DEST_EMAIL` | yes | `zivdaniel12@gmail.com` (user's Gmail per memory) | Real inbox to forward to. |
| `CF_ZONE_ID` | yes | `9b34962dce7f54404af236a48b1162cb` | Zone id for danielshaprvt.work. |
| `CF_API_TOKEN` | yes | `$HOMELAB_CF_EMAIL_TOKEN` (preferred) or `$CF_EMAIL_TOKEN` from `C:\Repo\proxmox\.env` | Scoped token (Account: Email Routing Addresses Edit; Zone: DNS Edit, Zone Read, Zone Settings Edit, Email Routing Rules Edit). |

If `CF_EMAIL_TOKEN` is missing from `.env`, the user must mint a token at https://dash.cloudflare.com/profile/api-tokens with the permissions above (account-scoped Email Routing Addresses lives under **Account Permissions**, not Zone).

## Run

```bash
set -a; source C:/Repo/proxmox/.env; set +a
export CF_API_TOKEN="${HOMELAB_CF_EMAIL_TOKEN:-${CF_EMAIL_TOKEN:-}}"
export CF_ZONE_ID="9b34962dce7f54404af236a48b1162cb"
export DEST_EMAIL="zivdaniel12@gmail.com"
export ROUTE_EMAIL="<local-part>@danielshaprvt.work"
bash C:/Repo/proxmox/scripts/setup-email-routing.sh
```

The script:
1. Verifies zone access and derives `account_id` from the zone.
2. Enables Email Routing if not already enabled.
3. Ensures MX (route1/2/3.mx.cloudflare.net) and SPF (`include:_spf.mx.cloudflare.net`) records exist.
4. Creates the destination address if missing → **exits 0** asking the user to click the verification link in their inbox. Re-run after verification.
5. Creates or updates a `literal` matcher rule for `ROUTE_EMAIL → DEST_EMAIL` and disables the catch-all (avoids spam magnet on the bare domain).
6. Writes a state snapshot to `scripts/email-routing.state.json` (gitignored).

## Stop point

Step 4 pauses on first run for destination-address verification. The Cloudflare email goes to `DEST_EMAIL` (the Gmail) — the user clicks the link, then says "go" and the skill re-runs the script. The address is reused on subsequent runs (Cloudflare keeps the destination once verified).

## Adding a second forwarding address

Just re-run with a different `ROUTE_EMAIL`. The script lists existing rules, matches by literal `to` address (case-insensitive), and creates or updates without touching other rules.

## Removing a forwarding address

Not yet wired into the script. To remove manually:

```bash
set -a; source C:/Repo/proxmox/.env; set +a
export CF_API_TOKEN="$CF_EMAIL_TOKEN"
ZONE=9b34962dce7f54404af236a48b1162cb
TARGET=claw.agent@danielshaprvt.work
RULE_ID=$(curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/email/routing/rules?per_page=50" \
  | jq -r --arg e "$TARGET" '[.result[] | select(.matchers[]? | (.type=="literal" and (.value|ascii_downcase)==($e|ascii_downcase)))][0].tag')
curl -sS -X DELETE -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/email/routing/rules/$RULE_ID" | jq .
```

## Verifying delivery

After the rule is active, send a test email **from another address** to `ROUTE_EMAIL` and confirm it lands in `DEST_EMAIL`. Cloudflare may take 30-60s to register a brand-new rule.

## Related

- Script: `C:\Repo\proxmox\scripts\setup-email-routing.sh`
- State snapshot: `C:\Repo\proxmox\scripts\email-routing.state.json` (gitignored)
- Sister skill: `cloudflare-tunnel-managed-config` (DNS + tunnel ingress, different concern)
