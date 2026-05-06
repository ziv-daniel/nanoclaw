---
name: slack-bolt-file-upload-v2-message-changed
description: Slack Bolt app silently drops video/file uploads even with files:read scope. Slack's v2 upload API delivers files via message_changed events, not file_share. Default subtype filters miss them. Use when files (especially videos) from Slack don't reach your bot despite correct scopes.
author: Claude Code
version: 1.0.0
date: 2026-04-21
---

# Slack Bolt v2 File Uploads Arrive as `message_changed`

## Problem

A Slack Bolt app (`@slack/bolt`, socket mode or HTTP) receives text messages fine, but video and other file uploads never reach the message handler — even when:
- The bot has `files:read` scope (verified via `auth.test` response headers)
- The event handler is `app.event('message', ...)` (catches all subtypes)
- `file_share` subtype is allowed through the filter

## Context / Trigger Conditions

- User reports "I sent a video/file in Slack but the bot didn't see it"
- `auth.test` confirms `files:read` and `files:write` scopes are present
- Small images *may* work but larger files / videos don't
- Bot never logs anything when the file is uploaded

## Root Cause

Slack's **v2 file upload API** (`files.getUploadURLExternal` / `files.completeUploadExternal`) — which the Slack clients use for most non-trivial uploads — posts the message *first*, then attaches the file via a separate `message_changed` event. The `file_share` subtype is only used for the legacy v1 upload path.

If your handler filters:
```ts
if (subtype && subtype !== 'bot_message' && subtype !== 'file_share') return;
```
then `message_changed` events (with the file attached in `event.message.files`) are dropped silently.

## Solution

Accept `message_changed` and unwrap the nested message. Only process edits that **added** files (not text-only edits):

```ts
this.app.event('message', async ({ event }) => {
  const subtype = (event as { subtype?: string }).subtype;
  if (
    subtype &&
    subtype !== 'bot_message' &&
    subtype !== 'file_share' &&
    subtype !== 'message_changed'
  ) return;

  // Unwrap message_changed (v2 file upload pattern)
  if (subtype === 'message_changed') {
    const changed: any = (event as any).message;
    const prev:    any = (event as any).previous_message;
    const prevHadFiles = Array.isArray(prev?.files) && prev.files.length > 0;
    const nowHasFiles  = Array.isArray(changed?.files) && changed.files.length > 0;
    // Only process if this edit ADDED files (skip text-only edits)
    if (!nowHasFiles || prevHadFiles) return;
    (event as any).files   = changed.files;
    (event as any).user    = changed.user;
    (event as any).text    = changed.text;
    (event as any).ts      = changed.ts;   // use message ts, not event ts
    (event as any).bot_id  = changed.bot_id;
  }

  // ... rest of handler (download file.url_private with Bearer token)
});
```

## Verification

After deploying:
1. Upload a video in Slack from the desktop client → bot receives the event, downloads the file, and logs `[File: ...]`
2. Edit an existing text message (don't add files) → handler returns early (correct)
3. Check your bot's logs for `message_changed` events now containing `files: [...]`

## Notes

- **Dedupe warning**: If you also subscribe to the top-level `file_shared` event, you'll get duplicates. Either use only the message-subtype path (simpler) or dedupe by `file.id`.
- **Mobile vs desktop**: The v1 `file_share` path is still used by some older clients / single-image mobile uploads, which is why text + small images "just worked" before. Keep both subtypes allowed.
- **Scope check first**: Before assuming this is the bug, run `curl -H "Authorization: Bearer xoxb-..." https://slack.com/api/auth.test -D -` and confirm `x-oauth-scopes` includes `files:read`. If it doesn't, fix the manifest instead.
- **File download**: `file.url_private` requires `Authorization: Bearer <bot_token>` header — plain GET returns 403.

## References

- [Slack API: message_changed event](https://api.slack.com/events/message/message_changed)
- [Slack API: files.completeUploadExternal (v2 upload)](https://api.slack.com/methods/files.completeUploadExternal)
- [Bolt JS: event types](https://slack.dev/bolt-js/concepts/event-listening)
