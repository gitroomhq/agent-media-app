#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * @agentmedia/mcp-server — stdio proxy to the hosted agent-media connector.
 *
 * WHY THIS IS A PROXY AND NOT A SERVER. Until 0.8.0 this package carried its
 * own hand-written tool list and handlers, separate from the hosted connector
 * at api.agent-media.ai/mcp. The two drifted on every change: the hosted side
 * got get_run_status, error detail pass-through, bounded timeouts and
 * upload_image during 2026-09; this side kept an eleven-tool v1 list, a
 * status tool that could only see /v1/videos, and told agents to poll URLs
 * it had no tool for. Nothing in the OSS repo forced the two to agree.
 *
 * Now there is one implementation. This binary opens the hosted connector
 * over Streamable HTTP with the user's ma_ key as the bearer, and re-exposes
 * exactly what it lists over stdio. Every tool, every description, every fix
 * lands here the moment it is deployed, with no release of this package.
 *
 * Who this is for: clients that only speak stdio. Anything that can add a
 * remote server should use the URL directly:
 *   claude mcp add --transport http agent-media https://api.agent-media.ai/mcp
 *
 * Env:
 *   AGENT_MEDIA_API_KEY   required, ma_xxx
 *   AGENT_MEDIA_API_URL   optional, defaults to https://api.agent-media.ai
 */

import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

const API_URL = (process.env.AGENT_MEDIA_API_URL || 'https://api.agent-media.ai').replace(/\/+$/, '');
const API_KEY = process.env.AGENT_MEDIA_API_KEY || '';

if (!API_KEY) {
  console.error('AGENT_MEDIA_API_KEY is required. Set it to your ma_xxx API key from https://agent-media.ai');
  process.exit(1);
}

// Generation runs for minutes; a single tool call never should. The hosted
// side bounds its own work well under this (get_run_status wait:true is 45s),
// so this ceiling only ever trips on a dead network.
const UPSTREAM_CALL_TIMEOUT_MS = 90_000;

// ── upstream: the hosted connector ───────────────────────────────────────────

let upstream: Client | null = null;

async function connectUpstream(): Promise<Client> {
  const client = new Client(
    { name: 'agent-media-stdio-proxy', version: VERSION },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(`${API_URL}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  await client.connect(transport);
  return client;
}

/** Lazily connect, and reconnect once if the hosted side dropped us. */
async function withUpstream<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  if (!upstream) upstream = await connectUpstream();
  try {
    return await fn(upstream);
  } catch (err) {
    // A stale connection (deploy swap, idle timeout) fails the first call
    // after it; one reconnect covers that without hiding a real error.
    try { await upstream.close(); } catch { /* already gone */ }
    upstream = await connectUpstream();
    return fn(upstream);
  }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// ── downstream: stdio to the local client ────────────────────────────────────

const server = new Server(
  { name: 'agent-media', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    return await withUpstream((c) => c.listTools());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-media] could not reach ${API_URL}/mcp: ${message}`);
    return { tools: [] };
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await withUpstream((c) =>
      c.callTool(
        { name: request.params.name, arguments: request.params.arguments ?? {} },
        undefined,
        { timeout: UPSTREAM_CALL_TIMEOUT_MS },
      ),
    );
    return result as CallToolResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/401|unauthori[sz]ed|invalid api key/i.test(message)) {
      return errorResult('agent-media rejected the API key. Check AGENT_MEDIA_API_KEY (ma_xxx) at https://agent-media.ai/settings.');
    }
    return errorResult(
      `agent-media did not answer (${message}). If you had just submitted a generation, call get_run_status before resubmitting so the user is not charged twice.`,
    );
  }
});

// ── boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`agent-media MCP proxy ${VERSION} → ${API_URL}/mcp`);
}

main().catch((err) => {
  console.error('[agent-media] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
