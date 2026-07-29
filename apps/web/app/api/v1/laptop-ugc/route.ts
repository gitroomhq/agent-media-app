// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/v1/laptop-ugc
 *
 * Server-side proxy from the web dashboard to api-v2's
 * /v1/generate/laptop_ugc endpoint. Uses the user's Supabase session
 * to authenticate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '')
  ?? 'https://api.agent-media.ai';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json', message: 'Request body must be JSON' } }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: { code: 'unauthenticated', message: 'Not authenticated' } }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${API_V2_URL}/v1/generate/laptop_ugc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
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
