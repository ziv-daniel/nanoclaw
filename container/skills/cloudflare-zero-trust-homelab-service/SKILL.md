---
name: cloudflare-zero-trust-homelab-service
description: Expose a homelab service externally through an existing Cloudflare Tunnel with Cloudflare Access (email-gated SSO). Use when adding a new public hostname like `<service>.danielshaprvt.work` that should require login. Covers: tunnel ingress, DNS CNAME, Access app + policy, required token scopes, and the failure modes (NXDOMAIN, ConnectionRefused, "Authentication error" from API).
author: Claude Code
version: 1.0.0
date: 2026-04-26
---

# Cloudflare Zero Trust Exposure for Homelab Service

## Problem

You have an internal-only HTTP service (e.g. an admin dashboard, vault UI, approval portal) bound to a LAN IP and port (e.g. `http://192.168.68.201:10254`). You need to make it reachable from outside the LAN (phone, anywhere) without:

- Opening a port on the home router
- Setting up reverse proxy + Let's Encrypt manually
- Trusting basic-auth as the only barrier on a sensitive surface

## Context / Trigger Conditions

- Existing Cloudflare Tunnel running (managed config — tunnel ID known, account ID known)
- Domain on Cloudflare DNS (e.g. `danielshaprvt.work`)
- Service must be reachable but only by the owner (or a small allow-list)
- Symptoms that mean *something is missing*:
  - `https://<sub>.<domain>` → `NXDOMAIN` (DNS CNAME missing)
  - `https://<sub>.<domain>` → 502 / ConnectionRefused (tunnel ingress missing or backend down)
  - `https://<sub>.<domain>` → 200 with no auth challenge (Access app/policy missing)
  - API responds `{"code":10000,"message":"Authentication error"}` when creating DNS records (token scope insufficient)

## Solution

Three Cloudflare resources must exist together. Missing any one breaks the chain.

### 1. Tunnel ingress rule (route)

PUT to `/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` — **GET first, modify the array, PUT the whole thing back**. The catch-all `{"service":"http_status:404"}` MUST stay last.

New rule shape:
```json
{
  "service": "http://192.168.68.201:10254",
  "hostname": "onecli.danielshaprvt.work"
}
```
Add `"originRequest": {"noTLSVerify": true}` if backend uses self-signed HTTPS.

### 2. DNS CNAME

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"<sub>","content":"<TUNNEL_ID>.cfargotunnel.com","proxied":true,"ttl":1}'
```
Must be **proxied=true** (orange cloud) for Access to intercept.

### 3. Cloudflare Access self-hosted app + policy

```bash
# Create app
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/access/apps" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"name":"<App Name>","domain":"<sub>.<domain>","type":"self_hosted","session_duration":"24h","app_launcher_visible":false}'
# → returns app id

# Create policy (allow only one email)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/access/apps/$APP_ID/policies" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"name":"Owner only","decision":"allow","include":[{"email":{"email":"you@example.com"}}],"precedence":1}'
```

Result: any request to `https://<sub>.<domain>/<path>` redirects to `https://<account>.cloudflareaccess.com/cdn-cgi/access/login/<sub>.<domain>?...&redirect_url=<path>` and prompts for the email + one-time PIN. Session lasts 24h.

## Required API Token Scopes — THIS IS THE GOTCHA

A typical "Cloudflare Tunnel" token from the dashboard has only `Account:Cloudflare Tunnel:Edit` and CANNOT:
- Create DNS records (`{"code":10000,"message":"Authentication error"}` on POST `/zones/.../dns_records`)
- Create Access apps/policies (`Method Not Allowed` or auth error)

**Make a new custom token with all three:**
1. **Zone : DNS : Edit** — scoped to your domain
2. **Account : Cloudflare Tunnel : Edit** — scoped to your account
3. **Account : Access: Apps and Policies : Edit** — scoped to your account

Verify token: `curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer $TOK"`. If `result` is empty for `/zones`, the token has no zone scope.

## Verification

```bash
# 1. DNS resolves at Cloudflare (don't trust ISP cache — query 1.1.1.1 directly)
curl "https://1.1.1.1/dns-query?name=<sub>.<domain>&type=A" -H "accept: application/dns-json"
# Should return Cloudflare proxy IPs (104.21.x.x or 172.67.x.x)

# 2. End-to-end probe (bypassing local DNS cache during the propagation window)
curl -sk -L -m 15 -o /dev/null -w "HTTP=%{http_code}\nFinalURL=%{url_effective}\n" \
  --resolve <sub>.<domain>:443:104.21.36.196 \
  https://<sub>.<domain>/<path>
# Expect: HTTP=200, FinalURL contains "cloudflareaccess.com/cdn-cgi/access/login/...&redirect_url=<path>"
```

If you see the cloudflareaccess.com login redirect, the entire chain (tunnel + DNS + Access) is wired correctly. If you see your service's own response, the Access policy isn't applied (probably because the DNS record is not proxied, or the Access app doesn't match the hostname).

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| `NXDOMAIN` from `nslookup` | DNS CNAME missing or DNS still propagating | Verify via DoH against 1.1.1.1; local ISP cache can take 5+ min |
| `Authentication error` on DNS POST | Token lacks `Zone:DNS:Edit` | Create new token with all 3 scopes |
| `Method Not Allowed` on `/access/apps` | Token lacks `Account:Access Apps and Policies:Edit` | Add scope |
| 200 but no Access challenge | DNS record proxied=false (gray cloud) OR Access app `domain` mismatch | Set `proxied:true`; ensure Access `domain` exactly matches the CNAME |
| 502 Bad Gateway from tunnel | Backend down or wrong port in ingress rule | `curl` the backend from the tunnel host |
| `dial tcp: lookup host.docker.internal: no such host` from inside backend container | Linux Docker missing `--add-host=host.docker.internal:host-gateway` | Add it to container spawn args; this is **NOT** a tunnel issue but symptoms can look similar |

## Notes

- **Tunnel ingress is GET-modify-PUT** — never just PUT a single rule, you'll wipe the others.
- **DNS records and Access apps are per-resource** — POST creates, no idempotency. Re-running creates duplicates. Check first with GET.
- The `cfargotunnel.com` target uses the tunnel UUID, not a name.
- Cloudflare Access is **free for up to 50 users** (Zero Trust free tier).
- For services that should be **public + auth-free** (e.g. health endpoints), skip Access entirely — just tunnel + DNS.
- After adding Access, `originRequest.noTLSVerify` on the tunnel side has no effect on Access — Access talks to Cloudflare edge over TLS regardless.

## References

- [Cloudflare Tunnel — Remotely Managed Configuration](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/remote-management/)
- [Cloudflare Access — Self-hosted applications API](https://developers.cloudflare.com/api/operations/access-applications-add-an-application)
- [API Tokens — required permissions reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
