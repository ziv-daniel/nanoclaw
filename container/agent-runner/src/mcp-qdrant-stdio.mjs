#!/usr/bin/env node
// Stdio→SSE proxy for mcp-qdrant-server
// Must be run with proxy env vars cleared: http_proxy="" node ...
import http from 'node:http';
import { createInterface } from 'node:readline';

const SSE_HOST = process.env.QDRANT_MCP_HOST || 'host.docker.internal';
const SSE_PORT = parseInt(process.env.QDRANT_MCP_PORT || '8000');
const SSE_PATH = process.env.QDRANT_MCP_PATH || '/sse';

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: SSE_HOST, port: SSE_PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => { let s=''; res.on('data',c=>s+=c); res.on('end',()=>resolve(s)); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

let sessionPath = null;
let sseReq = null;
const pendingMsgs = [];

function connectSSE() {
  let buf = '', eventType = '';
  sseReq = http.request({
    host: SSE_HOST, port: SSE_PORT, path: SSE_PATH, method: 'GET',
    headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }
  }, (res) => {
    res.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (eventType === 'endpoint' && !sessionPath) {
            sessionPath = data;
            // Flush any pending messages
            for (const msg of pendingMsgs) {
              httpPost(sessionPath, msg).catch(e => process.stderr.write(`Post err: ${e.message}\n`));
            }
            pendingMsgs.length = 0;
          } else if (data) {
            try {
              process.stdout.write(JSON.stringify(JSON.parse(data)) + '\n');
            } catch {}
          }
          eventType = '';
        }
      }
    });
    res.on('end', () => { process.stderr.write('SSE ended\n'); });
  });
  sseReq.on('error', (e) => { process.stderr.write(`SSE err: ${e.message}\n`); });
  sseReq.end();
}

connectSSE();

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (sessionPath) {
      await httpPost(sessionPath, msg).catch(e => process.stderr.write(`Post err: ${e.message}\n`));
    } else {
      pendingMsgs.push(msg);
    }
  } catch(e) {
    process.stderr.write(`Parse err: ${e.message}\n`);
  }
});

// Don't exit on stdin close — stay alive to receive SSE responses
// (Claude Code MCP runner will kill us when done)
rl.on('close', () => {
  // Keep running to receive responses via SSE
});
