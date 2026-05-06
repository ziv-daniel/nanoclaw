---
name: bolt-socket-mode-active-health-probe
description: Fix false-positive Slack WebSocket staleness in @slack/bolt Socket Mode apps. Use when a Bolt bot repeatedly logs "WebSocket stale, manual reconnect" every 5-6 min on quiet channels, or crashes with exit(1) after hitting a max-reconnects cap. Root cause is passive event-based liveness checks (ws_message never fires on Bolt's internal pings for quiet channels). Fix is an active auth.test() probe.
author: Claude Code
version: 1.0.0
date: 2026-04-21
---

# Bolt Socket Mode Active Health Probe

## Problem

A Slack bot built on `@slack/bolt` in Socket Mode repeatedly reports its WebSocket as stale and reconnects every 5-6 minutes, even when the socket is actually healthy and the app is functioning. After N total reconnects the app may `process.exit(1)` and restart, creating a 60-90 minute crash cycle on long-running services.

## Context / Trigger Conditions

- Logs like: `Slack WebSocket stale and Bolt auto-reconnect failed, manual reconnect  staleDurationMs: 300000+`
- Followed by: `Slack reconnected via full app restart` repeating every 5-6 min
- Duplicate `WebSocket disconnected` / `closed` events firing 2×+ per cycle
- systemd/journal: `Main process exited, code=exited, status=1/FAILURE` every 60-90 min
- Bot reachable via HTTP (`auth.test` works) but event-based staleness detector disagrees
- Channels bot is in are quiet (few real events per hour)

## Root Cause

Passive health checks that track `lastEventTime` from a `ws_message` (or similar raw-frame) listener on `SocketModeClient` miss Bolt's internal keepalive pings on quiet channels. No real Slack events arrive → `lastEventTime` never advances → the 5-min stale threshold trips even though the socket is fine. Each false-positive reconnect teardown + restart accumulates state and eventually hits the app's max-reconnects cap, triggering `process.exit(1)`.

## Solution

Replace (or augment) the passive event-timer heuristic with an **active probe** before declaring the socket dead. `auth.test()` is cheap, authenticated, and reliable:

```typescript
const AUTH_TEST_TIMEOUT_MS = 5_000;

private async checkHealth(): Promise<void> {
  if (!this.connected || this.reconnecting) return;

  const staleDuration = Date.now() - this.lastEventTime;
  if (staleDuration < SOCKET_STALE_MS) return;

  // If the socket client reports active, trust it and reset timer
  const sc = (this.app as any).receiver?.client;
  if (sc && typeof sc.isActive === 'function' && sc.isActive()) {
    this.lastEventTime = Date.now();
    return;
  }

  // Active probe — verifies token + HTTP path, orthogonal to WS event flow
  try {
    const timeout = new Promise<never>((_, r) =>
      setTimeout(() => r(new Error('auth.test timeout')), AUTH_TEST_TIMEOUT_MS),
    );
    await Promise.race([this.app.client.auth.test(), timeout]);
    this.lastEventTime = Date.now();
    logger.info({ staleDurationMs: staleDuration },
      'auth.test passed — API reachable despite stale socket timer, skipping reconnect');
    return;
  } catch (err) {
    logger.warn({ err }, 'auth.test failed — proceeding with reconnect');
  }

  // ...existing reconnect path
}
```

Key properties:
- **Cheap**: `auth.test` is rate-limit friendly (tier 1, ~100/min).
- **Orthogonal**: it probes HTTP, which is independent of the WS event pipeline, so a quiet-but-healthy socket won't false-positive.
- **Fail-open to existing logic**: if `auth.test` itself fails or times out, the original reconnect path still runs — no regression.

## Verification

Within ~5-6 min of start on a quiet channel, look for this line in logs:
```
INFO: auth.test passed — API reachable despite stale socket timer, skipping reconnect
  staleDurationMs: 300000+
```
And confirm `Slack reconnected via full app restart` does NOT appear. Service uptime should extend well past the previous crash cadence.

## Example

Before (loop, then crash after ~60-90 min):
```
12:38:44 ERROR: Slack WebSocket stale, manual reconnect  staleDurationMs: 300002
12:44:44 ERROR: Slack WebSocket stale, manual reconnect  staleDurationMs: 358358
... (repeats, 3x then cooldown, then resumes) ...
14:04:28 FATAL: Slack exceeded max total reconnects — exiting for clean systemd restart  totalReconnects: 11
→ systemd: Main process exited, code=exited, status=1/FAILURE
```

After (quiet channels stay connected):
```
14:18:22 INFO: auth.test passed — API reachable despite stale socket timer, skipping reconnect  staleDurationMs: 300005
```

## Notes

- Do **not** rely solely on `SocketModeClient.isActive()` — it can return false during transient states while the socket is still usable; that's why the active probe is a needed second check.
- Don't lower `SOCKET_STALE_MS` below 5 min thinking it will "catch it sooner" — it just amplifies the false positive rate.
- If you must rate-limit the probe itself, cache the result for 30-60s; it's safe to reuse.
- Tested on `@slack/bolt` 3.x; Bolt 4.x has an improved `SocketModeFunctions` but the same active-probe pattern still applies.

## References

- [`@slack/bolt` Socket Mode overview](https://slack.dev/bolt-js/concepts/socket-mode)
- [`auth.test` Web API method](https://api.slack.com/methods/auth.test)
- [`@slack/socket-mode` source (SocketModeClient events)](https://github.com/slackapi/node-slack-sdk/tree/main/packages/socket-mode)
