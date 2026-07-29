// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /openapi.json
 *
 * Proxies the OpenAPI spec from api-v2. Cached for 5 minutes.
 * This makes the spec discoverable at agent-media.ai/openapi.json.
 */

import { NextResponse } from 'next/server';

const API_V2_URL = process.env.API_V2_URL || 'https://api.agent-media.ai';

export async function GET() {
  try {
    const resp = await fetch(`${API_V2_URL}/openapi.json`, {
      next: { revalidate: 300 }, // cache 5 minutes
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch OpenAPI spec' },
        { status: 502 },
      );
    }

    const spec = await resp.json();

    // Override server URL to point to the public domain
    spec.servers = [
      { url: 'https://api.agent-media.ai', description: 'Production API' },
    ];

    return NextResponse.json(spec, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'OpenAPI spec unavailable' },
      { status: 502 },
    );
  }
}
