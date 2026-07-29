// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Shared same-origin proxy helper for /v1/agent/chats* — forwards to api-v2
 * with the caller's Supabase token. Uses AGENT_API_V2_URL (same as the brain
 * proxy) so chat persistence and the brain always hit the SAME api-v2 (in local
 * dev that's the local one carrying the new routes + tables; in prod they're
 * identical).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = (process.env.AGENT_API_V2_URL ?? process.env.API_V2_URL)?.replace(/\/+$/, '')
  ?? 'https://api.agent-media.ai';

export async function forwardToAgentApi(
  upstreamPath: string,
  init: { method: string; body?: string },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 });
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${session.access_token}` };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const upstream = await fetch(`${API_V2_URL}${upstreamPath}`, { method: init.method, headers, body: init.body });
    const text = await upstream.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: { message: text.slice(0, 400) } }; }
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'upstream_unreachable', message: (err as Error).message } },
      { status: 502 },
    );
  }
}
