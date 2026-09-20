import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const auth = vi.hoisted(() => ({ updateSession: vi.fn(), checkSubscription: vi.fn(), checkOnboarded: vi.fn() }));
vi.mock('@/lib/supabase/middleware', () => auth);
vi.stubEnv('ENFORCE_ONBOARDING', 'true');
vi.stubEnv('SUBSCRIPTION_REDIRECT', '/onboarding/plan');
const { middleware } = await import('../middleware');
beforeEach(() => {
  vi.clearAllMocks();
  auth.updateSession.mockResolvedValue({ user: { id: 'owner' }, supabase: {}, supabaseResponse: NextResponse.next() });
  auth.checkSubscription.mockResolvedValue(false); auth.checkOnboarded.mockResolvedValue(false);
});
describe('account setup and recovery access', () => {
  it.each(['/billing', '/billing/success', '/settings', '/settings/api-keys'])('lets a new signed-in user reach %s without a plan or onboarding', async (path) => {
    const response = await middleware(new NextRequest('https://app.agent-media.ai'+path));
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
    expect(auth.checkSubscription).not.toHaveBeenCalled(); expect(auth.checkOnboarded).not.toHaveBeenCalled();
  });
  it.each(['/billing', '/settings', '/settings/api-keys'])('still requires sign-in for %s', async (path) => {
    auth.updateSession.mockResolvedValue({ user: null, supabase: {}, supabaseResponse: NextResponse.next() });
    const response = await middleware(new NextRequest('https://app.agent-media.ai'+path));
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login'); expect(location.searchParams.get('redirect')).toBe(path);
  });
  it('keeps onboarding and subscription gates on generation/dashboard routes', async () => {
    const request = new NextRequest('https://app.agent-media.ai/dashboard');
    expect(new URL((await middleware(request)).headers.get('location')!).pathname).toBe('/onboarding');
    auth.checkOnboarded.mockResolvedValue(true);
    expect(new URL((await middleware(request)).headers.get('location')!).pathname).toBe('/onboarding/plan');
    auth.checkSubscription.mockResolvedValue(true);
    expect((await middleware(request)).status).toBe(200);
  });
});

describe('creation continuation through gates', () => {
  const target = '/dashboard/skills/example?mode=image&ref=one%20two';
  it('preserves the entire destination through unauthenticated login', async () => {
    auth.updateSession.mockResolvedValue({ user: null, supabase: {}, supabaseResponse: NextResponse.next() });
    const response = await middleware(new NextRequest('https://app.agent-media.ai' + target));
    expect(new URL(response.headers.get('location')!).searchParams.get('redirect')).toBe(target);
  });
  it.each([false, true])('remembers the destination when onboarded=%s without bypassing the paywall', async onboarded => {
    auth.checkOnboarded.mockResolvedValue(onboarded);
    const response = await middleware(new NextRequest('https://app.agent-media.ai' + target));
    const saved = response.cookies.get('am_creation_return');
    expect(saved?.httpOnly).toBe(true);
    expect(saved?.secure).toBe(true);
    expect(JSON.parse(saved!.value)).toMatchObject({ target, userId: 'owner' });
    expect(new URL(response.headers.get('location')!).pathname).toBe(onboarded ? '/onboarding/plan' : '/onboarding');
  });
  it('returns a subscribed user to their saved skill and query', async () => {
    auth.checkSubscription.mockResolvedValue(true);
    const saved = JSON.stringify({ target, userId: 'owner', expiresAt: Date.now() + 60000 });
    const response = await middleware(new NextRequest('https://app.agent-media.ai/onboarding/plan', { headers: { cookie: 'am_creation_return=' + encodeURIComponent(saved) } }));
    expect(response.headers.get('location')).toBe('https://app.agent-media.ai' + target);
  });
  it('does not use another account’s continuation', async () => {
    auth.checkSubscription.mockResolvedValue(true);
    const saved = JSON.stringify({ target, userId: 'another-user', expiresAt: Date.now() + 60000 });
    const response = await middleware(new NextRequest('https://app.agent-media.ai/onboarding/plan', { headers: { cookie: 'am_creation_return=' + encodeURIComponent(saved) } }));
    expect(response.headers.get('location')).toBe('https://app.agent-media.ai/dashboard');
  });
  it('carries refreshed session cookies onto gate redirects', async () => {
    const session = NextResponse.next();
    session.cookies.set('session-test', 'refreshed', { httpOnly: true });
    auth.updateSession.mockResolvedValue({ user: { id: 'owner' }, supabase: {}, supabaseResponse: session });
    const response = await middleware(new NextRequest('https://app.agent-media.ai' + target));
    expect(response.cookies.get('session-test')?.value).toBe('refreshed');
  });
  it('does not overwrite the return destination on link prefetch', async () => {
    const response = await middleware(new NextRequest('https://app.agent-media.ai' + target, { headers: { 'next-router-prefetch': '1' } }));
    expect(response.cookies.get('am_creation_return')).toBeUndefined();
  });
  it('rejects external login redirects for already authenticated users', async () => {
    const response = await middleware(new NextRequest('https://app.agent-media.ai/login?redirect=' + encodeURIComponent('/\\evil.test')));
    expect(response.headers.get('location')).toBe('https://app.agent-media.ai/dashboard');
  });
});

it('consumes a saved continuation only after the protected destination is accessible', async () => {
  auth.checkSubscription.mockResolvedValue(true); auth.checkOnboarded.mockResolvedValue(true);
  const target = '/dashboard/skills/portrait';
  const saved = JSON.stringify({ target, userId: 'owner', expiresAt: Date.now() + 60000 });
  const request = new NextRequest('https://app.agent-media.ai' + target, { headers: { cookie: 'am_creation_return=' + encodeURIComponent(saved) } });
  const response = await middleware(request);
  expect(response.status).toBe(200);
  expect(response.cookies.get('am_creation_return')?.maxAge).toBe(0);
});
