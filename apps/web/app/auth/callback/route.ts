// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * OAuth callback route handler.
 *
 * After a user authenticates with an OAuth provider (GitHub, Google),
 * Supabase redirects back to this route with an auth code. We exchange
 * the code for a session and redirect the user to their intended
 * destination (defaults to /gallery).
 *
 * Also handles email confirmation callbacks from signUp().
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawRedirect = searchParams.get('redirect') || '/dashboard';
  // Sanitise redirect: must be a known local path prefix to prevent open redirects
  const ALLOWED_PREFIXES = ['/dashboard', '/create', '/gallery', '/actors', '/billing', '/settings', '/docs', '/device', '/subscribe'];
  const redirect = ALLOWED_PREFIXES.some((p) => rawRedirect === p || rawRedirect.startsWith(p + '/') || rawRedirect.startsWith(p + '?'))
    ? rawRedirect
    : '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Track dub.co lead event for affiliate attribution
      try {
        const cookieStore = await cookies();
        const dubId = cookieStore.get('dub_id')?.value;
        if (dubId && process.env.DUB_API_KEY) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await fetch('https://api.dub.co/track/lead', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.DUB_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                clickId: dubId,
                eventName: 'Sign up',
                customerExternalId: user.id,
                customerEmail: user.email,
                customerName: user.user_metadata?.full_name ?? user.email,
              }),
            });
          }
        }
      } catch {
        // Non-fatal — don't block auth flow
      }

      // Successful auth -- redirect to the intended destination
      return NextResponse.redirect(new URL(redirect, origin));
    }
  }

  // If there was no code or the exchange failed, redirect to login
  return NextResponse.redirect(new URL('/login', origin));
}
