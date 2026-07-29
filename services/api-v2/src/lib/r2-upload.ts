// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * api-v2 R2 upload helper. Used to accept user-supplied image bytes
 * (base64) on skill routes, persist them under a per-user namespace,
 * and hand back a stable R2 public URL that downstream primitive
 * workflows can fetch (their SSRF guard requires R2-hosted URLs).
 *
 * Mirrors services/media-worker-v2/src/r2.js and
 * services/primitive-worker-vnext/src/client/r2.ts.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookupCb } from 'node:dns';
import { promisify } from 'node:util';
import type { IncomingMessage } from 'node:http';
import { moderateImageOrThrow } from './image-moderation.js';

const dnsLookupAll = promisify(dnsLookupCb);

interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

let _client: S3Client | null = null;
let _env: R2Env | null = null;

function readEnv(): R2Env {
  if (_env) return _env;
  const missing: string[] = [];
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (missing.length > 0) {
    throw new Error(`r2: missing env ${missing.join(', ')}`);
  }
  _env = {
    accountId: accountId!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: process.env.R2_BUCKET || 'agent-media-outputs',
    publicUrl:
      process.env.R2_PUBLIC_URL ||
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev',
  };
  return _env;
}

function getClient(): S3Client {
  if (_client) return _client;
  const env = readEnv();
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  return _client;
}

/** Returns the R2 public URL prefix (no trailing slash). */
export function getR2PublicUrlPrefix(): string {
  return readEnv().publicUrl.replace(/\/+$/, '');
}

export interface UploadedImage {
  url: string;
  key: string;
  bytes: number;
  mime: 'image/png' | 'image/jpeg';
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB hard cap.

/**
 * Decode a base64 image payload (with or without a `data:` prefix),
 * validate MIME + size, upload to R2, and return the public URL.
 *
 * Key shape: vnext/uploads/<user_id>/<uuid>.<ext>
 */
export async function uploadUserImageBase64(
  userId: string,
  base64: string,
): Promise<UploadedImage> {
  let mime: 'image/png' | 'image/jpeg';
  let body: string;
  const dataUrlMatch = base64.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (dataUrlMatch) {
    mime = dataUrlMatch[1] as 'image/png' | 'image/jpeg';
    body = dataUrlMatch[2];
  } else {
    // No prefix — assume PNG.
    mime = 'image/png';
    body = base64;
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(body, 'base64');
  } catch {
    throw new Error('r2: base64 decode failed');
  }
  if (bytes.byteLength === 0) {
    throw new Error('r2: decoded image is empty');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `r2: uploaded image too large (${bytes.byteLength} bytes, max ${MAX_UPLOAD_BYTES})`,
    );
  }
  // Sniff the magic bytes to confirm declared MIME matches reality.
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) {
    throw new Error('r2: uploaded image is not a PNG or JPEG');
  }
  mime = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';

  // Content-moderation gate: reject unsafe user images BEFORE they reach storage.
  await moderateImageOrThrow(bytes, mime);

  const env = readEnv();
  const key = `vnext/uploads/${userId}/${randomUUID()}.${ext}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: bytes,
      ContentType: mime,
    }),
  );
  return {
    url: `${env.publicUrl.replace(/\/+$/, '')}/${key}`,
    key,
    bytes: bytes.byteLength,
    mime,
  };
}

// ── SSRF-hardened fetch for user-supplied URLs ────────────────────────────────
// A string/hostname blocklist is NOT enough: an attacker-controlled hostname can
// resolve (via DNS A-record or a 302 redirect) to a private/internal address —
// cloud metadata (169.254.169.254), internal services, etc. And buffering the
// whole body before the size check is an unbounded-memory DoS. So we: (1) DNS-
// resolve the host ourselves and reject if ANY address is private/loopback/link-
// local/ULA/CGNAT, (2) PIN the connection to the validated IP (with SNI + Host so
// TLS still validates the real hostname) — closing the DNS-rebind TOCTOU, (3)
// follow redirects MANUALLY, re-validating protocol/port/IP at every hop, and
// (4) stream the body through a running byte counter that aborts at the cap.

const ALLOWED_PORTS = new Set([443, 8443]);
const MAX_REDIRECTS = 5;

/** True for any address that must never be reached from the server. */
export function isPrivateIp(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7)); // IPv4-mapped
  if (s.startsWith('fe80')) return true; // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // ULA fc00::/7
  if (s.startsWith('64:ff9b:')) return true; // NAT64 → may map to private
  if (/^(2001:db8:|::ffff:0:)/.test(s)) return true;
  return false;
}

/** Parse + validate scheme/port/userinfo (cheap, pre-DNS). */
export function validateOutboundUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('r2: invalid URL');
  }
  if (url.protocol !== 'https:') throw new Error('r2: URL must use https');
  if (url.username || url.password) throw new Error('r2: URL must not contain credentials');
  if (url.port && !ALLOWED_PORTS.has(Number(url.port))) {
    throw new Error('r2: URL port not allowed');
  }
  return url;
}

/** Resolve the host and reject unless EVERY resolved address is public. Returns
 *  the first validated address to pin the socket to (kills the rebind window). */
async function resolveToPublicIp(hostname: string): Promise<{ address: string; family: number }> {
  const addrs = (await dnsLookupAll(hostname, { all: true, verbatim: true })) as Array<{
    address: string;
    family: number;
  }>;
  if (!addrs.length) throw new Error('r2: host did not resolve');
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error('r2: URL resolves to a private/internal address');
  }
  return addrs[0];
}

interface FetchedBody {
  status: number;
  location?: string;
  contentType: string;
  buffer: Buffer;
}

/** One HTTPS GET, connected to a pinned IP, with SNI + Host set to the real
 *  hostname (so TLS still validates), a Content-Length pre-check, and a
 *  streaming byte cap. Redirects are returned (drained), not followed. */
function httpsGetPinned(
  url: URL,
  ip: string,
  family: number,
  maxBytes: number,
  timeoutMs: number,
): Promise<FetchedBody> {
  return new Promise<FetchedBody>((resolve, reject) => {
    const req = httpsRequest(
      {
        host: ip,
        family,
        servername: url.hostname, // SNI → cert validated against the real hostname
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { Host: url.hostname, 'User-Agent': 'agent-media/1', Accept: '*/*' },
        timeout: timeoutMs,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // drain, don't buffer a redirect body
          resolve({ status, location: String(res.headers.location), contentType, buffer: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers['content-length'] ?? '0');
        if (declared > maxBytes) {
          req.destroy();
          reject(new Error(`r2: response too large (${declared} bytes, max ${maxBytes})`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total > maxBytes) {
            req.destroy();
            reject(new Error(`r2: response exceeds size cap (max ${maxBytes})`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, contentType, buffer: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('r2: fetch timeout')));
    req.on('error', reject);
    req.end();
  });
}

/** SSRF-safe fetch of a user URL → Buffer. Validates scheme/port, DNS-resolves +
 *  IP-validates + pins every hop, follows <=5 redirects manually, streams under a
 *  hard byte cap. */
async function safeFetchToBuffer(
  rawUrl: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ buffer: Buffer; contentType: string }> {
  let url = validateOutboundUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const { address, family } = await resolveToPublicIp(url.hostname);
    const res = await httpsGetPinned(url, address, family, maxBytes, timeoutMs);
    if (res.status >= 300 && res.status < 400 && res.location) {
      // Re-validate every redirect target (protocol/port/credentials) then loop —
      // the next iteration re-resolves + re-validates the IP, so a redirect can't
      // downgrade to http or hop to an internal address.
      url = validateOutboundUrl(new URL(res.location, url).href);
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`r2: fetch failed (${res.status})`);
    }
    return { buffer: res.buffer, contentType: res.contentType };
  }
  throw new Error('r2: too many redirects');
}

/**
 * Fetch an image from ANY public https URL and re-host it on agent-media R2.
 * Used by skills that accept arbitrary product/image URLs (e.g.
 * make_product_in_hands) so the downstream primitive only ever sees an
 * R2-hosted URL. If the URL is already on our R2 public host, it's returned
 * as-is (no re-fetch). Validates MIME (PNG/JPEG) + the 10 MB cap.
 */
export async function uploadUserImageFromUrl(
  userId: string,
  rawUrl: string,
): Promise<UploadedImage> {
  const env = readEnv();
  const r2Prefix = env.publicUrl.replace(/\/+$/, '') + '/';
  // Already on our R2 — passthrough (still validate it's a sane https URL).
  if (rawUrl.startsWith(r2Prefix)) {
    return { url: rawUrl, key: rawUrl.slice(r2Prefix.length), bytes: 0, mime: 'image/png' };
  }

  const { buffer: bytes } = await safeFetchToBuffer(rawUrl, MAX_UPLOAD_BYTES, 30_000);
  if (bytes.byteLength === 0) throw new Error('r2: fetched image is empty');
  const isPng =
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) throw new Error('r2: fetched URL is not a PNG or JPEG image');
  const mime: 'image/png' | 'image/jpeg' = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';

  // Content-moderation gate: reject unsafe user images BEFORE they reach storage.
  await moderateImageOrThrow(bytes, mime);

  const key = `vnext/uploads/${userId}/${randomUUID()}.${ext}`;
  await getClient().send(
    new PutObjectCommand({ Bucket: env.bucket, Key: key, Body: bytes, ContentType: mime }),
  );
  return {
    url: `${env.publicUrl.replace(/\/+$/, '')}/${key}`,
    key,
    bytes: bytes.byteLength,
    mime,
  };
}

export interface UploadedVideo {
  url: string;
  key: string;
  bytes: number;
  mime: string;
}

const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB hard cap.

/**
 * Fetch an EXTERNAL video URL (e.g. a user-supplied b-roll clip on any host),
 * validate it (public https only — SSRF-guarded — plus size + a video sniff),
 * upload it to R2, and return the R2 public URL. Passthrough when the URL is
 * already on our R2. This lets callers pass arbitrary video links while the
 * downstream worker still only ever fetches R2 (its SSRF guard stays intact).
 *
 * Key shape: vnext/uploads/<user_id>/<uuid>.<ext>
 */
export async function uploadUserVideoFromUrl(
  userId: string,
  rawUrl: string,
): Promise<UploadedVideo> {
  const env = readEnv();
  const r2Prefix = env.publicUrl.replace(/\/+$/, '') + '/';
  if (rawUrl.startsWith(r2Prefix)) {
    return { url: rawUrl, key: rawUrl.slice(r2Prefix.length), bytes: 0, mime: 'video/mp4' };
  }

  const { buffer: bytes, contentType } = await safeFetchToBuffer(rawUrl, MAX_VIDEO_BYTES, 120_000);
  const ct = contentType.toLowerCase();
  if (bytes.byteLength === 0) throw new Error('r2: fetched video is empty');
  // Sniff: ISO-BMFF (mp4/mov) has 'ftyp' at offset 4; WebM/Matroska starts 1A45DFA3.
  const isMp4 = bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  const isWebm =
    bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (!ct.startsWith('video/') && !isMp4 && !isWebm) {
    throw new Error('r2: fetched URL is not a recognized video (expected mp4/mov/webm)');
  }
  const ext = isWebm ? 'webm' : 'mp4';
  const mime = isWebm ? 'video/webm' : 'video/mp4';
  const key = `vnext/uploads/${userId}/${randomUUID()}.${ext}`;
  await getClient().send(
    new PutObjectCommand({ Bucket: env.bucket, Key: key, Body: bytes, ContentType: mime }),
  );
  return {
    url: `${env.publicUrl.replace(/\/+$/, '')}/${key}`,
    key,
    bytes: bytes.byteLength,
    mime,
  };
}
