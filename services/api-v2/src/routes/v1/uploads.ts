// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v1/uploads/image — turn image bytes (or a foreign URL) into a
 * stable agent-media R2 https URL.
 *
 * WHY THIS EXISTS: every image-taking surface we ship accepts base64, and
 * nothing offered an alternative — so an agent holding a user's photo had
 * exactly one way to use it: paste the whole base64 blob into the
 * generation tool's arguments. Two things go wrong when it does.
 *
 *   1. The client renders tool arguments in the conversation, so a
 *      multi-megabyte string is dumped into the chat as visible text.
 *      (Reported from a real session: "it sends the 64 bit image on chat,
 *      as string".)
 *   2. Every retry re-sends it. A validation rejection on an unrelated
 *      field (a too-long script, say) costs the agent another full
 *      re-encode, and a few of those exhaust the context window.
 *
 * With this route the bytes cross the wire ONCE, and every later call —
 * retries included — carries a ~90-character URL instead.
 *
 * Read-only with respect to credits: uploading costs nothing. Moderation,
 * MIME sniffing, the 10 MB cap and the SSRF guard all come from the shared
 * r2-upload helper, so this endpoint is not a new trust boundary.
 */

import type { Request, Response } from 'express';
import {
  MAX_PRESIGNED_BYTES,
  confirmUpload,
  presignUpload,
  uploadUserImageBase64,
  uploadUserImageFromUrl,
} from '../../lib/r2-upload.js';

export async function uploadImageRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  const body = (req.body ?? {}) as { image_base64?: unknown; image_url?: unknown };
  const base64 = typeof body.image_base64 === 'string' ? body.image_base64.trim() : '';
  const url = typeof body.image_url === 'string' ? body.image_url.trim() : '';

  if (!base64 && !url) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Provide either image_base64 or image_url.' },
    });
    return;
  }
  if (base64 && url) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Provide image_base64 OR image_url, not both.' },
    });
    return;
  }

  try {
    const uploaded = url
      ? await uploadUserImageFromUrl(userId, url)
      : await uploadUserImageBase64(userId, base64);
    res.status(200).json({
      image_url: uploaded.url,
      mime: uploaded.mime,
      bytes: uploaded.bytes,
    });
  } catch (err) {
    const message = (err as Error)?.message ?? 'Upload failed';
    // The helper throws for user-fixable reasons (not an image, over 10 MB,
    // blocked host, moderation) far more often than for infrastructure ones.
    // Those must reach the agent as a 400 it can act on, not a 500 it retries.
    const userFixable =
      /not a PNG or JPEG|too large|exceeds|moderation|blocked|private|https|empty|invalid base64|decode/i.test(
        message,
      );
    if (!userFixable) console.error(`[v1 uploads/image] ${message}`);
    res.status(userFixable ? 400 : 500).json({
      error: {
        code: userFixable ? 'INVALID_INPUT' : 'UPLOAD_FAILED',
        message: userFixable ? message : 'Failed to store the image',
      },
    });
  }
}


// ── POST /v1/uploads/presign  +  POST /v1/uploads/confirm ────────────────────
//
// The no-base64 path. An agent that can run a shell (Claude Code, Codex,
// Cursor, the CLI, any script) asks for a PUT URL, streams the ORIGINAL file
// to it, and confirms. The bytes never enter the model's context, so there is
// no reason left to downscale a customer's photo to fit a context window.
//
// Two calls instead of one on purpose: the confirm step is where the same
// sniffing, size cap and moderation gate the base64 path runs happen, before
// any URL is handed to a model.

function failure(res: Response, err: unknown, tag: string): void {
  const message = (err as Error)?.message ?? 'Upload failed';
  const userFixable =
    /not a PNG or JPEG|too large|exceeds|moderation|blocked|private|https|empty|nothing was uploaded|does not belong|bytes must be/i.test(
      message,
    );
  if (!userFixable) console.error(`[v1 uploads/${tag}] ${message}`);
  res.status(userFixable ? 400 : 500).json({
    error: {
      code: userFixable ? 'INVALID_INPUT' : 'UPLOAD_FAILED',
      message: userFixable ? message : 'Failed to store the image',
    },
  });
}

export async function presignUploadRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const body = (req.body ?? {}) as { bytes?: unknown; content_type?: unknown; filename?: unknown };
  const bytes = Number(body.bytes);
  const contentType =
    typeof body.content_type === 'string' && body.content_type
      ? body.content_type
      : typeof body.filename === 'string' && /\.jpe?g$/i.test(body.filename)
        ? 'image/jpeg'
        : 'image/png';
  if (!Number.isInteger(bytes) || bytes <= 0) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'bytes must be the exact size of the file in bytes (e.g. `stat -f%z photo.png`).',
      },
    });
    return;
  }
  try {
    const p = await presignUpload(userId, bytes, contentType);
    res.status(200).json({
      ...p,
      max_bytes: MAX_PRESIGNED_BYTES,
      // Everything the caller needs, spelled out: a wrong Content-Type or a
      // body of a different length breaks the signature, and that is a
      // confusing 403 from R2 unless we say so up front.
      upload_with: `curl -X PUT -H "Content-Type: ${p.content_type}" --data-binary @<file> "<put_url>"`,
      then: 'POST /v1/uploads/confirm { "upload_key": "<upload_key>" } to validate it and get the image_url.',
      note: 'Upload the ORIGINAL file. Do not resize or re-encode it: the bytes go straight to storage, they never pass through the model.',
    });
  } catch (err) {
    failure(res, err, 'presign');
  }
}

export async function confirmUploadRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const uploadKey = String((req.body as { upload_key?: unknown } | undefined)?.upload_key ?? '').trim();
  if (!uploadKey) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'upload_key is required (from /v1/uploads/presign).' } });
    return;
  }
  try {
    const uploaded = await confirmUpload(userId, uploadKey);
    res.status(200).json({ image_url: uploaded.url, mime: uploaded.mime, bytes: uploaded.bytes });
  } catch (err) {
    failure(res, err, 'confirm');
  }
}
