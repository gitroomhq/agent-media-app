// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Browser-side Supabase client for Next.js client components.
 *
 * Uses `@supabase/ssr` createBrowserClient which automatically handles
 * cookie-based session management in the browser. All queries are
 * subject to RLS policies via the anon key.
 *
 * Usage:
 *   import { createClient } from '@/lib/supabase/client';
 *   const supabase = createClient();
 */

import { createBrowserClient } from '@supabase/ssr';
import { getVar } from '@/components/variable-context';

/**
 * Reads config at CALL time from the runtime context, not from build-time env.
 *
 * `process.env.NEXT_PUBLIC_*` is statically substituted by Next.js into every
 * bundle that reaches the browser — `export const dynamic = 'force-dynamic'` does
 * NOT prevent that. Referencing it here would bake one environment's Supabase URL
 * and anon key into the image, so an image built against staging would keep
 * authenticating against staging no matter what env the container is given.
 *
 * The root layout publishes these per request (see components/variable-context);
 * the build-time value is kept only as a fallback for non-container deploys
 * (e.g. Vercel), where it is correct by construction.
 */
export function createClient() {
  const url = getVar('supabaseUrl', process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') ?? '';
  const anonKey =
    getVar('supabaseAnonKey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '') ?? '';
  if (!url || !anonKey) {
    throw new Error(
      'Supabase browser config missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (injected at runtime by the root layout).',
    );
  }
  return createBrowserClient(url.trim(), anonKey.trim());
}
