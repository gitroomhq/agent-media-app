// Copyright 2026 agent-media contributors. Apache-2.0 license.
/** Recognize only the configured API's non-redirecting temporary-image gateway.
 * This is an additional trusted image source, never a general URL allowlist. */
export function isTemporaryImageUrl(raw: string, apiBase = 'https://api.agent-media.ai'): boolean {
  try {
    const base = new URL(apiBase);
    const url = new URL(raw);
    const secure =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    const prefix = base.pathname.replace(/\/+$/, '');
    const path = url.pathname.slice(prefix.length);
    return (
      secure &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.origin === base.origin &&
      url.pathname.startsWith(`${prefix}/`) &&
      /^\/v1\/uploads\/temporary\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/image$/i.test(
        path,
      ) &&
      /^[a-f0-9]{64}$/.test(url.searchParams.get('token') ?? '') &&
      [...url.searchParams.keys()].length === 1
    );
  } catch {
    return false;
  }
}
