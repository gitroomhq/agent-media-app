import { afterEach, describe, expect, it, vi } from 'vitest';
import { META_PIXEL_ID, trackMetaCheckoutReturn, trackMetaSignupOnce } from '../lib/meta-pixel';

const HOUR = 3_600_000;
const now = Date.parse('2026-10-03T12:00:00Z');

function stubWindow() {
  const fbq = vi.fn();
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    fbq,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  return { fbq, store };
}

afterEach(() => vi.unstubAllGlobals());

describe('meta pixel', () => {
  it('uses the agent-media.ai dataset', () => {
    expect(META_PIXEL_ID).toBe('1604725698100992');
  });

  it('fires CompleteRegistration once for a fresh account, with an eventID for dedupe', () => {
    const { fbq } = stubWindow();
    const user = { id: 'u1', created_at: new Date(now - HOUR).toISOString() };
    expect(trackMetaSignupOnce(user, now)).toBe(true);
    expect(trackMetaSignupOnce(user, now)).toBe(false);
    expect(fbq.mock.calls).toEqual([['track', 'CompleteRegistration', {}, { eventID: 'signup_u1' }]]);
  });

  it('keeps its own dedupe key, independent of the TikTok one', () => {
    const { fbq, store } = stubWindow();
    store.set('am_ttq_signup_u2', '1');
    expect(trackMetaSignupOnce({ id: 'u2', created_at: new Date(now).toISOString() }, now)).toBe(true);
    expect(fbq).toHaveBeenCalledTimes(1);
  });

  it('ignores accounts older than a day', () => {
    const { fbq } = stubWindow();
    expect(trackMetaSignupOnce({ id: 'old', created_at: new Date(now - 30 * HOUR).toISOString() }, now)).toBe(false);
    expect(fbq).not.toHaveBeenCalled();
  });

  it('maps the Stripe success return: plans to Subscribe, PAYG packs to a custom event', () => {
    const { fbq } = stubWindow();
    trackMetaCheckoutReturn(new URLSearchParams('status=success&session_id=cs_1'));
    trackMetaCheckoutReturn(new URLSearchParams('status=success&type=payg&session_id=cs_2'));
    trackMetaCheckoutReturn(new URLSearchParams('status=cancel'));
    expect(fbq.mock.calls).toEqual([
      ['track', 'Subscribe', { currency: 'USD' }, { eventID: 'cs_1' }],
      ['trackCustom', 'PaygPurchase', { currency: 'USD' }, { eventID: 'cs_2' }],
    ]);
  });

  it('is a no-op when the pixel was blocked', () => {
    vi.stubGlobal('window', {});
    expect(() => trackMetaCheckoutReturn(new URLSearchParams('status=success'))).not.toThrow();
    expect(trackMetaSignupOnce({ id: 'u', created_at: new Date(now).toISOString() }, now)).toBe(false);
  });
});

describe('app CSP lets the Meta pixel run', () => {
  it('allows fbevents.js and its beacons', async () => {
    const { SECURITY_HEADERS } = await import('../lib/security-headers');
    const csp = Object.fromEntries(
      SECURITY_HEADERS['Content-Security-Policy'].split('; ').map((d) => [d.split(' ')[0], d]),
    );
    expect(csp['script-src']).toContain('https://connect.facebook.net');
    expect(csp['connect-src']).toContain('https://www.facebook.com');
    expect(csp['img-src']).toContain('https://www.facebook.com');
  });
});
