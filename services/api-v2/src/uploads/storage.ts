// Copyright 2026 agent-media contributors. Apache-2.0 license.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { MAX_IMAGE_BYTES, UploadError, type UploadStorage } from './types.js';

/** A separate PRIVATE bucket is mandatory: expiry must not depend on cleanup. */
export function createUploadStorage(): UploadStorage {
  const bucket = process.env.R2_TEMP_UPLOAD_BUCKET;
  if (!bucket || bucket === (process.env.R2_BUCKET || 'agent-media-outputs')) {
    throw new UploadError(
      503,
      'UPLOAD_NOT_CONFIGURED',
      'Temporary image storage is not configured.',
    );
  }
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint:
      process.env.S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    maxAttempts: 2,
  });
  return {
    async put(key, bytes, mime) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
          CacheControl: 'private, no-store',
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    },
    async get(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
      if (!object.Body || (object.ContentLength ?? 0) > MAX_IMAGE_BYTES)
        throw new Error('Invalid stored image');
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        length += chunk.length;
        if (length > MAX_IMAGE_BYTES) throw new Error('Invalid stored image size');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
    },
  };
}
