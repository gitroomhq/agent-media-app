// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { RequestHandler, Request, Response, NextFunction } from 'express';

/**
 * Wrap an async route handler so a rejected promise is forwarded to Express's
 * error-handling middleware (the final handler in server.ts) instead of hanging
 * the request.
 *
 * Express 4 only auto-catches errors thrown SYNCHRONOUSLY by a handler; an async
 * handler that rejects leaves the request open until the socket times out (and,
 * under Node's default unhandledRejection behavior, can crash the process). This
 * is the prerequisite for any route that throws a typed pre-spend error (e.g.
 * make_ugc Route 0 / captions coherence): the throw becomes a clean JSON
 * response carrying the error's `.status`.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
