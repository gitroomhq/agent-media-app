import { describe, expect, it } from 'vitest';
import {
  FREE_TRIAL,
  trialSubscriptionData,
  isTrialMetadata,
  firstInvoiceAllowance,
  checkoutAllowance,
} from '../../../supabase/functions/_shared/free-trial';

describe('free 5s video trial (card required, Creator after 3 days)', () => {
  it('is one 5 second selfie video on Creator, 3 days', () => {
    expect(FREE_TRIAL.planTier).toBe('starter');
    expect(FREE_TRIAL.days).toBe(3);
    // selfie pricing: 75 base + 60/s
    expect(FREE_TRIAL.credits).toBe(75 + 60 * 5);
  });

  it('adds a trial only for a first-time Creator checkout that asked for it', () => {
    expect(trialSubscriptionData({ planTier: 'starter', wantsTrial: true, hadSubscription: false })).toEqual({
      trial_period_days: 3,
      metadata: { trial: 'free_5s_video' },
    });
    expect(trialSubscriptionData({ planTier: 'starter', wantsTrial: true, hadSubscription: true })).toBeNull();
    expect(trialSubscriptionData({ planTier: 'creator', wantsTrial: true, hadSubscription: false })).toBeNull();
    expect(trialSubscriptionData({ planTier: 'starter', wantsTrial: false, hadSubscription: false })).toBeNull();
  });

  it('grants only the trial credits while trialing, full plan on the first paid cycle', () => {
    const trialMeta = { trial: 'free_5s_video' };
    expect(isTrialMetadata(trialMeta)).toBe(true);
    expect(isTrialMetadata({})).toBe(false);
    expect(checkoutAllowance(trialMeta, 3900)).toBe(375);
    expect(checkoutAllowance({}, 3900)).toBe(3900);
    expect(firstInvoiceAllowance({ billingReason: 'subscription_create', total: 0, subMetadata: trialMeta }, 3900)).toBe(375);
    expect(firstInvoiceAllowance({ billingReason: 'subscription_create', total: 3900, subMetadata: {} }, 3900)).toBe(3900);
    // trial converts: Stripe bills the first real period as subscription_cycle
    expect(firstInvoiceAllowance({ billingReason: 'subscription_cycle', total: 3900, subMetadata: trialMeta }, 3900)).toBe(3900);
  });
});
