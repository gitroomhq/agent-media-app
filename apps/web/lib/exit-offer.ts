// Copyright 2026 agent-media contributors. Apache-2.0 license.
// When to show the exit-intent offer on the plan pages.

export const EXIT_OFFER_IDLE_MS = 25_000;
export const EXIT_OFFER_SEEN_KEY = 'am_exit_offer_seen';

type Signal =
  | { kind: 'mouseout'; clientY: number; toElement: unknown }
  | { kind: 'idle' }
  | { kind: 'logout' };

export function exitIntentFrom(s: Signal & { alreadyShown: boolean; busy: boolean }): boolean {
  if (s.alreadyShown || s.busy) return false;
  if (s.kind === 'mouseout') return s.toElement == null && s.clientY <= 0;
  return true;
}
