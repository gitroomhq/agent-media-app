// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/v1/integrations/postiz/accounts
 *
 * Same-origin proxy to api-v2's /v1/integrations/postiz/accounts. Used by
 * the /settings Postiz section to list the user's connected social
 * accounts so they can pick which to auto-publish to.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '')
  ?? 'https://api.agent-media.ai';

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: { code: 'unauthenticated', message: 'Not authenticated' } }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${API_V2_URL}/v1/integrations/postiz/accounts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
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
