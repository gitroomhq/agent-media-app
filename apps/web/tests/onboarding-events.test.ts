import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STEPS, parseOnboardingEvent } from '../lib/onboarding/events';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), insert: vi.fn(), update: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));
const { POST } = await import('../app/api/onboarding/event/route');
const { logOnboardingEvent } = await import('../lib/onboarding/log-event');
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => ({ insert: mocks.insert, update: mocks.update }) });
});
const request = (body: unknown) => new Request('https://app.test/api/onboarding/event', { method: 'POST', body: JSON.stringify(body) });
describe('shared onboarding contract', () => {
  it.each(ONBOARDING_STEPS)('accepts and stores %s for the authenticated owner', async (step) => {
    const response = await POST(request({ step, user_id: 'other' }));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: 'owner', step, event: 'entered', data: {} });
  });
  it.each(['checkout_started', 'checkout_ready', 'checkout_failed'])('records %s without claiming payment or changing entitlements', async (event) => {
    expect((await POST(request({ step: 'plan', event, data: { tier: 'starter' } }))).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: 'owner', step: 'plan', event, data: { tier: 'starter' } });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([null, [], { step: 'unknown' }, { step: 'plan', event: 'paid' }, { step: 'tool', event: 'checkout_ready' }])('rejects invalid input without writing it', async (body) => {
    expect(parseOnboardingEvent(body).error).toBeTruthy();
    expect((await POST(request(body))).status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('rejects anonymous ingestion', async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
    expect((await POST(request({ step: 'plan' }))).status).toBe(401); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('keeps database details out of the response', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '08006', message: 'private detail' } });
    const response = await POST(request({ step: 'plan' })); expect(response.status).toBe(500); expect(await response.text()).not.toContain('private detail');
  });
  it.each(['http', 'network'])('reports %s delivery failure without rejecting checkout', async (failure) => {
    const fetchMock = vi.fn();
    if (failure === 'http') fetchMock.mockResolvedValue(new Response('{}', { status: 400 }));
    else fetchMock.mockRejectedValue(new Error('private payload'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(logOnboardingEvent('plan', 'entered', { private: 'sensitive' })).resolves.toBeUndefined();
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain('sensitive');
  });
});
