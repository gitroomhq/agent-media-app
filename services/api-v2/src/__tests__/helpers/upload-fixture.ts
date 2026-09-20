// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { randomUUID } from 'node:crypto';
import { UploadService } from '../../uploads/service.js';
import {
  UploadError,
  type UploadAsset,
  type UploadSession,
  type UploadStore,
  type UploadStorage,
} from '../../uploads/types.js';

export function uploadFixture(apiBase = 'http://127.0.0.1:3001') {
  let now = Date.now();
  const sessions = new Map<string, UploadSession>();
  const assets = new Map<string, UploadAsset>();
  const objects = new Map<string, Buffer>();
  let writes = 0;
  let removeFails = false;
  const store: UploadStore = {
    async sessions(userId, time) { return [...sessions.values()].filter(s => s.user_id === userId && s.expires_at > time); },
    async createSession(id, user_id, token_hash) {
      const s = { id, user_id, token_hash, expires_at: new Date(now + 86400000).toISOString() };
      sessions.set(id, s);
      return s;
    },
    async session(id) {
      return sessions.get(id) ?? null;
    },
    async assets(id) {
      return [...assets.values()].filter((a) => a.session_id === id);
    },
    async asset(id) {
      return assets.get(id) ?? null;
    },
    async reserve(i) {
      const prior = assets.get(i.id);
      if (prior && (prior.source_hash !== i.hash || prior.session_id !== i.session.id))
        throw new UploadError(409, 'UPLOAD_CONFLICT', 'Different upload');
      if (prior?.status === 'ready') return prior;
      if (prior?.status === 'uploading' && Date.parse(prior.lease_until) > now)
        throw new UploadError(409, 'UPLOAD_IN_PROGRESS', 'Wait and retry');
      const asset: UploadAsset = {
        id: i.id,
        session_id: i.session.id,
        user_id: i.session.user_id,
        filename: i.filename,
        source_hash: i.hash,
        source_bytes: i.bytes,
        object_key: i.id,
        read_token: prior?.read_token ?? i.readToken,
        status: 'uploading',
        lease_token: i.lease,
        lease_until: new Date(now + 120000).toISOString(),
        expires_at: i.session.expires_at,
        mime: null,
        bytes: null,
        width: null,
        height: null,
      };
      assets.set(asset.id, asset);
      return asset;
    },
    async ready(a, image) {
      const result: UploadAsset = { ...a, ...image, status: 'ready' };
      assets.set(a.id, result);
      return result;
    },
    async failed(a) {
      assets.set(a.id, { ...a, status: 'failed' });
    },
    async expired(time) {
      return [...assets.values()].filter((a) => a.expires_at < time && a.lease_until < time);
    },
    async remove(id) {
      assets.delete(id);
    },
    async pruneSessions(time) {
      for (const [id, s] of sessions)
        if (s.expires_at < time && ![...assets.values()].some((a) => a.session_id === id))
          sessions.delete(id);
    },
  };
  const storage: UploadStorage = {
    async put(key, bytes) {
      writes++;
      objects.set(key, bytes);
    },
    async get(key) {
      if (!objects.has(key)) throw new Error('missing');
      return objects.get(key)!;
    },
    async remove(key) {
      if (removeFails) throw new Error('unavailable');
      objects.delete(key);
    },
  };
  const service = new UploadService(
    store,
    storage,
    apiBase,
    () => now,
    async () => {},
  );
  return {
    service,
    store,
    storage,
    sessions,
    assets,
    objects,
    owner: randomUUID(),
    writes: () => writes,
    advance(ms: number) {
      now += ms;
    },
    failRemove(value: boolean) {
      removeFails = value;
    },
  };
}
