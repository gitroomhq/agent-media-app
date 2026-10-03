import { describe, expect, it } from 'vitest';
import { dueEmail, LIFECYCLE_START, type UserFacts } from '../lib/lifecycle/rules';
import { renderEmail } from '../lib/lifecycle/templates';
import { unsubscribeToken, verifyUnsubscribe } from '../lib/lifecycle/unsubscribe';

const H = 3_600_000;
const now = Date.parse('2026-10-10T12:00:00Z');
const base: UserFacts = {
  createdAt: now - 2 * H,
  status: null,
  trialEndsAt: null,
  canceledAt: null,
  sent: [],
  unsubscribed: false,
};
const at = (f: Partial<UserFacts>) => dueEmail({ ...base, ...f }, now);

describe('lifecycle rules', () => {
  it('welcomes a new unpaid signup after 30 minutes, not before', () => {
    expect(at({ createdAt: now - 10 * 60_000 })).toBeNull();
    expect(at({})).toBe('welcome');
  });

  it('nudges unpaid signups on day 2 and day 5, each once', () => {
    expect(at({ createdAt: now - 50 * H, sent: ['welcome'] })).toBe('nudge_d2');
    expect(at({ createdAt: now - 50 * H, sent: ['welcome', 'nudge_d2'] })).toBeNull();
    expect(at({ createdAt: now - 122 * H, sent: ['welcome', 'nudge_d2'] })).toBe('nudge_d5');
    expect(at({ createdAt: now - 122 * H, sent: ['welcome', 'nudge_d2', 'nudge_d5'] })).toBeNull();
  });

  it('never emails accounts created before the sequence started (they got the broadcast)', () => {
    expect(at({ createdAt: LIFECYCLE_START - H })).toBeNull();
    expect(dueEmail({ ...base, createdAt: LIFECYCLE_START - 10 * H }, LIFECYCLE_START + 50 * H)).toBeNull();
  });

  it('warns a trialing user the day before the charge', () => {
    expect(at({ status: 'trialing', trialEndsAt: now + 20 * H })).toBe('trial_ending');
    expect(at({ status: 'trialing', trialEndsAt: now + 40 * H })).toBeNull();
    expect(at({ status: 'trialing', trialEndsAt: now + 20 * H, sent: ['trial_ending'] })).toBeNull();
  });

  it('asks past_due users to fix their card', () => {
    expect(at({ status: 'past_due', createdAt: now - 400 * H })).toBe('payment_failed');
  });

  it('wins back cancels on day 3 only', () => {
    expect(at({ status: 'canceled', canceledAt: now - 75 * H, createdAt: now - 900 * H })).toBe('winback_d3');
    expect(at({ status: 'canceled', canceledAt: now - 10 * H, createdAt: now - 900 * H })).toBeNull();
    expect(at({ status: 'canceled', canceledAt: now - 300 * H, createdAt: now - 900 * H })).toBeNull();
  });

  it('paying users get no nudges, unsubscribed users get nothing', () => {
    expect(at({ status: 'active' })).toBeNull();
    expect(at({ unsubscribed: true })).toBeNull();
    expect(at({ status: 'past_due', unsubscribed: true })).toBe('payment_failed'); // billing notice is transactional
  });
});

describe('templates', () => {
  it('every kind renders a subject, a CTA link and an unsubscribe link', () => {
    for (const kind of ['welcome', 'nudge_d2', 'nudge_d5', 'trial_ending', 'payment_failed', 'winback_d3'] as const) {
      const e = renderEmail(kind, { unsubscribeUrl: 'https://app.agent-media.ai/api/email/unsubscribe?x' });
      expect(e.subject.length).toBeGreaterThan(5);
      expect(e.text).toContain('https://app.agent-media.ai/');
      expect(e.text).toContain('utm_campaign=lifecycle_' + kind);
      expect(e.text).toContain('/api/email/unsubscribe');
      expect(e.text).not.toMatch(/—/); // no em-dashes
    }
  });
});

describe('unsubscribe token', () => {
  it('round-trips and rejects tampering', () => {
    const t = unsubscribeToken('user-1', 'secret');
    expect(verifyUnsubscribe('user-1', t, 'secret')).toBe(true);
    expect(verifyUnsubscribe('user-2', t, 'secret')).toBe(false);
    expect(verifyUnsubscribe('user-1', t, 'other')).toBe(false);
  });
});
