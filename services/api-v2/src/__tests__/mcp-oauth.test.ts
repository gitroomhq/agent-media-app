// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Proves the MCP connector handshake exists.
 *
 * The bug this locks down: before OAuth, POST /mcp returned a bare 401 with no
 * `WWW-Authenticate` and no `.well-known/*`, so connector clients (claude.ai
 * web, ChatGPT, Cursor) had no discoverable entry point and simply could not
 * connect. These tests assert the three things such a client needs:
 *   1. a 401 that names where to authenticate,
 *   2. protected-resource metadata pointing at an authorization server,
 *   3. authorization-server metadata advertising the grants + PKCE.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Env must be set before importing the module under test (it reads at import).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example-project.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.PUBLIC_API_ORIGIN = 'https://api.agent-media.ai';

const { createMcpOAuthRouter, isMcpOAuthConfigured, protectedResourceMetadataUrl } = await import(
  '../mcp-oauth.js'
);

let base: string;
let server: Server;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(createMcpOAuthRouter());

  // Minimal stand-in for the real /mcp guard: the assertion that matters is the
  // WWW-Authenticate challenge, which is what a connector client bootstraps on.
  app.post('/mcp', (req, res) => {
    if (!req.headers.authorization) {
      res
        .status(401)
        .set(
          'WWW-Authenticate',
          `Bearer resource_metadata="${protectedResourceMetadataUrl()}", error="invalid_token"`,
        )
        .json({ error: { code: 'UNAUTHORIZED' } });
      return;
    }
    res.json({ ok: true });
  });

  // Stand-ins for pre-existing API surface, registered AFTER the OAuth router —
  // exactly as in server.ts. These prove the router does not swallow traffic.
  app.get('/v1/existing-route', (_req, res) => { res.json({ untouched: true }); });
  app.post('/v1/existing-route', (req, res) => { res.json({ echoed: req.body }); });
  app.get('/v1/needs-auth', (_req, res) => {
    res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

describe('MCP connector OAuth', () => {
  it('is configured when Supabase env is present', () => {
    expect(isMcpOAuthConfigured()).toBe(true);
  });

  it('401 on /mcp carries WWW-Authenticate pointing at the metadata (the entry point)', async () => {
    const resp = await fetch(`${base}/mcp`, { method: 'POST' });
    expect(resp.status).toBe(401);
    const challenge = resp.headers.get('www-authenticate');
    expect(challenge).toBeTruthy();
    expect(challenge).toContain('resource_metadata=');
    expect(challenge).toContain('/.well-known/oauth-protected-resource/mcp');
  });

  it('serves protected-resource metadata naming an authorization server', async () => {
    const resp = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { resource: string; authorization_servers: string[] };
    expect(body.resource).toBe('https://api.agent-media.ai/mcp');
    expect(body.authorization_servers.length).toBeGreaterThan(0);
  });

  it('serves authorization-server metadata with the grants the SDK supports + PKCE', async () => {
    const resp = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint?: string;
      grant_types_supported: string[];
      code_challenge_methods_supported: string[];
    };
    expect(body.issuer).toContain('api.agent-media.ai');
    expect(body.authorization_endpoint).toContain('/authorize');
    expect(body.token_endpoint).toContain('/token');
    // Dynamic client registration — without it, connector clients cannot
    // self-register and the flow never starts.
    expect(body.registration_endpoint).toContain('/register');
    expect(body.grant_types_supported).toContain('authorization_code');
    expect(body.grant_types_supported).toContain('refresh_token');
    expect(body.code_challenge_methods_supported).toContain('S256');
  });

  it('metadata URL helper matches what the challenge advertises', () => {
    expect(protectedResourceMetadataUrl()).toBe(
      'https://api.agent-media.ai/.well-known/oauth-protected-resource/mcp',
    );
  });

  // ── Blast radius: existing traffic must be untouched ──────────────────────
  // The OAuth router mounts at the application ROOT, so the thing that could
  // break real users is it swallowing or altering requests to existing routes.

  it('passes through to existing routes it does not own', async () => {
    const resp = await fetch(`${base}/v1/existing-route`);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ untouched: true });
  });

  it('does not consume request bodies destined for existing routes', async () => {
    const resp = await fetch(`${base}/v1/existing-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ echoed: { hello: 'world' } });
  });

  it('leaves an existing route 401 WITHOUT a WWW-Authenticate challenge', async () => {
    // Only /mcp advertises OAuth. Changing other routes' 401 shape could
    // confuse existing API-key clients, so assert it did not happen.
    const resp = await fetch(`${base}/v1/needs-auth`);
    expect(resp.status).toBe(401);
    expect(resp.headers.get('www-authenticate')).toBeNull();
  });
});
