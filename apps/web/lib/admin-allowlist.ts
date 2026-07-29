// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Admin access allowlist. Hardcoded to exactly the people allowed into the
 * /dashboard/admin panel and the /api/admin/* routes. "Only me and Nevo."
 *
 * Intentionally NOT env-driven — access is explicit and reviewed in code.
 */
export const ADMIN_EMAILS = new Set<string>(
  [
    'yuvalsuede@gmail.com',
    'nevo@postiz.com',
  ].map((e) => e.toLowerCase()),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}
