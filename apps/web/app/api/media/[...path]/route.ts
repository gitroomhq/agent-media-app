// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { NextRequest, NextResponse } from 'next/server';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const ALLOWED_PREFIXES = [
  'generation-outputs/',
  'app-screenshots/',
  'actors/',
  'actor-variants/',
];

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const mediaPath = path.map((part) => encodeURIComponent(part)).join('/');

  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: 'Media origin is not configured' }, { status: 500 });
  }

  if (!mediaPath || !ALLOWED_PREFIXES.some((prefix) => mediaPath.startsWith(prefix))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const upstreamUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${mediaPath}`;
  const range = request.headers.get('range');
  const upstream = await fetch(upstreamUrl, {
    cache: 'no-store',
    headers: {
      ...(range ? { range } : {}),
    },
  });

  const headers = new Headers();
  for (const name of [
    'accept-ranges',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('vary', 'range');
  headers.set(
    'cache-control',
    upstream.status === 206
      ? 'no-store'
      : 'public, max-age=31536000, immutable',
  );

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
