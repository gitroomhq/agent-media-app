// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Structured logger (pino) for api-v2. One JSON line per log
 * { level, time, service, msg, ... } to stdout (Railway captures + indexes).
 * The request-id middleware attaches `req.log = logger.child({ request_id })`
 * so per-request logs are correlated end-to-end. LOG_LEVEL env overrides.
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'api-v2' },
});
