// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * OAuth 2.1 for the hosted MCP connector at api.agent-media.ai/mcp.
 *
 * WHY: connector clients (claude.ai web, ChatGPT, Cursor) cannot use a pasted
 * API key — they discover an authorization server from a 401's
 * `WWW-Authenticate` header, register themselves via dynamic client
 * registration, and run an authorization-code + PKCE flow. Before this module
 * our /mcp returned a bare 401 with no `WWW-Authenticate` and no
 * `.well-known/*`, so those clients had no way to even begin.
 *
 * HOW: we do NOT implement an authorization server. Supabase Auth ships a real
 * OAuth 2.1 AS (GoTrue >= 2.186) and our project has it enabled, so we proxy to
 * it with the SDK's ProxyOAuthServerProvider. Supabase owns registered clients,
 * authorization codes, PKCE challenges and refresh tokens — we store none of
 * that, which is why this needed no migration.
 *
 * Auth stays ADDITIVE: `ma_` API keys keep working everywhere (the CLI and SDKs
 * depend on them). This only adds a second, browser-based way in.
 */

import type { RequestHandler } from 'express';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { verifyToken } from './auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Public origin of this API — the OAuth issuer + resource server. */
const PUBLIC_ORIGIN = (process.env.PUBLIC_API_ORIGIN ?? 'https://api.agent-media.ai').replace(/\/+$/, '');

/** Scopes we ask Supabase for. Kept minimal — we only need identity. */
const SCOPES = ['openid', 'email', 'profile'];

/** True when the connector OAuth surface can be mounted at all. */
export function isMcpOAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Supabase's Kong gateway rejects the token/registration endpoints without an
 * `apikey` header, so every server-to-server leg carries the anon key. The
 * browser-facing /authorize leg is a redirect and needs nothing.
 */
function supabaseFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('apikey')) headers.set('apikey', SUPABASE_ANON_KEY);
  return fetch(input, { ...init, headers });
}

/** Read `exp` out of a JWT without verifying it — verification is done by
 *  verifyToken() against Supabase. Used only to populate AuthInfo.expiresAt,
 *  which the SDK's bearer middleware requires to be a number. */
function readJwtExp(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Verify a bearer token for the MCP resource server. Accepts BOTH a Supabase
 * OAuth access token (the new connector path) and an `ma_` API key (the CLI /
 * SDK path) — `verifyToken` already dispatches on the prefix.
 */
async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const result = await verifyToken(token);
  if (result.error || !result.userId) {
    throw new Error(result.error ?? 'Invalid token');
  }
  return {
    token,
    // The connector's registered client id isn't recoverable from an opaque
    // bearer; the resource server only needs the subject, which we carry in
    // `extra` for downstream handlers.
    clientId: '',
    scopes: SCOPES,
    // Non-expiring for API keys; JWTs carry their own exp.
    expiresAt: readJwtExp(token) ?? Math.floor(Date.now() / 1000) + 3600,
    extra: { userId: result.userId },
  };
}

/**
 * Look a registered client back up from Supabase. Clients are created by the
 * SDK's /register handler proxying to Supabase, so this reads them from the
 * admin API with the service-role key.
 */
async function getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
  if (!SUPABASE_SERVICE_ROLE_KEY) return undefined;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/oauth/clients/${encodeURIComponent(clientId)}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!resp.ok) return undefined;
    const c = (await resp.json()) as Record<string, unknown>;
    // Supabase returns snake_case fields; map to the SDK's shape.
    return {
      client_id: String(c.client_id ?? c.id ?? clientId),
      client_secret: typeof c.client_secret === 'string' ? c.client_secret : undefined,
      redirect_uris: Array.isArray(c.redirect_uris) ? (c.redirect_uris as string[]) : [],
      client_name: typeof c.client_name === 'string' ? c.client_name : undefined,
      grant_types: Array.isArray(c.grant_types) ? (c.grant_types as string[]) : ['authorization_code', 'refresh_token'],
      response_types: Array.isArray(c.response_types) ? (c.response_types as string[]) : ['code'],
      token_endpoint_auth_method:
        typeof c.token_endpoint_auth_method === 'string' ? c.token_endpoint_auth_method : 'none',
    } as OAuthClientInformationFull;
  } catch (err) {
    console.error('[mcp-oauth] getClient failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * Build the OAuth router that serves:
 *   GET  /.well-known/oauth-authorization-server
 *   GET  /.well-known/oauth-protected-resource[/mcp]
 *   GET|POST /authorize   → redirects to Supabase
 *   POST /token           → proxied to Supabase
 *   POST /register        → dynamic client registration, proxied to Supabase
 *
 * Mount this BEFORE the application's own routes.
 */
export function createMcpOAuthRouter(): RequestHandler {
  const provider = new ProxyOAuthServerProvider({
    endpoints: {
      authorizationUrl: `${SUPABASE_URL}/auth/v1/oauth/authorize`,
      tokenUrl: `${SUPABASE_URL}/auth/v1/oauth/token`,
      registrationUrl: `${SUPABASE_URL}/auth/v1/oauth/clients/register`,
    },
    verifyAccessToken,
    getClient,
    fetch: supabaseFetch,
  });

  return mcpAuthRouter({
    provider,
    issuerUrl: new URL(PUBLIC_ORIGIN),
    baseUrl: new URL(PUBLIC_ORIGIN),
    resourceServerUrl: new URL(`${PUBLIC_ORIGIN}/mcp`),
    resourceName: 'agent-media',
    scopesSupported: SCOPES,
  }) as unknown as RequestHandler;
}

/**
 * The URL a 401 from /mcp must advertise so a connector client can discover how
 * to authenticate. Without this header the client has no entry point at all —
 * which was the entire reason connectors could not use us.
 */
export function protectedResourceMetadataUrl(): string {
  return `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp`;
}
