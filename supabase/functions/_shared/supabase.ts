/**
 * Shared Supabase client factory for Edge Functions.
 *
 * Two clients available:
 *   - supabaseAdmin()  : service_role key, bypasses RLS (for mutations)
 *   - supabaseClient(req) : anon key + user JWT from Authorization header
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let _adminClient: SupabaseClient | null = null;

/**
 * Return a Supabase client using the service_role key.
 * Bypasses RLS -- use for server-side mutations (device_codes, api_keys, etc.).
 * Cached as a singleton.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  _adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}

/**
 * Return a Supabase client using the anon key and the caller's JWT.
 * Respects RLS policies -- use for user-scoped reads.
 */
export function supabaseClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables",
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
