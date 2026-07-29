// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Admin access allowlist for the /dashboard/admin panel and /api/admin/* routes.
 *
 * Configured, not hardcoded: set ADMIN_EMAILS to a comma-separated list.
 * The default is EMPTY — a fresh deployment grants admin to nobody until the
 * operator opts someone in. That fail-closed default matters for self-hosters:
 * shipping a populated allowlist would hand the upstream maintainers admin on
 * every downstream install.
 *
 *   ADMIN_EMAILS=alice@example.com,bob@example.com
 */
export const ADMIN_EMAILS = new Set<string>(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}
