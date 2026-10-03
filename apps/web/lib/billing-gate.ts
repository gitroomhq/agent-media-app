// Copyright 2026 agent-media contributors. Apache-2.0 license.
// A failed renewal (past_due/unpaid) locks the app until the card is fixed.
// Billing and settings stay reachable so the user can always pay.

export const UPDATE_CARD_PATH = '/billing/update-card';
const BLOCKED = new Set(['past_due', 'unpaid']);
const ALWAYS_OPEN = ['/billing', '/settings'];

export function pastDueRedirect(status: string | null | undefined, pathname: string): string | null {
  if (!status || !BLOCKED.has(status)) return null;
  if (ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return UPDATE_CARD_PATH;
}
