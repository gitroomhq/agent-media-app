import { describe, expect, it } from 'vitest';
import { pastDueRedirect, UPDATE_CARD_PATH } from '../lib/billing-gate';

describe('past-due gate', () => {
  it('sends past_due and unpaid users from app pages to the update-card page', () => {
    for (const status of ['past_due', 'unpaid']) {
      expect(pastDueRedirect(status, '/dashboard')).toBe(UPDATE_CARD_PATH);
      expect(pastDueRedirect(status, '/create/selfie')).toBe(UPDATE_CARD_PATH);
      expect(pastDueRedirect(status, '/gallery')).toBe(UPDATE_CARD_PATH);
    }
  });

  it('leaves billing, settings and the update-card page reachable', () => {
    for (const p of ['/billing', '/billing/update-card', '/settings']) expect(pastDueRedirect('past_due', p)).toBeNull();
  });

  it('never touches healthy, trialing or unknown subscriptions', () => {
    for (const s of ['active', 'trialing', 'canceled', 'expired', null]) expect(pastDueRedirect(s, '/dashboard')).toBeNull();
  });
});
