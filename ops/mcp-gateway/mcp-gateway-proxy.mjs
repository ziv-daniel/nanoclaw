#!/usr/bin/env node
/**
 * MCP Gateway stdio proxy.
 *
 * Bridges an MCP client that speaks stdio (e.g. Claude agent container) to an
 * MCP server that speaks HTTP+SSE (the gateway).
 *
 * Usage (in container.json mcpServers):
 *   "command": "node",
 *   "args": ["/opt/shared/mcp-gateway-proxy.mjs"],
 *   "env": {
 *     "MCP_SSE_URL": "http://host.docker.internal:3001/sse",
 *     "http_proxy": "", "https_proxy": "", "HTTP_PROXY": "", "HTTPS_PROXY": ""
 *   }
 *
 * The empty proxy vars bypass the NanoClaw OneCLI HTTP proxy so internal
 * gateway connections are not intercepted.
 */
import http from 'node:http';
import https from 'node:https';
import { createInterface } from 'node:readline';

const SSE_URL = process.env.MCP_SSE_URL;
if (!SSE_URL) {
  process.stderr.write('MCP_SSE_URL is required\n');
  process.exit(1);
}

let messageEndpoint = null;
const pendingLines = [];
let ready = false;

function send(line) {
  if (!messageEndpoint) {
    process.stderr.write(`[proxy] no endpoint yet, buffering: ${line.slice(0, 80)}\n`);
    pendingLines.push(line);
    return;
  }
  postMessage(line);
}

function flushPending() {
  while (pendingLines.length > 0) {
    postMessage(pendingLines.shift());
  }
}

function postMessage(body) {
  const u = new URL(messageEndpoint);
  const mod = u.protocol === 'https:' ? https : http;
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  const opts = {
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + (u.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };
  const req = mod.request(opts, (res) => res.resume());
  req.on('error', (err) => process.stderr.write(`[proxy] POST error: ${err.message}\n`));
  req.write(data);
  req.end();
}

function connectSSE() {
  const u = new URL(SSE_URL);
  const mod = u.protocol === 'https:' ? https : http;
  const opts = {
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + (u.search || ''),
    method: 'GET',
    headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
  };

  const req = mod.request(opts, (res) => {
    if (res.statusCode !== 200) {
      process.stderr.write(`[proxy] SSE connect failed: ${res.statusCode}\n`);
      setTimeout(connectSSE, 2000);
      return;
    }

    let buf = '';
    let eventType = '';

    res.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (eventType === 'endpoint') {
            // data is a path like /messages?sessionId=xxx; resolve against base.
            const base = new URL(SSE_URL);
            messageEndpoint = new URL(data, `${base.protocol}//${base.host}`).toString();
            if (!ready) {
              ready = true;
              flushPending();
            }
          } else if (eventType === 'message' || eventType === '') {
            process.stdout.write(data + '\n');
          }
          eventType = '';
        } else if (line === '') {
          eventType = '';
        }
      }
    });

    res.on('error', (err) => {
      process.stderr.write(`[proxy] SSE error: ${err.message}\n`);
      setTimeout(connectSSE, 2000);
    });

    res.on('end', () => {
      process.stderr.write('[proxy] SSE connection closed, reconnecting...\n');
      messageEndpoint = null;
      ready = false;
      setTimeout(connectSSE, 1000);
    });
  });

  req.on('error', (err) => {
    process.stderr.write(`[proxy] SSE request error: ${err.message}\n`);
    setTimeout(connectSSE, 2000);
  });

  req.end();
}

connectSSE();

// Forward stdin JSON-RPC lines to the gateway message endpoint.
const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (trimmed) send(trimmed);
});
rl.on('close', () => process.exit(0));
