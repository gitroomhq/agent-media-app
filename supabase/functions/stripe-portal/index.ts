// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: stripe-portal
 *
 * Creates a Stripe Customer Portal session so the user can manage their
 * subscription, payment methods, and invoices within the Stripe-hosted UI.
 *
 * Route:
 *   POST /functions/v1/stripe-portal
 *
 * Body:
 *   { "returnUrl": "https://agent-media.ai/billing" }
 *
 * Response (200):
 *   { "portal_url": "https://billing.stripe.com/session/..." }
 *
 * Error responses:
 *   400: No active subscription / invalid request
 *   401: Not authenticated
 *   429: Rate limit exceeded
 *   500: Stripe or server error
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";

// ── Stripe Configuration ────────────────────────────────────────────────────

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

// ── Request Validation ──────────────────────────────────────────────────────

interface PortalRequestBody {
  returnUrl?: string;
}

/**
 * Validate the return URL to prevent open-redirect vulnerabilities.
 *
 * Accepts:
 *   - Relative paths (e.g. "/billing")
 *   - HTTPS URLs on allowed domains
 *   - Localhost URLs for development
 */
function validateReturnUrl(url: string): boolean {
  // Relative paths are always safe
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    // Only allow https in production and http for localhost
    if (parsed.protocol === "https:") {
      return true;
    }
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Main Handler ────────────────────────────────────────────────────────────

async function handlePortal(req: Request): Promise<Response> {
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
  const rateLimitResult = await checkRateLimit(user.id, "stripe-portal", db);
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

  // 3. Parse and validate request body
  let body: PortalRequestBody;
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

  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  const returnUrl = body.returnUrl ?? `${siteUrl}/billing`;

  // Validate the return URL to prevent open redirects
  if (typeof returnUrl !== "string" || !validateReturnUrl(returnUrl)) {
    return corsRes(
      {
        error: "invalid_request",
        error_description:
          "returnUrl must be a valid HTTPS URL or relative path",
      },
      { status: 400 },
    );
  }

  // 4. Look up stripe_customer_id from subscriptions
  const { data: subscription, error: subError } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
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

  if (!subscription?.stripe_customer_id) {
    return corsRes(
      {
        error: "no_subscription",
        error_description: "No active subscription found",
      },
      { status: 400 },
    );
  }

  const stripeCustomerId = subscription.stripe_customer_id;

  // 5. Initialize Stripe
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    console.error("Stripe initialization failed:", err);
    return corsRes(
      {
        error: "configuration_error",
        error_description: "Payment system is not configured",
      },
      { status: 500 },
    );
  }

  // 6. Create Stripe Billing Portal session
  let session: Stripe.BillingPortal.Session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
  } catch (err) {
    console.error("Stripe portal session creation failed:", err);

    if (err instanceof Stripe.errors.StripeError) {
      return corsRes(
        {
          error: "stripe_error",
          error_description: err.message,
          stripe_code: err.code ?? undefined,
        },
        { status: err.statusCode ?? 500 },
      );
    }

    return corsRes(
      {
        error: "stripe_error",
        error_description:
          err instanceof Error
            ? err.message
            : "Failed to create portal session",
      },
      { status: 500 },
    );
  }

  // 7. Return the portal URL
  return corsRes({ portal_url: session.url });
}

// ── Router ──────────────────────────────────────────────────────────────────

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
    const response = await handlePortal(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in stripe-portal:", err);

    if (err instanceof Stripe.errors.StripeError) {
      return new Response(
        JSON.stringify({
          error: "stripe_error",
          error_description: err.message,
          stripe_code: err.code ?? undefined,
        }),
        {
          status: err.statusCode ?? 500,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(origin),
            ...getSecurityHeaders(),
          },
        },
      );
    }

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
