// Copyright 2026 agent-media contributors. Apache-2.0 license.
const TTL = 24 * 60 * 60 * 1000;
const LIMIT = 64 * 1024;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DraftValues = Record<string, unknown>;
export function draftKey(userId: string, slug: string) {
  return 'am:draft:v1:' + encodeURIComponent(userId) + ':' + encodeURIComponent(slug);
}
export function readDraft(storage: StorageLike, key: string, fields: string[], now = Date.now()): DraftValues | null {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > LIMIT) return null;
    const draft = JSON.parse(raw);
    if (!Number.isFinite(draft.savedAt) || draft.savedAt > now || now - draft.savedAt >= TTL || !draft.values || typeof draft.values !== 'object' || Array.isArray(draft.values)) {
      storage.removeItem(key); return null;
    }
    return Object.fromEntries(fields.filter(field => Object.hasOwn(draft.values, field)).map(field => [field, draft.values[field]]));
  } catch { return null; }
}
export function saveDraft(storage: StorageLike, key: string, values: DraftValues, now = Date.now()): boolean {
  try {
    const raw = JSON.stringify({ savedAt: now, values });
    if (raw.length > LIMIT) return false;
    storage.setItem(key, raw); return true;
  } catch { return false; }
}
