// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Public (no-auth) proxy for GET /v1/public/skills — powers the
 * marketing /skills page so non-signed-in visitors can browse.
 */

import { NextResponse } from 'next/server';

const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '')
  ?? 'https://api.agent-media.ai';

export async function GET(): Promise<NextResponse> {
  try {
    const upstream = await fetch(`${API_V2_URL}/v1/public/skills`);
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
