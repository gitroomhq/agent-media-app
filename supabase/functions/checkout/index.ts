/**
 * Edge Function: checkout
 *
 * Creates Stripe Checkout Sessions for subscription upgrades and
 * PAYG (pay-as-you-go) credit pack purchases.
 *
 * Route:
 *   POST /functions/v1/checkout -> create Stripe Checkout Session
 *
 * Body (subscription):
 *   { "plan_tier": "starter" }
 *
 * Body (PAYG):
 *   { "payg_pack_id": "pack_3900" }
 *
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 agent-media contributors
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";

// ── Env Validation ──────────────────────────────────────────────────────────

const REQUIRED_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_CREATOR",
  "STRIPE_PRICE_PRO_PLUS",
] as const;

function validateEnv(): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!Deno.env.get(key)) missing.push(key);
  }
  return missing;
}

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

// ── Plan Definitions ─────────────────────────────────────────────────────────

interface PlanDefinition {
  name: string;
  price_id: string;
}

/**
 * Plan tier -> Stripe price mapping.
 * Price IDs are loaded from environment variables so they can differ
 * between test and production Stripe accounts.
 */
function getPlanDefinitions(): Record<string, PlanDefinition> {
  return {
    starter: {
      name: "Creator",
      price_id: Deno.env.get("STRIPE_PRICE_STARTER") ?? "",
    },
    creator: {
      name: "Pro",
      price_id: Deno.env.get("STRIPE_PRICE_CREATOR") ?? "",
    },
    pro_plus: {
      name: "Pro Plus",
      price_id: Deno.env.get("STRIPE_PRICE_PRO_PLUS") ?? "",
    },
  };
}

// ── PAYG Credit Pack Definitions ─────────────────────────────────────────────

interface PaygPackDefinition {
  name: string;
  credits: number;
  price_id: string;
  /** Price in cents for display purposes. */
  amount_cents: number;
}

function getPaygPacks(): Record<string, PaygPackDefinition> {
  return {
    pack_3900: {
      name: "3,900 Credits",
      credits: 3900,
      price_id: Deno.env.get("STRIPE_PRICE_PAYG_3900") ?? "",
      amount_cents: 3900, // $39.00
    },
  };
}

// ── Request Validation ───────────────────────────────────────────────────────

interface CheckoutRequestBody {
  plan_tier?: string;
  payg_pack_id?: string;
  amount_cents?: number;
  dub_id?: string;
  embedded?: boolean;
  elements?: boolean;
}

const VALID_PLAN_TIERS = new Set(["starter", "creator", "pro_plus"]);
const VALID_PAYG_PACKS = new Set(["pack_3900"]);

/** Minimum PAYG purchase: $50. */
const MIN_PAYG_AMOUNT_CENTS = 5_000;
/** Maximum PAYG purchase per single transaction: $5,000. */
const MAX_PAYG_AMOUNT_CENTS = 500_000;
/** Credits per cent (= 100 credits per USD). */
const CREDITS_PER_CENT = 1;

type ValidationResult =
  | { type: "subscription"; plan_tier: string }
  | { type: "payg"; pack_id: string }
  | { type: "payg_dynamic"; amount_cents: number; credits: number }
  | { error: string };

function validateRequest(body: CheckoutRequestBody): ValidationResult {
  const hasPlan = body.plan_tier !== undefined && body.plan_tier !== null;
  const hasPack = body.payg_pack_id !== undefined && body.payg_pack_id !== null;
  const hasAmount = body.amount_cents !== undefined && body.amount_cents !== null;

  const specified = [hasPlan, hasPack, hasAmount].filter(Boolean).length;

  if (specified > 1) {
    return { error: "Provide exactly one of plan_tier, payg_pack_id, or amount_cents" };
  }

  if (specified === 0) {
    return { error: "Provide one of plan_tier, payg_pack_id, or amount_cents" };
  }

  if (hasPlan) {
    if (typeof body.plan_tier !== "string") {
      return { error: "plan_tier must be a string" };
    }
    if (!VALID_PLAN_TIERS.has(body.plan_tier)) {
      return {
        error: `Invalid plan_tier. Must be one of: ${[...VALID_PLAN_TIERS].join(", ")}`,
      };
    }
    return { type: "subscription", plan_tier: body.plan_tier };
  }

  if (hasPack) {
    if (typeof body.payg_pack_id !== "string") {
      return { error: "payg_pack_id must be a string" };
    }
    if (!VALID_PAYG_PACKS.has(body.payg_pack_id)) {
      return {
        error: `Invalid payg_pack_id. Must be one of: ${[...VALID_PAYG_PACKS].join(", ")}`,
      };
    }
    return { type: "payg", pack_id: body.payg_pack_id };
  }

  // hasAmount is true
  if (typeof body.amount_cents !== "number" || !Number.isInteger(body.amount_cents)) {
    return { error: "amount_cents must be an integer" };
  }
  if (body.amount_cents < MIN_PAYG_AMOUNT_CENTS) {
    return {
      error: `amount_cents must be at least ${MIN_PAYG_AMOUNT_CENTS} ($${MIN_PAYG_AMOUNT_CENTS / 100})`,
    };
  }
  if (body.amount_cents > MAX_PAYG_AMOUNT_CENTS) {
    return {
      error: `amount_cents must be at most ${MAX_PAYG_AMOUNT_CENTS} ($${MAX_PAYG_AMOUNT_CENTS / 100})`,
    };
  }
  return {
    type: "payg_dynamic",
    amount_cents: body.amount_cents,
    credits: body.amount_cents * CREDITS_PER_CENT,
  };
}

// ── Stripe Customer Management ───────────────────────────────────────────────

/**
 * Get or create a Stripe customer for the given user.
 * Links the Stripe customer ID back to the subscriptions table.
 */
async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userId: string,
  userEmail: string,
): Promise<string> {
  const db = supabaseAdmin();

  // Check if user already has a Stripe customer ID
  const { data: subscription } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email: userEmail,
    metadata: {
      supabase_user_id: userId,
    },
  });

  // Upsert a subscription record with the customer ID so we track it
  const { error: upsertError } = await db
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customer.id,
        plan_slug: "free",
        status: "active",
      },
      { onConflict: "user_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  // If upsert fails because user already has a row without a customer_id,
  // update the existing row instead
  if (upsertError) {
    await db
      .from("subscriptions")
      .update({ stripe_customer_id: customer.id })
      .eq("user_id", userId)
      .is("stripe_customer_id", null);
  }

  return customer.id;
}

// ── Subscription Checkout ────────────────────────────────────────────────────

async function createSubscriptionCheckout(
  stripe: Stripe,
  customerId: string,
  userId: string,
  planTier: string,
  origin: string,
  body?: CheckoutRequestBody,
): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  const plans = getPlanDefinitions();
  const plan = plans[planTier];

  if (!plan) {
    return corsRes(
      { error: "invalid_plan", error_description: `Unknown plan tier: ${planTier}` },
      { status: 400 },
    );
  }

  if (!plan.price_id) {
    return corsRes(
      {
        error: "configuration_error",
        error_description: `Stripe price not configured for plan: ${planTier}`,
      },
      { status: 500 },
    );
  }

  // Check if the customer already has ANY subscription (active, trialing,
  // incomplete, or past_due) to prevent double charges from rapid clicks
  // or webhook delays.
  try {
    for (const status of ["active", "trialing", "incomplete", "past_due"] as const) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status,
        limit: 1,
      });

      const sub = subs.data[0];
      if (sub) {
        if (status === "active" || status === "trialing") {
          return await handleSubscriptionUpdate(stripe, sub, plan, planTier, userId, corsRes);
        }
        // For incomplete/past_due, block new checkout — subscription already exists
        return corsRes(
          {
            error: "subscription_pending",
            error_description: "You already have a pending subscription. Please wait a moment and refresh the page.",
          },
          { status: 409 },
        );
      }
    }

    // Also check for recent open checkout sessions (prevents double-click)
    const recentSessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 5,
    });
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const pendingSession = recentSessions.data.find(
      (s) => s.status === "open" && s.created > tenMinutesAgo && s.mode === "subscription",
    );
    if (pendingSession) {
      // Return the existing session URL instead of creating a new one
      if (pendingSession.url) {
        return corsRes({ checkout_url: pendingSession.url, session_id: pendingSession.id });
      }
    }
  } catch (err) {
    console.error("Error checking existing subscriptions:", err);
    // Fall through to new checkout if subscription check fails
  }

  // No existing subscription — create a new checkout session
  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  const isEmbedded = body?.embedded === true;
  const isElements = body?.elements === true;

  // ── Elements mode: create subscription directly, return PaymentIntent secret ──
  if (isElements) {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.price_id }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      metadata: {
        user_id: userId,
        plan_tier: planTier,
      },
      expand: ["latest_invoice.payment_intent"],
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    if (!paymentIntent?.client_secret) {
      return corsRes(
        { error: "stripe_error", error_description: "No payment intent created" },
        { status: 500 },
      );
    }

    return corsRes({
      client_secret: paymentIntent.client_secret,
      subscription_id: subscription.id,
    });
  }

  // ── Checkout Session mode (embedded or hosted) ──
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: "subscription",
    currency: "usd",
    locale: "en",
    line_items: [
      {
        price: plan.price_id,
        quantity: 1,
      },
    ],
    metadata: {
      user_id: userId,
      plan_tier: planTier,
      checkout_type: "subscription",
      dubCustomerExternalId: userId,
    },
    subscription_data: {
      metadata: {
        user_id: userId,
        plan_tier: planTier,
      },
    },
  };

  if (isEmbedded) {
    sessionParams.ui_mode = "embedded";
    sessionParams.return_url = `${siteUrl}/billing?session_id={CHECKOUT_SESSION_ID}&status=success`;
  } else {
    sessionParams.success_url = `${siteUrl}/billing?session_id={CHECKOUT_SESSION_ID}&status=success`;
    sessionParams.cancel_url = `${siteUrl}/billing?status=canceled`;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (isEmbedded) {
    return corsRes({
      client_secret: session.client_secret,
      session_id: session.id,
    });
  }

  if (!session.url) {
    return corsRes(
      {
        error: "stripe_error",
        error_description: "Stripe did not return a checkout URL",
      },
      { status: 500 },
    );
  }

  return corsRes({
    checkout_url: session.url,
    session_id: session.id,
  });
}

/**
 * Update an existing subscription to a new plan (upgrade/downgrade).
 * Uses proration so the customer is charged/credited the difference immediately.
 */
async function handleSubscriptionUpdate(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  plan: PlanDefinition,
  planTier: string,
  userId: string,
  corsRes: (body: unknown, init?: ResponseInit) => Response,
): Promise<Response> {
  const currentItem = subscription.items.data[0];
  if (!currentItem) {
    return corsRes(
      { error: "stripe_error", error_description: "Existing subscription has no items" },
      { status: 500 },
    );
  }

  // If already on this price, check if it's a resubscription (undo cancellation)
  if (currentItem.price.id === plan.price_id) {
    if (subscription.cancel_at_period_end) {
      // Undo the cancellation — reactivate the subscription
      const reactivated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
      });

      const db = supabaseAdmin();
      await db
        .from("subscriptions")
        .update({ status: reactivated.status, cancel_at_period_end: false })
        .eq("user_id", userId);

      return corsRes({
        upgraded: true,
        plan_tier: planTier,
        status: reactivated.status,
        reactivated: true,
      });
    }

    return corsRes(
      { error: "already_subscribed", error_description: "You are already on this plan" },
      { status: 400 },
    );
  }

  try {
    const updated = await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: currentItem.id,
          price: plan.price_id,
        },
      ],
      proration_behavior: "always_invoice",
      metadata: {
        user_id: userId,
        plan_tier: planTier,
      },
    });

    // Update subscription record in our database
    const db = supabaseAdmin();
    await db
      .from("subscriptions")
      .update({
        plan_slug: planTier,
        stripe_customer_id: typeof updated.customer === "string" ? updated.customer : updated.customer?.id,
        stripe_subscription_id: updated.id,
        stripe_price_id: plan.price_id,
        status: updated.status,
        cancel_at_period_end: updated.cancel_at_period_end,
      })
      .eq("user_id", userId);

    // Allocate the new plan's monthly credits (upgrade = more credits)
    const PLAN_CREDITS: Record<string, number> = {
      starter: 3900,
      creator: 6900,
      pro_plus: 12900,
    };
    const newCredits = PLAN_CREDITS[planTier];
    if (newCredits) {
      // Set credits to the new plan's allowance (don't reduce if downgrading mid-cycle)
      const { data: currentCredits } = await db
        .from("user_credits")
        .select("id, monthly_credits_remaining")
        .eq("user_id", userId)
        .maybeSingle();

      const current = currentCredits?.monthly_credits_remaining ?? 0;
      if (!currentCredits) {
        await db
          .from("user_credits")
          .insert({
            user_id: userId,
            monthly_credits_remaining: newCredits,
            purchased_balance: 0,
          });
      } else if (newCredits > current) {
        await db
          .from("user_credits")
          .update({ monthly_credits_remaining: newCredits })
          .eq("user_id", userId);
      }
    }

    return corsRes({
      upgraded: true,
      plan_tier: planTier,
      status: updated.status,
    });
  } catch (err) {
    console.error("Stripe subscription update failed:", err);
    const message = err instanceof Error ? err.message : "Subscription update failed";
    return corsRes(
      { error: "stripe_error", error_description: message },
      { status: 500 },
    );
  }
}

// ── PAYG Checkout ────────────────────────────────────────────────────────────

async function createPaygCheckout(
  stripe: Stripe,
  customerId: string,
  userId: string,
  packId: string,
  origin: string,
): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  const packs = getPaygPacks();
  const pack = packs[packId];

  if (!pack) {
    return corsRes(
      { error: "invalid_pack", error_description: `Unknown PAYG pack: ${packId}` },
      { status: 400 },
    );
  }

  if (!pack.price_id) {
    return corsRes(
      {
        error: "configuration_error",
        error_description: `Stripe price not configured for pack: ${packId}`,
      },
      { status: 500 },
    );
  }

  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price: pack.price_id,
        quantity: 1,
      },
    ],
    success_url: `${siteUrl}/billing?session_id={CHECKOUT_SESSION_ID}&status=success&type=payg`,
    cancel_url: `${siteUrl}/billing?status=canceled`,
    metadata: {
      user_id: userId,
      pack_id: packId,
      credits: String(pack.credits),
      checkout_type: "payg",
      dubCustomerExternalId: userId,
    },
    payment_intent_data: {
      metadata: {
        user_id: userId,
        pack_id: packId,
        credits: String(pack.credits),
      },
    },
  });

  if (!session.url) {
    return corsRes(
      {
        error: "stripe_error",
        error_description: "Stripe did not return a checkout URL",
      },
      { status: 500 },
    );
  }

  return corsRes({
    checkout_url: session.url,
    session_id: session.id,
  });
}

// ── Dynamic PAYG Checkout (min $50, flexible amount) ────────────────────────

async function createDynamicPaygCheckout(
  stripe: Stripe,
  customerId: string,
  userId: string,
  amountCents: number,
  credits: number,
  origin: string,
): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${credits.toLocaleString("en-US")} agent-media credits`,
            description: "Pay-as-you-go credit top-up. Credits never expire.",
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${siteUrl}/billing?session_id={CHECKOUT_SESSION_ID}&status=success&type=payg`,
    cancel_url: `${siteUrl}/billing?status=canceled`,
    metadata: {
      user_id: userId,
      credits: String(credits),
      amount_cents: String(amountCents),
      checkout_type: "payg",
      dubCustomerExternalId: userId,
    },
    payment_intent_data: {
      // Save the card on the customer so Phase-3 auto top-up can charge
      // off-session without re-prompting the user.
      setup_future_usage: "off_session",
      metadata: {
        user_id: userId,
        credits: String(credits),
        amount_cents: String(amountCents),
      },
    },
  });

  if (!session.url) {
    return corsRes(
      {
        error: "stripe_error",
        error_description: "Stripe did not return a checkout URL",
      },
      { status: 500 },
    );
  }

  return corsRes({
    checkout_url: session.url,
    session_id: session.id,
    credits,
    amount_cents: amountCents,
  });
}

// ── Main Handler ─────────────────────────────────────────────────────────────

async function handleCheckout(req: Request): Promise<Response> {
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

  // 1b. Rate limit check
  const db = supabaseAdmin();
  const rateLimitResult = await checkRateLimit(user.id, "checkout", db);
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

  // 2. Parse and validate request body
  let body: CheckoutRequestBody;
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

  const validation = validateRequest(body);
  if ("error" in validation) {
    return corsRes(
      { error: "invalid_request", error_description: validation.error },
      { status: 400 },
    );
  }

  // 3. Initialize Stripe
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

  // 4. Get or create Stripe customer
  const userEmail = user.email ?? "";
  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer(stripe, user.id, userEmail);
  } catch (err) {
    console.error("Failed to get/create Stripe customer:", err);
    return corsRes(
      {
        error: "stripe_error",
        error_description: "Failed to initialize customer record",
      },
      { status: 500 },
    );
  }

  // 5. Attach dub.co affiliate click ID to Stripe customer (if present)
  if (body.dub_id) {
    try {
      await stripe.customers.update(customerId, {
        metadata: {
          dubCustomerExternalId: user.id,
          dubClickId: body.dub_id,
        },
      });
    } catch (err) {
      console.error("Failed to attach dub metadata to Stripe customer:", err);
      // Non-fatal — continue with checkout
    }
  }

  // 6. Create the appropriate Checkout Session
  if (validation.type === "subscription") {
    return await createSubscriptionCheckout(
      stripe,
      customerId,
      user.id,
      validation.plan_tier,
      origin,
      body,
    );
  }

  if (validation.type === "payg_dynamic") {
    return await createDynamicPaygCheckout(
      stripe,
      customerId,
      user.id,
      validation.amount_cents,
      validation.credits,
      origin,
    );
  }

  return await createPaygCheckout(
    stripe,
    customerId,
    user.id,
    validation.pack_id,
    origin,
  );
}

// ── Router ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  // Validate required env vars at request time
  const missingEnv = validateEnv();
  if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    return new Response(
      JSON.stringify({
        error: "configuration_error",
        error_description: "Payment system is not configured",
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
    const response = await handleCheckout(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in checkout:", err);

    // Distinguish Stripe API errors from other errors
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
