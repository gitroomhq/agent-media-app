// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * API V2 — Schema-driven API server for agent-media.
 *
 * Deployed on Railway. Production is untouched.
 */

// MUST be first: initialises Sentry before any other module loads (no-op
// until SENTRY_DSN is set).
import './instrument.js';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { logger } from './logger.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { GENERATOR_IDS, GENERATORS } from '@agentmedia/schema';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { verifyToken } from './auth.js';
import { generateRoute } from './routes/generate.js';
import { actorsRoute } from './routes/actors.js';
import { statusRoute } from './routes/status.js';
import { characterStoryboardSuggestRoute } from './routes/character-storyboard.js';
import {
  characterSheetGenerateRoute,
  characterStoryboardGenerateRoute,
} from './routes/character-sheets.js';
import { postizListAccountsRoute } from './routes/postiz.js';
import {
  listSchedulesRoute,
  createScheduleRoute,
  updateScheduleRoute,
  deleteScheduleRoute,
  triggerScheduleRoute,
} from './routes/schedules.js';
import { schedulePreviewRoute } from './routes/schedule-preview.js';
import { internalGptImageRoute } from './routes/internal/gpt-image.js';
import { selfieRoute } from './routes/v2/selfie.js';
import { characterCreateRoute, listCharactersRoute } from './routes/v2/characters.js';
import { listMyCharactersRoute } from './routes/v1/characters.js';
import { subtitleRoute } from './routes/v2/subtitle.js';
import { jobStreamRoute } from './routes/v2/job-stream.js';
import { mcpRoute } from './routes/mcp.js';
import { startReconciler } from './orchestrator/reconciler.js';
import {
  toolingContractsRoute,
  createToolingRunRoute,
  toolingRunStatusRoute,
  toolingRunStreamRoute,
  publishMarketplaceSkillRoute,
  listMarketplaceSkillsRoute,
  installMarketplaceSkillRoute,
  rollbackMarketplaceSkillRoute,
} from './routes/v1/tooling.js';
import { registerToolingMarketplaceRoutes } from './routes/v1/tooling-marketplace-routes.js';
import {
  isPrimitivesRouteEnabled,
  portraitGpt2PrimitiveRoute,
  characterSheetGpt2PrimitiveRoute,
  getPrimitiveRunRoute,
} from './routes/v1/primitives.js';
import { listSkillsRoute, runSkillRoute, getSkillRunRoute, cancelSkillRunRoute, quoteSkillRoute } from './routes/v1/skills.js';
import { asyncHandler } from './lib/async-handler.js';
import { getMyGalleryRoute } from './routes/v1/me-gallery.js';
import { listApiKeysRoute, createApiKeyRoute, revokeApiKeyRoute } from './routes/v1/me-api-keys.js';
import { listSocialProvidersRoute, listSocialChannelsRoute, connectSocialRoute, deleteSocialChannelRoute, publishSocialRoute } from './routes/v1/social.js';
import { videoConcurrencyGate } from './concurrency.js';
import { agentRoute } from './routes/v1/agent.js';
import {
  createChatRoute,
  appendMessagesRoute,
  getChatRoute,
  listChatsRoute,
  patchChatRoute,
  deleteChatRoute,
  listProjectsRoute,
  createProjectRoute,
  patchProjectRoute,
  deleteProjectRoute,
} from './routes/v1/agent-chats.js';
import { createTaskRoute, getTaskRoute, listTasksRoute } from './routes/v1/agent-tasks.js';
import { createMcpOAuthRouter, isMcpOAuthConfigured, protectedResourceMetadataUrl } from './mcp-oauth.js';

const app = express();

// Railway terminates TLS and forwards on a single proxy hop. Without this,
// req.ip is the PROXY's address for every request, so express-rate-limit put
// the entire internet in ONE bucket (and logged an ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// validation error on every call). Trusting one hop makes req.ip the real
// client and per-IP limits meaningful again.
app.set('trust proxy', 1);

// CORS — required for the hosted MCP connector. claude.ai (web) calls /mcp from
// the browser, so without this a signed-in user still gets a CORS failure even
// with a valid token. Mcp-Session-Id / MCP-Protocol-Version must be exposed for
// the streamable-HTTP transport.
//
// Hand-rolled rather than pulling in `cors`: this is ~10 lines, and a new
// runtime dependency is a boot-failure risk in the prod image for no benefit.
// Safe to reflect any origin because we send no cookies (credentials are never
// used) and auth is an Authorization header the browser never attaches
// automatically — so a hostile page cannot ride a user's session.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, x-request-id, Idempotency-Key',
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate, x-request-id',
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Bumped from default 100kb to support base64 image uploads on
// /v1/skills/* routes (e.g. portrait_image_base64 for character sheets).
app.use(express.json({ limit: '12mb' }));

// OAuth 2.1 for the MCP connector — serves /.well-known/*, /authorize, /token
// and /register (dynamic client registration), proxied to Supabase's OAuth
// server. Mounted FIRST so its routes win over the /functions/v1/* catch-all.
// No-op when Supabase OAuth env is absent, so local/dev boots unchanged.
// OAuth limiters. Defined HERE, immediately above their use, rather than with the
// other limiters further down: the OAuth router mounts early (it must beat the
// /functions/v1/* catch-all), and a `const` declared later would be in the
// temporal dead zone at this point.
//
// IP-keyed on purpose — every one of these routes is pre-auth, so there is no
// userId to key on yet.
const oauthIpKey = (req: express.Request): string =>
  req.ip ? ipKeyGenerator(req.ip) : 'unknown';

/** Dynamic client registration: a real client registers once, then reuses its id. */
const oauthRegisterLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: oauthIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many client registrations. Slow down and retry.' } },
});

/** Token exchange + revoke: a few per connect, plus refreshes. */
const oauthTokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: oauthIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many token requests. Slow down and retry.' } },
});

/** Authorize is browser-driven; humans retry, so keep it roomier than /token. */
const oauthAuthorizeLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyGenerator: oauthIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authorization attempts. Slow down and retry.' } },
});

if (isMcpOAuthConfigured()) {
  // Log every OAuth-path request. This router mounts before the correlation-id
  // middleware, so without this the entire connector handshake is invisible in
  // production logs — which is exactly what made the first connector failure
  // impossible to diagnose from our side.
  app.use((req, _res, next) => {
    if (/^\/(authorize|token|register|revoke|\.well-known)/.test(req.path)) {
      logger.info({ service: 'api-v2', method: req.method, path: req.path }, 'oauth request');
    }
    next();
  });
  // Rate limit the OAuth surface BEFORE the router handles it.
  //
  // These routes mount here — far above the general `app.use(ipFloodLimiter)`
  // that guards the API route table — because they must win over the
  // /functions/v1/* catch-all. That ordering left /authorize, /token, /register
  // and /revoke with NO rate limiting at all: an attacker could hammer token
  // exchange or spray dynamic client registrations unthrottled.
  //
  // Keyed on IP because these are pre-auth by definition (there is no user yet;
  // establishing one is the whole point). Registration is the tightest: a
  // legitimate client registers once and then reuses its client_id, so a healthy
  // caller never approaches these ceilings.
  app.use(['/register'], oauthRegisterLimiter);
  app.use(['/token', '/revoke'], oauthTokenLimiter);
  app.use(['/authorize'], oauthAuthorizeLimiter);

  app.use(createMcpOAuthRouter());
  logger.info({ service: 'api-v2' }, 'MCP OAuth router mounted');
} else {
  logger.warn({ service: 'api-v2' }, 'MCP OAuth not configured — connector clients cannot authenticate');
}

// #42 correlation id. Reuse an inbound x-request-id (from web/clients) or mint
// one; echo it on the response and tag the Sentry scope so a user's report or
// error maps to the exact request across web → api-v2 → worker.
app.use((req, res, next) => {
  const inbound = req.header('x-request-id');
  const requestId = inbound && /^[\w-]{1,128}$/.test(inbound) ? inbound : randomUUID();
  (req as express.Request & { requestId?: string }).requestId = requestId;
  (req as express.Request & { log?: typeof logger }).log = logger.child({ request_id: requestId });
  res.setHeader('x-request-id', requestId);
  Sentry.getCurrentScope().setTag('request_id', requestId);
  next();
});

const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Rate limiting ────────────────────────────────────────────────────────────

function rateLimitKey(req: express.Request): string {
  const userId = (req as any).userId;
  if (typeof userId === 'string' && userId) return userId;
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
}

// IP-only key for the PRE-auth flood guard. `rateLimitKey` above returns
// req.userId when set, but that only happens AFTER authMiddleware, so it is used
// only by the POST-auth per-user limiters below. Pre-auth we have no user yet.
function ipKey(req: express.Request): string {
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
}

// PRE-auth flood guard (A3 / invariant 12). Mounted before the API route table
// (see `app.use(ipFloodLimiter)` below) so it runs on every request BEFORE
// authMiddleware. Keyed on IP, it is the ONLY thing that can bucket an
// unauthenticated flood or a failed-auth hammer — those requests never reach a
// per-user bucket because they carry no verified userId. The ceiling is a coarse
// per-IP DoS backstop, deliberately well above any single user's per-user
// ceiling so shared-NAT users are not collapsed into one bucket.
const ipFloodLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests from this network. Slow down and retry.' } },
});

// POST-auth per-user limiters. These preserve the historical per-minute ceilings
// (generate 10, read 60, mcp 240) but now key on req.userId, because they are
// invoked from authMiddleware/mcpAuthMiddleware AFTER the userId is set (see
// applyUserLimit). Before A3 these ran in slot 1 of each route ahead of
// authMiddleware, so rateLimitKey always saw userId === undefined and every
// bucket silently fell back to IP.
type RateTier = 'generate' | 'read' | 'mcp';

const perUserLimiters: Record<RateTier, express.RequestHandler> = {
  // 60, not 10. Concurrency is now enforced properly by videoConcurrencyGate
  // (MAX_CONCURRENT_VIDEOS, default 3), which limits renders in flight — the
  // thing that actually costs money. This tier is back to being a coarse abuse
  // guard, which is all a per-minute request counter can honestly be.
  generate: rateLimit({
    windowMs: 60_000,
    max: 60,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many generate requests. Max 60 per minute.' } },
  }),
  read: rateLimit({
    windowMs: 60_000,
    max: 60,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Max 60 per minute.' } },
  }),
  mcp: rateLimit({
    windowMs: 60_000,
    max: 240,
    keyGenerator: rateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many MCP requests. Slow down and retry.' } },
  }),
};

// Slot-1 route middleware: records which per-user ceiling applies, then defers
// the actual per-user check to applyUserLimit (which runs post-auth). Keeping a
// tag in slot 1 means the existing `app.<verb>(path, <tier>Limiter,
// authMiddleware, route)` registrations do NOT have to be reordered — the tier
// is recorded pre-auth and the per-user limit is enforced post-auth.
function tagTier(tier: RateTier): express.RequestHandler {
  return (req, _res, next) => {
    (req as express.Request & { rateTier?: RateTier }).rateTier = tier;
    next();
  };
}

// Invoked from authMiddleware/mcpAuthMiddleware once req.userId is set. Applies
// the per-user limiter for the tier the route tagged (defaulting to the read
// ceiling if an authed route ever reaches here without a tag).
function applyUserLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const tier = (req as express.Request & { rateTier?: RateTier }).rateTier ?? 'read';
  perUserLimiters[tier](req, res, next);
}

const generateLimiter = tagTier('generate');
const readLimiter = tagTier('read');

/**
 * Rate limit for the MCP connector.
 *
 * MCP is a chatty protocol: a single connect performs initialize + tools/list
 * and the client retries on transient failures, so the 10/min `generateLimiter`
 * that used to guard /mcp exhausted itself DURING the handshake — surfacing to
 * the user as "Authorization with the MCP server failed". Combined with
 * `trust proxy` being unset, that 10/min was shared by every caller globally.
 *
 * This is a per-connection flood guard, not a spend guard: the real protection
 * against expensive work is the credit preflight on the skill routes, which is
 * per-user and unaffected by this ceiling.
 */
const mcpLimiter = tagTier('mcp');

// ── Auth middleware ──────────────────────────────────────────────────────────

async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
    return;
  }

  const token = authHeader.slice(7);
  const result = await verifyToken(token);

  if (result.error || !result.userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: result.error ?? 'Invalid token' } });
    return;
  }

  (req as any).userId = result.userId;
  (req as any).authToken = token;
  // userId is now set — enforce the tagged per-user ceiling (A3). This replaces
  // the old bare next(): the per-user limiter must run AFTER auth so rateLimitKey
  // reads a real userId instead of falling back to IP.
  applyUserLimit(req, res, next);
}

/**
 * Auth for the MCP connector. Identical to authMiddleware EXCEPT that a 401
 * carries `WWW-Authenticate` pointing at our protected-resource metadata.
 *
 * That header is the entire handshake entry point: a connector client
 * (claude.ai web, ChatGPT, Cursor) reads it, fetches the metadata, discovers the
 * authorization server, registers itself, and runs the OAuth flow. Without it a
 * client sees a bare 401 and has nowhere to go — which is why the hosted
 * connector was unusable before this.
 *
 * `ma_` API keys still authenticate here unchanged, so the CLI and SDKs are
 * unaffected.
 */
async function mcpAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const challenge = isMcpOAuthConfigured()
    ? `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`
    : 'Bearer';

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res
      .status(401)
      .set('WWW-Authenticate', `${challenge}, error="invalid_token", error_description="Missing Authorization header"`)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
    return;
  }

  const token = authHeader.slice(7);
  const result = await verifyToken(token);

  if (result.error || !result.userId) {
    res
      .status(401)
      .set('WWW-Authenticate', `${challenge}, error="invalid_token", error_description="Invalid or expired token"`)
      .json({ error: { code: 'UNAUTHORIZED', message: result.error ?? 'Invalid token' } });
    return;
  }

  (req as any).userId = result.userId;
  (req as any).authToken = token;
  // userId is now set — enforce the tagged per-user ceiling (A3), same as
  // authMiddleware. MCP routes tag the 'mcp' tier (240/min per user).
  applyUserLimit(req, res, next);
}

// ── Health check ─────────────────────────────────────────────────────────────

// Internal service-to-service: the primitive worker proxies its gpt-image-2
// calls through api-v2's (healthy) egress. Self-authenticates via
// x-internal-secret; not behind the public authMiddleware. Defined early so it
// is never shadowed by the public route table.
app.post('/internal/gpt-image', internalGptImageRoute);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api-v2',
    generators: GENERATOR_IDS,
  });
});

// ── OpenAPI spec (generated from schema at runtime) ──────────────────────────

function buildOpenApiSpec() {
  const paths: Record<string, unknown> = {};
  for (const [id, gen] of Object.entries(GENERATORS).filter(([, gen]) => !(gen as { legacy?: boolean }).legacy)) {
    const jsonSchema = zodToJsonSchema(gen.inputSchema, { name: `${id}_input`, $refStrategy: 'none' });
    const schema = (jsonSchema as any).definitions?.[`${id}_input`] ?? jsonSchema;
    paths[`/v1/generate/${id}`] = {
      post: {
        operationId: id, summary: gen.description, tags: ['generate'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema } } },
        responses: {
          '201': { description: 'Job submitted', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobSubmitted' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '402': { description: 'Insufficient credits', content: { 'application/json': { schema: { $ref: '#/components/schemas/InsufficientCredits' } } } },
          '429': { description: 'Rate limited', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    };
  }
  paths['/v1/actors'] = {
    get: {
      operationId: 'listActors',
      summary: 'List actors, or look up a single actor by slug. Public endpoint.',
      tags: ['actors'],
      parameters: [
        { name: 'gender', in: 'query', schema: { type: 'string', enum: ['female', 'male'] }, description: 'Filter by gender' },
        { name: 'age_range', in: 'query', schema: { type: 'string', enum: ['18-25', '26-35', '36-50', '51+'] }, description: 'Filter by age range' },
        { name: 'actor_type', in: 'query', schema: { type: 'string', enum: ['Young Adult', 'Professional', 'Mom', 'Elder', 'Casual'] }, description: 'Filter by persona type' },
        { name: 'preset', in: 'query', schema: { type: 'string' }, description: 'Filter by preset tag (e.g. show_your_app)' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Case-insensitive substring search on name' },
        { name: 'slug', in: 'query', schema: { type: 'string' }, description: 'Exact slug lookup. Returns a single actor or 404 with suggestions.' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 500, minimum: 1, maximum: 500 }, description: 'Page size. Default 500 — large enough to return the full active library in one call.' },
        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 }, description: 'Page offset.' },
      ],
      responses: {
        '200': {
          description: 'Actor list (when slug is omitted) or single actor (when slug is given).',
          content: {
            'application/json': {
              schema: { oneOf: [{ $ref: '#/components/schemas/ActorList' }, { $ref: '#/components/schemas/ActorSingle' }] },
            },
          },
        },
        '404': { description: 'Actor not found (slug lookup only)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        '429': { description: 'Rate limited', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  };
  paths['/v1/videos/{jobId}'] = { get: { operationId: 'getVideoStatus', summary: 'Get video status', tags: ['videos'], security: [{ bearerAuth: [] }], parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Job status', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobStatus' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } } };
  paths['/v1/tooling/contracts'] = {
    get: {
      operationId: 'getToolContracts',
      summary: 'List Tooling-First V1 contracts',
      tags: ['tooling'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Tool contracts' },
      },
    },
  };
  paths['/v1/tooling/runs'] = {
    post: {
      operationId: 'createToolingRun',
      summary: 'Start a tooling runtime graph run',
      tags: ['tooling'],
      security: [{ bearerAuth: [] }],
      responses: {
        '202': { description: 'Run queued' },
      },
    },
  };
  paths['/v1/tooling/runs/{runId}'] = {
    get: {
      operationId: 'getToolingRun',
      summary: 'Get tooling run state',
      tags: ['tooling'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Run state' }, '404': { description: 'Not found' } },
    },
  };
  paths['/v1/tooling/runs/{runId}/stream'] = {
    get: {
      operationId: 'streamToolingRun',
      summary: 'SSE tooling run events with fallback',
      tags: ['tooling'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { '200': { description: 'Event stream' } },
    },
  };
  paths['/v1/tooling/marketplace/publish'] = {
    post: {
      operationId: 'publishToolingSkillLegacy',
      summary: 'Publish skill package (legacy alias; use /v1/tooling/marketplace/skills/publish)',
      tags: ['tooling-marketplace'],
      security: [{ bearerAuth: [] }],
      deprecated: true,
      responses: { '201': { description: 'Package submitted' } },
    },
  };
  paths['/v1/tooling/marketplace/skills/publish'] = {
    post: {
      operationId: 'publishToolingSkill',
      summary: 'Publish skill package (review-gated)',
      tags: ['tooling-marketplace'],
      security: [{ bearerAuth: [] }],
      responses: { '201': { description: 'Package submitted' } },
    },
  };
  paths['/v1/tooling/marketplace/skills'] = {
    get: {
      operationId: 'listToolingSkills',
      summary: 'List marketplace skill packages',
      tags: ['tooling-marketplace'],
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Skill packages' } },
    },
  };
  paths['/v1/tooling/marketplace/install'] = {
    post: {
      operationId: 'installToolingSkill',
      summary: 'Install approved skill package with version pin',
      tags: ['tooling-marketplace'],
      security: [{ bearerAuth: [] }],
      responses: { '201': { description: 'Installed' } },
    },
  };
  paths['/v1/tooling/marketplace/rollback'] = {
    post: {
      operationId: 'rollbackToolingSkill',
      summary: 'Rollback latest installed skill version',
      tags: ['tooling-marketplace'],
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Rollback applied' } },
    },
  };
  // vNext primitive + skill surface (feature-flagged on the deployed instance).
  paths['/v1/primitives/portrait_gpt2'] = {
    post: {
      operationId: 'runPortraitGpt2',
      summary: 'Submit one realistic portrait generation via the vNext primitive runtime',
      tags: ['vnext-primitives'],
      security: [{ bearerAuth: [] }],
      responses: {
        '202': { description: 'Workflow submitted' },
        '400': { description: 'Invalid input' },
        '401': { description: 'Unauthorized' },
        '502': { description: 'Temporal dispatch failed' },
        '503': { description: 'Temporal not configured' },
      },
    },
  };
  paths['/v1/primitives/character_sheet_gpt2'] = {
    post: {
      operationId: 'runCharacterSheetGpt2',
      summary: 'Submit a character-sheet generation from an R2-hosted portrait',
      tags: ['vnext-primitives'],
      security: [{ bearerAuth: [] }],
      responses: {
        '202': { description: 'Workflow submitted' },
        '400': { description: 'Invalid input' },
        '401': { description: 'Unauthorized' },
      },
    },
  };
  // A11: subtitles_v2 and simple_selfie were advertised here but have NO
  // registered route (only portrait_gpt2, character_sheet_gpt2 and
  // runs/:run_id are mounted under isPrimitivesRouteEnabled(); see the route
  // block below). Emitting them made /openapi.json (and /docs) hand out two
  // paths that 404, so they are not published. Re-add each entry here only
  // together with its app.post(...) mount.
  paths['/v1/primitives/runs/{run_id}'] = {
    get: {
      operationId: 'getPrimitiveRun',
      summary: 'Get vNext primitive run status + artifacts',
      tags: ['vnext-primitives'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'run_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Run details' },
        '404': { description: 'Not found' },
      },
    },
  };
  paths['/v1/skills'] = {
    get: {
      operationId: 'listVnextSkills',
      summary: 'List registered vNext micro-skills with their input schemas',
      tags: ['vnext-skills'],
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Skill list' } },
    },
  };
  paths['/v1/me/gallery'] = {
    get: {
      operationId: 'getMyGallery',
      summary: 'List the user\'s recent generations (legacy + vNext, merged)',
      tags: ['vnext-skills'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 40, maximum: 100 } },
      ],
      responses: { '200': { description: 'Recent generations' } },
    },
  };
  paths['/v1/characters'] = {
    get: {
      operationId: 'listMyCharacters',
      summary: 'List the user\'s saved, reusable characters (with image URLs)',
      tags: ['vnext-skills'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50, maximum: 100 } },
      ],
      responses: { '200': { description: 'Saved characters with character_sheet_url + thumbnails' } },
    },
  };
  paths['/v1/skills/runs/{skill_run_id}'] = {
    get: {
      operationId: 'getSkillRun',
      summary: 'Get composed-skill run status + per-step artifacts',
      tags: ['vnext-skills'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'skill_run_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Composed skill run' }, '404': { description: 'Not found' } },
    },
  };
  paths['/v1/skills/{slug}/run'] = {
    post: {
      operationId: 'runVnextSkill',
      summary: 'Run a vNext micro-skill (e.g. make_portrait, make_character_sheet)',
      tags: ['vnext-skills'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
      ],
      responses: {
        '202': { description: 'Workflow submitted' },
        '400': { description: 'Invalid input' },
        '404': { description: 'Unknown skill' },
      },
    },
  };
  return {
    openapi: '3.1.0',
    info: { title: 'agent-media API', version: '1.0.0', description: 'AI UGC video production API. Generate talking head videos, SaaS reviews, and styled subtitles.', contact: { url: 'https://agent-media.ai' }, license: { name: 'Apache-2.0' }, termsOfService: 'https://agent-media.ai/terms' },
    servers: [{ url: 'https://api.agent-media.ai', description: 'Production' }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key (ma_xxx) or Supabase JWT' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } }, required: ['code', 'message'] } }, required: ['error'] },
        InsufficientCredits: { type: 'object', properties: { error: { type: 'string' }, error_description: { type: 'string' }, credits_required: { type: 'integer' }, credits_available: { type: 'integer' } }, required: ['error', 'credits_required', 'credits_available'] },
        JobSubmitted: { type: 'object', properties: { job_id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['submitted'] }, estimated_duration: { type: 'integer' }, credits_deducted: { type: 'integer' }, selected_voice: { type: 'string' }, voice_auto_detected: { type: 'boolean' }, word_count: { type: 'integer' }, pacing_warning: { type: 'string', nullable: true } }, required: ['job_id', 'status'] },
        JobStatus: { type: 'object', properties: { job_id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['submitted', 'processing', 'completed', 'failed'] }, progress: { type: 'object' }, video_url: { type: 'string', format: 'uri', nullable: true }, error_message: { type: 'string', nullable: true }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' } }, required: ['job_id', 'status'] },
        Actor: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: 'string' },
            name: { type: 'string' },
            gender: { type: 'string', enum: ['female', 'male'] },
            age: { type: 'integer' },
            age_range: { type: 'string' },
            nationality: { type: 'string' },
            actor_type: { type: 'string' },
            style: { type: 'string', description: 'On-camera style descriptor.' },
            portrait_url: { type: 'string', format: 'uri' },
            green_screen_url: { type: 'string', format: 'uri', nullable: true },
            voice_id: { type: 'string', description: 'ElevenLabs voice id used by default for this actor.' },
            voice_gender: { type: 'string' },
            lip_sync_engine: { type: 'string' },
            preset: { type: 'string', nullable: true },
            presets: { type: 'array', items: { type: 'string' } },
            bio_occupation: { type: 'string' },
            bio_story: { type: 'string' },
            bio_hobbies: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'slug', 'name', 'portrait_url', 'gender'],
        },
        ActorList: {
          type: 'object',
          properties: {
            actors: { type: 'array', items: { $ref: '#/components/schemas/Actor' } },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
          required: ['actors', 'total', 'limit', 'offset'],
        },
        ActorSingle: {
          type: 'object',
          properties: { actor: { $ref: '#/components/schemas/Actor' } },
          required: ['actor'],
        },
      },
    },
  };
}

app.get('/openapi.json', (_req, res) => { res.json(buildOpenApiSpec()); });

// ── Interactive API docs (Scalar) ────────────────────────────────────────────

import { apiReference } from '@scalar/express-api-reference';

app.use('/docs', apiReference({
  spec: { url: '/openapi.json' },
  theme: 'default',
} as any));

// ── Pre-auth IP flood guard (A3 / invariant 12) ───────────────────────────────
// Mounted here so it runs for every API route registered BELOW. The health,
// /internal/gpt-image, /openapi.json and /docs handlers are registered ABOVE and
// stay unlimited, exactly as before. This is the pre-auth, IP-keyed layer: it is
// the only limiter that sees unauthenticated floods and failed-auth attempts,
// which never reach a per-user bucket. Per-user ceilings are enforced post-auth
// by applyUserLimit (invoked from authMiddleware/mcpAuthMiddleware).
app.use(ipFloodLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────

app.post('/v1/generate/:generatorId', generateLimiter, authMiddleware, videoConcurrencyGate, generateRoute);

// ── v2 routes (Selfie, Character) — isolated, additive ────────────────────
app.post('/v2/selfie',     generateLimiter, authMiddleware, videoConcurrencyGate, selfieRoute);
app.post('/v2/characters', generateLimiter, authMiddleware, videoConcurrencyGate, characterCreateRoute);
app.get('/v2/characters',  readLimiter,     authMiddleware, listCharactersRoute);
app.post('/v2/subtitle',   generateLimiter, authMiddleware, videoConcurrencyGate, subtitleRoute);
app.get('/v2/jobs/:jobId/stream', readLimiter, authMiddleware, jobStreamRoute);

// ── HTTP MCP server (Claude.ai integrations + remote MCP clients) ─────────
// Both POST (RPC) and GET (SSE) per the streamable HTTP transport spec.
app.post('/mcp', mcpLimiter, mcpAuthMiddleware, mcpRoute);
app.get('/mcp',  mcpLimiter,      mcpAuthMiddleware, mcpRoute);
app.delete('/mcp', mcpLimiter,    mcpAuthMiddleware, mcpRoute);
// Storyboard suggestions for the character_video wizard — text-only,
// no credits, rate-limited as a read since it's just a Claude call.
app.post('/v1/character/storyboard-suggest', readLimiter, authMiddleware, characterStoryboardSuggestRoute);
// Step 1: gpt-image-2 → multi-angle character sheet PNG (or actor portrait passthrough)
app.post('/v1/character/sheet-generate', generateLimiter, authMiddleware, characterSheetGenerateRoute);
// Step 2: gpt-image-2 with character sheet as reference → numbered storyboard PNG
app.post('/v1/character/storyboard-generate', generateLimiter, authMiddleware, characterStoryboardGenerateRoute);

// Postiz integration — list user's connected social accounts via their stored API key.
app.get('/v1/integrations/postiz/accounts', readLimiter, authMiddleware, postizListAccountsRoute);

// Schedules — recurring auto-publish jobs (powers /jobs dashboard + /integrations/postiz UI).
app.get('/v1/schedules',           readLimiter,     authMiddleware, listSchedulesRoute);
app.post('/v1/schedules',          generateLimiter, authMiddleware, createScheduleRoute);
app.patch('/v1/schedules/:id',     generateLimiter, authMiddleware, updateScheduleRoute);
app.delete('/v1/schedules/:id',    generateLimiter, authMiddleware, deleteScheduleRoute);
app.post('/v1/schedules/:id/trigger', generateLimiter, authMiddleware, triggerScheduleRoute);
app.post('/v1/schedules/preview-brief', readLimiter, authMiddleware, schedulePreviewRoute);
// Public — actor library is browseable without auth (matches /functions/v1/actors).
app.get('/v1/actors', readLimiter, actorsRoute);
app.get('/v1/videos/:jobId', readLimiter, authMiddleware, statusRoute);

// ── Tooling-first V1 routes (additive, back-compat safe) ──────────────────
app.get('/v1/tooling/contracts', readLimiter, authMiddleware, toolingContractsRoute);
app.post('/v1/tooling/runs', generateLimiter, authMiddleware, createToolingRunRoute);
app.get('/v1/tooling/runs/:runId', readLimiter, authMiddleware, toolingRunStatusRoute);
app.get('/v1/tooling/runs/:runId/stream', readLimiter, authMiddleware, toolingRunStreamRoute);
registerToolingMarketplaceRoutes(
  app,
  { generateLimiter, readLimiter, authMiddleware },
  {
    publishMarketplaceSkillRoute,
    listMarketplaceSkillsRoute,
    installMarketplaceSkillRoute,
    rollbackMarketplaceSkillRoute,
  },
);

// ── vNext primitive routes (feature-flagged off by default) ────────────────
// Enabled when VNEXT_PRIMITIVES_ENABLED=true. Dispatches to a fresh
// Temporal task queue (primitive-vnext-v1) served by primitive-worker-vnext.
if (isPrimitivesRouteEnabled()) {
  app.post(
    '/v1/primitives/portrait_gpt2',
    generateLimiter,
    authMiddleware,
    portraitGpt2PrimitiveRoute,
  );
  app.post(
    '/v1/primitives/character_sheet_gpt2',
    generateLimiter,
    authMiddleware,
    characterSheetGpt2PrimitiveRoute,
  );
  app.get(
    '/v1/primitives/runs/:run_id',
    readLimiter,
    authMiddleware,
    getPrimitiveRunRoute,
  );
  // Micro-skill surface (one slug per primitive for V1).
  app.get('/v1/skills', readLimiter, authMiddleware, listSkillsRoute);
  // Public alias — skill metadata is non-sensitive (mirror of the public
  // SKILL.md files at github.com/gitroomhq/agent-media). Used by the
  // unauthenticated marketing /skills landing page.
  app.get('/v1/public/skills', readLimiter, listSkillsRoute);
  app.post('/v1/skills/:slug/quote', readLimiter, authMiddleware, asyncHandler(quoteSkillRoute));
  app.post('/v1/skills/:slug/run', generateLimiter, authMiddleware, videoConcurrencyGate, asyncHandler(runSkillRoute));
  app.get('/v1/skills/runs/:skill_run_id', readLimiter, authMiddleware, asyncHandler(getSkillRunRoute));
  app.post('/v1/skills/runs/:skill_run_id/cancel', generateLimiter, authMiddleware, asyncHandler(cancelSkillRunRoute));
  app.get('/v1/me/gallery', readLimiter, authMiddleware, getMyGalleryRoute);
  app.get('/v1/characters', readLimiter, authMiddleware, listMyCharactersRoute);
  app.get('/v1/me/api-keys', readLimiter, authMiddleware, listApiKeysRoute);
  app.post('/v1/me/api-keys', generateLimiter, authMiddleware, createApiKeyRoute);
  app.delete('/v1/me/api-keys/:id', generateLimiter, authMiddleware, revokeApiKeyRoute);
  app.get('/v1/social/providers', readLimiter, authMiddleware, listSocialProvidersRoute);
  app.get('/v1/social/channels', readLimiter, authMiddleware, listSocialChannelsRoute);
  app.post('/v1/social/connect', generateLimiter, authMiddleware, connectSocialRoute);
  app.delete('/v1/social/channels/:channelId', generateLimiter, authMiddleware, deleteSocialChannelRoute);
  app.post('/v1/social/publish', generateLimiter, authMiddleware, publishSocialRoute);
  app.post('/v1/agent', generateLimiter, authMiddleware, agentRoute);
  // Agent chat persistence (Phase 1) — reopenable sessions. Client-driven,
  // additive: the brain + /v1/skills/run are untouched. See agent-chats.ts.
  //
  // These are CRUD on chat records — creating a chat, appending a message,
  // renaming one. They generate nothing and cost nothing, so they belong on the
  // read tier (60/min), not the generate tier (10/min).
  //
  // On generate they made the agent unusable: one conversational turn is a
  // brain call plus a message append plus sometimes a title patch, so three
  // turns hit the ceiling. A first-time user got RATE_LIMITED on their first
  // conversation. /v1/agent — the brain, which actually spends money — stays
  // on generate.
  app.get('/v1/agent/chats', readLimiter, authMiddleware, listChatsRoute);
  app.post('/v1/agent/chats', readLimiter, authMiddleware, createChatRoute);
  app.get('/v1/agent/chats/:id', readLimiter, authMiddleware, getChatRoute);
  app.patch('/v1/agent/chats/:id', readLimiter, authMiddleware, patchChatRoute);
  app.delete('/v1/agent/chats/:id', readLimiter, authMiddleware, deleteChatRoute);
  app.post('/v1/agent/chats/:id/messages', readLimiter, authMiddleware, appendMessagesRoute);
  // Projects (Phase 3) — rail groups + pinned context injected into the brain.
  // Same reasoning: record-keeping, not generation.
  app.get('/v1/agent/projects', readLimiter, authMiddleware, listProjectsRoute);
  app.post('/v1/agent/projects', readLimiter, authMiddleware, createProjectRoute);
  app.patch('/v1/agent/projects/:id', readLimiter, authMiddleware, patchProjectRoute);
  app.delete('/v1/agent/projects/:id', readLimiter, authMiddleware, deleteProjectRoute);
  // Durable-loop tasks (Phase 1 — data layer; dormant until the Phase 2 workflow).
  app.get('/v1/agent/tasks', readLimiter, authMiddleware, listTasksRoute);
  app.post('/v1/agent/tasks', generateLimiter, authMiddleware, createTaskRoute);
  app.get('/v1/agent/tasks/:id', readLimiter, authMiddleware, getTaskRoute);
  logger.info('vNext primitives + skill routes enabled');
}

// ── V1 compatibility routes (CLI sends to these paths) ───────────────────

app.post('/functions/v1/ugc-video', generateLimiter, authMiddleware, (req, res) => {
  req.params = { generatorId: 'ugc_video' };
  return generateRoute(req, res);
});

app.post('/functions/v1/subtitle-video', generateLimiter, authMiddleware, (req, res) => {
  req.params = { generatorId: 'subtitle' };
  return generateRoute(req, res);
});

// ── Edge function proxy for all other CLI endpoints ──────────────────────
// The CLI calls ~15 Supabase edge functions. We handle ugc-video and
// subtitle-video directly. Everything else gets proxied to Supabase
// so the CLI works fully when pointed at api-v2.

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

async function proxyToEdgeFunction(req: express.Request, res: express.Response): Promise<void> {
  const fnPath = req.params[0]; // captures everything after /functions/v1/
  const authHeader = req.headers.authorization ?? '';
  const method = req.method;
  const url = `${SUPABASE_FUNCTIONS_URL}/${fnPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

  try {
    const fetchOpts: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'apikey': process.env.SUPABASE_ANON_KEY || '',
      },
      signal: AbortSignal.timeout(60_000),
    };

    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(url, fetchOpts);
    const body = await upstream.text();

    // Forward status and body
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.send(body);
  } catch (err) {
    logger.error({ err, method, fn: fnPath }, 'edge function proxy failed');
    res.status(502).json({ error: { code: 'PROXY_ERROR', message: 'Upstream edge function unavailable' } });
  }
}

// Public passthrough — device-token endpoints are the CLI login flow,
// called BEFORE the user has any auth. authMiddleware would reject the
// anon-JWT request with "missing sub claim".
//   POST /functions/v1/device-token       — init (returns user_code, verification_url)
//   POST /functions/v1/device-token/poll  — poll for user approval
app.all(/^\/functions\/v1\/device-token(\/.*)?$/, readLimiter, (req, res) => {
  const fnPath = req.path.replace(/^\/functions\/v1\//, '');
  (req.params as Record<string, string>)[0] = fnPath;
  return proxyToEdgeFunction(req, res);
});

// Proxy all /functions/v1/* routes not already handled above
app.all('/functions/v1/*', readLimiter, authMiddleware, proxyToEdgeFunction);

// Secret-gated Sentry smoke-test route. 404s unless ?token matches
// SENTRY_TEST_TOKEN (so it's not abusable); when matched it throws, which the
// error handler below captures to Sentry. Reused by the Phase 4 synthetic
// monitor to prove the capture pipeline end-to-end.
app.get('/_debug/sentry', (req, res) => {
  const token = process.env.SENTRY_TEST_TOKEN;
  if (!token || req.query.token !== token) {
    res.status(404).end();
    return;
  }
  throw new Error(`SENTRY_API_V2_VERIFY ${String(req.query.m || '')}`);
});

// Sentry Express error handler — must be registered AFTER all routes so it
// sees their errors. Captures to Sentry, then falls through to our JSON
// handler below.
Sentry.setupExpressErrorHandler(app);

// #41 final JSON error handler. Runs after Sentry already captured the error.
// Returns a stable shape with the request_id and NEVER leaks the stack/internal
// message on a 500 (a non-500 status — e.g. a 4xx thrown with .status — keeps
// its own message). Express identifies this as an error handler by its arity.
app.use((err: Error & { status?: number; statusCode?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  const status = err.status ?? err.statusCode ?? 500;
  const requestId = (req as express.Request & { requestId?: string }).requestId;
  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL' : 'ERROR',
      message: status === 500 ? 'Internal server error' : err.message || 'Error',
      request_id: requestId,
    },
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info({ port: PORT, generators: GENERATOR_IDS }, 'api-v2 listening');
  // Tight in-process sweep for jobs stuck at status=submitted /
  // webhook_checkpoint=none. Reuses the existing recover_stuck_jobs RPC
  // (same one pg_cron uses) but at a sub-pg-cron cadence so a Temporal
  // handoff failure resolves within ~6 minutes instead of ~60.
  startReconciler({ supabase });
});
