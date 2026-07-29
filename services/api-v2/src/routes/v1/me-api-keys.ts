// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /v1/me/api-keys — let a signed-in user manage their own `ma_*` API keys.
 *
 * Keys are stored SHA-256 hashed (see auth.ts), so an existing key can NEVER
 * be re-displayed — we only ever show the raw key ONCE, at creation. This
 * route lists key metadata (prefix/name/last-used), creates+returns a new raw
 * key once, and revokes (soft-deactivates) a key.
 */

import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { supabase } from '../../server.js';

const KEY_PREFIX = 'ma_';
const RANDOM_BYTES = 24; // -> 48 hex chars; key = ma_<48 hex> (51 chars)

function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const hex = randomBytes(RANDOM_BYTES).toString('hex');
  const rawKey = `${KEY_PREFIX}${hex}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 8); // ma_ + first 8 hex
  return { rawKey, keyHash, keyPrefix };
}

/** GET /v1/me/api-keys — list the user's keys (metadata only, never the secret). */
export async function listApiKeysRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, last_used_at, expires_at, is_active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    res.status(500).json({ error: 'lookup_failed', detail: error.message });
    return;
  }
  res.status(200).json({ keys: data ?? [] });
}

/** POST /v1/me/api-keys { name? } — create a key; returns the raw key ONCE. */
export async function createApiKeyRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const name = (rawName || 'API key').slice(0, 80);

  // Cap active keys per user to keep the surface sane.
  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);
  if ((count ?? 0) >= 10) {
    res.status(409).json({ error: 'too_many_keys', detail: 'Revoke an existing key first (max 10 active).' });
    return;
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ user_id: userId, name, key_prefix: keyPrefix, key_hash: keyHash, is_active: true })
    .select('id, name, key_prefix, created_at')
    .single();
  if (error || !data) {
    res.status(500).json({ error: 'create_failed', detail: error?.message ?? 'no row' });
    return;
  }
  // raw_key is returned exactly once — it is NOT stored and cannot be recovered.
  res.status(201).json({
    id: data.id,
    name: data.name,
    key_prefix: data.key_prefix,
    created_at: data.created_at,
    raw_key: rawKey,
  });
}

/** DELETE /v1/me/api-keys/:id — revoke (deactivate) a key the user owns. */
export async function revokeApiKeyRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const id = String(req.params.id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }
  const { data, error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: 'revoke_failed', detail: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json({ id: data.id, revoked: true });
}
