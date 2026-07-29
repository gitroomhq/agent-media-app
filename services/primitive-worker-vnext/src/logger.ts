// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Structured logger (pino) for the worker. Emits one JSON shape per line
 * { level, time, service, msg, ... } to stdout, which Railway captures and
 * keeps searchable. Use `logger.child({ run_id, skill })` for per-run
 * correlation. LOG_LEVEL env overrides the default.
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'primitive-worker-vnext' },
});
