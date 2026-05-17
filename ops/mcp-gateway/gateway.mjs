#!/usr/bin/env node
/**
 * MCP Gateway — process manager.
 * Spawns supergateway wrappers for each local MCP server and serves a health
 * endpoint on :3000. Auto-restarts crashed processes with exponential backoff.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const SERVERS = [
  {
    name: 'github',
    port: 3001,
    stdio: 'mcp-server-github',
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN,
    },
  },
  {
    name: 'n8n-mcp',
    port: 3002,
    stdio: 'n8n-mcp',
    env: {
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      N8N_MCP_TELEMETRY_DISABLED: 'true',
      N8N_API_URL: process.env.N8N_API_URL,
      N8N_API_KEY: process.env.N8N_API_KEY,
    },
  },
  {
    name: 'hass-mcp',
    port: 3005,  // 3003 was taken by an existing node process on the host
    stdio: 'hass-mcp',
    env: {
      HA_URL: process.env.HA_URL,
      HA_TOKEN: process.env.HA_TOKEN,
    },
  },
  {
    name: 'dokploy',
    port: 3004,
    stdio: 'dokploy-mcp',
    env: {
      DOKPLOY_URL: process.env.DOKPLOY_URL,
      DOKPLOY_API_KEY: process.env.DOKPLOY_API_KEY,
    },
  },
];

/** Runtime state per server. */
const state = Object.fromEntries(
  SERVERS.map((s) => [
    s.name,
    { status: 'starting', port: s.port, startTime: null, restarts: 0, backoff: 1000 },
  ]),
);

function startServer(server) {
  const info = state[server.name];
  info.status = 'starting';

  // Merge env, dropping undefined values.
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...server.env }).filter(([, v]) => v !== undefined),
  );

  const child = spawn('supergateway', ['--stdio', server.stdio, '--port', String(server.port)], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  info.status = 'running';
  info.startTime = Date.now();

  child.stdout.on('data', (d) => process.stdout.write(`[${server.name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${server.name}] ${d}`));

  child.on('exit', (code) => {
    const uptime = Math.round((Date.now() - info.startTime) / 1000);
    info.status = 'crashed';

    // Reset backoff for long-lived runs (not a crash-loop).
    if (uptime > 60) info.backoff = 1000;

    const delay = info.backoff;
    console.error(
      `[${server.name}] exited code=${code} uptime=${uptime}s — restarting in ${delay}ms`,
    );

    setTimeout(() => {
      info.restarts++;
      info.backoff = Math.min(info.backoff * 2, 30_000);
      startServer(server);
    }, delay);
  });
}

for (const server of SERVERS) startServer(server);

// Health endpoint.
http
  .createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const now = Date.now();
    const servers = Object.fromEntries(
      Object.entries(state).map(([name, info]) => [
        name,
        {
          status: info.status,
          port: info.port,
          uptime: info.startTime ? Math.round((now - info.startTime) / 1000) : 0,
          restarts: info.restarts,
        },
      ]),
    );
    const ok = Object.values(servers).every((s) => s.status === 'running');
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: ok ? 'ok' : 'degraded', servers }, null, 2));
  })
  .listen(3000, () => console.log('MCP Gateway health on :3000'));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => process.exit(0));
}
