---
name: slack-bolt-listener-stacking-fix
description: |
  Fix exponential duplicate log lines and event handling in Slack Bolt apps after WebSocket
  reconnections. Use when: (1) Slack bot logs show 20-50+ identical "connected" or "connecting"
  messages at the same timestamp, (2) messages are processed multiple times after reconnect,
  (3) app.stop()/start() cycle causes listener accumulation, (4) Bolt SocketModeClient reuses
  the same object after reconnect but code re-registers event listeners.
author: Claude Code
version: 1.0.0
date: 2026-04-07
---

# Slack Bolt Listener Stacking Fix

## Problem

Slack Bolt apps using Socket Mode can accumulate duplicate event listeners after WebSocket
reconnections. Each `app.stop()` + `app.start()` cycle may reuse the same `SocketModeClient`
object internally. If your code uses a boolean guard (`listenersAttached`) that gets reset on
reconnect, new listeners stack on top of old ones. After N reconnect cycles, every event fires
N+1 times.

## Context / Trigger Conditions

- Logs show 20-50+ identical lines at the exact same timestamp:
  ```
  [07:59:28.596] Slack WebSocket connecting...  (x50)
  [07:59:29.109] Slack WebSocket connected      (x50)
  ```
- Messages are processed/responded to multiple times
- Problem worsens over time (each reconnect adds more duplicates)
- Code has a pattern like:
  ```typescript
  if (this.listenersAttached) return;
  this.listenersAttached = true;
  socketClient.on('connected', () => { ... });
  ```
- Reconnect logic resets `listenersAttached = false` before re-calling setup

## Solution

Track the actual socket client **instance**, not just a boolean flag:

```typescript
// BEFORE (broken):
private listenersAttached = false;

private setupSocketListeners(): void {
  if (this.listenersAttached) return;  // guard gets reset on reconnect!
  this.listenersAttached = true;
  socketClient.on('connected', () => { ... });
}

// In reconnect:
this.listenersAttached = false;  // BUG: allows re-stacking on same object
this.setupSocketListeners();
```

```typescript
// AFTER (fixed):
private listenersAttached = false;
private attachedSocketClient: unknown = null;

private setupSocketListeners(): void {
  const receiver = (this.app as unknown as { receiver: SocketModeReceiver }).receiver;
  const socketClient = receiver?.client;
  if (!socketClient) return;

  // Only re-attach if the socket client instance actually changed
  if (this.listenersAttached && this.attachedSocketClient === socketClient) return;
  this.listenersAttached = true;
  this.attachedSocketClient = socketClient;

  socketClient.on('connected', () => { ... });
  socketClient.on('connecting', () => { ... });
  socketClient.on('disconnected', () => { ... });
  socketClient.on('close', () => { ... });
}
```

The key insight: compare the **object reference** (`=== socketClient`), not a boolean.
If Bolt reuses the same client, old listeners are still valid. If it creates a new one,
the old listeners are on a dead object and new ones are needed.

## Verification

After applying the fix:
1. Restart the service
2. Wait for a WebSocket reconnect (or trigger one by disconnecting the network briefly)
3. Check logs — each event should appear exactly ONCE per occurrence
4. No more duplicate "connected"/"connecting" lines at the same timestamp

## Notes

- This is a general pattern for ANY EventEmitter-based reconnect logic, not just Slack Bolt
- The same bug can occur with MQTT clients, WebSocket libraries, Redis pub/sub, etc.
- Alternative fix: call `socketClient.removeAllListeners()` before re-attaching, but this
  risks removing Bolt's own internal listeners
- Bolt's `app.stop()` + `app.start()` does NOT always create a new SocketModeClient —
  this is the root cause of the stacking
