// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encodeCreationReturn } from '../lib/navigation/return-to';
const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }));
const { GET, POST } = await import('../app/api/onboarding/resume/route');
beforeEach(() => { auth.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } }); });
describe('saved creation destination endpoint', () => {
  it('requires sign-in to read a destination', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(new NextRequest('https://app.test/api/onboarding/resume'))).status).toBe(401);
  });
  it('reads only this user’s saved destination with no caching', async () => {
    const saved = encodeCreationReturn('/dashboard/skills/portrait?mode=image', 'owner');
    const response = await GET(new NextRequest('https://app.test/api/onboarding/resume', { headers: { cookie: 'am_creation_return=' + encodeURIComponent(saved) } }));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ destination: '/dashboard/skills/portrait?mode=image' });
  });
  it('stores only a safe same-origin destination with secure cookie attributes', async () => {
    const response = await POST(new NextRequest('https://app.test/api/onboarding/resume', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ destination: '/dashboard/skills/portrait' }) }));
    expect(response.status).toBe(200);
    expect(response.cookies.get('am_creation_return')).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400 });
  });
  it.each([['https://evil.test', '/dashboard', 403], ['https://app.test', '//evil.test', 400], ['https://app.test', '/billing', 400]])('rejects invalid origin/destination', async (origin, destination, status) => {
    const response = await POST(new NextRequest('https://app.test/api/onboarding/resume', { method: 'POST', headers: { origin: String(origin) }, body: JSON.stringify({ destination }) }));
    expect(response.status).toBe(status);
    expect(response.cookies.get('am_creation_return')).toBeUndefined();
  });
});
