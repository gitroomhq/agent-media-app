/**
 * Edge Function: cancel-subscription
 *
 * Cancels the user's Stripe subscription at period end.
 * The user keeps access until their current billing period expires.
 *
 * Route:
 *   POST /functions/v1/cancel-subscription
 *
 * Response (200):
 *   { "canceled": true, "cancel_at": "2026-05-02T..." }
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";

function getStripe(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  return new Stripe(secretKey, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

async function handleCancel(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // 1. Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      { error: "unauthorized", error_description: authError ?? "Authentication required" },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  // 2. Rate limit
  const rateLimitResult = await checkRateLimit(user.id, "cancel-subscription", db);
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        retry_after: Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000),
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

  // 3. Look up stripe_customer_id
  const { data: subscription, error: subError } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError || !subscription?.stripe_customer_id) {
    return corsRes(
      { error: "no_subscription", error_description: "No active subscription found" },
      { status: 400 },
    );
  }

  // 4. Find the active Stripe subscription
  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: subscription.stripe_customer_id,
    status: "active",
    limit: 1,
  });

  let stripeSub = subs.data[0];
  if (!stripeSub) {
    const trialSubs = await stripe.subscriptions.list({
      customer: subscription.stripe_customer_id,
      status: "trialing",
      limit: 1,
    });
    stripeSub = trialSubs.data[0];
  }

  if (!stripeSub) {
    return corsRes(
      { error: "no_subscription", error_description: "No active Stripe subscription found" },
      { status: 400 },
    );
  }

  // 5. Cancel at period end (user keeps access until end of billing cycle)
  const updated = await stripe.subscriptions.update(stripeSub.id, {
    cancel_at_period_end: true,
  });

  const periodEndIso = new Date((updated.current_period_end ?? 0) * 1000).toISOString();

  // 6. Update our DB — flag as cancel-pending, keep status "active"
  await db
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      current_period_end: periodEndIso,
    })
    .eq("user_id", user.id);

  return corsRes({
    canceled: true,
    cancel_at: periodEndIso,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...getCorsHeaders(origin), ...getSecurityHeaders() },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() },
      },
    );
  }

  try {
    const response = await handleCancel(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in cancel-subscription:", err);
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() },
      },
    );
  }
});
