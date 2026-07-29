// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Same-origin proxy for POST /v1/agent — the in-app creative agent brain.
 * Forwards the conversation (Anthropic Messages format) to api-v2 with the
 * caller's Supabase access token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// AGENT_API_V2_URL lets the brain point at a different api-v2 (e.g. a local one
// with new agent features) while skills/characters/gallery keep using API_V2_URL.
const API_V2_URL = (process.env.AGENT_API_V2_URL ?? process.env.API_V2_URL)?.replace(/\/+$/, '') ?? 'https://api.agent-media.ai';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 });
  }
  const body = await req.text();
  try {
    const upstream = await fetch(`${API_V2_URL}/v1/agent`, {
      method: 'POST',
      // Declare this client supports the interactive ask_user choice card, so the
      // brain may offer it. Old clients omit this and never receive ask_user.
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'x-am-agent-caps': 'ask_user' },
      body,
    });
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
