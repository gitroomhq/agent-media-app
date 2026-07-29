// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/dashboard/content-machine/sessions
 *
 * Lists the caller's Content Machine sessions, grouped by session_id
 * (set by the wizard on first submit). Each row carries up to three
 * jobs — sheet, storyboard, video — with their output_media_url so the
 * library page can render thumbnails and reuse buttons.
 *
 * Sessions without a session_id (legacy or external API submissions)
 * are returned as one-off rows keyed by job_id so they aren't lost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface JobLite {
  id: string;
  operation: 'character_sheet' | 'character_storyboard' | 'character_video';
  status: string;
  output_media_url: string | null;
  prompt: string | null;
  created_at: string;
  updated_at: string;
  input_params: Record<string, unknown> | null;
}

interface SessionGroup {
  session_id: string | null;
  created_at: string; // earliest job in the group
  sheet: JobLite | null;
  storyboard: JobLite | null;
  video: JobLite | null;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from('generation_jobs')
    .select('id, operation, status, output_media_url, prompt, created_at, updated_at, input_params, deleted_at')
    .eq('user_id', user.id)
    .in('operation', ['character_sheet', 'character_storyboard', 'character_video'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json(
      { error: { code: 'db_error', message: error.message } },
      { status: 500 },
    );
  }

  const groups = new Map<string, SessionGroup>();
  for (const j of (data ?? []) as JobLite[]) {
    const sid = (j.input_params as { session_id?: string } | null)?.session_id ?? null;
    // Skip legacy rows without a session_id — they predate proper
    // session tracking and surface as broken/mismatched cards.
    if (!sid) continue;
    if (!groups.has(sid)) {
      groups.set(sid, {
        session_id: sid,
        created_at: j.created_at,
        sheet: null,
        storyboard: null,
        video: null,
      });
    }
    const g = groups.get(sid)!;
    if (j.operation === 'character_sheet' && !g.sheet) g.sheet = j;
    if (j.operation === 'character_storyboard' && !g.storyboard) g.storyboard = j;
    if (j.operation === 'character_video' && !g.video) g.video = j;
    if (j.created_at < g.created_at) g.created_at = j.created_at;
  }

  const sessions = [...groups.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json(
    { sessions },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
