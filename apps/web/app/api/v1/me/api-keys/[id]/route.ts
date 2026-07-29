// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Same-origin proxy for DELETE /v1/me/api-keys/:id — revoke a key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '') ?? 'https://api.agent-media.ai';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const r = await fetch(`${API_V2_URL}/v1/me/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await r.text();
  return new NextResponse(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
}
