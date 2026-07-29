// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Same-origin proxy for /v1/me/gallery — merged legacy + vNext
 * recent-generations feed for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '')
  ?? 'https://api.agent-media.ai';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Not authenticated' } },
      { status: 401 },
    );
  }
  const params = new URLSearchParams();
  params.set('limit', req.nextUrl.searchParams.get('limit') ?? '40');
  params.set('offset', req.nextUrl.searchParams.get('offset') ?? '0');
  const filter = req.nextUrl.searchParams.get('filter');
  if (filter) params.set('filter', filter);
  const primitive = req.nextUrl.searchParams.get('primitive');
  if (primitive) params.set('primitive', primitive);
  const skill = req.nextUrl.searchParams.get('skill');
  if (skill) params.set('skill', skill);
  try {
    const upstream = await fetch(`${API_V2_URL}/v1/me/gallery?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: { code: 'upstream_error', message: text.slice(0, 400) } };
    }
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'upstream_unreachable', message: (err as Error).message } },
      { status: 502 },
    );
  }
}
