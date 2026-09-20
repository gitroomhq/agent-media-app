// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { describe, expect, it } from 'vitest';
import { safeReturnTo, creationReturnTo, encodeCreationReturn, readCreationReturn, RETURN_TTL_SECONDS } from '../lib/navigation/return-to';
import { draftKey, readDraft, saveDraft } from '../lib/creation/draft';

describe('safe continuation destinations', () => {
  it.each(['/dashboard/skills/example?mode=image&ref=one%20two', '/device?code=123456', '/oauth/consent?authorization_id=abc', '/onboarding/plan'])('preserves local destination %s', path => expect(safeReturnTo(path)).toBe(path));
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/dashboard/../../evil', '/dashboard/%5cevil', '/dashboard%0aevil', 'javascript:alert(1)', '/not-allowed', '/dashboardish', '/dashboard/%zz'])('rejects unsafe destination %s', path => expect(safeReturnTo(path)).toBe('/dashboard'));
  it('does not save auth or billing loops as creation destinations', () => {
    for (const path of ['/login', '/onboarding/plan', '/billing', '/dashboard/billing?status=success', '/oauth/consent?authorization_id=x']) expect(creationReturnTo(path)).toBeNull();
  });
  it('keeps saved destinations account scoped and expiring', () => {
    const saved = encodeCreationReturn('/dashboard/skills/example?mode=image', 'owner', 1000);
    expect(readCreationReturn(saved, 'owner', 1001)).toBe('/dashboard/skills/example?mode=image');
    expect(readCreationReturn(saved, 'other', 1001)).toBeNull();
    expect(readCreationReturn(saved, 'owner', 1000 + RETURN_TTL_SECONDS * 1000)).toBeNull();
    expect(readCreationReturn('bad json', 'owner')).toBeNull();
    expect(readCreationReturn(encodeCreationReturn('//evil.test', 'owner'), 'owner')).toBeNull();
  });
});
describe('same-tab skill drafts', () => {
  function storage() {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  }
  it('restores only this account, skill and current form fields', () => {
    const store = storage(); const key = draftKey('owner', 'portrait');
    expect(saveDraft(store, key, { prompt: 'Keep this request', ratio: '9:16', removedField: true }, 1000)).toBe(true);
    expect(readDraft(store, key, ['prompt', 'ratio'], 1001)).toEqual({ prompt: 'Keep this request', ratio: '9:16' });
    expect(readDraft(store, draftKey('other', 'portrait'), ['prompt'], 1001)).toBeNull();
    expect(readDraft(store, draftKey('owner', 'video'), ['prompt'], 1001)).toBeNull();
    expect(readDraft(store, key, ['prompt'], 1000 + 86400000)).toBeNull();
    expect(store.getItem(key)).toBeNull();
  });
  it('does not break the form when storage is corrupt, oversized or unavailable', () => {
    const store = storage(); store.setItem('key', 'invalid');
    expect(readDraft(store, 'key', ['prompt'])).toBeNull();
    expect(saveDraft(store, 'key', { prompt: 'x'.repeat(65536) })).toBe(false);
    expect(saveDraft({ ...store, setItem() { throw Error('quota'); } }, 'key', { prompt: 'test' })).toBe(false);
  });
});

it('does not carry Next.js transport tokens into a user return URL', () => {
  expect(safeReturnTo('/dashboard/skills/portrait?mode=image&_rsc=internal')).toBe('/dashboard/skills/portrait?mode=image');
});
