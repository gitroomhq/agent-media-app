// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: invite-redeem
 *
 * Redeems a beta invite code for the authenticated user, creating or
 * updating their subscription to the code's plan tier and allocating
 * the corresponding monthly credits.
 *
 * Route:
 *   POST /functions/v1/invite-redeem { code: string }
 *
 * Response:
 *   { success: true, plan: 'starter', credits: 2000 }
 */

import { corsResponse, corsPreflightResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Plan credit allocations ─────────────────────────────────────────────────

const PLAN_CREDITS: Record<string, number> = {
  starter: 3900,
  creator: 6900,
  pro_plus: 12900,
};

// ── Handler ─────────────────────────────────────────────────────────────────

async function handleInviteRedeem(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
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

  // 2. Parse and validate request body
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "Invite code is required",
      },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // 3. Look up the invite code
  const { data: invite, error: lookupError } = await db
    .from("invite_codes")
    .select("id, code, plan_slug, max_uses, used_count, expires_at, is_active")
    .eq("code", code)
    .maybeSingle();

  if (lookupError) {
    console.error("invite-redeem: lookup error:", lookupError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to look up invite code",
      },
      { status: 500 },
    );
  }

  if (!invite) {
    return corsRes(
      {
        error: "invalid_code",
        error_description: "Invite code not found",
      },
      { status: 404 },
    );
  }

  // 4. Validate the invite code
  if (!invite.is_active) {
    return corsRes(
      {
        error: "invalid_code",
        error_description: "This invite code has been deactivated",
      },
      { status: 400 },
    );
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return corsRes(
      {
        error: "invalid_code",
        error_description: "This invite code has expired",
      },
      { status: 400 },
    );
  }

  if (invite.used_count >= invite.max_uses) {
    return corsRes(
      {
        error: "invalid_code",
        error_description: "This invite code has reached its maximum number of uses",
      },
      { status: 400 },
    );
  }

  // 5. Create or update subscription for the user
  // Use conditional insert/update to preserve Stripe fields on existing rows
  const planSlug = invite.plan_slug;
  const credits = PLAN_CREDITS[planSlug] ?? 2000;
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: existingSub } = await db
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  let subError;
  if (existingSub) {
    // Update only plan fields — preserve stripe_customer_id, stripe_subscription_id, etc.
    ({ error: subError } = await db
      .from("subscriptions")
      .update({
        plan_slug: planSlug,
        status: "active",
        current_period_end: periodEnd,
      })
      .eq("user_id", user.id));
  } else {
    ({ error: subError } = await db
      .from("subscriptions")
      .insert({
        user_id: user.id,
        plan_slug: planSlug,
        status: "active",
        current_period_end: periodEnd,
      }));
  }

  if (subError) {
    console.error("invite-redeem: subscription error:", subError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to activate subscription",
      },
      { status: 500 },
    );
  }

  // 6. Allocate monthly credits
  // Use conditional insert/update to preserve purchased_balance on existing rows
  const { data: existingCredits } = await db
    .from("user_credits")
    .select("purchased_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  let creditError;
  if (existingCredits) {
    // Only update monthly credits — leave purchased_balance untouched
    ({ error: creditError } = await db
      .from("user_credits")
      .update({ monthly_credits_remaining: credits })
      .eq("user_id", user.id));
  } else {
    // Fresh user — no purchased balance to preserve
    ({ error: creditError } = await db
      .from("user_credits")
      .insert({
        user_id: user.id,
        monthly_credits_remaining: credits,
        purchased_balance: 0,
      }));
  }

  if (creditError) {
    console.error(
      "invite-redeem: credit allocation error:",
      creditError.message,
    );
    // Non-fatal: subscription was already created, credits can be healed
    // by the self-healing mechanism in credits-check
  }

  // 7. Record credit transaction for audit trail
  await db.from("credit_transactions").insert({
    user_id: user.id,
    type: "monthly_reset",
    amount: credits,
    bucket: "monthly",
    running_monthly_balance: credits,
    running_purchased_balance: existingCredits?.purchased_balance ?? 0,
    description: `Beta invite code ${code} redeemed: ${planSlug} plan activated`,
  });

  // 8. Increment used_count on the invite code
  const { error: updateError } = await db
    .from("invite_codes")
    .update({ used_count: invite.used_count + 1 })
    .eq("id", invite.id);

  if (updateError) {
    console.error(
      "invite-redeem: failed to increment used_count:",
      updateError.message,
    );
    // Non-fatal: the code was already redeemed successfully
  }

  return corsRes({
    success: true,
    plan: planSlug,
    credits,
  });
}

// ── Router ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(origin),
        ...getSecurityHeaders(),
      },
    });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "method_not_allowed",
        error_description: "Only POST requests are accepted",
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
    const response = await handleInviteRedeem(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in invite-redeem:", err);
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
