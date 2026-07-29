// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/dashboard/wizard-session/[sid]
 *
 * Resolves a Content Machine wizard session into its 1–3 generation_jobs
 * (sheet, storyboard, video) so the dashboard can rehydrate after a
 * refresh. Authenticates via the user's Supabase session — RLS scopes
 * the lookup to the requester's own jobs.
 *
 * Returns:
 *   {
 *     session_id: string,
 *     sheet:       Job | null,
 *     storyboard:  Job | null,
 *     video:       Job | null,
 *   }
 *
 * Job shape mirrors api-v2's /v1/videos/:id where it overlaps:
 *   { id, status, output_media_url, error_message, progress_detail,
 *     input_params, created_at, updated_at }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Params = { params: Promise<{ sid: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { sid } = await params;
  if (!sid || !UUID_RE.test(sid)) {
    return NextResponse.json(
      { error: { code: 'invalid_session_id', message: 'Session id must be a UUID' } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  // RLS already restricts this to the caller's own jobs, but we add an
  // explicit user_id filter for defense-in-depth.
  const { data, error } = await supabase
    .from('generation_jobs')
    .select('id, operation, status, output_media_url, error_message, error_code, progress_detail, input_params, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('input_params->>session_id', sid)
    .in('operation', ['character_sheet', 'character_storyboard', 'character_video'])
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { code: 'db_error', message: error.message } },
      { status: 500 },
    );
  }

  // Map the (up to 3) rows into named slots. If a session_id was reused
  // accidentally and produced two jobs of the same operation, the
  // earliest one wins (deterministic).
  const slot: Record<'character_sheet' | 'character_storyboard' | 'character_video', unknown | null> = {
    character_sheet: null,
    character_storyboard: null,
    character_video: null,
  };
  for (const row of data ?? []) {
    const op = row.operation as keyof typeof slot;
    if (slot[op] == null) slot[op] = row;
  }

  return NextResponse.json(
    {
      session_id: sid,
      sheet: slot.character_sheet,
      storyboard: slot.character_storyboard,
      video: slot.character_video,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
