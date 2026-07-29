// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/v1/generation-input-url
 *
 * Returns a temporary signed read URL for a user's uploaded generation-inputs
 * object. Used immediately after signed upload so model providers can fetch
 * the reference image.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

export async function POST(req: NextRequest) {
  let body: { storage_path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_json', message: 'Request body must be JSON' } },
      { status: 400 },
    );
  }

  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : '';
  if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/')) {
    return NextResponse.json(
      { error: { code: 'invalid_storage_path', message: 'storage_path is required' } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'Cannot sign another user upload' } },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.storage
    .from('generation-inputs')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: { code: 'sign_failed', message: error?.message ?? 'Failed to sign upload' } },
      { status: 500 },
    );
  }

  return NextResponse.json({ signed_url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS });
}
