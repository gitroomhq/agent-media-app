// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/v1/product-acting
 *
 * Same-origin dashboard proxy to api-v2's lab Product Acting UGC generator.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_API_V2_URL = 'https://api.agent-media.ai';

function getApiV2Url(req: NextRequest) {
  const configuredUrl = process.env.API_V2_URL?.replace(/\/+$/, '');
  if (configuredUrl) return configuredUrl;

  const hostname = req.nextUrl.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return 'http://localhost:3001';
  }

  return DEFAULT_API_V2_URL;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_json', message: 'Request body must be JSON' } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  try {
    const apiV2Url = getApiV2Url(req);
    const upstream = await fetch(`${apiV2Url}/v1/generate/product_acting_ugc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
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
