// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Account and billing types.
 */

export const PLAN_TIERS = ['free', 'starter', 'creator', 'pro_plus'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'canceled', 'past_due', 'trialing'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
