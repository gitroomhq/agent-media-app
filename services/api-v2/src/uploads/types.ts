// Copyright 2026 agent-media contributors. Apache-2.0 license.
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_SESSION_FILES = 10;
export const UPLOAD_RESOURCE_URI = 'ui://agent-media/image-upload-v1.html';
export const UPLOAD_RESOURCE_MIME = 'text/html;profile=mcp-app';
export const temporaryUploadsEnabled = () => process.env.TEMP_UPLOADS_ENABLED === 'true';
export const publicApiBase = () =>
  (process.env.PUBLIC_API_BASE || 'https://api.agent-media.ai').replace(/\/+$/, '');

export interface UploadSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
}
export interface UploadAsset {
  id: string;
  session_id: string;
  user_id: string;
  filename: string;
  source_hash: string;
  source_bytes: number;
  object_key: string;
  read_token: string;
  status: 'uploading' | 'ready' | 'failed';
  lease_token: string;
  lease_until: string;
  expires_at: string;
  mime: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
}
export interface ReadyImage {
  asset_id: string;
  filename: string;
  image_url: string;
  expires_at: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
}
export interface UploadView {
  session_id: string;
  expires_at: string;
  max_bytes: number;
  max_files: number;
  images: ReadyImage[];
}
export class UploadError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface UploadStore {
  createSession(id: string, userId: string, tokenHash: string): Promise<UploadSession>;
  session(id: string): Promise<UploadSession | null>;
  assets(sessionId: string): Promise<UploadAsset[]>;
  asset(id: string): Promise<UploadAsset | null>;
  reserve(input: {
    id: string;
    session: UploadSession;
    filename: string;
    hash: string;
    bytes: number;
    readToken: string;
    lease: string;
  }): Promise<UploadAsset>;
  ready(
    asset: UploadAsset,
    image: { mime: string; bytes: number; width: number; height: number },
  ): Promise<UploadAsset>;
  failed(asset: UploadAsset): Promise<void>;
  expired(now: string): Promise<UploadAsset[]>;
  remove(id: string): Promise<void>;
  pruneSessions(before: string): Promise<void>;
}
export interface UploadStorage {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
