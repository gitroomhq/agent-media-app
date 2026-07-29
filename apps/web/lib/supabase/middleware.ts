// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Supabase auth middleware for refreshing sessions on every request.
 *
 * This function creates a Supabase server client that reads and writes
 * auth tokens from/to Next.js request/response cookies. It calls
 * `getUser()` to refresh expired JWTs and propagate updated cookies.
 *
 * Called from the root Next.js middleware (middleware.ts).
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do NOT use getSession() here. getUser() sends a request
  // to the Supabase Auth server to revalidate the token, which is the
  // only reliable way to ensure the session is still valid.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabase, supabaseResponse };
}

/**
 * Check if a user has an active subscription.
 * Queries the subscriptions table directly.
 */
export async function checkSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // Any subscription record means user has subscribed at some point.
  // The /subscribe page is for first-time subscribers only.
  // Canceled/expired users should see the dashboard (with billing page to resubscribe).
  const { data } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .neq('plan_slug', 'free')
    .limit(1)
    .single();

  return !!data;
}

/**
 * Check whether a user has finished the post-login onboarding flow.
 * Reads profiles.onboarded_at - any non-null timestamp counts. The
 * middleware uses this to force unsubscribed-and-not-onboarded users
 * through /onboarding before showing pricing or app routes.
 */
export async function checkOnboarded(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('onboarded_at')
    .eq('id', userId)
    .single();

  return !!data?.onboarded_at;
}
