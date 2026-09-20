// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
const { GET } = await import('../app/auth/callback/route');
beforeEach(() => auth.exchangeCodeForSession.mockResolvedValue({ error: null }));
it.each(['/dashboard/skills/portrait?mode=image', '/oauth/consent?authorization_id=abc', '/device?code=123'])('returns to %s after OAuth', async destination => {
  const response = await GET(new Request('https://app.test/auth/callback?code=test&redirect=' + encodeURIComponent(destination)));
  expect(response.headers.get('location')).toBe('https://app.test' + destination);
});
it('keeps the destination when sign-in needs retrying', async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: { message: 'expired' } });
  const response = await GET(new Request('https://app.test/auth/callback?code=test&redirect=' + encodeURIComponent('/dashboard/skills/portrait?mode=image')));
  const location = new URL(response.headers.get('location')!);
  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('redirect')).toBe('/dashboard/skills/portrait?mode=image');
});
