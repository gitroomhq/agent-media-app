// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/showcase-videos
 *
 * Public route that returns recent completed video output URLs from
 * across the platform. Used by the paywall page to render an infinite
 * marquee of real customer-generated content as social proof.
 *
 * No auth required — the URLs are already public R2 assets. Uses the
 * service-role key server-side so it can read past RLS.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface Job {
  output_media_url: string | null;
  output_thumbnail_url: string | null;
}

export const runtime = 'nodejs';
// 1 hour s-maxage — the showcase is essentially static day-to-day.
// We can serve a stale-while-revalidate window of a full day on top.
export const revalidate = 3600;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: { code: 'misconfigured', message: 'Supabase env missing' } },
      { status: 500 },
    );
  }
  const db = createClient(url, key);
  // Pull a generous bag from BOTH character_video and ugc_video so the
  // marquee has variety. We do NOT hard-filter on thumbnail presence —
  // older jobs may not have one, and the tile has a gradient fallback
  // background so missing posters still look intentional. We DO sort
  // rows-with-thumbnails first so those paint instantly.
  const { data, error } = await db
    .from('generation_jobs')
    .select('output_media_url, output_thumbnail_url')
    .eq('status', 'completed')
    .in('operation', ['character_video', 'ugc_video'])
    .not('output_media_url', 'is', null)
    .is('deleted_at', null)
    .order('output_thumbnail_url', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    return NextResponse.json(
      { error: { code: 'db_error', message: error.message } },
      { status: 500 },
    );
  }
  const videos = ((data ?? []) as Job[])
    .map((r) => ({ url: r.output_media_url!, poster: r.output_thumbnail_url ?? null }))
    .filter((v) => v.url.endsWith('.mp4'));
  return NextResponse.json(
    { videos },
    {
      headers: {
        // Edge-cache an hour, serve stale for a day while we revalidate
        // in the background. Browsers also cache locally for 5 min so
        // repeat visits in a session paint instantly with zero traffic.
        'Cache-Control':
          'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
