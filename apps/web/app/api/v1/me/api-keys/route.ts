// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Same-origin proxy for /v1/me/api-keys — list + create the signed-in user's
 * API keys. Auth via the Supabase session; forwards to api-v2.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '') ?? 'https://api.agent-media.ai';

async function token(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function GET(): Promise<NextResponse> {
  const t = await token();
  if (!t) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const r = await fetch(`${API_V2_URL}/v1/me/api-keys`, { headers: { Authorization: `Bearer ${t}` } });
  const body = await r.text();
  return new NextResponse(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t = await token();
  if (!t) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const payload = await req.text();
  const r = await fetch(`${API_V2_URL}/v1/me/api-keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: payload || '{}',
  });
  const body = await r.text();
  return new NextResponse(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
}
