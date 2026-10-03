// Copyright 2026 agent-media contributors. Apache-2.0 license.
// Which lifecycle email (if any) a user is due right now. Pure: the cron
// route gathers the facts, this decides, a ledger keeps it to once per kind.

export type EmailKind = 'welcome' | 'nudge_d2' | 'nudge_d5' | 'trial_ending' | 'payment_failed' | 'winback_d3';

export interface UserFacts {
  createdAt: number; // ms
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'expired' | null; // null = never subscribed
  trialEndsAt: number | null;
  canceledAt: number | null;
  sent: EmailKind[];
  unsubscribed: boolean;
}

/** Older signups were covered by the one-time broadcast; the sequence starts here. */
export const LIFECYCLE_START = Date.parse('2026-10-03T10:00:00Z');

const H = 3_600_000;

export function dueEmail(u: UserFacts, now: number): EmailKind | null {
  const once = (k: EmailKind) => (u.sent.includes(k) ? null : k);

  // Billing notice is transactional: sent even to marketing-unsubscribed users.
  if (u.status === 'past_due') return once('payment_failed');
  if (u.unsubscribed) return null;

  if (u.status === 'trialing') {
    if (u.trialEndsAt && u.trialEndsAt - now > 0 && u.trialEndsAt - now <= 24 * H) return once('trial_ending');
    return null;
  }
  if (u.status === 'canceled' || u.status === 'expired') {
    if (u.canceledAt && now - u.canceledAt >= 72 * H && now - u.canceledAt < 120 * H) return once('winback_d3');
    return null;
  }
  if (u.status !== null) return null; // paying

  if (u.createdAt < LIFECYCLE_START) return null;
  const age = now - u.createdAt;
  if (age >= 120 * H && age < 168 * H) return once('nudge_d5');
  if (age >= 48 * H && age < 72 * H) return once('nudge_d2');
  if (age >= 0.5 * H && age < 48 * H) return once('welcome');
  return null;
}
