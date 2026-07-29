// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Claude vision pass over the desktop screenshot.
 *
 * The k-bucket palette extractor is fast but dumb: on a mostly-white
 * site it returns six shades of grey because antialiased text edges
 * dominate the histogram. Similarly, link[rel="icon"] selectors can't
 * tell you which icon is the actual brand mark vs. just a favicon.
 *
 * Sending the screenshot to Claude gets us:
 *   - palette: the actual brand-identity colours the user sees, not
 *     histogram noise.
 *   - logo: a bounding box around the logo on the page (if visible),
 *     which we can crop out of the screenshot for a clean preview.
 *   - brand_name: the brand name as written on the page (sometimes
 *     more useful than og:title).
 *
 * Returns a partial object; missing fields are null. Errors are
 * swallowed and the caller falls back to its non-AI defaults.
 */

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 25_000;

const SYSTEM_PROMPT = `You are a brand identity extractor. You will be shown a screenshot of a website's homepage. Return ONLY a JSON object with this exact shape and no prose:

{
  "palette": ["#rrggbb", ...],        // 3 to 6 hex colours that represent the brand's visible identity (hero background, primary button, accent, badges). DO NOT include white, near-white, near-black, or grey shades that just come from text/antialiasing. Order by importance.
  "logo": {                            // bounding box of the brand logo on the screenshot, in pixel coordinates of the image you were shown. The logo is usually a small mark in the top header. Return null if no clear logo is visible.
    "x": int, "y": int, "width": int, "height": int
  } | null,
  "brand_name": string | null         // the brand name as written on the page (the wordmark text), null if not obvious.
}`;

const USER_PROMPT = 'Extract this site\'s brand identity from the screenshot. Return JSON only.';

/**
 * Call Claude with the screenshot. Returns:
 *   { palette: string[]|null, logo: {x,y,width,height}|null, brand_name: string|null }
 * or null on any failure.
 */
export async function callVision({ screenshotBuf, viewport }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[ai-vision] ANTHROPIC_API_KEY not set, skipping');
    return null;
  }

  // Downscale the screenshot before sending so we stay well under the
  // image size budget and pay for fewer tokens. The image is still
  // detailed enough for colour + logo location.
  let pngForVision;
  try {
    pngForVision = await sharp(screenshotBuf)
      .resize(1024, null, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    console.error('[ai-vision] resize failed:', e?.message ?? e);
    return null;
  }

  const client = new Anthropic({ apiKey });
  let resp;
  try {
    resp = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: pngForVision.toString('base64'),
                },
              },
              { type: 'text', text: USER_PROMPT },
            ],
          },
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (e) {
    console.error('[ai-vision] claude call failed:', e?.message ?? e);
    return null;
  }

  const text = resp?.content?.find?.((b) => b.type === 'text')?.text ?? '';
  // Claude usually returns clean JSON when asked, but be defensive.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error('[ai-vision] no JSON in response:', text.slice(0, 200));
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error('[ai-vision] JSON parse failed:', e?.message ?? e);
    return null;
  }

  // Sanitize. Hex must be #rrggbb, logo box must be inside viewport.
  const palette = Array.isArray(parsed.palette)
    ? parsed.palette
        .filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
        .map((c) => c.toLowerCase())
    : null;

  let logo = null;
  if (
    parsed.logo &&
    typeof parsed.logo === 'object' &&
    [parsed.logo.x, parsed.logo.y, parsed.logo.width, parsed.logo.height].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  ) {
    // Coordinates from Claude are in the 1024-wide image we sent. Map
    // them back to the original viewport.
    const scale = viewport.width / 1024;
    logo = {
      x: Math.round(parsed.logo.x * scale),
      y: Math.round(parsed.logo.y * scale),
      width: Math.round(parsed.logo.width * scale),
      height: Math.round(parsed.logo.height * scale),
    };
    // Sanity clamp.
    logo.x = Math.max(0, Math.min(viewport.width - 1, logo.x));
    logo.y = Math.max(0, Math.min(viewport.height - 1, logo.y));
    logo.width = Math.max(1, Math.min(viewport.width - logo.x, logo.width));
    logo.height = Math.max(1, Math.min(viewport.height - logo.y, logo.height));
  }

  const brand_name =
    typeof parsed.brand_name === 'string' && parsed.brand_name.trim().length > 0
      ? parsed.brand_name.trim()
      : null;

  return { palette: palette && palette.length > 0 ? palette : null, logo, brand_name };
}

/**
 * Crop a logo region from a screenshot buffer and return it as a tight
 * PNG suitable for upload. Returns null on any failure.
 */
export async function cropLogo({ screenshotBuf, box }) {
  if (!box) return null;
  try {
    return await sharp(screenshotBuf)
      .extract({
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    console.error('[ai-vision] cropLogo failed:', e?.message ?? e);
    return null;
  }
}
