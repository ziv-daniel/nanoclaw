import { findByName, getAllDestinations, type DestinationEntry } from './destinations.js';
import { getPendingMessages, markProcessing, markCompleted, type MessageInRow } from './db/messages-in.js';
import { writeMessageOut } from './db/messages-out.js';
import { touchHeartbeat, clearStaleProcessingAcks } from './db/connection.js';
import { getStoredSessionId, setStoredSessionId, clearStoredSessionId } from './db/session-state.js';
import { recordModelDecision } from './db/model-decisions.js';
import { recordUsage } from './db/agent-usage.js';
import { getRouter, type RouteDecision } from './routing/index.js';
import fs from 'fs';
import path from 'path';

// Auto-rotate the Claude SDK session before its transcript grows past
// the size where prompt-format drift becomes likely. Empirically a
// 9.7 MB / 2,915-turn JSONL was severe enough that every container
// resuming the session learned a broken response format from history.
// Defaults: 5 MB OR 1500 turns. Tuneable via env.
const MAX_SESSION_BYTES = parseInt(process.env.NANOCLAW_MAX_SESSION_BYTES || '', 10) || 5 * 1024 * 1024;
const MAX_SESSION_TURNS = parseInt(process.env.NANOCLAW_MAX_SESSION_TURNS || '', 10) || 1500;

function transcriptPath(continuation: string): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  // Claude SDK encodes the cwd into the projects dir slug: each `/`
  // becomes `-`, leading `/` stays as a leading `-`. For a runner
  // working in /workspace/agent that produces `-workspace-agent`.
  const cwd = process.cwd();
  const slug = cwd.replace(/\//g, '-');
  return path.join(home, '.claude', 'projects', slug, `${continuation}.jsonl`);
}

/** Returns true if the caller should clear `continuation` and start fresh. */
function maybeRotateSession(continuation: string | undefined, log: (msg: string) => void): boolean {
  if (!continuation) return false;
  const tp = transcriptPath(continuation);
  if (!tp) return false;
  let size = 0;
  let turns = 0;
  try {
    size = fs.statSync(tp).size;
    if (size <= MAX_SESSION_BYTES / 2) return false; // fast path: small file, no need to count lines
    // Count newlines lazily — only when we're already over half the byte budget.
    const buf = fs.readFileSync(tp);
    turns = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) turns++;
  } catch {
    return false;
  }
  if (size > MAX_SESSION_BYTES || turns > MAX_SESSION_TURNS) {
    log(`Auto-rotating session ${continuation}: ${size} bytes / ${turns} turns exceeds cap (${MAX_SESSION_BYTES} bytes / ${MAX_SESSION_TURNS} turns)`);
    return true;
  }
  return false;
}
import { formatMessages, extractRouting, categorizeMessage, isClearCommand, stripInternalTags, type RoutingContext } from './formatter.js';
import type { AgentProvider, AgentQuery, ProviderEvent } from './providers/types.js';

const POLL_INTERVAL_MS = 1000;
const ACTIVE_POLL_INTERVAL_MS = 500;

function log(msg: string): void {
  console.error(`[poll-loop] ${msg}`);
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Short label for the user-visible prefix: "opus", "sonnet", "haiku", or the raw id. */
function shortModelLabel(model: string): string {
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model;
}

/** `_[opus · high]_\n` — italic-rendered in markdown channels (Telegram, Slack). */
function formatRoutePrefix(decision: RouteDecision): string {
  return `_[${shortModelLabel(decision.model)} · ${decision.effort}]_\n`;
}

/** Pull representative text from the batch for routing — joins all message
 * `text` fields, capped at 2000 chars so a long pasted log doesn't dominate. */
function extractRouteText(messages: MessageInRow[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    try {
      const c = JSON.parse(m.content) as { text?: string };
      if (c?.text) parts.push(c.text);
    } catch {
      // Non-JSON content (rare) — fall back to raw.
      parts.push(m.content);
    }
  }
  return parts.join('\n').slice(0, 2000);
}

export interface PollLoopConfig {
  provider: AgentProvider;
  cwd: string;
  systemContext?: {
    instructions?: string;
  };
}

/**
 * Main poll loop. Runs indefinitely until the process is killed.
 *
 * 1. Poll messages_in for pending rows
 * 2. Format into prompt, call provider.query()
 * 3. While query active: continue polling, push new messages via provider.push()
 * 4. On result: write messages_out
 * 5. Mark messages completed
 * 6. Loop
 */
export async function runPollLoop(config: PollLoopConfig): Promise<void> {
  // Resume the agent's prior session from a previous container run if one
  // was persisted. The continuation is opaque to the poll-loop — the
  // provider decides how to use it (Claude resumes a .jsonl transcript,
  // other providers may reload a thread ID, etc.).
  let continuation: string | undefined = getStoredSessionId();

  if (continuation) {
    log(`Resuming agent session ${continuation}`);
    if (maybeRotateSession(continuation, log)) {
      continuation = undefined;
      clearStoredSessionId();
      log('Cleared stored session ID — next query will start a fresh Claude session.');
    }
  }

  // Clear leftover 'processing' acks from a previous crashed container.
  // This lets the new container re-process those messages.
  clearStaleProcessingAcks();

  let pollCount = 0;
  while (true) {
    // Skip system messages — they're responses for MCP tools (e.g., ask_user_question)
    const messages = getPendingMessages().filter((m) => m.kind !== 'system');
    pollCount++;

    // Periodic heartbeat so we know the loop is alive
    if (pollCount % 30 === 0) {
      log(`Poll heartbeat (${pollCount} iterations, ${messages.length} pending)`);
    }

    // Periodic rotation check: if the active session has grown past
    // the size cap mid-run, clear it so the next query starts fresh.
    // Skipped while a query is active (would interrupt mid-turn).
    if (pollCount % 50 === 0 && messages.length === 0 && maybeRotateSession(continuation, log)) {
      continuation = undefined;
      clearStoredSessionId();
      log('Cleared stored session ID mid-run — next query will start a fresh Claude session.');
    }

    if (messages.length === 0) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // Accumulate gate: if the batch contains only trigger=0 rows
    // (context-only, router-stored under ignored_message_policy='accumulate'),
    // don't wake the agent. Leave them `pending` — they'll ride along the
    // next time a real trigger=1 message lands via this same getPendingMessages
    // query. Without this gate, a warm container keeps processing
    // (and potentially responding to) every accumulate-only batch, defeating
    // the "store as context, don't engage" contract. Host-side countDueMessages
    // gates the same way for wake-from-cold (see src/db/session-db.ts).
    if (!messages.some((m) => m.trigger === 1)) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const ids = messages.map((m) => m.id);
    markProcessing(ids);

    const routing = extractRouting(messages);

    // Command handling: the host router gates filtered and unauthorized
    // admin commands before they reach the container. The only command
    // the runner handles directly is /clear (session reset).
    const normalMessages: MessageInRow[] = [];
    const commandIds: string[] = [];

    for (const msg of messages) {
      if ((msg.kind === 'chat' || msg.kind === 'chat-sdk') && isClearCommand(msg)) {
        log('Clearing session (resetting continuation)');
        continuation = undefined;
        clearStoredSessionId();
        writeMessageOut({
          id: generateId(),
          kind: 'chat',
          platform_id: routing.platformId,
          channel_type: routing.channelType,
          thread_id: routing.threadId,
          content: JSON.stringify({ text: 'Session cleared.' }),
        });
        commandIds.push(msg.id);
        continue;
      }
      normalMessages.push(msg);
    }

    if (commandIds.length > 0) {
      markCompleted(commandIds);
    }

    if (normalMessages.length === 0) {
      const remainingIds = ids.filter((id) => !commandIds.includes(id));
      if (remainingIds.length > 0) markCompleted(remainingIds);
      log(`All ${messages.length} message(s) were commands, skipping query`);
      continue;
    }

    // Pre-task scripts: for any task rows with a `script`, run it before the
    // provider call. Scripts returning wakeAgent=false (or erroring) gate
    // their own task row only — surviving messages still go to the agent.
    // Without the scheduling module, the marker block is empty, `keep`
    // falls back to `normalMessages`, and no gating happens.
    let keep: MessageInRow[] = normalMessages;
    let skipped: string[] = [];
    // MODULE-HOOK:scheduling-pre-task:start
    const { applyPreTaskScripts } = await import('./scheduling/task-script.js');
    const preTask = await applyPreTaskScripts(normalMessages);
    keep = preTask.keep;
    skipped = preTask.skipped;
    if (skipped.length > 0) {
      markCompleted(skipped);
      log(`Pre-task script skipped ${skipped.length} task(s): ${skipped.join(', ')}`);
    }
    // MODULE-HOOK:scheduling-pre-task:end

    if (keep.length === 0) {
      log(`All ${normalMessages.length} non-command message(s) gated by script, skipping query`);
      continue;
    }

    // Format messages: passthrough commands get raw text (only if the
    // provider natively handles slash commands), others get XML.
    const prompt = formatMessagesWithCommands(keep, config.provider.supportsNativeSlashCommands);

    log(`Processing ${keep.length} message(s), kinds: ${[...new Set(keep.map((m) => m.kind))].join(',')}`);

    // Route this turn: pick model + effort from the message content.
    // Decision is per-turn; follow-up messages pushed mid-stream inherit it.
    const router = getRouter();
    const routeText = extractRouteText(keep);
    const decision = await router.route({
      message: routeText,
      channelType: routing.channelType,
    });
    log(`Route: ${decision.model} · ${decision.effort} (rule=${decision.rule})`);
    try {
      recordModelDecision({
        ts: new Date().toISOString(),
        message_id: keep[0]?.id ?? null,
        channel_type: routing.channelType ?? null,
        model: decision.model,
        effort: decision.effort,
        executor: decision.executor,
        rule: decision.rule,
        reason: decision.reason ?? null,
        message_excerpt: routeText.slice(0, 200),
        decided_by: router.kind,
      });
    } catch (e) {
      // Decision logging is best-effort — never block a query on it.
      log(`recordModelDecision failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const query = config.provider.query({
      prompt,
      continuation,
      cwd: config.cwd,
      systemContext: config.systemContext,
      model: decision.model,
      effort: decision.effort,
    });

    // Process the query while concurrently polling for new messages
    const skippedSet = new Set(skipped);
    const processingIds = ids.filter((id) => !commandIds.includes(id) && !skippedSet.has(id));
    try {
      const result = await processQuery(query, routing, processingIds, decision);
      if (result.continuation && result.continuation !== continuation) {
        continuation = result.continuation;
        setStoredSessionId(continuation);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`Query error: ${errMsg}`);

      // Stale/corrupt continuation recovery: ask the provider whether
      // this error means the stored continuation is unusable, and clear
      // it so the next attempt starts fresh.
      if (continuation && config.provider.isSessionInvalid(err)) {
        log(`Stale session detected (${continuation}) — clearing for next retry`);
        continuation = undefined;
        clearStoredSessionId();
      }

      // Write error response so the user knows something went wrong.
      // Prefix surfaces which model failed — useful for telling "Sonnet
      // is exhausted" apart from "auth broken".
      writeMessageOut({
        id: generateId(),
        kind: 'chat',
        platform_id: routing.platformId,
        channel_type: routing.channelType,
        thread_id: routing.threadId,
        content: JSON.stringify({ text: `${formatRoutePrefix(decision)}Error: ${errMsg}` }),
      });
    }

    // Ensure completed even if processQuery ended without a result event
    // (e.g. stream closed unexpectedly).
    markCompleted(processingIds);
    log(`Completed ${ids.length} message(s)`);
  }
}

/**
 * Format messages, handling passthrough commands differently.
 * When the provider handles slash commands natively (Claude Code),
 * passthrough commands are sent raw (no XML wrapping) so the SDK can
 * dispatch them. Otherwise they fall through to standard XML formatting.
 */
function formatMessagesWithCommands(messages: MessageInRow[], nativeSlashCommands: boolean): string {
  const parts: string[] = [];
  const normalBatch: MessageInRow[] = [];

  for (const msg of messages) {
    if (nativeSlashCommands && (msg.kind === 'chat' || msg.kind === 'chat-sdk')) {
      const cmdInfo = categorizeMessage(msg);
      if (cmdInfo.category === 'passthrough' || cmdInfo.category === 'admin') {
        // Flush normal batch first
        if (normalBatch.length > 0) {
          parts.push(formatMessages(normalBatch));
          normalBatch.length = 0;
        }
        // Pass raw command text (no XML wrapping) — SDK handles it natively
        parts.push(cmdInfo.text);
        continue;
      }
    }
    normalBatch.push(msg);
  }

  if (normalBatch.length > 0) {
    parts.push(formatMessages(normalBatch));
  }

  return parts.join('\n\n');
}

interface QueryResult {
  continuation?: string;
}

async function processQuery(
  query: AgentQuery,
  routing: RoutingContext,
  initialBatchIds: string[],
  decision: RouteDecision,
): Promise<QueryResult> {
  let queryContinuation: string | undefined;
  let done = false;

  // Concurrent polling: push follow-ups into the active query as they arrive.
  // We do NOT force-end the stream on silence — keeping the query open is
  // strictly cheaper than close+reopen (no cold prompt cache, no reconnect).
  // Stream liveness is decided host-side via the heartbeat file + processing
  // claim age (see src/host-sweep.ts); if something is truly stuck, the host
  // will kill the container and messages get reset to pending.
  const pollHandle = setInterval(() => {
    if (done) return;

    // Skip system messages (MCP tool responses) and /clear (needs fresh query).
    // Thread routing is the router's concern — if a message landed in this
    // session, the agent should see it. Per-thread sessions already isolate
    // threads into separate containers; shared sessions intentionally merge
    // everything. Filtering on thread_id here caused deadlocks when the
    // initial batch and follow-ups had mismatched thread_ids (e.g. a
    // host-generated welcome trigger with null thread vs a Discord DM reply).
    const newMessages = getPendingMessages().filter((m) => {
      if (m.kind === 'system') return false;
      if ((m.kind === 'chat' || m.kind === 'chat-sdk') && isClearCommand(m)) return false;
      return true;
    });
    if (newMessages.length > 0) {
      const newIds = newMessages.map((m) => m.id);
      markProcessing(newIds);

      const prompt = formatMessages(newMessages);
      log(`Pushing ${newMessages.length} follow-up message(s) into active query`);
      query.push(prompt);

      markCompleted(newIds);
    }
  }, ACTIVE_POLL_INTERVAL_MS);

  // Wall-clock heartbeat: touch every 5s independent of SDK events so long
  // tool calls (MCP, OneCLI gateway, hung WebFetch) don't trigger the
  // host-side claim-stuck/ceiling kill. The per-event touchHeartbeat below
  // stays as a fast-path; this timer is the safety net.
  const wallHbHandle = setInterval(() => touchHeartbeat(), 5000);
  (wallHbHandle as { unref?: () => void }).unref?.();
  try {
    for await (const event of query.events) {
      handleEvent(event, routing);
      touchHeartbeat();

      if (event.type === 'init') {
        queryContinuation = event.continuation;
        // Persist immediately so a mid-turn container crash still lets the
        // next wake resume the conversation. Without this, the session id
        // was only written after the full stream completed — if the
        // container died between `init` and `result`, the SDK session was
        // effectively orphaned and the next message started a blank
        // Claude session with no prior context.
        setStoredSessionId(event.continuation);
      } else if (event.type === 'result') {
        // A result — with or without text — means the turn is done. Mark
        // the initial batch completed now so the host sweep doesn't see
        // stale 'processing' claims while the query stays open for
        // follow-up pushes. The agent may have responded via MCP
        // (send_message) mid-turn, or the message may not need a response
        // at all — either way the turn is finished.
        markCompleted(initialBatchIds);
        // Capture token usage for monitoring (mcp__nanoclaw__get_usage).
        // Best-effort — never blocks turn completion.
        if (event.usage) {
          try {
            recordUsage({
              ts: new Date().toISOString(),
              session_id: queryContinuation ?? null,
              model: event.usage.model ?? decision.model,
              input_tokens: event.usage.input_tokens,
              output_tokens: event.usage.output_tokens,
              cache_create_tokens: event.usage.cache_create_tokens,
              cache_read_tokens: event.usage.cache_read_tokens,
            });
          } catch (e) {
            log(`recordUsage failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (event.text) {
          dispatchResultText(event.text, routing, decision);
        }
      }
    }
  } finally {
    done = true;
    clearInterval(pollHandle);
    clearInterval(wallHbHandle);
  }

  return { continuation: queryContinuation };
}

function handleEvent(event: ProviderEvent, _routing: RoutingContext): void {
  switch (event.type) {
    case 'init':
      log(`Session: ${event.continuation}`);
      break;
    case 'result':
      log(`Result: ${event.text ? event.text.slice(0, 200) : '(empty)'}`);
      break;
    case 'error':
      log(`Error: ${event.message} (retryable: ${event.retryable}${event.classification ? `, ${event.classification}` : ''})`);
      break;
    case 'progress':
      log(`Progress: ${event.message}`);
      break;
  }
}

/**
 * Parse the agent's final text for <message to="name">...</message> blocks
 * and dispatch each one to its resolved destination. Text outside of blocks
 * (including <internal>...</internal>) is normally scratchpad — logged but
 * not sent.
 *
 * Single-destination shortcut: if the agent has exactly one configured
 * destination AND the output contains zero <message> blocks, the entire
 * cleaned text (with <internal> tags stripped) is sent to that destination.
 * This preserves the simple case of one user on one channel — the agent
 * doesn't need to know about wrapping syntax at all.
 */
function dispatchResultText(text: string, routing: RoutingContext, decision: RouteDecision): void {
  const MESSAGE_RE = /<message\s+to="([^"]+)"\s*>([\s\S]*?)<\/message>/g;
  const prefix = formatRoutePrefix(decision);

  let match: RegExpExecArray | null;
  let sent = 0;
  let lastIndex = 0;
  const scratchpadParts: string[] = [];

  while ((match = MESSAGE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      scratchpadParts.push(text.slice(lastIndex, match.index));
    }
    const toName = match[1];
    const body = match[2].trim();
    lastIndex = MESSAGE_RE.lastIndex;

    const dest = findByName(toName);
    if (!dest) {
      log(`Unknown destination in <message to="${toName}">, dropping block`);
      scratchpadParts.push(`[dropped: unknown destination "${toName}"] ${body}`);
      continue;
    }
    sendToDestination(dest, prefix + body, routing);
    sent++;
  }
  if (lastIndex < text.length) {
    scratchpadParts.push(text.slice(lastIndex));
  }

  const scratchpad = stripInternalTags(scratchpadParts.join(''));

  // Single-destination shortcut: the agent wrote plain text — send to
  // the session's originating channel (from session_routing) if available,
  // otherwise fall back to the single destination.
  if (sent === 0 && scratchpad) {
    if (routing.channelType && routing.platformId) {
      // Reply to the channel/thread the message came from
      writeMessageOut({
        id: generateId(),
        in_reply_to: routing.inReplyTo,
        kind: 'chat',
        platform_id: routing.platformId,
        channel_type: routing.channelType,
        thread_id: routing.threadId,
        content: JSON.stringify({ text: prefix + scratchpad }),
      });
      return;
    }
    const all = getAllDestinations();
    if (all.length === 1) {
      sendToDestination(all[0], prefix + scratchpad, routing);
      return;
    }
  }

  if (scratchpad) {
    log(`[scratchpad] ${scratchpad.slice(0, 500)}${scratchpad.length > 500 ? '…' : ''}`);
  }

  if (sent === 0 && text.trim()) {
    log(`WARNING: agent output had no <message to="..."> blocks — nothing was sent`);
  }
}

function sendToDestination(dest: DestinationEntry, body: string, routing: RoutingContext): void {
  const platformId = dest.type === 'channel' ? dest.platformId! : dest.agentGroupId!;
  const channelType = dest.type === 'channel' ? dest.channelType! : 'agent';
  // Inherit thread_id from the inbound routing context so replies land in the
  // same thread the conversation is in. For non-threaded adapters the router
  // strips thread_id at ingest, so this will already be null.
  writeMessageOut({
    id: generateId(),
    in_reply_to: routing.inReplyTo,
    kind: 'chat',
    platform_id: platformId,
    channel_type: channelType,
    thread_id: routing.threadId,
    content: JSON.stringify({ text: body }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
