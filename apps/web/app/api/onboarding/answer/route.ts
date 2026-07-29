// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/onboarding/answer
 *
 * Persists the user's response for one onboarding step. Body shape:
 *
 *   {
 *     step:   "role" | "goal" | "channel" | ...,
 *     answer: any  // anything JSON-serialisable; merged under
 *                  // profiles.onboarding_data[step]
 *   }
 *
 * Effect:
 *   - profiles.onboarding_data = onboarding_data || jsonb_build_object(step, answer)
 *   - profiles.onboarding_step = step  (latest completed step label)
 *
 * Does NOT mark the user as fully onboarded - that's POST
 * /api/onboarding/complete, called by the last screen of the flow.
 *
 * Returns 401 if unauthenticated, 400 if body is malformed.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Body = {
  step?: unknown;
  answer?: unknown;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const step = typeof body.step === 'string' ? body.step.trim() : '';
  if (!step) {
    return NextResponse.json(
      { error: 'step (string) is required' },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9_-]{1,64}$/i.test(step)) {
    return NextResponse.json(
      { error: 'step must be 1-64 chars of [a-z0-9_-]' },
      { status: 400 },
    );
  }
  if (body.answer === undefined) {
    return NextResponse.json(
      { error: 'answer is required (use null to clear)' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read existing answers, merge in the new step, write back. Doing
  // this in two round-trips (rather than a Postgres jsonb_set) avoids
  // needing an RPC and keeps the surface small. profiles is one row
  // per user so the race window is negligible.
  const { data: row, error: readErr } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const existing =
    (row?.onboarding_data && typeof row.onboarding_data === 'object'
      ? (row.onboarding_data as Record<string, unknown>)
      : {}) ?? {};
  const merged = { ...existing, [step]: body.answer };

  const { error: writeErr } = await supabase
    .from('profiles')
    .update({
      onboarding_data: merged,
      onboarding_step: step,
    })
    .eq('id', user.id);
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, step, answers: merged });
}
