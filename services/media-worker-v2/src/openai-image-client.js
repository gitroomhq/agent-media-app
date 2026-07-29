// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Minimal OpenAI Images Edits client for gpt-image-2 reference-image
 * generation. Used by character-sheets.js as a direct replacement for the
 * EvoLink proxy, which has been flaky on the Azure-hosted gpt-image-2
 * route ("Resource temporarily exhausted" upstream errors).
 *
 *   generateImageEdit({ prompt, imageBuffers, size, quality, n })
 *     → POST https://api.openai.com/v1/images/edits
 *     → returns Buffer (PNG bytes from data[0].b64_json)
 *
 * Reads OPENAI_API_KEY from env. Throws if unset.
 */

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Text-to-image via /v1/images/generations. Used by the "Describe a
 * character" wizard mode — no reference image, model paints the
 * portrait from the description alone.
 *
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} [args.model='gpt-image-2']
 * @param {string} [args.size='1024x1024']
 * @param {string} [args.quality='medium']
 * @param {number} [args.n=1]
 * @param {number} [args.timeoutMs=600000]
 * @returns {Promise<Buffer>}
 */
export async function generateImageFromText({
  prompt,
  model = 'gpt-image-2',
  size = '1024x1024',
  quality = 'medium',
  n = 1,
  timeoutMs = 600_000,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  if (!prompt) throw new Error('prompt is required');

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, prompt, size, quality, n }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const msg = body?.error?.message || `HTTP ${res.status}`;
      // Classify safety/content-policy rejections the same way generateImageEdit
      // does — NOT transient, and the user needs a "rephrase + retry" signal with
      // a CONTENT_POLICY code, not a raw "images.generations failed" string.
      const violations = Array.isArray(body?.error?.safety_violations) ? body.error.safety_violations : null;
      const isPolicy = res.status === 400 && (
        /safety system|safety_violations|content_policy/i.test(msg)
        || (violations && violations.length > 0)
      );
      if (isPolicy) {
        const policyErr = new Error(
          violations
            ? `Content policy: ${violations.join(', ')} — rephrase with neutral, production-safe wording.`
            : 'Content policy: this prompt was rejected by the safety filter — rephrase with neutral, production-safe wording.',
        );
        policyErr.code = 'CONTENT_POLICY';
        throw policyErr;
      }
      throw new Error(`OpenAI images.generations failed: ${msg}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI images.generations returned no b64_json');
    return Buffer.from(b64, 'base64');
  } finally {
    clearTimeout(t);
  }
}
const DEFAULT_TIMEOUT_MS = 600_000; // 10 min — gpt-image-2 takes 2–5 min
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 15_000;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function detectImageMime(buf) {
  if (!buf || buf.length < 12) return { mime: 'application/octet-stream', ext: 'bin' };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { mime: 'image/gif', ext: 'gif' };
  // RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return { mime: 'application/octet-stream', ext: 'bin' };
}

function isTransient(status, errPayload) {
  if (status === 408 || status === 429 || (status >= 500 && status < 600)) return true;
  const code = errPayload?.error?.code ?? '';
  const type = errPayload?.error?.type ?? '';
  return /rate_limit|server_error|service_unavailable|timeout/i.test(`${code} ${type}`);
}

/**
 * @param {object} args
 * @param {string} args.prompt
 * @param {Buffer[]} args.imageBuffers - one or more reference images (PNG/JPEG/WebP/GIF)
 * @param {string} [args.model='gpt-image-2']
 * @param {string} [args.size='1024x1024'] — must be one of OpenAI's supported sizes: 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape), or 'auto'
 * @param {string} [args.quality='medium']
 * @param {number} [args.n=1]
 * @param {number} [args.timeoutMs]
 * @param {number} [args.attempts]
 * @returns {Promise<Buffer>} PNG bytes of the first generated image
 */
export async function generateImageEdit({
  prompt,
  imageBuffers,
  model = 'gpt-image-2',
  size = '1024x1024',
  quality = 'medium',
  n = 1,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required');
  }
  if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) {
    throw new Error('imageBuffers must be a non-empty array of Buffers');
  }

  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('n', String(n));
    imageBuffers.forEach((buf, i) => {
      const { mime, ext } = detectImageMime(buf);
      form.append('image[]', new Blob([buf], { type: mime }), `ref-${i}.${ext}`);
    });

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      console.log(`    [openai] images.edits model=${model} attempt=${attempt}/${attempts} (size=${size}, q=${quality})`);
      res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      lastErr = err;
      console.warn(`    [openai] network error on attempt ${attempt}: ${err.message}`);
      if (attempt >= attempts) throw err;
      await sleep(DEFAULT_RETRY_DELAY_MS * attempt);
      continue;
    } finally {
      clearTimeout(t);
    }

    if (!res.ok) {
      let body = null;
      try {
        body = await res.json();
      } catch {
        // ignore parse error
      }
      const message = body?.error?.message || `HTTP ${res.status}`;
      // Classify safety / content-policy rejections separately — these
      // are NOT transient and surface to the user with a different
      // error_code so the UI can show a "rephrase + try again" state.
      const violations = Array.isArray(body?.error?.safety_violations) ? body.error.safety_violations : null;
      const isPolicy = res.status === 400 && (
        /safety system|safety_violations|content_policy/i.test(message)
        || (violations && violations.length > 0)
      );
      if (isPolicy) {
        const policyErr = new Error(
          violations
            ? `Content policy: ${violations.join(', ')} — try a different character or beats.`
            : 'Content policy: this prompt was rejected by the safety filter — try a different character or beats.',
        );
        policyErr.code = 'CONTENT_POLICY';
        throw policyErr;
      }
      lastErr = new Error(`OpenAI images.edits failed: ${message}`);
      if (isTransient(res.status, body) && attempt < attempts) {
        const waitMs = DEFAULT_RETRY_DELAY_MS * attempt;
        console.warn(`    [openai] transient ${res.status} on attempt ${attempt}/${attempts}: ${message}. Retry in ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }
      throw lastErr;
    }

    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`OpenAI images.edits returned no b64_json: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return Buffer.from(b64, 'base64');
  }

  throw lastErr ?? new Error('OpenAI images.edits failed after retries');
}
