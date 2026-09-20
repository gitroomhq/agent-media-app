// Copyright 2026 agent-media contributors. Apache-2.0 license.
const LOCAL_ORIGIN = 'https://local.invalid';
const ALLOWED = ['/dashboard', '/create', '/gallery', '/actors', '/billing', '/settings', '/docs', '/device', '/subscribe', '/onboarding', '/oauth/consent', '/jobs', '/integrations'];
export const RETURN_COOKIE = 'am_creation_return';
export const RETURN_TTL_SECONDS = 24 * 60 * 60;

/** Local navigation only; never accept a scheme, network path or encoded path escape. */
export function safeReturnTo(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    const decoded = decodeURIComponent(url.pathname);
    if (url.origin !== LOCAL_ORIGIN || /[\\\u0000-\u0020]/.test(decoded) || decoded.startsWith('//') || decoded.split('/').some(s => s === '.' || s === '..')) return fallback;
    if (!ALLOWED.some(p => decoded === p || decoded.startsWith(p + '/'))) return fallback;
    if (url.searchParams.has('_rsc')) url.searchParams.delete('_rsc');
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function creationReturnTo(value: unknown): string | null {
  const target = safeReturnTo(value, '');
  if (!target) return null;
  const path = new URL(target, LOCAL_ORIGIN).pathname;
  return (path === '/gallery' || path.startsWith('/gallery/') ||
    (path === '/dashboard' || path.startsWith('/dashboard/')) &&
    path !== '/dashboard/billing' && !path.startsWith('/dashboard/billing/')) ? target : null;
}

export function encodeCreationReturn(target: string, userId: string, now = Date.now()): string {
  return JSON.stringify({ target, userId, expiresAt: now + RETURN_TTL_SECONDS * 1000 });
}

export function readCreationReturn(value: string | undefined, userId: string, now = Date.now()): string | null {
  try {
    const data = JSON.parse(value ?? '');
    if (data.userId !== userId || !Number.isFinite(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + RETURN_TTL_SECONDS * 1000) return null;
    return creationReturnTo(data.target);
  } catch { return null; }
}
