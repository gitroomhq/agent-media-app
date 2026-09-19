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
