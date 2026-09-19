// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { moderateImageOrThrow, ModerationError } from '../lib/image-moderation.js';
import {
  MAX_IMAGE_BYTES,
  MAX_SESSION_FILES,
  UploadError,
  type UploadAsset,
  type UploadSession,
  type UploadStorage,
  type UploadStore,
  type UploadView,
  type ReadyImage,
} from './types.js';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
function matches(value: string, hash: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(tokenHash(value), 'hex'), Buffer.from(hash, 'hex'))
  );
}
export async function normalizeImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new UploadError(413, 'IMAGE_TOO_LARGE', 'Choose an image between 1 byte and 25 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp)
    throw new UploadError(415, 'UNSUPPORTED_IMAGE', 'Choose a still PNG, JPEG, or WebP image.');
  try {
    const input = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning', animated: true });
    const metadata = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
      throw new UploadError(415, 'UNSUPPORTED_IMAGE', 'Choose a still PNG, JPEG, or WebP image.');
    }
    // Full decode, preserve resolution, apply EXIF orientation, strip metadata.
    // WebP is converted to PNG so existing image generation paths can use it.
    const outputPng = metadata.format !== 'jpeg';
    const { data, info } = await (
      outputPng ? input.rotate().png() : input.rotate().jpeg({ quality: 95 })
    ).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES)
      throw new UploadError(
        413,
        'IMAGE_TOO_LARGE',
        'This image exceeds 25 MB after preparation. Choose a smaller image.',
      );
    return {
      data,
      mime: outputPng ? 'image/png' : 'image/jpeg',
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(
      422,
      'INVALID_IMAGE',
      'This image is damaged or too large to decode. Choose a still image under 40 megapixels.',
    );
  }
}

export class UploadService {
  constructor(
    readonly store: UploadStore,
    readonly storage: UploadStorage,
    readonly apiBase: string,
    readonly now = () => Date.now(),
    readonly moderate = moderateImageOrThrow,
  ) {}

  private active(expires: string) {
    if (Date.parse(expires) <= this.now())
      throw new UploadError(
        410,
        'UPLOAD_EXPIRED',
        'These images have expired. Ask your agent for a new upload panel.',
      );
  }
  image(asset: UploadAsset): ReadyImage {
    return {
      asset_id: asset.id,
      filename: asset.filename,
      image_url: `${this.apiBase}/v1/uploads/temporary/${asset.id}/image?token=${asset.read_token}`,
      expires_at: asset.expires_at,
      mime: asset.mime!,
      bytes: asset.bytes!,
      width: asset.width!,
      height: asset.height!,
    };
  }
  async create(userId: string) {
    const token = randomBytes(32).toString('hex');
    const session = await this.store.createSession(randomUUID(), userId, tokenHash(token));
    return {
      ...(await this.view(session)),
      upload_token: token,
      upload_url: `${this.apiBase}/upload#session=${session.id}&token=${token}`,
    };
  }
  async authorize(
    id: string,
    auth: { userId: string } | { token: string },
  ): Promise<UploadSession> {
    const session = await this.store.session(id);
    if (
      !session ||
      ('userId' in auth
        ? auth.userId !== session.user_id
        : !matches(auth.token, session.token_hash))
    ) {
      throw new UploadError(
        404,
        'UPLOAD_NOT_FOUND',
        'Upload panel not found. Ask your agent for a new link.',
      );
    }
    this.active(session.expires_at);
    return session;
  }
  async view(session: UploadSession): Promise<UploadView> {
    this.active(session.expires_at);
    const assets = await this.store.assets(session.id);
    return {
      session_id: session.id,
      expires_at: session.expires_at,
      max_bytes: MAX_IMAGE_BYTES,
      max_files: MAX_SESSION_FILES,
      images: assets
        .filter((a) => a.status === 'ready' && Date.parse(a.expires_at) > this.now())
        .map((a) => this.image(a)),
    };
  }
  async upload(
    session: UploadSession,
    id: string,
    filename: string,
    bytes: Buffer,
  ): Promise<ReadyImage> {
    this.active(session.expires_at);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
      throw new UploadError(413, 'IMAGE_TOO_LARGE', 'Choose an image up to 25 MB.');
    const safeName =
      Array.from(filename)
        .filter((char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127)
        .slice(0, 160)
        .join('') || 'Image';
    const asset = await this.store.reserve({
      id,
      session,
      filename: safeName,
      hash: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      readToken: randomBytes(32).toString('hex'),
      lease: randomUUID(),
    });
    if (asset.status === 'ready') return this.image(asset);
    try {
      const image = await normalizeImage(bytes);
      await this.moderate(image.data, image.mime);
      this.active(session.expires_at);
      await this.storage.put(asset.object_key, image.data, image.mime);
      this.active(session.expires_at);
      return this.image(
        await this.store.ready(asset, {
          mime: image.mime,
          bytes: image.data.length,
          width: image.width,
          height: image.height,
        }),
      );
    } catch (error) {
      await this.store.failed(asset).catch(() => {}); // Durable reservation remains for retry/cleanup.
      if (error instanceof ModerationError) {
        if (error.categories.includes('moderation_unavailable'))
          throw new UploadError(
            503,
            'UPLOAD_UNAVAILABLE',
            'Image checking is temporarily unavailable. Please retry.',
          );
        throw new UploadError(
          422,
          'IMAGE_REJECTED',
          'This image cannot be used for generation. Please choose another.',
        );
      }
      throw error;
    }
  }
  async read(id: string, token: string) {
    const asset = await this.store.asset(id);
    if (!asset || asset.status !== 'ready' || !matches(token, tokenHash(asset.read_token))) {
      throw new UploadError(404, 'IMAGE_NOT_FOUND', 'Image not found.');
    }
    this.active(asset.expires_at);
    const bytes = await this.storage.get(asset.object_key);
    this.active(asset.expires_at); // Do not let a slow fetch cross the expiry boundary.
    return { bytes, mime: asset.mime! };
  }
  async cleanup() {
    const now = new Date(this.now()).toISOString();
    const expired = await this.store.expired(now);
    let removed = 0;
    let failed = 0;
    for (const asset of expired) {
      try {
        await this.storage.remove(asset.object_key);
        await this.store.remove(asset.id);
        removed++;
      } catch {
        failed++;
      } // Keep its row so the next sweep retries storage deletion.
    }
    await this.store.pruneSessions(now);
    return { removed, failed };
  }
}

export function startUploadCleanup(service: UploadService): () => void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const result = await service.cleanup();
      if (result.failed) console.error('[temporary-uploads] cleanup pending', result);
    } catch {
      console.error('[temporary-uploads] cleanup unavailable; retrying next sweep');
    } finally {
      running = false;
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
