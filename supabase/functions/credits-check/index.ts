// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Edge Function: credits-check
 *
 * Returns the authenticated user's billing state including plan details,
 * credit balances, and feature limits based on their subscription tier.
 *
 * Route:
 *   GET /functions/v1/credits-check -> authenticated billing state
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import { captureEdgeError, maybeThrowSentryTest } from "../_shared/sentry.ts";

// ── Plan Tier Definitions ────────────────────────────────────────────────────

/**
 * Tier ordering for plan comparisons.
 * Higher index = higher tier.
 */
const TIER_ORDER: string[] = [
  "free",
  "newby",   // deprecated — kept for legacy subscribers
  "payg",
  "starter",
  "creator",
  "pro_plus",
];

function tierRank(tier: string): number {
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : 0;
}

interface PlanConfig {
  name: string;
  monthly_credits: number;
  max_concurrent_jobs: number;
  max_video_duration: number; // seconds
}

const PLAN_CONFIGS: Record<string, PlanConfig> = {
  free:     { name: "Free",          monthly_credits: 0,     max_concurrent_jobs: 1,  max_video_duration: 5  },
  payg:     { name: "Pay As You Go", monthly_credits: 0,     max_concurrent_jobs: 2,  max_video_duration: 15 },
  newby:    { name: "Newby",         monthly_credits: 1300,  max_concurrent_jobs: 2,  max_video_duration: 10 },  // deprecated — legacy only
  starter:  { name: "Creator",       monthly_credits: 3900,  max_concurrent_jobs: 3,  max_video_duration: 10 },
  creator:  { name: "Pro",           monthly_credits: 6900,  max_concurrent_jobs: 5,  max_video_duration: 15 },
  pro_plus: { name: "Pro Plus",      monthly_credits: 12900, max_concurrent_jobs: 10, max_video_duration: 15 },
};

/** Returns the plan config for a given tier slug, falling back to free. */
function getPlanConfig(tier: string): PlanConfig {
  return PLAN_CONFIGS[tier] ?? PLAN_CONFIGS["free"];
}

// ── Handler ──────────────────────────────────────────────────────────────────

async function handleCreditsCheck(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";

  // Bind origin to corsResponse for origin-aware CORS
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // 1. Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      {
        error: "unauthorized",
        error_description: authError ?? "Authentication required",
      },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  // 2. Rate limit check
  const rateLimitResult = await checkRateLimit(user.id, "credits-check", db);
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        retry_after: Math.ceil(
          (rateLimitResult.resetAt.getTime() - Date.now()) / 1000,
        ),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...getRateLimitHeaders(rateLimitResult),
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // 3. Look up the user's subscription
  const { data: subscription, error: subError } = await db
    .from("subscriptions")
    .select(
      "plan_slug, status, current_period_end, trial_ends_at, cancel_at_period_end",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.error("Failed to fetch subscription:", subError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to fetch subscription data",
      },
      { status: 500 },
    );
  }

  // Determine effective plan details
  // If no subscription but user has purchased credits, they're PAYG
  let planSlug = subscription?.plan_slug ?? "free";
  const subscriptionStatus = subscription?.status ?? "active";
  const currentPeriodEnd = subscription?.current_period_end ?? null;
  const trialEndsAt = subscription?.trial_ends_at ?? null;

  // Determine if a trial is currently active
  const now = new Date();
  const trialActive =
    subscriptionStatus === "trialing" &&
    trialEndsAt !== null &&
    new Date(trialEndsAt) > now;

  // 4. Fetch credit balances via the RPC stored procedure
  let monthlyRemaining = 0;
  let purchasedBalance = 0;

  const { data: creditData, error: creditError } = await db.rpc(
    "get_credit_balance",
    { p_user_id: user.id },
  );

  if (creditError) {
    // If no credit record exists (new user), default to zero
    const isNotFound =
      creditError.message?.includes("USER_NOT_FOUND") ?? false;
    if (!isNotFound) {
      console.error("Failed to fetch credits:", creditError.message);
      return corsRes(
        {
          error: "server_error",
          error_description: "Failed to fetch credit balance",
        },
        { status: 500 },
      );
    }
    // For users with no credit record, balances stay at 0
  } else if (creditData) {
    monthlyRemaining = creditData.monthly_credits_remaining ?? 0;
    purchasedBalance = creditData.purchased_balance ?? 0;
  }

  // Upgrade "free" to "payg" if user has purchased credits but no subscription
  if (planSlug === "free" && purchasedBalance > 0) {
    planSlug = "payg";
  }

  const planConfig = getPlanConfig(planSlug);

  // 4b. Query available models for this plan tier from the DB
  const userRank = tierRank(planSlug);
  const { data: availableModels } = await db
    .from("models")
    .select("slug, min_plan_tier")
    .eq("is_active", true)
    .order("slug");

  const modelsAvailable = (availableModels ?? [])
    .filter((m: { min_plan_tier: string }) => tierRank(m.min_plan_tier) <= userRank)
    .map((m: { slug: string }) => m.slug);

  // ── Self-healing: allocate monthly credits if webhook missed ──────────
  // If user has an active paid subscription but 0 monthly credits,
  // check whether the billing cycle has actually renewed (period expired)
  // before restoring credits. Without this check, users who legitimately
  // used all their credits mid-cycle would get a free refill.
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end ?? false;
  if (
    planConfig.monthly_credits > 0 &&
    monthlyRemaining === 0 &&
    subscriptionStatus === "active" &&
    !cancelAtPeriodEnd
  ) {
    // Only self-heal if the billing period has actually rolled over
    const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;

    if (periodEnd !== null && periodEnd < now) {
      console.warn(
        `credits-check: self-healing monthly credits for user ${user.id} ` +
          `(plan=${planSlug}, expected=${planConfig.monthly_credits}, ` +
          `period_end=${currentPeriodEnd} < now)`,
      );

      // Calculate new period end (+30 days from now)
      const newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: healError } = await db
        .from("user_credits")
        .update({ monthly_credits_remaining: planConfig.monthly_credits })
        .eq("user_id", user.id);

      if (!healError) {
        monthlyRemaining = planConfig.monthly_credits;

        // Also advance current_period_end so we don't self-heal again next request
        await db
          .from("subscriptions")
          .update({ current_period_end: newPeriodEnd })
          .eq("user_id", user.id);

        // Record in ledger for audit trail
        await db.from("credit_transactions").insert({
          user_id: user.id,
          type: "monthly_reset",
          amount: planConfig.monthly_credits,
          bucket: "monthly",
          running_monthly_balance: planConfig.monthly_credits,
          running_purchased_balance: purchasedBalance,
          description: `Self-healed: monthly credit allocation for ${planSlug} plan (period expired)`,
        });
      } else {
        console.error("credits-check: self-heal failed:", healError.message);
      }
    } else {
      console.log(
        `credits-check: user ${user.id} has 0 monthly credits but period_end ` +
          `(${currentPeriodEnd}) is still in the future — not self-healing`,
      );
    }
  }

  // 5. Build the response
  const response = {
    user_id: user.id,
    plan: {
      tier: planSlug,
      name: planConfig.name,
      status: subscriptionStatus,
      cancel_at_period_end: cancelAtPeriodEnd,
      trial_active: trialActive,
      trial_ends_at: trialActive ? trialEndsAt : null,
      current_period_end: currentPeriodEnd,
    },
    credits: {
      monthly_remaining: monthlyRemaining,
      monthly_allowance: planConfig.monthly_credits,
      purchased: purchasedBalance,
      total: monthlyRemaining + purchasedBalance,
    },
    limits: {
      max_concurrent_jobs: planConfig.max_concurrent_jobs,
      max_video_duration: planConfig.max_video_duration,
      models_available: modelsAvailable,
    },
  };

  return corsRes(response);
}

// ── Router ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  // Handle CORS preflight with security headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(origin),
        ...getSecurityHeaders(),
      },
    });
  }

  // Only GET allowed
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({
        error: "method_not_allowed",
        error_description: "Only GET requests are accepted",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  try {
    // Secret-gated edge→Sentry smoke test (no-op unless ?sentrytest matches);
    // inside the try so the catch below captures it.
    maybeThrowSentryTest(req, "credits-check");
    const response = await handleCreditsCheck(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in credits-check:", err);
    await captureEdgeError(err, "credits-check");
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description:
          err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }
});
