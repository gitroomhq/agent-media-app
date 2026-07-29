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

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  );
}
