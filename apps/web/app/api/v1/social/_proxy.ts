// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API = process.env.API_V2_URL?.replace(/\/+$/, '') ?? 'https://api.agent-media.ai';

export async function proxy(method: string, path: string, payload?: string): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload,
  });
  const body = await r.text();
  return new NextResponse(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
}
