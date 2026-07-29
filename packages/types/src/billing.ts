// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Billing domain types for the agent-media platform.
 *
 * Defines plan tiers, feature gates, PAYG packs, and billing-cycle
 * configuration. These types are consumed by both the backend
 * (Edge Functions, CLI) and the frontend (Next.js dashboard).
 */

// ── Plan Tier ───────────────────────────────────────────────────────────────

/**
 * Subscription plan tiers offered by agent-media.
 *
 * NOTE: `PlanTier` is also exported from index.ts for backward compatibility.
 * This enum-style constant provides runtime values in addition to the type.
 */
export const PLAN_TIERS = ['free', 'newby', 'starter', 'growth', 'pro'] as const;

export type BillingPlanTier = (typeof PLAN_TIERS)[number];

// ── Feature Gates ───────────────────────────────────────────────────────────

/**
 * Feature gates that vary by subscription plan.
 * Used to enforce plan-level restrictions at the Edge Function layer.
 */
export interface PlanFeatureGates {
  /** Maximum number of concurrent generation jobs. */
  maxConcurrentJobs: number;
  /** Maximum video duration in seconds. */
  maxVideoDurationSeconds: number;
  /** Which AI models the user can access (slugs). Empty = all models. */
  allowedModels: string[];
  /** Maximum resolution tier (e.g., '720p', '1080p', '4k'). */
  maxResolution: string;
  /** Whether output includes a watermark. */
  hasWatermark: boolean;
  /** Whether the user has priority queue access. */
  hasPriority: boolean;
  /** Whether the user has REST API access. */
  hasApiAccess: boolean;
}

// ── Plan Configuration ──────────────────────────────────────────────────────

/**
 * Complete configuration for a subscription plan.
 * Stored as a compile-time constant; Stripe product/price IDs are
 * injected via environment or config so they work across test/live modes.
 */
export interface PlanConfig {
  /** Internal tier identifier. */
  tier: BillingPlanTier;
  /** Display name (e.g., "Growth Plan"). */
  displayName: string;
  /** Monthly price in USD cents (0 for Free). */
  priceUsdCents: number;
  /** Credits granted per billing cycle (one-time for Free). */
  credits: number;
  /** Whether credits are one-time (Free) or reset monthly. */
  creditsType: 'one_time' | 'monthly';
  /** Feature gates for this plan. */
  features: PlanFeatureGates;
  /** Stripe product ID placeholder (set from env/config at runtime). */
  stripeProductId: string;
  /** Stripe price ID placeholder (set from env/config at runtime). */
  stripePriceId: string;
}

// ── PAYG Packs ──────────────────────────────────────────────────────────────

/**
 * A pay-as-you-go credit pack that users can purchase
 * in addition to their monthly subscription allowance.
 * Purchased credits never expire.
 */
export interface PaygPack {
  /** Unique slug (e.g., 'pack-100'). */
  slug: string;
  /** Display name shown in the CLI and dashboard. */
  displayName: string;
  /** Number of credits in this pack. */
  credits: number;
  /** Price in USD cents. */
  priceUsdCents: number;
  /** Effective per-credit cost in USD cents (for display). */
  perCreditCostCents: number;
  /** Stripe product ID placeholder. */
  stripeProductId: string;
  /** Stripe price ID placeholder. */
  stripePriceId: string;
}

// ── Billing Cycle ───────────────────────────────────────────────────────────

/**
 * Information about the current billing cycle for a user's subscription.
 */
export interface BillingCycle {
  /** Start of the current billing period (ISO 8601). */
  periodStart: string;
  /** End of the current billing period (ISO 8601). */
  periodEnd: string;
  /** Number of days remaining in the billing period. */
  daysRemaining: number;
  /** Whether the subscription will renew at period end. */
  willRenew: boolean;
}

// ── Trial Configuration ─────────────────────────────────────────────────────

/**
 * Trial configuration for a subscription plan.
 * Only the Starter plan currently supports trials.
 */
export interface TrialConfig {
  /** Whether a trial is available for this plan. */
  enabled: boolean;
  /** Trial duration in days. */
  durationDays: number;
  /** Trial price in USD cents ($1 = 100 cents). */
  priceUsdCents: number;
  /** Credits available during the trial period. */
  trialCredits: number;
}
