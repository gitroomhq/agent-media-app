// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/onboarding/reset
 *
 * Wipes the current user's onboarding state so the next time they
 * hit any gated route, middleware routes them to /onboarding for a
 * fresh run-through.
 *
 * Effect on profiles:
 *   onboarded_at    -> null
 *   onboarding_step -> null
 *   onboarding_data -> '{}'
 *
 * Plus DELETE FROM onboarding_events WHERE user_id = <self>.
 *
 * Subscription state, generation history, etc are NOT touched.
 *
 * Intended for development / "I want to redo the flow" use cases.
 * Production users go through this exactly once on first signup.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      onboarded_at: null,
      onboarding_step: null,
      onboarding_data: {},
    })
    .eq('id', user.id);
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // Best-effort: clear the events log too so the funnel doesn't
  // double-count multiple resets. Not fatal if it fails.
  const { error: eventsErr } = await supabase
    .from('onboarding_events')
    .delete()
    .eq('user_id', user.id);
  if (eventsErr) {
    console.error('[onboarding/reset] events cleanup failed:', eventsErr.message);
  }

  return NextResponse.json({ ok: true });
}
