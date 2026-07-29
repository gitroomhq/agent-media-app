// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type express from 'express';
import type { RequestHandler } from 'express';

interface MarketplaceRouteHandlers {
  publishMarketplaceSkillRoute: RequestHandler;
  listMarketplaceSkillsRoute: RequestHandler;
  installMarketplaceSkillRoute: RequestHandler;
  rollbackMarketplaceSkillRoute: RequestHandler;
}

interface MarketplaceRouteMiddleware {
  generateLimiter: RequestHandler;
  readLimiter: RequestHandler;
  authMiddleware: RequestHandler;
}

/**
 * Register tooling marketplace routes.
 *
 * Canonical publish endpoint is /v1/tooling/marketplace/skills/publish.
 * Legacy /v1/tooling/marketplace/publish is kept as a backward-compatible alias.
 */
export function registerToolingMarketplaceRoutes(
  app: express.Express,
  middleware: MarketplaceRouteMiddleware,
  handlers: MarketplaceRouteHandlers,
): void {
  const { generateLimiter, readLimiter, authMiddleware } = middleware;
  const {
    publishMarketplaceSkillRoute,
    listMarketplaceSkillsRoute,
    installMarketplaceSkillRoute,
    rollbackMarketplaceSkillRoute,
  } = handlers;

  app.post('/v1/tooling/marketplace/publish', generateLimiter, authMiddleware, publishMarketplaceSkillRoute);
  app.post('/v1/tooling/marketplace/skills/publish', generateLimiter, authMiddleware, publishMarketplaceSkillRoute);
  app.get('/v1/tooling/marketplace/skills', readLimiter, authMiddleware, listMarketplaceSkillsRoute);
  app.post('/v1/tooling/marketplace/install', generateLimiter, authMiddleware, installMarketplaceSkillRoute);
  app.post('/v1/tooling/marketplace/rollback', generateLimiter, authMiddleware, rollbackMarketplaceSkillRoute);
}
