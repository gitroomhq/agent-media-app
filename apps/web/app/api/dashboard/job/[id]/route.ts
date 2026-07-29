// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/dashboard/job/[id]
 *
 * Same-origin job-status proxy for the dashboard. Authenticates via
 * the user's Supabase session (cookie-based) and forwards to api-v2's
 * /v1/videos/:jobId endpoint, which surfaces character_sheet_url +
 * storyboard_url + video_url for character_video jobs (and
 * progress_detail for in-flight ones).
 *
 * Distinct from /api/v1/videos/:id (the public Bearer-token endpoint
 * used by the CLI/SDK) — that one requires an API key header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '')
  ?? 'https://api.agent-media.ai';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: { code: 'invalid_id', message: 'Missing job id' } }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: { code: 'unauthenticated', message: 'Not authenticated' } }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${API_V2_URL}/v1/videos/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { error: { code: 'upstream_error', message: text.slice(0, 400) } }; }
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'upstream_unreachable', message: (err as Error).message } },
      { status: 502 },
    );
  }
}
