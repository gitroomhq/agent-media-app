// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Server relay for the OAuth consent screen.
 *
 * Supabase's OAuth 2.1 server delegates the consent UI to us: it redirects the
 * signed-in user to /oauth/consent?authorization_id=… and expects us to show
 * what is being authorised, then call back with approve or deny.
 *
 * This runs server-side so the user's session token is read from the auth
 * cookie and never handed to the browser bundle — the same shape as
 * /api/device-approve.
 *
 *   GET  ?authorization_id=…  → details of the pending authorization
 *   POST { authorization_id, action: 'approve' | 'deny' } → { redirect_url }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** An authorization id is an opaque Supabase identifier — keep it to a safe
 *  charset so it can never be used to traverse the upstream path. */
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

async function sessionToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authorizationId = req.nextUrl.searchParams.get('authorization_id') ?? '';
  if (!ID_RE.test(authorizationId)) {
    return NextResponse.json({ error: 'invalid_authorization_id' }, { status: 400 });
  }

  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const resp = await fetch(
    `${SUPABASE_URL}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
      cache: 'no-store',
    },
  );

  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    authorization_id?: string;
    action?: string;
  };

  const authorizationId = body.authorization_id ?? '';
  if (!ID_RE.test(authorizationId)) {
    return NextResponse.json({ error: 'invalid_authorization_id' }, { status: 400 });
  }
  // Only ever forward a known action — never pass the client's string through.
  const action = body.action === 'approve' ? 'approve' : body.action === 'deny' ? 'deny' : null;
  if (!action) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const resp = await fetch(
    `${SUPABASE_URL}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ action }),
    },
  );

  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
