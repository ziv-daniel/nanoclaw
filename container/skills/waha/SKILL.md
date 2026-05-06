---
name: waha
description: Work with WAHA (WhatsApp HTTP API) for sending and receiving WhatsApp messages. Use when the user wants to send WhatsApp messages, build WhatsApp bots, create AI agents that communicate via WhatsApp, integrate with n8n/Node-RED/Home Assistant, manage WhatsApp sessions, configure webhooks, or build the "העוזר האישי" universal agent. Covers session management, webhook configuration, message sending (text/media/files), group chat patterns, AI agent integration, API authentication, security patterns, and production deployment.
---

# WAHA (WhatsApp HTTP API)

## Overview

WAHA is a self-hosted WhatsApp API running via Docker that provides REST endpoints for WhatsApp automation. This skill covers production-ready usage patterns including secure credential management, session handling, message operations, webhook configuration, group chat integration, AI agent communication layer, and integrations with n8n, Node-RED, and Home Assistant.

## Current Deployment

**WAHA runs on Raspberry Pi 5 (PIE5):**
- **API URL:** `http://192.168.68.136:3000`
- **Dashboard:** `http://192.168.68.136:3000/dashboard`
- **Swagger:** `http://192.168.68.136:3000/`
- **Credentials:** Stored in `C:\Repo\waha\.env`
- **Worker:** Single worker "WAHA-Pi5" (engine: WEBJS, ARM64)
- **Session:** `default` — connected to `972528416436@c.us`
- **Account Name:** העוזר האישי משפחת דניאל
- **WhatsApp Group:** "העוזר האישי" — primary channel for AI agent communication

**Dashboard access uses HTTP Basic Auth** — credentials from `.env` (`WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD`).

**WEBJS on ARM startup time:** 1-2 minutes. State flow: `STOPPED` → `STARTING` (1-2 min) → `SCAN_QR_CODE` or `WORKING`.

**Switching WhatsApp accounts:** Logout current session first (`POST /api/sessions/{session}/logout`), then restart and scan new QR code.

## Critical Principles

### Security
**All sensitive credentials MUST be stored in `.env` files—never hardcode API keys, tokens, phone numbers, or webhook URLs.** See `assets/.env.example` for the complete template.

### Typing Indicator Requirement
**CRITICAL:** Always send typing indicator 1-2 seconds before text messages. This mimics human behavior and prevents spam detection.

```bash
# ✅ CORRECT
curl -X POST 'http://localhost:3000/api/startTyping' \
  -H 'X-Api-Key: YOUR_API_KEY' \
  -d '{"chatId":"12132132130@c.us","session":"default"}'
sleep 2
curl -X POST 'http://localhost:3000/api/sendText' ...

# ❌ WRONG - No typing indicator
curl -X POST 'http://localhost:3000/api/sendText' ...
```

## Quick Start

### Environment Setup

1. Copy `assets/.env.example` to `.env` in your project
2. Generate secure credentials:
```bash
# Generate API key
uuidgen | tr -d '-'

# Generate dashboard password
openssl rand -hex 16

# Hash API key for production
echo -n "your-api-key" | shasum -a 512
```

3. Configure `.env` with your values (never commit this file)

### Docker Deployment

**For ARM (Raspberry Pi, Apple Silicon):**
```yaml
services:
  waha:
    image: devlikeapro/waha:arm
    ports:
      - "3000:3000"  # LAN access (or use 127.0.0.1:3000:3000 for localhost only)
    env_file:
      - .env
    volumes:
      - ./sessions:/app/.sessions
    restart: unless-stopped
```

**For x86/AMD64:**
```yaml
services:
  waha:
    image: devlikeapro/waha
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./sessions:/app/.sessions
    restart: unless-stopped
```

**Note:** Removed deprecated `version:` attribute (Docker Compose v2+).

### Auto-Start on Boot (Linux/Systemd)

```bash
# Create systemd service
sudo tee /etc/systemd/system/waha.service << 'EOF'
[Unit]
Description=WAHA WhatsApp API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/YOUR_USER/waha
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=YOUR_USER

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable waha.service
sudo systemctl start waha.service

# Check status
sudo systemctl status waha.service
```

### First Session Setup

```bash
# 1. Start session (creates if doesn't exist)
curl -X POST 'http://localhost:3000/api/sessions/default/start' \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: YOUR_API_KEY'

# 2. Wait for SCAN_QR_CODE status (~10 seconds)
sleep 10

# 3. Get QR code image
curl -H 'X-Api-Key: YOUR_API_KEY' \
  http://localhost:3000/api/default/auth/qr -o qr.png

# 4. Scan QR with WhatsApp → Settings → Linked Devices → Link a device

# 5. Verify session is WORKING
curl -H 'X-Api-Key: YOUR_API_KEY' \
  http://localhost:3000/api/sessions/default | jq '.status'
```

## Core Concepts

### Session Architecture

WAHA sessions represent authenticated WhatsApp accounts. Each session has states:
- `STOPPED` → `STARTING` → `SCAN_QR_CODE` → `WORKING`
- `FAILED` requires re-authentication

**Engine selection:**
- **ARM (Pi/Apple Silicon):** `WHATSAPP_DEFAULT_ENGINE=WEBJS` (only ARM-compatible option)
- **x86/AMD64:** `WHATSAPP_DEFAULT_ENGINE=GOWS` (recommended - Go-based, stable, lightweight)

### chatId Format

| Type | Format | Example |
|------|--------|---------|
| User | `{phone}@c.us` | `12132132130@c.us` |
| Group | `{id}@g.us` | `120363012345@g.us` |
| Channel | `{id}@newsletter` | `123456789@newsletter` |

Phone numbers exclude `+` prefix.

### API Authentication

Every request requires `X-Api-Key` header:
```bash
curl -X POST 'http://localhost:3000/api/sendText' \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: YOUR_API_KEY' \
  -d '{"session":"default","chatId":"PHONE@c.us","text":"Hello"}'
```

## Sending Messages

**⚠️ IMPORTANT:** Always send typing indicator first (see Critical Principles above).

### Start/Stop Typing

```bash
# Start typing indicator
POST /api/startTyping
{
  "session": "default",
  "chatId": "12132132130@c.us"
}

# Stop typing indicator (optional - auto-stops after message)
POST /api/stopTyping
{
  "session": "default",
  "chatId": "12132132130@c.us"
}
```

### Text Messages

**Complete flow:**
```bash
# 1. Start typing
curl -X POST 'http://localhost:3000/api/startTyping' \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: YOUR_API_KEY' \
  -d '{"session":"default","chatId":"12132132130@c.us"}'

# 2. Wait 1-2 seconds
sleep 2

# 3. Send message
curl -X POST 'http://localhost:3000/api/sendText' \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: YOUR_API_KEY' \
  -d '{"session":"default","chatId":"12132132130@c.us","text":"Hello!"}'
```

**Message payload:**
```json
{
  "session": "default",
  "chatId": "12132132130@c.us",
  "text": "Hello! *Bold* _italic_ ~strikethrough~",
  "linkPreview": true
}
```

**Endpoint:** `POST /api/sendText`

### Image Messages

```json
{
  "session": "default",
  "chatId": "12132132130@c.us",
  "file": {
    "mimetype": "image/jpeg",
    "url": "https://example.com/image.jpg",
    "filename": "photo.jpg"
  },
  "caption": "Check this out!"
}
```

**Endpoint:** `POST /api/sendImage`

### Document/File Messages

```json
{
  "session": "default",
  "chatId": "12132132130@c.us",
  "file": {
    "mimetype": "application/pdf",
    "url": "https://example.com/document.pdf",
    "filename": "report.pdf"
  },
  "caption": "Monthly report"
}
```

**Endpoint:** `POST /api/sendFile`

### Voice Messages

```json
{
  "session": "default",
  "chatId": "12132132130@c.us",
  "file": {
    "mimetype": "audio/ogg; codecs=opus",
    "url": "https://example.com/voice.opus"
  },
  "convert": true
}
```

**Endpoint:** `POST /api/sendVoice`

### Mentions in Groups

```json
{
  "session": "default",
  "chatId": "123456789@g.us",
  "text": "Attention @2132132130!",
  "mentions": ["2132132130@c.us"]
}
```

Use `"mentions": ["all"]` to mention everyone.

## Receiving Messages (Webhooks)

### Configuration Methods

**Per-session (recommended):**
```json
{
  "name": "default",
  "config": {
    "webhooks": [{
      "url": "https://your-server.com/webhook",
      "events": ["message", "message.ack", "session.status"],
      "hmac": {"key": "your-secret-hmac-key"},
      "retries": {
        "policy": "exponential",
        "delaySeconds": 2,
        "attempts": 15
      }
    }]
  }
}
```

**Global (via environment):**
```bash
WHATSAPP_HOOK_URL=https://your-server.com/webhook
WHATSAPP_HOOK_EVENTS=message,message.ack,session.status
WHATSAPP_HOOK_HMAC_KEY=your-secret-key
```

### Webhook Payload Structure

```json
{
  "event": "message",
  "session": "default",
  "payload": {
    "id": "true_12132132130@c.us_AAAAAAAA",
    "timestamp": 1667561485,
    "from": "12132132130@c.us",
    "fromMe": false,
    "body": "Hello!",
    "ack": 1,
    "ackName": "PENDING"
  }
}
```

### Key Events

- `message` - Incoming messages only
- `message.any` - All messages including yours
- `message.ack` - Delivery/read status
- `session.status` - Session state changes

### HMAC Validation

WAHA sends headers for security:
- `X-Webhook-Hmac` - SHA512 signature
- `X-Webhook-Timestamp` - Unix timestamp

**Node.js validation:**
```javascript
const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const computed = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return computed === signature;
}
```

## n8n Integration

### Installation

```bash
n8n → Settings → Community nodes → Install: @devlikeapro/n8n-nodes-waha
```

### WAHA Trigger Setup

1. Add **WAHA Trigger** node
2. Create credentials with WAHA host URL and API key
3. Select events: `message`, `session.status`
4. Copy webhook URL and configure in WAHA session

### Echo Bot Pattern

```
[WAHA Trigger] → [IF: not fromMe] → [WAHA Action: Send Text]
```

**WAHA Action settings:**
- Session: `{{ $json.session }}`
- Chat ID: `{{ $json.payload.from }}`
- Text: `You said: {{ $json.payload.body }}`

### Rate Limiting Pattern

- **Split In Batches** node (batch size: 10)
- **Wait** node (30-60 seconds between batches)

## Node-RED Integration

### Send Message Flow

```javascript
// Function: Prepare WAHA request
const wahaUrl = env.get("WAHA_URL");
const apiKey = env.get("WAHA_API_KEY");

let phone = msg.payload.phone.replace(/\+/g, "");
if (!phone.endsWith("@c.us")) {
    phone += "@c.us";
}

msg.url = wahaUrl + "/api/sendText";
msg.method = "POST";
msg.headers = {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey
};
msg.payload = {
    session: "default",
    chatId: phone,
    text: msg.payload.message
};
return msg;
```

### Webhook Receiver

```javascript
// Function: Process incoming webhook
const event = msg.payload;

if (event.event !== 'message' || event.payload.fromMe) {
    return null;
}

msg.waMessage = {
    from: event.payload.from,
    body: event.payload.body,
    timestamp: event.payload.timestamp
};
return msg;
```

### Home Assistant Integration

**Send HA alerts:**
```javascript
const entityName = msg.payload.new_state.attributes.friendly_name;
msg.payload = {
    session: 'default',
    chatId: flow.get('notifyPhone') + '@c.us',
    text: `🚨 *Alert*\n\n${entityName} triggered!`
};
```

## Common Patterns

### Notification System

```javascript
async function sendNotification(phone, message, priority = 'normal') {
    const emoji = priority === 'high' ? '🚨' : 'ℹ️';
    const chatId = phone + '@c.us';
    const baseUrl = 'http://localhost:3000';
    const headers = {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.WAHA_API_KEY
    };

    // 1. Start typing indicator
    await fetch(`${baseUrl}/api/startTyping`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ session: 'default', chatId })
    });

    // 2. Wait 1-2 seconds
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 3. Send message
    await fetch(`${baseUrl}/api/sendText`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            session: 'default',
            chatId,
            text: `${emoji} ${message}`
        })
    });
}
```

### Bulk Messaging (Safe)

```javascript
async function sendBulk(recipients, message) {
    for (const phone of recipients) {
        await sendNotification(phone, message);
        // Random delay 30-60 seconds
        await sleep(30000 + Math.random() * 30000);
    }
}
```

## Rate Limiting & WhatsApp Blocks

**Critical guidelines:**
- Never initiate conversations—use `wa.me/{phone}` links
- Get explicit opt-in consent
- Personalize messages with recipient names
- 30-60 second random delays between messages
- Warm up new numbers: max 20 new contacts/day
- Safe volume: 6-12 messages per minute max
- Avoid URL shorteners, spam phrases, ALL CAPS

## Production Helper Scripts

Create these utility scripts for easier WAHA management:

### Check Status Script

```bash
#!/bin/bash
# check-waha.sh - Check WAHA health and session status

cd ~/waha
source .env

echo "=== WAHA Status Check ==="
echo ""
echo "1. Container:"
docker compose ps
echo ""
echo "2. Health:"
curl -s http://localhost:3000/health -H "X-Api-Key: $WAHA_API_KEY" | jq
echo ""
echo "3. Sessions:"
curl -s http://localhost:3000/api/sessions -H "X-Api-Key: $WAHA_API_KEY" | jq
```

### Send Message Script

```bash
#!/bin/bash
# send-message.sh - Send message with typing indicator

cd ~/waha
source .env

if [ -z "$1" ]; then
  echo "Usage: ./send-message.sh <phone> [message]"
  exit 1
fi

PHONE="$1"
MESSAGE="${2:-Test message}"

# 1. Start typing
curl -s -X POST http://localhost:3000/api/startTyping \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $WAHA_API_KEY" \
  -d "{\"chatId\":\"${PHONE}@c.us\",\"session\":\"default\"}"

# 2. Wait
sleep 2

# 3. Send message
curl -s -X POST http://localhost:3000/api/sendText \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $WAHA_API_KEY" \
  -d "{\"chatId\":\"${PHONE}@c.us\",\"text\":\"$MESSAGE\",\"session\":\"default\"}" | jq
```

### Restart Script

```bash
#!/bin/bash
# restart-waha.sh - Safely restart WAHA

cd ~/waha
echo "Stopping WAHA..."
docker compose down
sleep 5
echo "Starting WAHA..."
docker compose up -d
sleep 10
docker compose ps
```

**Make scripts executable:**
```bash
chmod +x check-waha.sh send-message.sh restart-waha.sh
```

## Group Chat Integration

Group chats use `{id}@g.us` format. The primary use case is the "העוזר האישי" WhatsApp group.

### Finding Group chatId

```bash
# List all groups the session belongs to
curl -s 'http://192.168.68.136:3000/api/default/chats' \
  -H 'X-Api-Key: YOUR_API_KEY' | jq '.[] | select(.id | endswith("@g.us"))'
```

### Receiving Group Messages (Webhook)

Group message webhook payloads include extra fields:

```json
{
  "event": "message",
  "session": "default",
  "payload": {
    "id": "false_120363012345@g.us_AAAAAAAA",
    "from": "120363012345@g.us",
    "to": "120363012345@g.us",
    "participant": "972522539467@c.us",
    "fromMe": false,
    "body": "כבה אורות בסלון",
    "hasMedia": false
  }
}
```

**Key difference from DMs:** `payload.participant` contains the actual sender, `payload.from` is the group ID.

### Filtering Bot's Own Messages

When the agent replies in a group, the webhook fires for its own messages too. Always filter:

```javascript
// Filter: only process messages from others, not our own
if (event.payload.fromMe) return null;

// For groups, extract who sent it
const sender = event.payload.participant || event.payload.from;
const groupId = event.payload.from;
const message = event.payload.body;
```

### Sending to Group

```bash
# Reply to group (always with typing indicator first)
curl -X POST 'http://192.168.68.136:3000/api/startTyping' \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: YOUR_API_KEY' \
  -d '{"chatId":"GROUP_ID@g.us","session":"default"}'

sleep 2

curl -X POST 'http://192.168.68.136:3000/api/sendText' \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: YOUR_API_KEY' \
  -d '{"chatId":"GROUP_ID@g.us","text":"האורות בסלון כבויים ✅","session":"default"}'
```

### Group Security — Authorized Users

For the AI agent, restrict commands to authorized group members:

```javascript
const AUTHORIZED_USERS = [
  '972522539467@c.us',   // Ziv
  '972528416436@c.us'    // Agent account
];

function isAuthorized(participant) {
  return AUTHORIZED_USERS.includes(participant);
}
```

## AI Agent Integration

WAHA serves as the **communication layer** for the "העוזר האישי" universal AI agent. The agent receives messages via webhook, processes them through an LLM with tools, and replies via WAHA.

### Architecture

```
WhatsApp Group "העוזר האישי"
        ↓ (user sends message)
   WAHA webhook → Agent Service
        ↓
   LLM (Gemini/Claude/GPT) + Tools
        ↓
   Execute action (HA, terminal, research, etc.)
        ↓
   WAHA API → WhatsApp reply ✅
```

### Webhook → Agent Service Pattern

Configure WAHA session to forward messages to your agent:

```json
{
  "name": "default",
  "config": {
    "webhooks": [{
      "url": "http://localhost:8080/webhook/whatsapp",
      "events": ["message"],
      "hmac": {"key": "your-hmac-secret"}
    }]
  }
}
```

### Agent Message Handler (Node.js/TypeScript)

```typescript
// POST /webhook/whatsapp
async function handleWhatsAppMessage(webhook: WAHAWebhook) {
  const { payload } = webhook;

  // 1. Filter own messages
  if (payload.fromMe) return;

  // 2. Extract sender and message
  const chatId = payload.from;  // group or DM
  const sender = payload.participant || payload.from;
  const message = payload.body;

  // 3. Check authorization
  if (!isAuthorized(sender)) return;

  // 4. Send typing indicator
  await wahaApi.startTyping(chatId);

  // 5. Process with AI agent (tools, context, etc.)
  const response = await agent.process({ message, sender, chatId });

  // 6. Reply via WAHA
  await wahaApi.sendText(chatId, response);
}
```

### WAHA API Helper Class

```typescript
class WAHAClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private session: string = 'default'
  ) {}

  private async request(endpoint: string, body: object) {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey
      },
      body: JSON.stringify({ session: this.session, ...body })
    });
  }

  async startTyping(chatId: string) {
    return this.request('/api/startTyping', { chatId });
  }

  async sendText(chatId: string, text: string) {
    await this.startTyping(chatId);
    await new Promise(r => setTimeout(r, 1500));
    return this.request('/api/sendText', { chatId, text });
  }

  async sendImage(chatId: string, url: string, caption?: string) {
    await this.startTyping(chatId);
    await new Promise(r => setTimeout(r, 1500));
    return this.request('/api/sendImage', {
      chatId,
      file: { mimetype: 'image/jpeg', url },
      caption
    });
  }

  async getSessionStatus() {
    const res = await fetch(
      `${this.baseUrl}/api/sessions/${this.session}`,
      { headers: { 'X-Api-Key': this.apiKey } }
    );
    return res.json();
  }
}
```

### Long-Running Operations

For agent tasks that take time (research, file generation), send progress updates:

```typescript
async function handleLongTask(chatId: string, task: string) {
  // Acknowledge immediately
  await waha.sendText(chatId, '🔄 מתחיל לעבוד על זה...');

  // ... perform long operation ...

  // Send result when done
  await waha.sendText(chatId, '✅ סיימתי! הנה התוצאה:\n\n' + result);
}
```

### Message Formatting for Hebrew

WhatsApp supports basic formatting — use it for Hebrew responses:

```
*כותרת בולטת*           → Bold
_טקסט נטוי_             → Italic
~טקסט מחוק~             → Strikethrough
```monospace```          → Code block
- פריט ברשימה            → List item (just use dash)
```

## Troubleshooting

### Session stuck in STARTING
- On ARM/Pi, WEBJS takes **1-2 minutes** to start — wait patiently
- If stuck beyond 3 minutes: restart container `docker compose restart`
- Nuclear option: delete `.sessions/webjs-{SESSION_NAME}` and re-authenticate
- GOWS engine is faster but **x86 only**: `WHATSAPP_DEFAULT_ENGINE=GOWS`

### Messages stay PENDING
- Session partially disconnected
- Restart session: `POST /api/sessions/{session}/restart`

### Webhook not receiving
- Verify URL accessible from container (use `http://host.docker.internal:port` or LAN IP)
- Don't use `localhost` — container can't reach host that way
- Check events enabled in session config
- Verify HMAC key matches on both sides

### Dashboard shows duplicate workers
- Only one worker "WAHA-Pi5" should exist
- Remove stale workers via Dashboard → Workers → Disconnect Worker button
- Stale workers appear when dashboard stores old browser-based connections

### QR code expired
- Restart session: `POST /api/sessions/{session}/restart`
- Wait for `SCAN_QR_CODE` state, then fetch fresh QR: `GET /api/{session}/auth/qr`

### Session shows SCAN_QR_CODE after restart
- Previous WhatsApp link expired or was removed from phone
- Need to re-scan QR: Settings → Linked Devices → Link a Device

## API Reference

See `references/api-endpoints.md` for complete endpoint documentation.

## Resources

### assets/
- `.env.example` - Complete environment variable template with all WAHA configuration options

### references/
- `api-endpoints.md` - Complete API endpoint reference
- `webhook-events.md` - Detailed webhook event types and payload structures
- `integration-examples.md` - More n8n and Node-RED workflow examples
