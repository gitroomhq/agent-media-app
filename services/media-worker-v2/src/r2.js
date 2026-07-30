// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Cloudflare R2 upload helper.
 *
 * Provides upload and presigned URL functions for the media worker,
 * replacing Supabase Storage for video/audio/image hosting.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'agent-media-outputs';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev';

let _client = null;

function getClient() {
  if (!_client) {
    // R2_ACCOUNT_ID only builds Cloudflare's endpoint hostname. With S3_ENDPOINT
    // set (MinIO, AWS S3, Ceph) it is never read, so self-hosters must not be
    // required to invent one.
    const hasCustomEndpoint = Boolean(process.env.S3_ENDPOINT?.trim());
    if ((!R2_ACCOUNT_ID && !hasCustomEndpoint) || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials not configured (R2_ACCOUNT_ID or S3_ENDPOINT, plus R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
    }
    // S3_ENDPOINT lets a self-hoster use any S3-compatible store (MinIO, Ceph).
    // Unset → Cloudflare R2, so hosted behaviour is unchanged. MinIO needs
    // S3_FORCE_PATH_STYLE=true (buckets served as /bucket/key).
    _client = new S3Client({
      region: process.env.S3_REGION?.trim() || 'auto',
      endpoint:
        process.env.S3_ENDPOINT?.trim() ||
        `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE?.trim() === 'true',
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

/**
 * Upload a file to R2 and return its public URL.
 *
 * @param {string} bucket - Logical bucket prefix (e.g. 'generation-outputs', 'persona-assets')
 * @param {string} path - Storage path within the bucket (e.g. 'user_id/job_id/ugc-final.mp4')
 * @param {Buffer} buffer - File contents
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export async function r2Upload(bucket, path, buffer, contentType) {
  const key = `${bucket}/${path}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Generate a presigned URL for reading a file from R2.
 * Used for private files that need temporary access (e.g. TTS audio for Kling API).
 *
 * @param {string} bucket - Logical bucket prefix
 * @param {string} path - Storage path within the bucket
 * @param {number} [expiresIn=3600] - URL expiry in seconds
 * @returns {Promise<string>} Presigned URL
 */
export async function r2SignedUrl(bucket, path, expiresIn = 3600) {
  const key = `${bucket}/${path}`;
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}
