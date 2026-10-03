import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIKTOK_PIXEL_ID, trackCheckoutReturn, trackSignupOnce } from '../lib/tiktok-pixel';

const HOUR = 3_600_000;
const now = Date.parse('2026-10-03T12:00:00Z');

function stubWindow() {
  const track = vi.fn();
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    ttq: { page: vi.fn(), track },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  return { track, store };
}

afterEach(() => vi.unstubAllGlobals());

describe('tiktok pixel', () => {
  it('uses the agent-media pixel id', () => {
    expect(TIKTOK_PIXEL_ID).toBe('DB0BOCRC77UA626ECF60');
  });

  it('fires CompleteRegistration once for a fresh account', () => {
    const { track } = stubWindow();
    const user = { id: 'u1', created_at: new Date(now - HOUR).toISOString() };
    expect(trackSignupOnce(user, now)).toBe(true);
    expect(trackSignupOnce(user, now)).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('CompleteRegistration', {}, { event_id: 'signup_u1' });
  });

  it('ignores accounts older than a day (existing users finishing onboarding)', () => {
    const { track } = stubWindow();
    expect(trackSignupOnce({ id: 'old', created_at: new Date(now - 30 * HOUR).toISOString() }, now)).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('maps the Stripe success return to Subscribe or CompletePayment, deduped by session', () => {
    const { track } = stubWindow();
    trackCheckoutReturn(new URLSearchParams('status=success&session_id=cs_1'));
    trackCheckoutReturn(new URLSearchParams('status=success&type=payg&session_id=cs_2'));
    trackCheckoutReturn(new URLSearchParams('status=cancel'));
    expect(track.mock.calls).toEqual([
      ['Subscribe', { currency: 'USD' }, { event_id: 'cs_1' }],
      ['CompletePayment', { currency: 'USD' }, { event_id: 'cs_2' }],
    ]);
  });

  it('is a no-op when the pixel was blocked', () => {
    vi.stubGlobal('window', {});
    expect(() => trackCheckoutReturn(new URLSearchParams('status=success'))).not.toThrow();
    expect(trackSignupOnce({ id: 'u', created_at: new Date(now).toISOString() }, now)).toBe(false);
  });
});

describe('app CSP lets the TikTok pixel run', () => {
  it('allows the SDK script and its beacons', async () => {
    const { SECURITY_HEADERS } = await import('../lib/security-headers');
    const csp = Object.fromEntries(
      SECURITY_HEADERS['Content-Security-Policy'].split('; ').map((d) => [d.split(' ')[0], d]),
    );
    expect(csp['script-src']).toContain('https://analytics.tiktok.com');
    expect(csp['connect-src']).toContain('https://analytics.tiktok.com');
    expect(csp['connect-src']).toContain('https://analytics-ipv6.tiktokw.us');
    expect(csp['img-src']).toContain('https://analytics.tiktok.com');
  });
});
