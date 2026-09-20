// Copyright 2026 agent-media contributors. Apache-2.0 license.
import type { SupabaseClient } from '@supabase/supabase-js';
import { UploadError, type UploadAsset, type UploadSession, type UploadStore } from './types.js';

function check(error: { message: string } | null): void {
  if (!error) return;
  const codes: Record<string, [number, string]> = {
    UPLOAD_EXPIRED: [410, 'This upload session has expired. Ask your agent for a new panel.'],
    UPLOAD_CONFLICT: [409, 'This upload ID already belongs to a different file.'],
    UPLOAD_IN_PROGRESS: [409, 'This image is still uploading. Wait a moment and retry.'],
    UPLOAD_FILE_LIMIT: [
      429,
      'Image limit reached. Use your uploaded images before starting more uploads.',
    ],
    UPLOAD_SESSION_LIMIT: [429, 'Too many active upload panels. Reuse an existing panel.'],
  };
  for (const [code, [status, message]] of Object.entries(codes)) {
    if (error.message.includes(code)) throw new UploadError(status, code, message);
  }
  throw new UploadError(
    503,
    'UPLOAD_UNAVAILABLE',
    'Uploads are temporarily unavailable. Please retry.',
  );
}

export function createUploadStore(db: SupabaseClient): UploadStore {
  return {
    async createSession(id, userId, tokenHash) {
      const { data, error } = await db.rpc('create_temporary_upload_session', {
        p_id: id,
        p_user_id: userId,
        p_token_hash: tokenHash,
      });
      check(error);
      return data as UploadSession;
    },
    async sessions(userId, now) {
      const { data, error } = await db.from('temporary_upload_sessions').select('*')
        .eq('user_id', userId).gt('expires_at', now).order('expires_at', { ascending: false }).limit(10);
      check(error);
      return (data ?? []) as UploadSession[];
    },
    async session(id) {
      const { data, error } = await db
        .from('temporary_upload_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      check(error);
      return data as UploadSession | null;
    },
    async assets(id) {
      const { data, error } = await db
        .from('temporary_upload_assets')
        .select('*')
        .eq('session_id', id)
        .order('created_at');
      check(error);
      return data as UploadAsset[];
    },
    async asset(id) {
      const { data, error } = await db
        .from('temporary_upload_assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      check(error);
      return data as UploadAsset | null;
    },
    async reserve(input) {
      const { data, error } = await db.rpc('reserve_temporary_upload_asset', {
        p_id: input.id,
        p_session_id: input.session.id,
        p_user_id: input.session.user_id,
        p_filename: input.filename,
        p_source_hash: input.hash,
        p_source_bytes: input.bytes,
        p_read_token: input.readToken,
        p_lease_token: input.lease,
      });
      check(error);
      return data as UploadAsset;
    },
    async ready(asset, image) {
      const { data, error } = await db
        .from('temporary_upload_assets')
        .update({ ...image, status: 'ready' })
        .eq('id', asset.id)
        .eq('lease_token', asset.lease_token)
        .select('*')
        .maybeSingle();
      check(error);
      if (!data)
        throw new UploadError(
          409,
          'UPLOAD_IN_PROGRESS',
          'Upload was resumed in another request. Refresh the panel.',
        );
      return data as UploadAsset;
    },
    async failed(asset) {
      const { error } = await db
        .from('temporary_upload_assets')
        .update({ status: 'failed' })
        .eq('id', asset.id)
        .eq('lease_token', asset.lease_token)
        .eq('status', 'uploading');
      check(error);
    },
    async expired(now) {
      const { data, error } = await db
        .from('temporary_upload_assets')
        .select('*')
        .lt('expires_at', now)
        .lt('lease_until', now)
        .limit(100);
      check(error);
      return data as UploadAsset[];
    },
    async remove(id) {
      const { error } = await db.from('temporary_upload_assets').delete().eq('id', id);
      check(error);
    },
    async pruneSessions(before) {
      // Never cascade away a failed object deletion: those rows must be retried.
      const { data, error } = await db
        .from('temporary_upload_sessions')
        .select('id,temporary_upload_assets(id)')
        .lt('expires_at', before)
        .limit(100);
      check(error);
      for (const row of data ?? []) {
        if (row.temporary_upload_assets.length === 0) {
          const result = await db.from('temporary_upload_sessions').delete().eq('id', row.id);
          check(result.error);
        }
      }
    },
  };
}
