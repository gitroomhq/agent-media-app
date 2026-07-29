// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getDb(url: string, serviceRoleKey: string): SupabaseClient {
  if (!_client) {
    _client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
