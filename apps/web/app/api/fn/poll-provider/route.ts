// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/fn/poll-provider
 *
 * Gallery-page polling fallback. The legacy Supabase `poll-provider` edge
 * function no longer exists; this route replaces it by reading the job
 * status directly from the generation_jobs table.
 *
 * Works for all generators (ugc_video, show_your_app, etc.) because the
 * worker writes to the same table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.jobId || typeof body.jobId !== 'string') {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('generation_jobs')
    .select('id, status, progress_detail, output_media_url, error_message, updated_at')
    .eq('id', body.jobId)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    job_id: data.id,
    status: data.status,
    progress: data.progress_detail,
    video_url: data.output_media_url,
    error_message: data.error_message,
    updated_at: data.updated_at,
  });
}
