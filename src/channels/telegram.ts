/**
 * Telegram channel adapter (v2) — forum topic routing + ack reactions.
 * See telegram-pairing.ts for pairing flow documentation.
 *
 * Forum topic routing: for Telegram supergroups with topics (is_forum=true),
 * each topic thread routes as a separate messaging_group via compound platformId:
 *   "<chatId>:<threadId>"  e.g. "-1003904891263:3"
 * The deliver() method decodes these back to chatId + threadId for the API.
 *
 * Reaction patches (2026-04-25/26):
 *  - emoji ack on inbound (👀/📸/🎤/🎬/📄 with standard-set fallback)
 *  - 👍 reaction on outbound delivery (paired to the prompting inbound msg)
 */
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { readEnvFile } from "../env.js";
import { log } from "../log.js";
import { createMessagingGroup, getMessagingGroupByPlatform, updateMessagingGroup } from "../db/messaging-groups.js";
import { grantRole, hasAnyOwner } from "../modules/permissions/db/user-roles.js";
import { upsertUser } from "../modules/permissions/db/users.js";
import { createChatSdkBridge, type ReplyContext } from "./chat-sdk-bridge.js";
import { sanitizeTelegramLegacyMarkdown } from "./telegram-markdown-sanitize.js";
import { registerChannelAdapter } from "./channel-registry.js";
import type { ChannelAdapter, ChannelSetup, InboundMessage, OutboundMessage } from "./adapter.js";
import { tryConsume } from "./telegram-pairing.js";

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = Math.min(16000, 1000 * 2 ** (attempt - 1));
      log.warn("Telegram setup failed, retrying", { label, attempt, delayMs: delay, err });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReplyContext(raw: Record<string, any>): ReplyContext | null {
  if (!raw.reply_to_message) return null;
  const reply = raw.reply_to_message;
  return { text: reply.text || reply.caption || "", sender: reply.from?.first_name || reply.from?.username || "Unknown" };
}

async function fetchBotUsername(token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return json.ok ? (json.result?.username ?? null) : null;
  } catch (err) { log.warn("Telegram getMe failed", { err }); return null; }
}

function isGroupPlatformId(platformId: string): boolean {
  return (platformId.split(":").pop() ?? "").startsWith("-");
}

/** Decode compound platformId back to chatId + topicId. */
function decodeForumPlatformId(platformId: string): { chatId: string; topicId: string | null } {
  const match = platformId.match(/^(-\d+):(\d+)$/);
  return match ? { chatId: match[1], topicId: match[2] } : { chatId: platformId, topicId: null };
}

interface InboundFields { text: string; authorUserId: string | null; }

function readInboundFields(message: InboundMessage): InboundFields {
  if (message.kind !== "chat-sdk" || !message.content || typeof message.content !== "object") {
    return { text: "", authorUserId: null };
  }
  const c = message.content as { text?: string; author?: { userId?: string } };
  return { text: c.text ?? "", authorUserId: c.author?.userId ?? null };
}

async function sendPairingConfirmation(token: string, platformId: string): Promise<void> {
  const chatId = platformId.split(":").slice(1).join(":");
  if (!chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "Pairing success! Andy is spinning up now." }),
    });
    if (!res.ok) log.warn("Pairing confirmation non-OK", { status: res.status });
  } catch (err) { log.warn("Pairing confirmation failed", { err }); }
}

function createPairingInterceptor(
  botUsernamePromise: Promise<string | null>,
  hostOnInbound: ChannelSetup["onInbound"],
  token: string,
): ChannelSetup["onInbound"] {
  return async (platformId, threadId, message) => {
    try {
      const botUsername = await botUsernamePromise;
      if (!botUsername) { hostOnInbound(platformId, threadId, message); return; }
      const { text, authorUserId } = readInboundFields(message);
      if (!text) { hostOnInbound(platformId, threadId, message); return; }
      const consumed = await tryConsume({ text, botUsername, platformId, isGroup: isGroupPlatformId(platformId), adminUserId: authorUserId });
      if (!consumed) { hostOnInbound(platformId, threadId, message); return; }
      const existing = getMessagingGroupByPlatform("telegram", platformId);
      if (existing) {
        updateMessagingGroup(existing.id, { is_group: consumed.consumed!.isGroup ? 1 : 0 });
      } else {
        createMessagingGroup({
          id: `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel_type: "telegram", platform_id: platformId, name: consumed.consumed!.name,
          is_group: consumed.consumed!.isGroup ? 1 : 0, unknown_sender_policy: "strict",
          created_at: new Date().toISOString(),
        });
      }
      const pairedUserId = `telegram:${consumed.consumed!.adminUserId}`;
      upsertUser({ id: pairedUserId, kind: "telegram", display_name: null, created_at: new Date().toISOString() });
      let promotedToOwner = false;
      if (!hasAnyOwner()) {
        grantRole({ user_id: pairedUserId, role: "owner", agent_group_id: null, granted_by: null, granted_at: new Date().toISOString() });
        promotedToOwner = true;
      }
      log.info("Telegram pairing accepted", { platformId, pairedUser: pairedUserId, promotedToOwner, intent: consumed.intent });
      await sendPairingConfirmation(token, platformId);
    } catch (err) {
      log.error("Telegram pairing interceptor error", { err });
      hostOnInbound(platformId, threadId, message);
    }
  };
}

/**
 * Forum topic routing interceptor.
 * Remaps (chatId, threadId) -> (chatId:threadId, null) for forum group messages.
 *
 * PATCH (2026-04-25): chat-sdk-telegram channelIdFromThreadId returns
 * the chat without topic suffix (e.g. "telegram:-1003904891263") and
 * the thread.id IS already the compound (e.g. "telegram:-1003904891263:3").
 * Original check `platformId.startsWith("-")` was always false because
 * platformId starts with "telegram:". Using isGroupPlatformId fixes detection,
 * and threadId itself is already the compound id we want as the new platformId.
 */
function createForumTopicInterceptor(nextOnInbound: ChannelSetup["onInbound"]): ChannelSetup["onInbound"] {
  return (platformId, threadId, message) => {
    if (threadId !== null && isGroupPlatformId(platformId) && threadId !== platformId) {
      log.debug("Forum topic routing", { platformId, threadId, compound: threadId });
      return nextOnInbound(threadId, null, message);
    }
    return nextOnInbound(platformId, threadId, message);
  };
}

/**
 * PATCH (2026-04-25 v2): emoji ack on inbound — explicit emojis with fallback.
 * Tries the explicit type emoji first (📸 🎤 🎬 📄). If Telegram rejects
 * (REACTION_INVALID — chat doesn't allow custom emoji reactions), falls
 * back to a standard-set emoji (🔥 🎉 🤩 👌). Bot API allows only ONE
 * reaction per message for non-premium bots, so we can't combine.
 */
async function sendEmojiReaction(
  token: string,
  chatId: string,
  messageId: number,
  primary: string,
  fallback: string,
): Promise<void> {
  for (const emoji of [primary, fallback]) {
    if (!emoji) continue;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reaction: [{ type: "emoji", emoji }],
        }),
      });
      if (res.ok) return;
      const body = await res.text().catch(() => "");
      log.debug("Emoji ack non-OK, trying fallback", { emoji, status: res.status, body: body.slice(0, 200) });
    } catch (err) {
      log.debug("Emoji ack failed", { emoji, err });
    }
  }
}

function pickAckEmojis(message: InboundMessage): [string, string] {
  try {
    const c = message.content as { attachments?: Array<{ type?: string }> } | undefined;
    if (c && typeof c === "object" && Array.isArray(c.attachments) && c.attachments.length > 0) {
      const type = String(c.attachments[0].type ?? "").toLowerCase();
      if (type === "photo" || type.startsWith("image")) return ["📸", "🔥"];
      if (type === "voice" || type === "audio") return ["🎤", "🎉"];
      if (type === "video") return ["🎬", "🤩"];
      if (type === "document" || type === "file") return ["📄", "👌"];
      return ["👍", "👍"];
    }
    return ["👀", "👀"];
  } catch (err) {
    return ["👀", "👀"];
  }
}

function extractTelegramMessageId(message: InboundMessage): number | null {
  try {
    const c = message.content as { id?: string } | undefined;
    const id = c?.id;
    if (typeof id !== "string") return null;
    const parts = id.split(":");
    const last = parts[parts.length - 1];
    const n = parseInt(last, 10);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    return null;
  }
}

/** chatId -> last inbound message_id; consumed by deliver() to attach 👍. */
const lastInboundMsg = new Map<string, number>();

function createEmojiAckInterceptor(
  token: string,
  nextOnInbound: ChannelSetup["onInbound"],
): ChannelSetup["onInbound"] {
  return (platformId, threadId, message) => {
    try {
      const c = message.content as { author?: { isMe?: boolean } } | undefined;
      // Skip messages from the bot itself
      if (c?.author?.isMe !== true) {
        const messageId = extractTelegramMessageId(message);
        let chatId = platformId.replace(/^telegram:/, "");
        const m = chatId.match(/^(-?\d+)(:.*)?$/);
        if (m) chatId = m[1];
        if (messageId !== null && chatId) {
          const [primary, fallback] = pickAckEmojis(message);
          void sendEmojiReaction(token, chatId, messageId, primary, fallback);
          lastInboundMsg.set(String(chatId), messageId);
        }
      }
    } catch (err) {
      log.debug("Emoji ack interceptor error", { err });
    }
    return nextOnInbound(platformId, threadId, message);
  };
}

async function sendDoneReaction(token: string, chatId: string, messageId: number): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reaction: [{ type: "emoji", emoji: "👍" }], is_big: false }),
    });
  } catch (err) { log.debug("done reaction failed", { err }); }
}

registerChannelAdapter("telegram", {
  factory: () => {
    const env = readEnvFile(["TELEGRAM_BOT_TOKEN"]);
    if (!env.TELEGRAM_BOT_TOKEN) return null;
    const token = env.TELEGRAM_BOT_TOKEN;
    const telegramAdapter = createTelegramAdapter({ botToken: token, mode: "polling" });
    const bridge = createChatSdkBridge({
      adapter: telegramAdapter, concurrency: "concurrent",
      extractReplyContext, supportsThreads: true,
      transformOutboundText: sanitizeTelegramLegacyMarkdown,
    });
    const botUsernamePromise = fetchBotUsername(token);
    const wrapped: ChannelAdapter = {
      ...bridge,
      // supportsThreads=false at router level: forum topics are encoded in platformId instead.
      supportsThreads: false,
      async setup(hostConfig: ChannelSetup) {
        const intercepted: ChannelSetup = {
          ...hostConfig,
          onInbound: createEmojiAckInterceptor(
            token,
            createForumTopicInterceptor(
              createPairingInterceptor(botUsernamePromise, hostConfig.onInbound, token),
            ),
          ),
        };
        return withRetry(() => bridge.setup(intercepted), "bridge.setup");
      },
      async deliver(platformId: string, threadId: string | null, message: OutboundMessage): Promise<string | undefined> {
        const { chatId, topicId } = decodeForumPlatformId(platformId);
        const effectiveThreadId = topicId ?? threadId;
        const result = await bridge.deliver(chatId, effectiveThreadId, message);
        try {
          let baseChat = String(chatId).replace(/^telegram:/, "");
          const bm = baseChat.match(/^(-?\d+)/);
          const baseKey = bm ? bm[1] : baseChat;
          const inboundMsgId = lastInboundMsg.get(baseKey);
          if (inboundMsgId != null) {
            lastInboundMsg.delete(baseKey);
            void sendDoneReaction(token, baseKey, inboundMsgId);
          }
        } catch (err) { log.debug("done reaction wiring failed", { err }); }
        return result;
      },
    };
    return wrapped;
  },
});
