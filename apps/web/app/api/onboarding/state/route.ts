// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/onboarding/state
 *
 * Returns the current user's onboarding snapshot so the UI can resume
 * mid-flow if the user refreshes / re-enters /onboarding:
 *
 *   {
 *     onboarded_at:    string | null,
 *     onboarding_step: string | null,  // last "entered" step
 *     onboarding_data: Record<string, unknown>
 *   }
 *
 * 401 if unauth. No side effects.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarded_at, onboarding_step, onboarding_data')
    .eq('id', user.id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    onboarded_at: data?.onboarded_at ?? null,
    onboarding_step: data?.onboarding_step ?? null,
    onboarding_data: data?.onboarding_data ?? {},
  });
}
