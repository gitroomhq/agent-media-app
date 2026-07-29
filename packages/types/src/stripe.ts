// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Stripe-specific types for the agent-media billing integration.
 *
 * These types mirror the Stripe API objects we interact with,
 * providing a thin, typed abstraction so the rest of the codebase
 * never imports the Stripe SDK directly.
 */

// ── Stripe Product ──────────────────────────────────────────────────────────

/**
 * Minimal representation of a Stripe Product used for plan
 * and PAYG pack configuration.
 */
export interface StripeProduct {
  /** Stripe product ID (e.g., `prod_xxx`). */
  id: string;
  /** Human-readable name displayed on invoices. */
  name: string;
  /** Whether this product is currently available for purchase. */
  active: boolean;
  /** Arbitrary key-value metadata attached to the product. */
  metadata: Record<string, string>;
}

// ── Stripe Price ────────────────────────────────────────────────────────────

export type StripePriceType = 'one_time' | 'recurring';

export type StripePriceInterval = 'month' | 'year';

/**
 * Minimal representation of a Stripe Price attached to a product.
 */
export interface StripePrice {
  /** Stripe price ID (e.g., `price_xxx`). */
  id: string;
  /** The product this price belongs to. */
  productId: string;
  /** Unit amount in the smallest currency unit (cents for USD). */
  unitAmount: number;
  /** Three-letter ISO currency code in lowercase. */
  currency: string;
  /** Whether the price is one-time (PAYG) or recurring (subscription). */
  type: StripePriceType;
  /** Billing interval; only present when `type` is `recurring`. */
  interval?: StripePriceInterval;
}

// ── Stripe Subscription ─────────────────────────────────────────────────────

export type StripeSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

/**
 * Minimal representation of a Stripe Subscription.
 */
export interface StripeSubscription {
  /** Stripe subscription ID (e.g., `sub_xxx`). */
  id: string;
  /** Stripe customer ID that owns this subscription. */
  customerId: string;
  /** Current subscription status. */
  status: StripeSubscriptionStatus;
  /** Stripe price ID for the active subscription item. */
  priceId: string;
  /** Stripe product ID for the active subscription item. */
  productId: string;
  /** Start of the current billing period. */
  currentPeriodStart: number;
  /** End of the current billing period. */
  currentPeriodEnd: number;
  /** Whether the subscription will cancel at period end. */
  cancelAtPeriodEnd: boolean;
  /** Timestamp when the trial period ends (if applicable). */
  trialEnd: number | null;
}

// ── Stripe Invoice ──────────────────────────────────────────────────────────

export type StripeInvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'uncollectible'
  | 'void';

/**
 * Minimal representation of a Stripe Invoice.
 */
export interface StripeInvoice {
  /** Stripe invoice ID (e.g., `in_xxx`). */
  id: string;
  /** Stripe customer ID. */
  customerId: string;
  /** Stripe subscription ID (null for one-time invoices). */
  subscriptionId: string | null;
  /** Invoice status. */
  status: StripeInvoiceStatus;
  /** Total amount in the smallest currency unit (cents). */
  amountPaid: number;
  /** Three-letter ISO currency code in lowercase. */
  currency: string;
  /** Timestamp when the invoice was paid. */
  paidAt: number | null;
}

// ── Stripe Webhook Event ────────────────────────────────────────────────────

/**
 * The subset of Stripe webhook event types that agent-media processes.
 */
export type StripeWebhookEventType =
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'checkout.session.completed';

/**
 * Wrapper around an incoming Stripe webhook event with the
 * typed event type and raw payload.
 */
export interface StripeWebhookEvent {
  /** Stripe event ID (e.g., `evt_xxx`). Used for idempotent processing. */
  id: string;
  /** The event type. */
  type: StripeWebhookEventType;
  /** Timestamp when the event was created (Unix epoch seconds). */
  created: number;
  /** Whether this event was triggered in livemode. */
  livemode: boolean;
  /** The full event payload. */
  data: {
    object: Record<string, unknown>;
  };
}
