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
 * Edge Function: webhook-stripe
 *
 * Receives and processes ALL Stripe webhook events for the agent-media
 * billing system.  Every event is verified via HMAC-SHA256 signature,
 * de-duplicated through the stripe_webhook_events table, and dispatched
 * to the appropriate handler.
 *
 * Handled event types:
 *   - invoice.paid              (monthly reset / first subscription)
 *   - customer.subscription.updated  (plan changes, trial end)
 *   - customer.subscription.deleted  (cancellation)
 *   - payment_intent.succeeded  (PAYG credit purchases)
 *   - checkout.session.completed (post-checkout linkage)
 *
 * Reference: architecture doc Sections 2, 6, 12; sprint-plan Sprint 3.
 */

import { supabaseAdmin } from "../_shared/supabase.ts";
import { getSecurityHeaders } from "../_shared/security-headers.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { notifyTelegram } from "../_shared/telegram.ts";
import { PLANS, PAYG_PACKS, planByPriceId } from "./plans.ts";
import type { PlanDefinition } from "./plans.ts";

// ─── Env Validation ─────────────────────────────────────────────────────────

const REQUIRED_ENV_VARS = [
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
] as const;

function validateEnv(): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!Deno.env.get(key)) missing.push(key);
  }
  return missing;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape of a parsed Stripe event (we verify manually). */
interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
}

// ─── Signature Verification ─────────────────────────────────────────────────

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Verify the Stripe webhook signature using `crypto.subtle` (Deno-native).
 *
 * Stripe signs payloads with HMAC-SHA256.  The `Stripe-Signature` header
 * contains a timestamp (`t=...`) and one or more signatures (`v1=...`).
 * We recompute the expected signature over `${timestamp}.${rawBody}` and
 * compare using constant-time equality.
 *
 * @returns The parsed event on success.
 * @throws  Error with a human-readable message on failure.
 */
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<StripeEvent> {
  // 1. Parse the signature header
  const elements = signatureHeader.split(",");
  const pairs: Record<string, string[]> = {};
  for (const element of elements) {
    const [key, value] = element.split("=", 2);
    if (key && value) {
      (pairs[key] ??= []).push(value);
    }
  }

  const timestamp = pairs["t"]?.[0];
  const signatures = pairs["v1"] ?? [];

  if (!timestamp) {
    throw new Error("Missing timestamp in Stripe-Signature header");
  }

  if (signatures.length === 0) {
    throw new Error("Missing v1 signature in Stripe-Signature header");
  }

  // 2. Reject stale timestamps to mitigate replay attacks
  const eventAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (isNaN(eventAge) || Math.abs(eventAge) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new Error(
      `Webhook timestamp outside tolerance (age: ${eventAge}s, max: ${TIMESTAMP_TOLERANCE_SECONDS}s)`,
    );
  }

  // 3. Compute expected signature: HMAC-SHA256(secret, "${timestamp}.${body}")
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload),
  );

  // Convert to hex string
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 4. Constant-time comparison against all provided v1 signatures
  let verified = false;
  for (const sig of signatures) {
    if (timingSafeEqual(expectedSignature, sig)) {
      verified = true;
      break;
    }
  }

  if (!verified) {
    throw new Error("Stripe webhook signature verification failed");
  }

  // 5. Parse and return the event
  const event: StripeEvent = JSON.parse(rawBody);
  return event;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Idempotency ────────────────────────────────────────────────────────────

/**
 * Check if a Stripe event has already been processed.
 *
 * If it has been processed (processed_at is NOT null), we skip.
 * If it exists but processed_at IS null, a previous attempt started
 * but did not complete -- we allow re-processing.
 *
 * @returns `true` if the event should be SKIPPED (already processed).
 */
async function isEventAlreadyProcessed(
  db: ReturnType<typeof supabaseAdmin>,
  stripeEventId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("stripe_webhook_events")
    .select("stripe_event_id, processed_at")
    .eq("stripe_event_id", stripeEventId)
    .maybeSingle();

  if (error) {
    console.error("Error checking event idempotency:", error.message);
    // On error, allow processing rather than silently dropping events.
    return false;
  }

  // Event exists and was fully processed -- skip
  if (data?.processed_at) {
    return true;
  }

  // Not found or found-but-incomplete -- allow processing
  return false;
}

/**
 * Record the event BEFORE processing.  `processed_at` is set to null
 * so that incomplete processing can be retried.
 */
async function recordEventStart(
  db: ReturnType<typeof supabaseAdmin>,
  event: StripeEvent,
): Promise<void> {
  const { error } = await db
    .from("stripe_webhook_events")
    .upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        processed_at: null,
        payload: event as unknown as Record<string, unknown>,
      },
      { onConflict: "stripe_event_id" },
    );

  if (error) {
    // Log but don't throw -- the worst case is we process twice, which
    // the handlers below are designed to tolerate.
    console.error("Failed to record event start:", error.message);
  }
}

/**
 * Mark the event as fully processed.
 */
async function recordEventComplete(
  db: ReturnType<typeof supabaseAdmin>,
  stripeEventId: string,
): Promise<void> {
  const { error } = await db
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", stripeEventId);

  if (error) {
    console.error("Failed to mark event complete:", error.message);
  }
}

// ─── Dead Letter ────────────────────────────────────────────────────────────

/**
 * Insert a failed event into the dead_letter_webhooks table for
 * later manual or automated retry.
 */
async function deadLetter(
  db: ReturnType<typeof supabaseAdmin>,
  event: StripeEvent,
  errorMessage: string,
): Promise<void> {
  const { error } = await db.from("dead_letter_webhooks").insert({
    provider_slug: "stripe",
    payload: event as unknown as Record<string, unknown>,
    error_message: errorMessage,
    status: "pending",
    next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
  });

  if (error) {
    console.error("Failed to insert dead letter:", error.message);
  }
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

/**
 * invoice.paid
 *
 * Fired every time a subscription invoice is successfully charged.
 * Two cases:
 *   1. First invoice of a new subscription: initialize user_credits
 *      with the plan's monthly allowance.
 *   2. Renewal invoice: call reset_monthly_credits RPC to reset the
 *      monthly balance (unused credits do NOT roll over).
 *
 * We also update the subscription status and period dates.
 */
async function handleInvoicePaid(
  db: ReturnType<typeof supabaseAdmin>,
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeSubscriptionId = invoice.subscription as string | null;
  if (!stripeSubscriptionId) {
    // One-time invoice (not subscription-related) -- skip
    console.log("invoice.paid: no subscription ID, skipping");
    return;
  }

  const billingReason = invoice.billing_reason as string | undefined;

  // Extract line items to determine the price ID
  const lines = invoice.lines as { data?: Array<Record<string, unknown>> } | undefined;
  const lineItem = lines?.data?.[0];
  const price = lineItem?.price as Record<string, unknown> | undefined;
  const priceId = price?.id as string | undefined;

  // Resolve plan from price ID
  let plan: PlanDefinition | undefined;
  if (priceId) {
    plan = planByPriceId(priceId);
  }

  // Look up the subscription record
  const { data: subscription, error: subError } = await db
    .from("subscriptions")
    .select("id, user_id, plan_slug")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (subError) {
    throw new Error(`Failed to look up subscription: ${subError.message}`);
  }

  if (!subscription) {
    // Subscription not yet in our DB -- this can happen when the first
    // invoice fires before checkout.session.completed links the customer.
    // We log and dead-letter; checkout handler will create the record,
    // and Stripe will retry this event.
    throw new Error(
      `Subscription ${stripeSubscriptionId} not found in database`,
    );
  }

  const userId = subscription.user_id as string;

  // Determine the plan if not resolved from price ID -- fall back to DB
  if (!plan) {
    plan = PLANS[subscription.plan_slug as string];
  }

  const monthlyAllowance = plan?.monthlyCredits ?? 0;

  // Extract period from the invoice
  const periodStart = lineItem?.period as Record<string, unknown> | undefined;
  const currentPeriodStart = periodStart?.start
    ? new Date((periodStart.start as number) * 1000).toISOString()
    : null;
  const currentPeriodEnd = periodStart?.end
    ? new Date((periodStart.end as number) * 1000).toISOString()
    : null;

  // Update subscription status + period
  const subUpdate: Record<string, unknown> = {
    status: "active",
    cancel_at_period_end: false,
  };
  const currentPlan = PLANS[subscription.plan_slug as string];
  if (
    plan?.slug &&
    plan.monthlyCredits >= (currentPlan?.monthlyCredits ?? 0)
  ) {
    subUpdate.plan_slug = plan.slug;
  }
  if (currentPeriodStart) subUpdate.current_period_start = currentPeriodStart;
  if (currentPeriodEnd) subUpdate.current_period_end = currentPeriodEnd;
  if (
    priceId &&
    (!plan || plan.monthlyCredits >= (currentPlan?.monthlyCredits ?? 0))
  ) {
    subUpdate.stripe_price_id = priceId;
    if (price?.product) subUpdate.stripe_product_id = price.product as string;
  }

  const { error: updateSubError } = await db
    .from("subscriptions")
    .update(subUpdate)
    .eq("id", subscription.id);

  if (updateSubError) {
    console.error("Failed to update subscription:", updateSubError.message);
  }

  // Handle credits based on whether this is first invoice or renewal
  if (
    billingReason === "subscription_create" ||
    billingReason === "subscription_cycle"
  ) {
    // Check if user_credits row exists
    const { data: existingCredits } = await db
      .from("user_credits")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingCredits && billingReason === "subscription_create") {
      // First subscription: initialize user_credits
      const { error: insertError } = await db.from("user_credits").insert({
        user_id: userId,
        monthly_credits_remaining: monthlyAllowance,
        purchased_balance: 0,
      });

      if (insertError) {
        // Row might already exist (race condition with profile trigger)
        // Try update instead
        if (insertError.code === "23505") {
          const { error: upsertError } = await db
            .from("user_credits")
            .update({ monthly_credits_remaining: monthlyAllowance })
            .eq("user_id", userId);

          if (upsertError) {
            throw new Error(
              `Failed to initialize credits: ${upsertError.message}`,
            );
          }
        } else {
          throw new Error(
            `Failed to insert user_credits: ${insertError.message}`,
          );
        }
      }

      // Record the transaction in the ledger
      await db.from("credit_transactions").insert({
        user_id: userId,
        type: "monthly_reset",
        amount: monthlyAllowance,
        bucket: "monthly",
        running_monthly_balance: monthlyAllowance,
        running_purchased_balance: 0,
        description: `Initial credit allocation for ${plan?.slug ?? "unknown"} plan`,
      });

      console.log(
        `invoice.paid: initialized ${monthlyAllowance} credits for user ${userId}`,
      );
    } else {
      // Renewal (or subscription_create where credits row already exists):
      // call the stored procedure to reset monthly credits
      const { data: rpcResult, error: rpcError } = await db.rpc(
        "reset_monthly_credits",
        {
          p_user_id: userId,
          p_allowance: monthlyAllowance,
        },
      );

      if (rpcError) {
        throw new Error(
          `reset_monthly_credits RPC failed: ${rpcError.message}`,
        );
      }

      console.log(
        `invoice.paid: reset monthly credits for user ${userId}:`,
        rpcResult,
      );
    }
  } else {
    console.log(
      `invoice.paid: billing_reason="${billingReason}", no credit action`,
    );
  }
}

/**
 * customer.subscription.updated
 *
 * Handles plan changes (upgrades/downgrades), trial endings, and
 * status transitions.  The `previous_attributes` field tells us
 * what changed so we can act precisely.
 */
async function handleSubscriptionUpdated(
  db: ReturnType<typeof supabaseAdmin>,
  subscription: Record<string, unknown>,
  previousAttributes?: Record<string, unknown>,
): Promise<void> {
  const stripeSubscriptionId = subscription.id as string;

  // Look up our subscription record
  const { data: subRecord, error: subError } = await db
    .from("subscriptions")
    .select("id, user_id, plan_slug")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (subError) {
    // A genuine DB/query failure is transient — throw so Stripe retries.
    throw new Error(
      `subscription.updated: lookup failed for ${stripeSubscriptionId}: ${subError.message}`,
    );
  }
  if (!subRecord) {
    // No local record for this Stripe subscription. This is NOT transient
    // (event arrived before our checkout insert, or it's an old/migrated sub),
    // so throwing just makes Stripe retry the same event forever -> 500 storm.
    // Acknowledge (return -> 200) and log for investigation. (2026-06-12)
    console.warn(
      `subscription.updated: no local record for ${stripeSubscriptionId} — acknowledging without action`,
    );
    return;
  }

  const userId = subRecord.user_id as string;

  // Extract current plan info from the subscription items
  const items = subscription.items as {
    data?: Array<Record<string, unknown>>;
  } | undefined;
  const currentItem = items?.data?.[0];
  const currentPrice = currentItem?.price as Record<string, unknown> | undefined;
  const currentPriceId = currentPrice?.id as string | undefined;

  // Build the update payload
  // Status reflects Stripe's raw status; cancel_at_period_end is a separate flag
  const stripeStatus = subscription.status as string;
  const cancelAtPeriodEnd = !!(subscription.cancel_at_period_end);

  const updatePayload: Record<string, unknown> = {
    status: stripeStatus,
    cancel_at_period_end: cancelAtPeriodEnd,
  };

  // Update period dates if available
  if (subscription.current_period_start) {
    updatePayload.current_period_start = new Date(
      (subscription.current_period_start as number) * 1000,
    ).toISOString();
  }
  if (subscription.current_period_end) {
    updatePayload.current_period_end = new Date(
      (subscription.current_period_end as number) * 1000,
    ).toISOString();
  }

  // Handle trial end
  if (subscription.trial_end) {
    updatePayload.trial_ends_at = new Date(
      (subscription.trial_end as number) * 1000,
    ).toISOString();
  }

  // Check for plan change (price ID changed)
  const previousItems = previousAttributes?.items as {
    data?: Array<Record<string, unknown>>;
  } | undefined;
  const previousPrice = previousItems?.data?.[0]?.price as
    | Record<string, unknown>
    | undefined;
  const previousPriceId = previousPrice?.id as string | undefined;

  const planChanged =
    currentPriceId &&
    previousPriceId &&
    currentPriceId !== previousPriceId;
  const currentPlan = currentPriceId ? planByPriceId(currentPriceId) : undefined;

  if (currentPlan && currentPriceId) {
    const existingPlan = PLANS[subRecord.plan_slug as string];
    const shouldApplyPlan =
      currentPlan.monthlyCredits >= (existingPlan?.monthlyCredits ?? 0);

    if (shouldApplyPlan) {
      updatePayload.plan_slug = currentPlan.slug;
      updatePayload.stripe_price_id = currentPriceId;
      if (currentPrice?.product) {
        updatePayload.stripe_product_id = currentPrice.product as string;
      }
    } else {
      console.log(
        `subscription.updated: ignoring lower-tier retry for user ${userId}: ` +
          `${subRecord.plan_slug} -> ${currentPlan.slug}`,
      );
    }

    if (shouldApplyPlan && (planChanged || currentPlan.slug !== subRecord.plan_slug)) {
      console.log(
        `subscription.updated: plan change for user ${userId}: ` +
          `${subRecord.plan_slug} -> ${currentPlan.slug}`,
      );

      // Notify admin via Telegram (fire-and-forget)
      notifyTelegram(
        `<b>Plan change</b>\nUser: ${userId}\n${subRecord.plan_slug} → ${currentPlan.slug}`,
      );
    }
  } else if (currentPriceId) {
    // Price ID present but no change detected -- still store it
    updatePayload.stripe_price_id = currentPriceId;
    if (currentPrice?.product) {
      updatePayload.stripe_product_id = currentPrice.product as string;
    }
  }

  // Handle trial -> active transition
  const previousStatus = previousAttributes?.status as string | undefined;
  const currentStatus = subscription.status as string;
  if (previousStatus === "trialing" && currentStatus === "active") {
    console.log(
      `subscription.updated: trial ended for user ${userId}, now active`,
    );
  }

  // Persist changes
  const { error: updateError } = await db
    .from("subscriptions")
    .update(updatePayload)
    .eq("id", subRecord.id);

  if (updateError) {
    throw new Error(
      `Failed to update subscription record: ${updateError.message}`,
    );
  }

  console.log(
    `subscription.updated: updated subscription for user ${userId}, status=${currentStatus}`,
  );
}

/**
 * customer.subscription.deleted
 *
 * Fired when a subscription is canceled (at period end or immediately).
 * We set the subscription status to 'canceled' and downgrade the plan
 * to 'free', but do NOT zero out remaining credits -- the user has
 * already paid for them.
 */
async function handleSubscriptionDeleted(
  db: ReturnType<typeof supabaseAdmin>,
  subscription: Record<string, unknown>,
): Promise<void> {
  const stripeSubscriptionId = subscription.id as string;

  const { data: subRecord, error: subError } = await db
    .from("subscriptions")
    .select("id, user_id, plan_slug")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (subError) {
    // Genuine DB failure — transient, let Stripe retry.
    throw new Error(
      `subscription.deleted: lookup failed for ${stripeSubscriptionId}: ${subError.message}`,
    );
  }
  if (!subRecord) {
    // Nothing to expire — we have no local record for this subscription.
    // Acknowledge so Stripe stops retrying. (2026-06-12)
    console.warn(
      `subscription.deleted: no local record for ${stripeSubscriptionId} — acknowledging without action`,
    );
    return;
  }

  const userId = subRecord.user_id as string;

  const { error: updateError } = await db
    .from("subscriptions")
    .update({
      status: "expired",
      plan_slug: "free",
      cancel_at_period_end: false,
    })
    .eq("id", subRecord.id);

  if (updateError) {
    throw new Error(
      `Failed to expire subscription record: ${updateError.message}`,
    );
  }

  console.log(
    `subscription.deleted: expired subscription for user ${userId}, ` +
      `plan downgraded from ${subRecord.plan_slug} to free (credits preserved)`,
  );
}

/**
 * Resolve how many credits a PAYG purchase is worth from Stripe metadata.
 *
 * The same metadata shape is attached to both the Checkout Session and the
 * PaymentIntent, and both events credit, so this lives in one place:
 *   1. Dynamic flow stores `credits` directly in metadata.
 *   2. Legacy fixed-pack flow stores `pack_id` → PAYG_PACKS lookup.
 *
 * Returns `null` when the metadata describes something that is not a PAYG
 * credit purchase (e.g. a subscription payment).  Throws when the metadata
 * is present but malformed — we would rather Stripe retry than credit a
 * wrong amount.
 */
function resolvePaygCredits(
  metadata: Record<string, string> | undefined,
): { amount: number; source: "dynamic" | "pack"; description: string } | null {
  const packId = metadata?.pack_id ?? metadata?.payg_pack_id;
  const rawCredits = metadata?.credits;

  if (rawCredits) {
    const parsed = parseInt(rawCredits, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
      throw new Error(`invalid credits metadata "${rawCredits}"`);
    }
    return {
      amount: parsed,
      source: "dynamic",
      description:
        `PAYG credit purchase: ${parsed} credits (dynamic, $${(parsed / 100).toFixed(2)})`,
    };
  }

  if (packId) {
    const pack = PAYG_PACKS[packId];
    if (!pack) {
      throw new Error(`Unknown pack_id in metadata: ${packId}`);
    }
    return {
      amount: pack.credits,
      source: "pack",
      description: `PAYG credit purchase: ${pack.credits} credits (${packId})`,
    };
  }

  return null;
}

/**
 * payment_intent.succeeded
 *
 * Fired when a one-time payment succeeds.  Credits are also applied from
 * checkout.session.completed; add_purchased_credits is idempotent on the
 * PaymentIntent ID so whichever event arrives first wins.
 */
async function handlePaymentIntentSucceeded(
  db: ReturnType<typeof supabaseAdmin>,
  paymentIntent: Record<string, unknown>,
): Promise<void> {
  const metadata = paymentIntent.metadata as Record<string, string> | undefined;

  const resolved = resolvePaygCredits(metadata);
  if (!resolved) {
    // Not a PAYG purchase (could be a subscription payment).
    console.log(
      "payment_intent.succeeded: no credits or pack_id in metadata, skipping",
    );
    return;
  }
  const credits = resolved.amount;
  const source = resolved.source;

  const stripeCustomerId = paymentIntent.customer as string | null;
  const paymentIntentId = paymentIntent.id as string;

  // Resolve the user.  Prefer the `user_id` we put in the PaymentIntent
  // metadata at checkout time — it is authoritative and works for buyers
  // who have no subscriptions row at all (pure PAYG).  Fall back to the
  // Stripe customer ID for legacy intents created before we set metadata.
  let userId = metadata?.user_id ?? null;

  if (!userId) {
    if (!stripeCustomerId) {
      throw new Error(
        "payment_intent.succeeded: no user_id metadata and no customer ID",
      );
    }

    const { data: subscription, error: subError } = await db
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (subError || !subscription) {
      throw new Error(
        `No subscription found for customer ${stripeCustomerId}: ${subError?.message ?? "not found"}`,
      );
    }

    userId = subscription.user_id as string;
  }

  // Add credits atomically via RPC (handles upsert + ledger in one transaction)
  const { error: rpcError } = await db.rpc(
    "add_purchased_credits",
    {
      p_user_id: userId,
      p_amount: credits,
      p_payment_intent_id: paymentIntentId,
      p_description: resolved.description,
    },
  );

  if (rpcError) {
    throw new Error(
      `add_purchased_credits RPC failed for user ${userId}: ${rpcError.message}`,
    );
  }

  console.log(
    `payment_intent.succeeded: added ${credits} credits to user ${userId} ` +
      `(${source}, PI: ${paymentIntentId})`,
  );
}

/**
 * checkout.session.completed
 *
 * Handles post-checkout setup.  The primary responsibility is linking
 * the Stripe customer ID to the user's subscription record if it hasn't
 * been linked yet.
 *
 * For subscription checkouts, the subscription itself is handled by
 * invoice.paid.  For one-time PAYG checkouts, the payment is handled
 * by payment_intent.succeeded.
 */
async function handleCheckoutSessionCompleted(
  db: ReturnType<typeof supabaseAdmin>,
  session: Record<string, unknown>,
): Promise<void> {
  const stripeCustomerId = session.customer as string | null;
  const stripeSubscriptionId = session.subscription as string | null;
  const mode = session.mode as string; // 'subscription' | 'payment' | 'setup'

  // Extract user ID from client_reference_id or metadata (PAYG uses metadata)
  const metadata = session.metadata as Record<string, string> | undefined;
  const userId =
    (session.client_reference_id as string | null) ??
    metadata?.user_id ??
    null;

  if (!stripeCustomerId) {
    console.log("checkout.session.completed: no customer ID, skipping");
    return;
  }

  if (mode === "subscription" && stripeSubscriptionId && userId) {
    const planTier = metadata?.plan_tier ?? "starter";
    const plan = PLANS[planTier];
    const monthlyCredits = plan?.monthlyCredits ?? 0;

    // Link Stripe customer + subscription to our subscription record.
    // If the record doesn't exist yet, create it.
    const { data: existing } = await db
      .from("subscriptions")
      .select("id, plan_slug")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const existingPlan = PLANS[existing.plan_slug as string];
      const shouldApplyPlan =
        monthlyCredits >= (existingPlan?.monthlyCredits ?? 0);
      const updatePayload: Record<string, unknown> = {
        status: "active",
        cancel_at_period_end: false,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      };
      if (shouldApplyPlan) {
        updatePayload.plan_slug = planTier;
      }

      // Update existing subscription with Stripe IDs
      const { error: updateError } = await db
        .from("subscriptions")
        .update(updatePayload)
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(
          `Failed to link Stripe IDs to subscription: ${updateError.message}`,
        );
      }

      console.log(
        `checkout.session.completed: linked Stripe customer ${stripeCustomerId} ` +
          `to user ${userId}`,
      );

      // Allocate monthly credits immediately. The invoice handler will
      // reconcile period dates and can safely reset on the next cycle.
      if (monthlyCredits > 0) {
        const { data: existingCredits } = await db
          .from("user_credits")
          .select("id, monthly_credits_remaining")
          .eq("user_id", userId)
          .maybeSingle();

        if (existingCredits) {
          if ((existingCredits.monthly_credits_remaining as number) < monthlyCredits) {
            await db
              .from("user_credits")
              .update({ monthly_credits_remaining: monthlyCredits })
              .eq("user_id", userId);
          }
        } else {
          await db.from("user_credits").insert({
            user_id: userId,
            monthly_credits_remaining: monthlyCredits,
            purchased_balance: 0,
          });
        }
      }
    } else {
      // Resolve plan tier from checkout metadata
      // Create a new subscription record with the correct plan slug
      const { error: insertError } = await db.from("subscriptions").insert({
        user_id: userId,
        plan_slug: planTier,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status: "active",
        cancel_at_period_end: false,
      });

      if (insertError) {
        throw new Error(
          `Failed to create subscription record: ${insertError.message}`,
        );
      }

      console.log(
        `checkout.session.completed: created subscription for user ${userId} ` +
          `(plan=${planTier})`,
      );

      // Notify admin via Telegram (fire-and-forget)
      notifyTelegram(
        `<b>New subscription</b>\nUser: ${userId}\nPlan: ${planTier}`,
      );

      // Allocate monthly credits immediately (belt-and-suspenders with invoice.paid)
      if (monthlyCredits > 0) {
        const { data: existingCredits } = await db
          .from("user_credits")
          .select("id, monthly_credits_remaining")
          .eq("user_id", userId)
          .maybeSingle();

        if (existingCredits) {
          // Only set if still 0 (invoice.paid may have already run)
          if ((existingCredits.monthly_credits_remaining as number) === 0) {
            await db
              .from("user_credits")
              .update({ monthly_credits_remaining: monthlyCredits })
              .eq("user_id", userId);

            console.log(
              `checkout.session.completed: allocated ${monthlyCredits} monthly credits for ${userId}`,
            );
          }
        } else {
          await db.from("user_credits").insert({
            user_id: userId,
            monthly_credits_remaining: monthlyCredits,
            purchased_balance: 0,
          });

          console.log(
            `checkout.session.completed: created user_credits with ${monthlyCredits} monthly for ${userId}`,
          );
        }
      }
    }
  } else if (mode === "payment" && userId) {
    // One-time payment (PAYG credit top-up).
    //
    // We credit here rather than waiting for payment_intent.succeeded.
    // Both events can safely credit: add_purchased_credits is idempotent
    // on the Stripe PaymentIntent ID, so whichever arrives first wins and
    // the other is a no-op.  Relying on payment_intent.succeeded alone is
    // fragile — the endpoint has to be subscribed to that event type, and
    // if it isn't, the customer is charged and never credited. (2026-08-02)

    // Ensure the customer ID is linked
    const { error: updateError } = await db
      .from("subscriptions")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("user_id", userId)
      .is("stripe_customer_id", null);

    if (updateError) {
      console.error(
        "checkout.session.completed: failed to link customer:",
        updateError.message,
      );
    }

    const paymentStatus = session.payment_status as string | undefined;
    if (paymentStatus !== "paid") {
      // Async payment methods complete later via
      // checkout.session.async_payment_succeeded / payment_intent.succeeded.
      console.log(
        `checkout.session.completed: PAYG session for user ${userId} is ` +
          `payment_status=${paymentStatus}, not crediting yet`,
      );
      return;
    }

    const paymentIntentId = session.payment_intent as string | null;
    if (!paymentIntentId) {
      throw new Error(
        `checkout.session.completed: paid PAYG session for user ${userId} has no payment_intent`,
      );
    }

    const credits = resolvePaygCredits(metadata);
    if (credits === null) {
      console.log(
        `checkout.session.completed: PAYG session for user ${userId} has no ` +
          `credits/pack_id metadata, skipping`,
      );
      return;
    }

    const { error: rpcError } = await db.rpc("add_purchased_credits", {
      p_user_id: userId,
      p_amount: credits.amount,
      p_payment_intent_id: paymentIntentId,
      p_description: credits.description,
    });

    if (rpcError) {
      throw new Error(
        `add_purchased_credits RPC failed for user ${userId} ` +
          `(PI: ${paymentIntentId}): ${rpcError.message}`,
      );
    }

    console.log(
      `checkout.session.completed: credited ${credits.amount} credits to ` +
        `user ${userId} (${credits.source}, PI: ${paymentIntentId})`,
    );
  } else {
    console.log(
      `checkout.session.completed: mode=${mode}, no action required`,
    );
  }
}

// ─── Event Router ───────────────────────────────────────────────────────────

/**
 * Dispatch a verified Stripe event to the appropriate handler.
 *
 * Returns `true` if the event was handled, `false` if it was
 * an unrecognized type (which we acknowledge with 200 anyway).
 */
async function routeEvent(
  db: ReturnType<typeof supabaseAdmin>,
  event: StripeEvent,
): Promise<boolean> {
  const obj = event.data.object;

  switch (event.type) {
    case "invoice.paid":
      await handleInvoicePaid(db, obj);
      return true;

    case "customer.subscription.updated":
      await handleSubscriptionUpdated(db, obj, event.data.previous_attributes);
      return true;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(db, obj);
      return true;

    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(db, obj);
      return true;

    case "checkout.session.completed":
    // Delayed payment methods complete the session later; same object
    // shape, and crediting is idempotent, so the same handler applies.
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutSessionCompleted(db, obj);
      return true;

    default:
      console.log(`Unhandled event type: ${event.type} -- returning 200`);
      return false;
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const secHeaders = getSecurityHeaders();

  // Validate required env vars at request time
  const missingEnv = validateEnv();
  if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // ── 1. Read raw body and signature ──────────────────────────────────────

  const signatureHeader = req.headers.get("Stripe-Signature");
  if (!signatureHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Stripe-Signature header" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  const rawBody = await req.text();

  // ── 2. Verify signature ─────────────────────────────────────────────────

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    console.error("Stripe signature verification failed:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // ── 3. Idempotency check ────────────────────────────────────────────────

  const db = supabaseAdmin();

  if (await isEventAlreadyProcessed(db, event.id)) {
    console.log(`Event ${event.id} already processed, skipping`);
    return new Response(
      JSON.stringify({ received: true, status: "already_processed" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // Record that we are starting to process this event
  await recordEventStart(db, event);

  // ── 4. Route and handle the event ───────────────────────────────────────

  try {
    const handled = await routeEvent(db, event);

    // Mark as fully processed
    await recordEventComplete(db, event.id);

    return new Response(
      JSON.stringify({
        received: true,
        status: handled ? "processed" : "ignored",
        type: event.type,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error";
    console.error(`Error processing ${event.type} (${event.id}):`, message);
    await captureEdgeError(err, "webhook-stripe", { event_type: event.type, event_id: event.id });

    // Send to dead letter queue for manual retry
    await deadLetter(db, event, message);

    // ALWAYS return 200 to Stripe to prevent retry storms.
    // The dead letter queue handles retries on our side.
    return new Response(
      JSON.stringify({
        received: true,
        status: "error_queued",
        type: event.type,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }
});
