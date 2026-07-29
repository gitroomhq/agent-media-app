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
 * Shared rate limiting utility for Edge Functions.
 *
 * Implements a sliding window algorithm using the `rate_limit_log` table.
 * Rate limits are tier-based: the user's subscription tier determines
 * their per-minute request quota via the `rate_limit_config` table.
 *
 * Usage:
 *   const result = await checkRateLimit(userId, 'generate', supabaseClient);
 *   if (!result.allowed) {
 *     return new Response(..., { status: 429, headers: getRateLimitHeaders(result) });
 *   }
 *   // proceed with request, include headers in success response too
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Number of requests remaining in the current window. */
  remaining: number;
  /** When the current window resets. */
  resetAt: Date;
  /** Maximum requests allowed per window for this tier. */
  limit: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Sliding window size in seconds. */
const WINDOW_SECONDS = 60;

/** Default rate limits per tier if rate_limit_config table is unavailable. */
const DEFAULT_TIER_LIMITS: Record<string, number> = {
  free: 10,
  starter: 30,
  creator: 60,
  pro_plus: 120,
};

/** Fallback limit when tier is unknown. */
const FALLBACK_LIMIT = 10;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check whether a request from the given user to the given endpoint
 * should be allowed under the current rate limit.
 *
 * Algorithm (sliding window, 1-minute granularity):
 *   1. Resolve the user's subscription tier from `user_subscriptions`
 *      joined with `subscription_plans`.
 *   2. Look up the rate limit for that tier from `rate_limit_config`
 *      (using wildcard `*` endpoint_pattern).
 *   3. Count requests in the current 1-minute window from `rate_limit_log`.
 *   4. If count >= limit: deny.
 *   5. Otherwise: insert a new log entry and allow.
 *
 * @param userId         - The authenticated user's ID.
 * @param endpoint       - The edge function name (e.g. 'generate').
 * @param supabaseClient - A Supabase client with service_role privileges.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  supabaseClient: {
    from: (table: string) => unknown;
    rpc: (fn: string, params?: Record<string, unknown>) => unknown;
    [key: string]: unknown;
  },
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_SECONDS * 1000);
  const resetAt = new Date(now.getTime() + WINDOW_SECONDS * 1000);

  // deno-lint-ignore no-explicit-any
  const db = supabaseClient as any;

  // ── Step 1: Resolve user's subscription tier ────────────────────────
  // Resolve from the real `subscriptions` table. A prior version queried a
  // `user_subscriptions` table that NEVER existed in prod — that query threw,
  // and because the catch wraps the whole block, the fallback below never ran,
  // so EVERY user (incl. paying ones) defaulted to the 'free' 10/min limit and
  // got "rate limit exceeded" on credit-heavy pages like billing. (2026-06-09)
  let tier = "free";
  try {
    const { data: sub } = await db
      .from("subscriptions")
      .select("plan_slug, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub?.plan_slug && (sub.status === "active" || sub.status === "trialing")) {
      tier = sub.plan_slug as string;
    }
  } catch {
    // On error, proceed with 'free' tier (most restrictive).
    console.error("rate-limit: failed to resolve user tier, defaulting to free");
  }

  // ── Step 2: Look up rate limit config for this tier ─────────────────
  let limit = DEFAULT_TIER_LIMITS[tier] ?? FALLBACK_LIMIT;
  try {
    const { data: configData } = await db
      .from("rate_limit_config")
      .select("requests_per_window")
      .eq("tier", tier)
      .eq("endpoint_pattern", "*")
      .maybeSingle();

    if (configData?.requests_per_window) {
      limit = configData.requests_per_window as number;
    } else {
      // Try endpoint-specific config
      const { data: endpointConfig } = await db
        .from("rate_limit_config")
        .select("requests_per_window")
        .eq("tier", tier)
        .eq("endpoint_pattern", endpoint)
        .maybeSingle();

      if (endpointConfig?.requests_per_window) {
        limit = endpointConfig.requests_per_window as number;
      }
    }
  } catch {
    // On error, use the default limits (already set)
    console.error("rate-limit: failed to read rate_limit_config, using defaults");
  }

  // ── Step 3: Count requests in the current window ────────────────────
  let count = 0;
  try {
    const { count: requestCount, error: countError } = await db
      .from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart.toISOString());

    if (countError) {
      // Fail CLOSED. Letting requests through when the rate-limit table
      // is unreachable means a Supabase blip = uncapped abuse. Block the
      // request and let the caller (typically a 503) tell the user to
      // retry. Paying tiers get a slightly different message via the
      // caller, but the policy is the same.
      console.error("rate-limit: count query failed — failing CLOSED:", countError.message);
      return { allowed: false, remaining: 0, resetAt, limit };
    }

    count = requestCount ?? 0;
  } catch (err) {
    console.error("rate-limit: unexpected error counting requests — failing CLOSED:", err instanceof Error ? err.message : String(err));
    return { allowed: false, remaining: 0, resetAt, limit };
  }

  // ── Step 4: Check if over limit ─────────────────────────────────────
  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit,
    };
  }

  // ── Step 5: Log the request and allow ───────────────────────────────
  // NOTE: `window_start` is NOT NULL in the table. Omitting it (the previous
  // bug) made EVERY insert throw, and combined with fail-closed-below that
  // turned every billing/account request into a 429 — paying users saw "rate
  // limit exceeded / no credits". Set window_start to the current request time.
  const { error: logError } = await db.from("rate_limit_log").insert({
    user_id: userId,
    endpoint,
    window_start: now.toISOString(),
    created_at: now.toISOString(),
  });
  if (logError) {
    // Fail OPEN: a logging hiccup must never block a paying customer. The
    // COUNT query above (the actual gate) still fails closed on table outage,
    // which is the real abuse-prevention case. Losing one increment is fine.
    console.error("rate-limit: failed to insert rate_limit_log entry — allowing (fail-open):", logError.message);
    return { allowed: true, remaining: Math.max(0, limit - count - 1), resetAt, limit };
  }

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt,
    limit,
  };
}

/**
 * Build standard rate limit response headers from a RateLimitResult.
 *
 * Returns headers conforming to the IETF RateLimit header fields draft:
 *   - X-RateLimit-Limit:     Maximum requests per window
 *   - X-RateLimit-Remaining: Requests remaining in current window
 *   - X-RateLimit-Reset:     Unix timestamp (seconds) when the window resets
 */
export function getRateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  };
}
