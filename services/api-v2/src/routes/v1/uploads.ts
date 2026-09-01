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
import { uploadUserImageBase64, uploadUserImageFromUrl } from '../../lib/r2-upload.js';

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
