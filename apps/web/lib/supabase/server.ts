// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Server-side Supabase client for Next.js Server Components and Route Handlers.
 *
 * Uses `@supabase/ssr` createServerClient with the cookies() API from
 * next/headers. Session tokens are read from and written to HTTP-only
 * cookies to maintain auth state across requests.
 *
 * Usage:
 *   import { createClient } from '@/lib/supabase/server';
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies cannot be set. This is expected when reading session
            // data in layouts/pages. The middleware handles the actual
            // cookie refresh.
          }
        },
      },
    },
  );
}
