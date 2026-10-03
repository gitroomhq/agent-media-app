// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Card-required free trial: a new customer adds a card at Stripe Checkout,
// gets credits for one 5-second video, and is billed Creator ($39/mo) after
// 3 days unless they cancel. Pure logic (no Deno/Node imports) so it can be
// unit-tested from apps/web (tests/free-trial.test.ts).

export const FREE_TRIAL = {
  tag: 'free_5s_video',
  planTier: 'starter', // shown as "Creator" ($39)
  days: 3,
  // selfie generator: 75 base + 60 credits/s (packages/schema/src/v2/generators.ts)
  credits: 75 + 60 * 5,
} as const;

type Meta = Record<string, unknown> | null | undefined;

export function isTrialMetadata(meta: Meta): boolean {
  return meta?.trial === FREE_TRIAL.tag;
}

/** subscription_data additions for Checkout, or null when no trial applies. */
export function trialSubscriptionData(opts: {
  planTier: string;
  wantsTrial: boolean;
  hadSubscription: boolean;
}): { trial_period_days: number; metadata: { trial: string } } | null {
  if (!opts.wantsTrial || opts.hadSubscription || opts.planTier !== FREE_TRIAL.planTier) return null;
  return { trial_period_days: FREE_TRIAL.days, metadata: { trial: FREE_TRIAL.tag } };
}

/** Credits to grant when checkout.session.completed links the subscription. */
export function checkoutAllowance(sessionMeta: Meta, monthlyCredits: number): number {
  return isTrialMetadata(sessionMeta) ? FREE_TRIAL.credits : monthlyCredits;
}

/** Credits for an invoice.paid event: the $0 trial invoice only gets the trial grant. */
export function firstInvoiceAllowance(
  inv: { billingReason?: string; total?: number | null; subMetadata?: Meta },
  monthlyCredits: number,
): number {
  if (inv.billingReason === 'subscription_create' && (inv.total ?? 0) === 0 && isTrialMetadata(inv.subMetadata)) {
    return FREE_TRIAL.credits;
  }
  return monthlyCredits;
}
