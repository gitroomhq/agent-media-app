// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Postiz OAuth callback route.
 *
 * Exchanges the authorization code for an access token, extracts user
 * info from the token response (or decodes the JWT), and creates or
 * signs in the corresponding Supabase user.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

const POSTIZ_TOKEN_URL = 'https://api.postiz.com/oauth/token';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  // ── Verify CSRF state ──────────────────────────────────────────────────
  const cookieHeader = request.headers.get('cookie') || '';
  const stateMatch = cookieHeader.match(/postiz_oauth_state=([^;]+)/);
  let redirect = '/dashboard';

  if (stateMatch) {
    try {
      const stored = JSON.parse(decodeURIComponent(stateMatch[1]));
      if (stored.state !== stateParam) {
        return NextResponse.redirect(new URL('/login?error=invalid_state', origin));
      }
      redirect = stored.redirect || '/dashboard';
    } catch {
      return NextResponse.redirect(new URL('/login?error=invalid_state', origin));
    }
  }

  // ── Exchange code for access token ─────────────────────────────────────
  const clientId = process.env.POSTIZ_CLIENT_ID;
  const clientSecret = process.env.POSTIZ_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=config', origin));
  }

  const redirectUri = `${origin}/api/auth/postiz/callback`;

  let tokenData: Record<string, unknown>;
  try {
    const tokenRes = await fetch(POSTIZ_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => 'unknown');
      console.error('Postiz token exchange failed:', tokenRes.status, text);
      return NextResponse.redirect(new URL('/login?error=token_exchange', origin));
    }

    tokenData = await tokenRes.json();
    console.log('Postiz token response keys:', Object.keys(tokenData));
  } catch (err) {
    console.error('Postiz token exchange error:', err);
    return NextResponse.redirect(new URL('/login?error=token_exchange', origin));
  }

  // ── Extract user info ────────────────────────────────────────────────
  // Postiz token response: { id: "username", access_token: "jwt...", token_type }
  // The access_token JWT contains the real UUID in its `id` field.
  // Prioritize the JWT payload over the top-level `id` (which is the username).

  let postizUserId: string | null = null;
  let displayName: string | null = null;

  // Decode access_token JWT to get the real user UUID
  if (tokenData.access_token) {
    const jwtPayload = decodeJwtPayload(String(tokenData.access_token));
    if (jwtPayload) {
      console.log('Postiz access_token JWT payload:', JSON.stringify(jwtPayload));
      postizUserId = String(jwtPayload.id || jwtPayload.sub || jwtPayload.user_id || '') || null;
      displayName = String(jwtPayload.displayName || jwtPayload.name || '') || null;
    }
  }

  // Fallback: use top-level id from token response (username)
  if (!postizUserId) {
    postizUserId = String(tokenData.id || '') || null;
  }

  if (!postizUserId) {
    console.error('Could not extract user ID from Postiz token response:', JSON.stringify(tokenData));
    return NextResponse.redirect(new URL('/login?error=no_user_id', origin));
  }

  // ── Create or find Supabase user ───────────────────────────────────────
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
  );

  const ssoEmail = `postiz_${postizUserId}@sso.agent-media.ai`;

  let userId: string;

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: ssoEmail,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      postiz_id: postizUserId,
      auth_provider: 'postiz',
    },
  });

  if (newUser?.user) {
    userId = newUser.user.id;

    await supabaseAdmin
      .from('profiles')
      .update({ postiz_id: postizUserId })
      .eq('id', userId);
  } else if (createError?.message?.includes('already been registered')) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('postiz_id', postizUserId)
      .maybeSingle();

    if (!profile?.id) {
      console.error('Postiz user exists but profile not found:', postizUserId);
      return NextResponse.redirect(new URL('/login?error=user_lookup', origin));
    }
    userId = profile.id;
  } else {
    console.error('Failed to create Supabase user:', createError);
    return NextResponse.redirect(new URL('/login?error=user_creation', origin));
  }

  // ── Generate a session for the user ────────────────────────────────────
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: ssoEmail,
  });

  if (linkError || !linkData) {
    console.error('Failed to generate magic link:', linkError);
    return NextResponse.redirect(new URL('/login?error=session', origin));
  }

  const supabase = await createServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('Failed to verify magic link:', verifyError);
    return NextResponse.redirect(new URL('/login?error=session', origin));
  }

  // ── Redirect to app ───────────────────────────────────────────────────
  const ALLOWED_PREFIXES = ['/gallery', '/billing', '/settings', '/subscribe'];
  const safeRedirect = ALLOWED_PREFIXES.some(
    (p) => redirect === p || redirect.startsWith(p + '/') || redirect.startsWith(p + '?'),
  )
    ? redirect
    : '/gallery';

  const response = NextResponse.redirect(new URL(safeRedirect, origin));

  response.cookies.set('postiz_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}
