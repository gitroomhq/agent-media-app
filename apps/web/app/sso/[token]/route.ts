// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Postiz SSO endpoint.
 *
 * Postiz redirects logged-in users to:
 *   https://agent-media.ai/sso/{jwtToken}
 *
 * The JWT contains the user's Postiz ID and name, signed with our
 * OAuth client_secret (HMAC-SHA256). We verify the signature, extract
 * the user info, create or find the corresponding Supabase user, sign
 * them in, and redirect to the dashboard.
 *
 * JWT payload expected: { sub: "postiz-user-id", name: "Display Name" }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createHmac, timingSafeEqual } from 'crypto';

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function verifyJwt(token: string, secret: string): { sub: string; name?: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify HMAC-SHA256 signature
  const expectedSig = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();

  const actualSig = base64UrlDecode(signatureB64);

  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  // Decode payload
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));

    // Check expiration if present
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    // Accept both `sub` and `id` as user identifier (Postiz uses `id`)
    const userId = payload.sub || payload.id;
    if (!userId) return null;
    return { sub: userId, name: payload.name || payload.displayName };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { origin } = new URL(request.url);

  const clientSecret = process.env.POSTIZ_CLIENT_SECRET;
  if (!clientSecret) {
    console.error('POSTIZ_CLIENT_SECRET not configured');
    return NextResponse.redirect(new URL('/login?error=config', origin));
  }

  // ── Verify and decode the JWT ──────────────────────────────────────────
  const payload = verifyJwt(token, clientSecret);
  if (!payload) {
    console.error('Invalid or expired Postiz SSO token');
    return NextResponse.redirect(new URL('/login?error=invalid_token', origin));
  }

  const postizUserId = payload.sub;
  const displayName = payload.name || null;

  // ── Create or find Supabase user ───────────────────────────────────────
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
  );

  const ssoEmail = `postiz_${postizUserId}@sso.agent-media.ai`;

  // Try to create — if already exists, look up by postiz_id
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

    // Store postiz_id in profiles
    await supabaseAdmin
      .from('profiles')
      .update({ postiz_id: postizUserId })
      .eq('id', userId);
  } else if (createError?.message?.includes('already been registered')) {
    // Existing user — look up by postiz_id
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

  // ── Generate a session ─────────────────────────────────────────────────
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: ssoEmail,
  });

  if (linkError || !linkData) {
    console.error('Failed to generate magic link:', linkError);
    return NextResponse.redirect(new URL('/login?error=session', origin));
  }

  // Exchange the token hash for a session
  const supabase = await createServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('Failed to verify magic link:', verifyError);
    return NextResponse.redirect(new URL('/login?error=session', origin));
  }

  // ── Redirect to dashboard ─────────────────────────────────────────────
  return NextResponse.redirect(new URL('/dashboard', origin));
}
