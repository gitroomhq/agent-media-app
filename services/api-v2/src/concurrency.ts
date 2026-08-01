// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { NextFunction, Request, Response } from 'express';
import { supabase } from './server.js';
import { logger } from './logger.js';

/**
 * How many videos one account may have rendering at once.
 *
 * This is the limit that actually matters, and until now it did not exist. The
 * only control was a 10-requests-per-minute rate limiter, which counts ACTIONS
 * — so a user who submitted three renders and then clicked around was blocked,
 * while a user who submitted ten renders in ten minutes was not. It measured
 * the wrong thing in both directions.
 *
 * Renders are what cost money and occupy workers, so the cap is on renders in
 * flight. Everything else is free to be as chatty as the UI needs.
 */
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_VIDEOS ?? 3);

/** Rows older than this are treated as dead, not in flight. */
const STALE_AFTER_MS = 60 * 60_000;

async function inFlightCount(userId: string): Promise<number> {
  const sinceIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const [sk, pr] = await Promise.all([
    supabase
      .from('skill_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['submitted', 'running'])
      .gte('created_at', sinceIso),
    // Standalone primitives only — one owned by a skill_run is already counted
    // by that run, and double-counting would halve the effective limit.
    supabase
      .from('primitive_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['submitted', 'running'])
      .is('skill_run_id', null)
      .gte('created_at', sinceIso),
  ]);
  return (sk.count ?? 0) + (pr.count ?? 0);
}

/**
 * Rejects a new render when the account already has MAX_CONCURRENT in flight.
 *
 * Fails OPEN: if the count query errors we let the request through. A database
 * hiccup must not stop paying customers generating; the credit ledger is the
 * backstop that actually protects us from runaway spend.
 */
export async function videoConcurrencyGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId || MAX_CONCURRENT <= 0) {
    next();
    return;
  }

  let active: number;
  try {
    active = await inFlightCount(userId);
  } catch (err) {
    logger.warn({ err, userId }, 'concurrency gate: count failed, allowing');
    next();
    return;
  }

  if (active >= MAX_CONCURRENT) {
    res.status(429).json({
      error: {
        code: 'TOO_MANY_ACTIVE_VIDEOS',
        message: `You already have ${active} videos generating. Wait for one to finish, then try again. (Limit ${MAX_CONCURRENT}.)`,
        active,
        limit: MAX_CONCURRENT,
      },
    });
    return;
  }

  next();
}
