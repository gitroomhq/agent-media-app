// TikTok Ads pixel helpers. The loader lives in components/TikTokPixel.tsx;
// these are safe no-ops on the server or when the pixel is blocked.

export const TIKTOK_PIXEL_ID = 'DB0BOCRC77UA626ECF60';

type Ttq = { page: () => void; track: (...args: unknown[]) => void };

declare global {
  interface Window {
    ttq?: Ttq;
  }
}

function ttq(): Ttq | undefined {
  if (typeof window === 'undefined') return undefined;
  return typeof window.ttq?.track === 'function' ? window.ttq : undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * CompleteRegistration for a brand-new account. OTP login auto-creates
 * accounts, so "new" means created in the last 24h; existing users who
 * hit onboarding later are skipped. Deduped per user in localStorage and
 * by event_id on TikTok's side.
 */
export function trackSignupOnce(user: { id: string; created_at?: string | null }, now = Date.now()): boolean {
  const t = ttq();
  if (!t || !user.created_at) return false;
  if (now - Date.parse(user.created_at) > DAY_MS) return false;
  const key = `am_ttq_signup_${user.id}`;
  try {
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, '1');
  } catch {
    // storage blocked: event_id still dedupes on TikTok's side
  }
  t.track('CompleteRegistration', {}, { event_id: `signup_${user.id}` });
  return true;
}

/** Stripe success return: plans -> Subscribe, PAYG packs -> CompletePayment. */
export function trackCheckoutReturn(params: URLSearchParams): void {
  if (params.get('status') !== 'success') return;
  const t = ttq();
  if (!t) return;
  const sessionId = params.get('session_id');
  const event = params.get('type') === 'payg' ? 'CompletePayment' : 'Subscribe';
  t.track(event, { currency: 'USD' }, sessionId ? { event_id: sessionId } : undefined);
}
