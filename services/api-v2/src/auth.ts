// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Auth verification for api-v2.
 *
 * Mirrors the edge function auth logic: supports API keys (ma_ prefix)
 * and Supabase JWTs. Returns user_id on success.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) {
  console.warn('[auth] SUPABASE_ANON_KEY not set — JWT verification will fail. Set this env var.');
}

export interface AuthResult {
  userId: string | null;
  error: string | null;
}

/**
 * Verify an API key (ma_ prefix) by SHA-256 hashing and looking up in api_keys table.
 */
async function verifyApiKey(rawKey: string): Promise<AuthResult> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();
    const { data: keyRecord, error } = await db
      .from('api_keys')
      .select('user_id')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .single();

    if (error || !keyRecord) {
      return { userId: null, error: 'Invalid API key' };
    }

    // Update last_used_at (fire-and-forget)
    db.from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash)
      .then(() => {});

    return { userId: keyRecord.user_id, error: null };
  } catch (err) {
    console.error('API key verification failed:', err);
    return { userId: null, error: 'API key verification failed' };
  }
}

/**
 * Verify a Supabase JWT by calling auth.getUser().
 */
async function verifyJwt(token: string): Promise<AuthResult> {
  if (!SUPABASE_ANON_KEY) {
    return { userId: null, error: 'JWT verification unavailable — SUPABASE_ANON_KEY not configured' };
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { userId: null, error: error?.message ?? 'Invalid or expired token' };
    }

    return { userId: user.id, error: null };
  } catch (err) {
    console.error('JWT verification failed:', err);
    return { userId: null, error: 'JWT verification failed' };
  }
}

/**
 * Verify any token — dispatches to API key or JWT verification.
 */
export async function verifyToken(token: string): Promise<AuthResult> {
  if (token.startsWith('ma_')) {
    return verifyApiKey(token);
  }
  return verifyJwt(token);
}
