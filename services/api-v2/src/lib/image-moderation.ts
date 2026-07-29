// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Content moderation for USER-SUPPLIED images before they are stored in R2.
 *
 * This is the F1 gap: users push image bytes (portrait / product / actor
 * references) through the *_base64 and URL upload paths on /v1/skills/*, and
 * those were stored with only size + type guards — no content check. This module
 * runs each user image through OpenAI's omni-moderation model and REJECTS clearly
 * unsafe content (sexual/minors — zero tolerance; explicit sexual; graphic
 * violence) at the upload choke point, so nothing unsafe reaches storage or the
 * downstream video pipeline.
 *
 * SCOPE: this is the NSFW/abuse gate. Reliable CSAM detection (PhotoDNA /
 * Cloudflare CSAM Scanning Tool / Thorn Safer, with the attendant NCMEC-reporting
 * duty) is a separate legal-enrollment track and is intentionally NOT claimed
 * here. Video uploads are also out of scope (image moderation only).
 *
 * ROLLOUT: active whenever OPENAI_API_KEY is present. Set IMAGE_MODERATION_DISABLED=1
 * to turn it off (kill switch). On a provider/network error it fails OPEN by
 * default (an OpenAI outage must not block every legitimate upload) — set
 * IMAGE_MODERATION_FAILCLOSED=1 to invert that. Category scores are logged so the
 * thresholds below can be tuned against real traffic.
 */

import OpenAI from 'openai';

/** Thrown when an image is rejected. The route layer maps this to HTTP 422. */
export class ModerationError extends Error {
  readonly code = 'UNSAFE_CONTENT';
  readonly categories: string[];
  constructor(categories: string[]) {
    super(`image rejected by content moderation (${categories.join(', ')})`);
    this.name = 'ModerationError';
    this.categories = categories;
  }
}

// Categories we block and the minimum category_score that trips each one.
// sexual/minors is zero-tolerance (any non-trivial signal blocks); the adult
// categories use conservative thresholds so ordinary UGC (a person, a product)
// is not false-positived. Tune against the logged scores.
const BLOCK_RULES: Array<{ category: string; minScore: number }> = [
  { category: 'sexual/minors', minScore: 0.2 },
  { category: 'sexual', minScore: 0.7 },
  { category: 'violence/graphic', minScore: 0.85 },
];

let _client: OpenAI | null = null;
function getClient(apiKey: string): OpenAI {
  // Short timeout + one retry: an upload is a synchronous request path, so a
  // wedged moderation call must resolve fast (success, block, or fail-open).
  if (!_client) _client = new OpenAI({ apiKey, maxRetries: 1, timeout: 15_000 });
  return _client;
}

function isEnabled(): boolean {
  if (process.env.IMAGE_MODERATION_DISABLED === '1') return false;
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Reject the image if it trips a blocked category. No-op when moderation is
 * disabled or unconfigured. `mime` must be image/png or image/jpeg (the callers
 * have already sniffed the magic bytes).
 */
export async function moderateImageOrThrow(bytes: Buffer, mime: string): Promise<void> {
  if (!isEnabled()) return;
  const apiKey = process.env.OPENAI_API_KEY as string;

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  let result: OpenAI.Moderation | undefined;
  try {
    const resp = await getClient(apiKey).moderations.create({
      model: 'omni-moderation-latest',
      input: [{ type: 'image_url', image_url: { url: dataUrl } }],
    });
    result = resp.results[0];
  } catch (err) {
    // Provider/network error — fail OPEN so an OpenAI outage doesn't take down
    // every upload, unless explicitly told to fail closed. Always logged.
    console.error('[image-moderation] provider error (failing %s):',
      process.env.IMAGE_MODERATION_FAILCLOSED === '1' ? 'closed' : 'open', err);
    if (process.env.IMAGE_MODERATION_FAILCLOSED === '1') {
      throw new ModerationError(['moderation_unavailable']);
    }
    return;
  }
  if (!result) return;

  const scores = (result.category_scores ?? {}) as unknown as Record<string, number>;
  const hits: string[] = [];
  for (const { category, minScore } of BLOCK_RULES) {
    if (Number(scores[category] ?? 0) >= minScore) hits.push(category);
  }
  if (hits.length) {
    console.warn('[image-moderation] BLOCKED %s scores=%j', hits.join(','),
      Object.fromEntries(BLOCK_RULES.map((r) => [r.category, scores[r.category] ?? 0])));
    throw new ModerationError(hits);
  }
}
