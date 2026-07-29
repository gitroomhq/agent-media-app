// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Postiz OAuth initiation route.
 *
 * Generates a CSRF state token, stores it in a cookie, and redirects the
 * user to Postiz's OAuth authorization page.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

const POSTIZ_AUTHORIZE_URL = 'https://platform.postiz.com/oauth/authorize';

export async function GET(request: Request) {
  const clientId = process.env.POSTIZ_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'POSTIZ_CLIENT_ID not configured' }, { status: 500 });
  }

  // Generate CSRF state token
  const state = randomBytes(32).toString('hex');

  // Preserve redirect destination if provided
  const { searchParams } = new URL(request.url);
  const redirect = searchParams.get('redirect') || '/dashboard';

  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/postiz/callback`;

  const authorizeUrl = new URL(POSTIZ_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl.toString());

  // Store state + redirect in a short-lived cookie for verification in callback
  response.cookies.set('postiz_oauth_state', JSON.stringify({ state, redirect }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
