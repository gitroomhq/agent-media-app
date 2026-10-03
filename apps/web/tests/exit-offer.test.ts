import { describe, expect, it } from 'vitest';
import { EXIT_OFFER, exitOfferDiscount } from '../../../supabase/functions/_shared/exit-offer';
import { exitIntentFrom, EXIT_OFFER_IDLE_MS } from '../lib/exit-offer';

describe('exit offer pricing (server)', () => {
  it('is 30% off the first month only', () => {
    expect(EXIT_OFFER.percentOff).toBe(30);
    expect(EXIT_OFFER.duration).toBe('once');
  });

  it('applies to any plan, only for first-time subscribers who asked for it, never with the trial', () => {
    for (const planTier of ['starter', 'creator', 'pro_plus']) {
      expect(exitOfferDiscount({ planTier, wantsOffer: true, hadSubscription: false, trial: false })).toEqual([
        { coupon: EXIT_OFFER.couponId },
      ]);
    }
    expect(exitOfferDiscount({ planTier: 'starter', wantsOffer: true, hadSubscription: true, trial: false })).toBeNull();
    expect(exitOfferDiscount({ planTier: 'starter', wantsOffer: false, hadSubscription: false, trial: false })).toBeNull();
    expect(exitOfferDiscount({ planTier: 'starter', wantsOffer: true, hadSubscription: false, trial: true })).toBeNull();
    expect(exitOfferDiscount({ planTier: 'enterprise', wantsOffer: true, hadSubscription: false, trial: false })).toBeNull();
  });
});

describe('exit intent (client)', () => {
  const base = { alreadyShown: false, busy: false };
  it('fires when the mouse leaves through the top of the window on desktop', () => {
    expect(exitIntentFrom({ ...base, kind: 'mouseout', clientY: -2, toElement: null })).toBe(true);
    expect(exitIntentFrom({ ...base, kind: 'mouseout', clientY: 300, toElement: null })).toBe(false);
    expect(exitIntentFrom({ ...base, kind: 'mouseout', clientY: -2, toElement: {} })).toBe(false);
  });

  it('fires on idle (phones) and on log out', () => {
    expect(EXIT_OFFER_IDLE_MS).toBe(25_000);
    expect(exitIntentFrom({ ...base, kind: 'idle' })).toBe(true);
    expect(exitIntentFrom({ ...base, kind: 'logout' })).toBe(true);
  });

  it('shows once, and never while checkout is starting', () => {
    expect(exitIntentFrom({ alreadyShown: true, busy: false, kind: 'logout' })).toBe(false);
    expect(exitIntentFrom({ alreadyShown: false, busy: true, kind: 'idle' })).toBe(false);
  });
});
