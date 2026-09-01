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
import {
  InvalidClientError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidTargetError,
  ServerError,
  UnauthorizedClientError,
  UnsupportedGrantTypeError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { OAuthClientInformationFullSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
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
/**
 * Map an upstream OAuth error code onto the SDK's error class, so the code
 * survives the hop instead of collapsing into `server_error`.
 */
const UPSTREAM_ERRORS: Record<string, new (m: string) => Error> = {
  invalid_grant: InvalidGrantError,
  invalid_client: InvalidClientError,
  invalid_request: InvalidRequestError,
  invalid_target: InvalidTargetError,
  unauthorized_client: UnauthorizedClientError,
  unsupported_grant_type: UnsupportedGrantTypeError,
};

/**
 * ProxyOAuthServerProvider, but the token leg tells the truth.
 *
 * WHY. The SDK's implementation does this on any non-2xx from upstream:
 *
 *     await response.body?.cancel();
 *     throw new ServerError(`Token exchange failed: ${response.status}`);
 *
 * It cancels the body — the ONLY place the reason lives — and reports
 * `server_error`. Supabase had answered, precisely:
 *
 *     {"error":"invalid_grant","error_description":"Invalid authorization code"}
 *
 * and the connecting client saw `server_error`, which claude.ai surfaces as
 * "Authorization with the MCP server failed" with `mcp_token_exchange_failed`.
 * Verified against production on 2026-09-01: the same bogus code returns
 * invalid_grant straight from Supabase and server_error through us.
 *
 * That is not a cosmetic difference. `invalid_grant` tells a client its code
 * is stale and to restart the flow; `server_error` tells it we are broken, so
 * it neither retries usefully nor reports anything actionable — and nobody on
 * our side can tell an expired code from a real outage. Every connector
 * sign-in failure looked identical and unexplained.
 *
 * So: read the body, log it, and re-throw the upstream code.
 */
class LoggingProxyOAuthServerProvider extends ProxyOAuthServerProvider {
  /**
   * Register connector clients as PUBLIC (PKCE, no secret).
   *
   * THE BUG THIS FIXES. claude.ai's dynamic registration does not state a
   * `token_endpoint_auth_method`. Supabase's default for that is a
   * CONFIDENTIAL client — it registers `client_secret_basic` and returns a
   * `client_secret` exactly once, in the registration response.
   *
   * We are stateless: at token time `getClient()` re-reads the client from
   * Supabase's admin API, and that endpoint does NOT return the secret (it is
   * write-once by design — verified against production, the admin GET has no
   * client_secret field). So `client.client_secret` was always undefined by
   * then, the token request carried no client authentication, and Supabase
   * refused it:
   *
   *   invalid authentication method: client is registered for
   *   'client_secret_post' but 'none' was used
   *
   * Every connector sign-in failed this way, on the last step, after the user
   * had already logged in — and the old code reported it as `server_error`,
   * so it read as "Authorization with the MCP server failed" with no cause.
   *
   * A browser-based PKCE client has nowhere safe to keep a secret anyway;
   * public + S256 is the shape MCP connectors are meant to use. Forcing it at
   * registration makes the secret we cannot store unnecessary, rather than
   * bolting on storage for one we would only ever use once.
   */
  get clientsStore() {
    return {
      getClient,
      registerClient: async (client: OAuthClientInformationFull): Promise<OAuthClientInformationFull> => {
        const body = { ...client, token_endpoint_auth_method: 'none' };
        const response = await supabaseFetch(`${SUPABASE_URL}/auth/v1/oauth/clients/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        if (!response.ok) {
          console.error(`[mcp-oauth] client registration rejected: HTTP ${response.status} ${text.slice(0, 300)}`);
          throw new ServerError(`Client registration failed: ${response.status}`);
        }
        return OAuthClientInformationFullSchema.parse(JSON.parse(text));
      },
    };
  }

  private async postToken(params: URLSearchParams, leg: 'exchange' | 'refresh'): Promise<OAuthTokens> {
    const response = await supabaseFetch(`${SUPABASE_URL}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await response.text();
    if (!response.ok) {
      let code = '';
      let description = '';
      try {
        const body = JSON.parse(text) as { error?: string; error_description?: string; msg?: string };
        code = body.error ?? '';
        description = body.error_description ?? body.msg ?? '';
      } catch {
        description = text.slice(0, 300);
      }
      // Server-side, with the client id, so a failed sign-in is greppable.
      console.error(
        `[mcp-oauth] token ${leg} rejected upstream: HTTP ${response.status} ` +
          `error=${code || '(none)'} description=${description || '(none)'} ` +
          `client_id=${params.get('client_id') ?? '(none)'}`,
      );
      const Err = UPSTREAM_ERRORS[code];
      const message = description || `upstream returned HTTP ${response.status}`;
      throw Err ? new Err(message) : new ServerError(`${code || 'upstream_error'}: ${message}`);
    }
    return JSON.parse(text) as OAuthTokens;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code: authorizationCode,
    });
    if (client.client_secret) params.append('client_secret', client.client_secret);
    if (codeVerifier) params.append('code_verifier', codeVerifier);
    if (redirectUri) params.append('redirect_uri', redirectUri);
    if (resource) params.append('resource', resource.href);
    return this.postToken(params, 'exchange');
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: refreshToken,
    });
    if (client.client_secret) params.set('client_secret', client.client_secret);
    if (scopes?.length) params.set('scope', scopes.join(' '));
    if (resource) params.set('resource', resource.href);
    return this.postToken(params, 'refresh');
  }
}

export function createMcpOAuthRouter(): RequestHandler {
  const provider = new LoggingProxyOAuthServerProvider({
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
