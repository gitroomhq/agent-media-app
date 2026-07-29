// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/onboarding/complete
 *
 * Marks the current authenticated user as onboarded by stamping
 * profiles.onboarded_at = now(). Idempotent: subsequent calls are
 * a no-op once the timestamp is set (we don't overwrite). Returns
 * 401 if the request is unauthenticated.
 *
 * Called by the /onboarding flow's final step. After the row is
 * updated the middleware will stop redirecting the user back here.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  // Only stamp if not already set so we keep the original onboarding
  // completion time for analytics.
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('onboarded_at', null);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
