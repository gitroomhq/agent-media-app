// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Exit-intent offer on the plan pages: 30% off the first month of any plan,
// for customers who never had a subscription. Not combined with the free
// 5-second video trial. Pure logic, unit-tested from apps/web.

export const EXIT_OFFER = {
  couponId: 'AM_EXIT30_FIRST_MONTH',
  name: '30% off your first month',
  percentOff: 30,
  duration: 'once',
} as const;

const PLANS = new Set(['starter', 'creator', 'pro_plus']);

export function exitOfferDiscount(opts: {
  planTier: string;
  wantsOffer: boolean;
  hadSubscription: boolean;
  trial: boolean;
}): Array<{ coupon: string }> | null {
  if (!opts.wantsOffer || opts.hadSubscription || opts.trial || !PLANS.has(opts.planTier)) return null;
  return [{ coupon: EXIT_OFFER.couponId }];
}
