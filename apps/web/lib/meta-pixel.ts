// Meta (Facebook/Instagram) pixel helpers. The loader lives in
// components/MetaPixel.tsx; these are safe no-ops on the server or when the
// pixel is blocked.

export const META_PIXEL_ID = '1604725698100992';

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

function fbq(): Fbq | undefined {
  if (typeof window === 'undefined') return undefined;
  return typeof window.fbq === 'function' ? window.fbq : undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** CompleteRegistration for accounts created in the last 24h, once per user. */
export function trackMetaSignupOnce(user: { id: string; created_at?: string | null }, now = Date.now()): boolean {
  const f = fbq();
  if (!f || !user.created_at) return false;
  if (now - Date.parse(user.created_at) > DAY_MS) return false;
  const key = `am_fbq_signup_${user.id}`;
  try {
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, '1');
  } catch {
    // storage blocked: eventID still dedupes on Meta's side
  }
  f('track', 'CompleteRegistration', {}, { eventID: `signup_${user.id}` });
  return true;
}

/** Stripe success return: plans -> Subscribe, PAYG packs -> custom PaygPurchase. */
export function trackMetaCheckoutReturn(params: URLSearchParams): void {
  if (params.get('status') !== 'success') return;
  const f = fbq();
  if (!f) return;
  const sessionId = params.get('session_id');
  const opts = sessionId ? { eventID: sessionId } : undefined;
  if (params.get('type') === 'payg') f('trackCustom', 'PaygPurchase', { currency: 'USD' }, opts);
  else f('track', 'Subscribe', { currency: 'USD' }, opts);
}
