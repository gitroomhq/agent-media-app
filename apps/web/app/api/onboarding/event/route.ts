// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/onboarding/event
 *
 * Logs one row into public.onboarding_events for the current user.
 * Used by each step page to record "entered" on mount and
 * "completed" / "skipped" when navigating away. Lets us build a real
 * funnel and answer "where do users drop off?".
 *
 * Body:
 *   {
 *     step:   "welcome" | "showcase" | "product" | "source" | "goal" |
 *             "tool" | "preparing" | "completed",
 *     event?: "entered" | "completed" | "skipped"        (default: "entered")
 *     data?:  Record<string, unknown>                    (default: {})
 *   }
 *
 * As a side effect, we also update profiles.onboarding_step to the
 * latest non-completion step the user has seen, so server-side
 * resume logic can route them to the right page on a refresh.
 *
 * Returns 401 if unauth, 400 on bad input, 500 on db error.
 * Best-effort: callers should NOT await this in the user-blocking
 * path - fire-and-forget from useEffect is fine.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Body = {
  step?: unknown;
  event?: unknown;
  data?: unknown;
};

const VALID_STEPS = new Set([
  'welcome',
  'showcase',
  'product',
  'source',
  'goal',
  'tool',
  'preparing',
  'completed',
]);
const VALID_EVENTS = new Set(['entered', 'completed', 'skipped']);

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const step = typeof body.step === 'string' ? body.step.trim() : '';
  if (!VALID_STEPS.has(step)) {
    return NextResponse.json(
      { error: `step must be one of ${Array.from(VALID_STEPS).join(', ')}` },
      { status: 400 },
    );
  }
  const event =
    typeof body.event === 'string' && VALID_EVENTS.has(body.event)
      ? (body.event as string)
      : 'entered';
  const data =
    body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error: insertErr } = await supabase
    .from('onboarding_events')
    .insert({
      user_id: user.id,
      step,
      event,
      data,
    });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Mirror the latest "entered" step into profiles so the server can
  // resume mid-flow without scanning the events table on every page
  // load. We do NOT update for the "completed" pseudo-step here
  // (that's what profiles.onboarded_at is for, set by
  // /api/onboarding/complete).
  if (event === 'entered' && step !== 'completed') {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ onboarding_step: step })
      .eq('id', user.id);
    if (updateErr) {
      // Non-fatal: the event row is already written. Log + continue.
      console.error('[onboarding/event] mirror to profiles failed:', updateErr.message);
    }
  }

  return NextResponse.json({ ok: true });
}
