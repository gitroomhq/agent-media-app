// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { registerToolingMarketplaceRoutes } from '../routes/v1/tooling-marketplace-routes.js';

const NOOP = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void>; publishSpy: ReturnType<typeof vi.fn> }> {
  const app = express();
  app.use(express.json());

  const publishSpy = vi.fn((req: express.Request, res: express.Response) => {
    res.status(201).json({
      route: req.path,
      package_id: 'pkg-route-test',
      review_state: 'pending',
      approved_creator: false,
    });
  });

  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
      return;
    }
    (req as any).userId = 'user-test';
    next();
  };

  registerToolingMarketplaceRoutes(
    app,
    { generateLimiter: NOOP, readLimiter: NOOP, authMiddleware },
    {
      publishMarketplaceSkillRoute: publishSpy,
      listMarketplaceSkillsRoute: (_req, res) => res.status(200).json({ packages: [] }),
      installMarketplaceSkillRoute: (_req, res) => res.status(201).json({ status: 'installed' }),
      rollbackMarketplaceSkillRoute: (_req, res) => res.status(200).json({ status: 'rolled_back' }),
    },
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    publishSpy,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('tooling marketplace publish route aliases', () => {
  it('requires auth for both publish endpoints', async () => {
    const { baseUrl, close } = await startTestServer();
    try {
      const [legacy, canonical] = await Promise.all([
        fetch(`${baseUrl}/v1/tooling/marketplace/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        fetch(`${baseUrl}/v1/tooling/marketplace/skills/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      ]);
      expect(legacy.status).toBe(401);
      expect(canonical.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('routes both publish endpoints to the same handler', async () => {
    const { baseUrl, close, publishSpy } = await startTestServer();
    try {
      const body = {
        name: 'marketplace-route-test',
        version: '1.0.0',
        skill_json: {
          name: 'marketplace-route-test',
          version: '1.0.0',
          entrypoint: 'index.js',
          tools: ['tool.alpha'],
        },
      };
      const [legacy, canonical] = await Promise.all([
        fetch(`${baseUrl}/v1/tooling/marketplace/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
          body: JSON.stringify(body),
        }),
        fetch(`${baseUrl}/v1/tooling/marketplace/skills/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
          body: JSON.stringify(body),
        }),
      ]);

      expect(legacy.status).toBe(201);
      expect(canonical.status).toBe(201);
      expect(publishSpy).toHaveBeenCalledTimes(2);
      expect(publishSpy.mock.calls[0]?.[0].path).toBe('/v1/tooling/marketplace/publish');
      expect(publishSpy.mock.calls[1]?.[0].path).toBe('/v1/tooling/marketplace/skills/publish');
    } finally {
      await close();
    }
  });
});
