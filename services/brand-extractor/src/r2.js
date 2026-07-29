// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Minimal Cloudflare R2 uploader for the brand-extractor service.
 *
 * Same shape as media-worker-v2/src/r2.js (re-implemented here so this
 * service has zero coupling). One method - `r2Upload(bucket, path,
 * buffer, contentType)` returns the public URL of the uploaded object.
 *
 * Env:
 *   R2_ACCOUNT_ID         - Cloudflare account ID
 *   R2_ACCESS_KEY_ID      - R2 API token access key
 *   R2_SECRET_ACCESS_KEY  - R2 API token secret
 *   R2_BUCKET             - bucket name (default: agent-media-outputs)
 *   R2_PUBLIC_URL         - public CDN host (default: the existing pub-...
 *                           r2.dev URL used elsewhere in the project)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'agent-media-outputs';
const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev';

let _client = null;

function client() {
  if (!_client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error(
        'R2 credentials missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)',
      );
    }
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

export async function r2Upload(bucket, path, buffer, contentType) {
  const key = `${bucket}/${path}`;
  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return `${R2_PUBLIC_URL}/${key}`;
}
