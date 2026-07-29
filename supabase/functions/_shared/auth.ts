/**
 * Auth middleware for Edge Functions.
 *
 * verifyAuth(req) extracts and validates the token from the Authorization header.
 * Supports two authentication methods:
 *   1. API keys (ma_ prefix) — hashed with SHA-256 and looked up in api_keys table
 *   2. Supabase JWTs — verified via supabase.auth.getUser()
 *
 * Returns the authenticated Supabase User (or a synthetic user for API keys) or null on failure.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { User } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseAdmin } from "./supabase.ts";

export interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Verify the token in the Authorization header.
 *
 * Accepts:
 *   - `Authorization: Bearer ma_xxx` — API key auth
 *   - `Authorization: Bearer <jwt>` — Supabase JWT auth
 *
 * Returns { user, error }.
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return { user: null, error: "Missing Authorization header" };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { user: null, error: "Missing bearer token" };
  }

  // API key authentication (ma_ prefix)
  if (token.startsWith("ma_")) {
    return await verifyApiKey(token);
  }

  // Fall back to JWT authentication
  return await verifyJwt(token);
}

/**
 * Verify an API key by SHA-256 hashing it and looking up in the api_keys table.
 */
async function verifyApiKey(rawKey: string): Promise<AuthResult> {
  try {
    // SHA-256 hash the raw key
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Look up the key hash in the api_keys table using admin client (bypasses RLS)
    const db = supabaseAdmin();
    const now = new Date().toISOString();
    const { data: keyRecord, error } = await db
      .from("api_keys")
      .select("user_id")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .single();

    if (error || !keyRecord) {
      return { user: null, error: "Invalid API key" };
    }

    // Update last_used_at (fire-and-forget)
    db.from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key_hash", keyHash)
      .then(() => {});

    // Return a synthetic User object with the linked user_id.
    // Edge functions only access user.id and user.email.
    return {
      user: { id: keyRecord.user_id } as User,
      error: null,
    };
  } catch (err) {
    console.error("API key verification failed:", err);
    return { user: null, error: "API key verification failed" };
  }
}

/**
 * Verify a Supabase JWT token.
 */
async function verifyJwt(token: string): Promise<AuthResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    return {
      user: null,
      error: "Server misconfiguration: missing Supabase environment variables",
    };
  }

  const supabase = createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      error: error?.message ?? "Invalid or expired token",
    };
  }

  return { user, error: null };
}
