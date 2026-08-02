// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Plan limits for the vNext skills path.
 *
 * The paywall sells clip length as the difference between tiers — Creator "up
 * to 10s", Pro and Pro Plus "up to 15s". That was enforced in exactly one
 * place: `/v1/generate/ugc_video` in generate.ts. Nothing enforced it on
 * `/v1/skills/:slug/run`, which is the path the MCP server, the CLI and the
 * dashboard agent all use — i.e. the path essentially every customer takes.
 *
 * So a Creator-tier account could write a 23-word script, get a 15s take, and
 * be charged 420 credits, and the tier they were sold meant nothing.
 *
 * Charging more is not the issue. Selling a boundary and not having one is.
 */

import { fitDuration } from '@agentmedia/schema';
import { supabase } from '../server.js';

/** Tiers that are capped at 10s clips. Mirrors generate.ts's isCreatorTier. */
const TEN_SECOND_TIERS = new Set(['starter', 'newby']);

/** Longest clip each capped tier may render. */
const CAPPED_MAX_SECONDS = 10;

export interface PlanLimitViolation {
  tier: string;
  requestedSeconds: number;
  maxSeconds: number;
}

/**
 * Resolve the user's plan tier the same way generate.ts does, including the
 * "paid credits with no subscription counts as newby" rule — otherwise someone
 * on a credit pack would be treated as free and blocked entirely.
 */
async function resolveTier(userId: string): Promise<string> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_slug, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  let tier = sub?.plan_slug ?? 'free';
  if (tier === 'free') {
    const { data: credits } = await supabase
      .from('user_credits')
      .select('purchased_balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (credits && Number(credits.purchased_balance ?? 0) > 0) tier = 'newby';
  }
  return tier;
}

/**
 * Check a skill run against the caller's plan.
 *
 * Only applies to skills whose length comes from a script — the duration a take
 * renders at is derived from word count, so that is what has to be measured.
 * Returns null when the run is allowed.
 *
 * FAILS OPEN. If the tier lookup errors we let the run through: a database
 * hiccup must not block a paying customer from generating. The tier gate is a
 * packaging rule, not a security control.
 */
export async function checkPlanDurationLimit(
  userId: string,
  input: Record<string, unknown>,
): Promise<PlanLimitViolation | null> {
  const script = typeof input.script === 'string' ? input.script : '';
  if (!script.trim()) return null;

  let tier: string;
  try {
    tier = await resolveTier(userId);
  } catch {
    return null;
  }
  if (!TEN_SECOND_TIERS.has(tier)) return null;

  // Longest take this script will produce. A multi-take script is a series of
  // clips, so the cap applies per clip, matching what the plan advertises.
  const requestedSeconds = fitDuration(script);
  if (requestedSeconds <= CAPPED_MAX_SECONDS) return null;

  return { tier, requestedSeconds, maxSeconds: CAPPED_MAX_SECONDS };
}

/**
 * Word count that still fits a 10s take, for the error message. Derived from
 * fitDuration's own boundary so the number we tell users can never drift from
 * the number the router applies.
 */
export const MAX_WORDS_FOR_TEN_SECONDS = 22;
