// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Brand extraction pipeline.
 *
 * Given a public URL, opens it in headless Chromium and pulls:
 *   - 1280x800  desktop PNG screenshot (uploaded to R2 -> public URL)
 *   - 390x844   mobile  PNG screenshot (with mobile user-agent +
 *                isMobile context, so responsive sites lay out their
 *                mobile DOM)
 *   - logo / favicon URL (link rel="icon", apple-touch-icon, og:logo)
 *   - og:image hero
 *   - title (og:title, then <title>)
 *   - description (og:description, then meta name="description")
 *   - theme-color (meta name="theme-color")
 *   - hero copy (first H1)
 *   - dominant colour palette (k-bucket quantisation on the desktop
 *     screenshot)
 *
 * Returns a plain JSON object — the caller persists it wherever it
 * needs to. No DB calls live here.
 */

import { chromium, devices } from 'playwright';
import sharp from 'sharp';
import { r2Upload } from './r2.js';
import { callVision, cropLogo } from './ai-vision.js';

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
// Use Playwright's built-in iPhone 13 profile as the source of truth
// for the mobile viewport + DPR + touch flags. Falls back to a hand-
// rolled 390x844 if the profile is missing for some reason.
const MOBILE_PROFILE = devices['iPhone 13'] ?? {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
const NAV_TIMEOUT_MS = 45_000;
const RENDER_SETTLE_MS = 2000;

/**
 * Convert a relative URL into an absolute one given a base.
 * Returns null when the input is empty or unparseable.
 */
function absolutize(maybeUrl, baseUrl) {
  if (!maybeUrl || typeof maybeUrl !== 'string') return null;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Extract a small dominant-colour palette from a PNG buffer.
 *
 * Strategy: downsize to 96x96, read raw RGB, drop near-white /
 * near-black AND near-grey pixels (so the palette doesn't collapse
 * onto antialiased text edges on a mostly-white page), snap survivors
 * to an 8-step bucket per channel, tally, return top N as hex.
 *
 * "Near-grey" filter: a pixel is grey when (max - min) of its channels
 * is small. We require max-min >= 25 (~10% colour difference) to keep
 * the swatch. Without this filter a black-text-on-white screenshot
 * yields a palette of six grey shades, which is what motivated this.
 */
async function extractPalette(pngBuffer, n = 6) {
  const { data, info } = await sharp(pngBuffer)
    .resize(96, 96, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map();
  const step = 32; // 8 buckets per channel (256 / 32)
  const SATURATION_MIN = 25; // max-min channel delta threshold
  for (let i = 0; i < data.length; i += info.channels) {
    const r0 = data[i];
    const g0 = data[i + 1];
    const b0 = data[i + 2];
    const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
    if (lum > 240 || lum < 15) continue;
    const chromaDelta = Math.max(r0, g0, b0) - Math.min(r0, g0, b0);
    if (chromaDelta < SATURATION_MIN) continue;
    const r = Math.round(r0 / step) * step;
    const g = Math.round(g0 / step) * step;
    const b = Math.round(b0 / step) * step;
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => {
      const r = (key >> 16) & 0xff;
      const g = (key >> 8) & 0xff;
      const b = key & 0xff;
      const toHex = (v) => v.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    });
  return sorted;
}

/**
 * Read brand metadata from inside the page. Runs in browser context.
 * Returned strings are trimmed; missing fields are null.
 */
async function readMeta(page) {
  return await page.evaluate(() => {
    function attr(sel, name) {
      const el = document.querySelector(sel);
      const v = el?.getAttribute(name);
      return v ? v.trim() : null;
    }
    function text(sel) {
      const el = document.querySelector(sel);
      const v = el?.textContent;
      return v ? v.trim() : null;
    }
    const title =
      attr('meta[property="og:title"]', 'content') ||
      attr('meta[name="twitter:title"]', 'content') ||
      text('title');
    const description =
      attr('meta[property="og:description"]', 'content') ||
      attr('meta[name="description"]', 'content') ||
      attr('meta[name="twitter:description"]', 'content');
    const image =
      attr('meta[property="og:image"]', 'content') ||
      attr('meta[name="twitter:image"]', 'content');
    // Logo selection: <img> tags don't render .ico reliably, and many
    // sites ship both /favicon.ico AND a higher-res PNG/SVG. Walk the
    // candidates and prefer the one most likely to render in a browser
    // <img> at preview size.
    const logoCandidates = [
      ...Array.from(document.querySelectorAll('link[rel="apple-touch-icon"]')),
      ...Array.from(
        document.querySelectorAll('link[rel="icon"][type="image/svg+xml"]'),
      ),
      ...Array.from(document.querySelectorAll('link[rel="icon"][sizes]')),
      ...Array.from(document.querySelectorAll('link[rel="icon"]')),
      ...Array.from(document.querySelectorAll('link[rel="shortcut icon"]')),
    ]
      .map((el) => el.getAttribute('href'))
      .filter((href) => typeof href === 'string' && href.length > 0);
    function pickLogo(cands) {
      // Drop .ico if any non-ico candidate is available.
      const nonIco = cands.filter((h) => !/\.ico(\?|$)/i.test(h));
      const pool = nonIco.length > 0 ? nonIco : cands;
      // Prefer .svg, then .png/.webp/.jpg, otherwise first.
      const svg = pool.find((h) => /\.svg(\?|$)/i.test(h));
      if (svg) return svg;
      const raster = pool.find((h) => /\.(png|webp|jpg|jpeg)(\?|$)/i.test(h));
      if (raster) return raster;
      return pool[0] ?? null;
    }
    const logo =
      pickLogo(logoCandidates) ||
      attr('meta[property="og:logo"]', 'content');
    const themeColor = attr('meta[name="theme-color"]', 'content');
    const h1 = text('h1');
    return { title, description, image, logo, themeColor, h1 };
  });
}

/**
 * Open the target URL in a given context, wait for it to settle, take
 * a screenshot, upload it to R2 and return the public URL + the
 * screenshot buffer (the desktop buffer is reused for palette
 * extraction; the mobile buffer is discarded after upload).
 *
 * `metaFromPage` is called once with the desktop page so we don't
 * re-parse the DOM twice.
 */
async function captureShot({ browser, contextOpts, url, label, jobId, readMetaToo }) {
  const ctx = await browser.newContext(contextOpts);
  try {
    const page = await ctx.newPage();
    // 'networkidle' hangs on busy sites with analytics / live video
    // pulls, so wait only for DOM + critical resources. The fixed
    // settle delay below gives anything important time to render.
    await page.goto(url, {
      waitUntil: 'load',
      timeout: NAV_TIMEOUT_MS,
    });
    await page.waitForTimeout(RENDER_SETTLE_MS);
    // Best-effort wait for networkidle, but never block the pipeline
    // when it doesn't settle - common with sites that keep polling.
    try {
      await page.waitForLoadState('networkidle', { timeout: 4000 });
    } catch {
      // ignore
    }
    const meta = readMetaToo ? await readMeta(page) : null;
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const publicUrl = await r2Upload(
      'brand-extracts',
      `${jobId}/screenshot-${label}.png`,
      buf,
      'image/png',
    );
    return { buf, publicUrl, meta };
  } finally {
    await ctx.close();
  }
}

/**
 * Top-level: launch Chromium, capture desktop + mobile shots in the
 * same browser instance, parse meta from the desktop pass, return the
 * brand JSON. Errors propagate to caller.
 */
export async function extractBrand({ url, jobId = `brand-${Date.now()}` }) {
  if (!url || typeof url !== 'string') {
    throw new Error('extractBrand: url is required');
  }
  // Coerce missing scheme: people paste "agent-media.ai" all the time.
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    // Desktop first - we also pull meta from this pass.
    const desktop = await captureShot({
      browser,
      contextOpts: {
        viewport: DESKTOP_VIEWPORT,
        userAgent: DESKTOP_UA,
      },
      url: target,
      label: 'desktop',
      jobId,
      readMetaToo: true,
    });

    // Mobile second - separate context so the iPhone UA + mobile
    // viewport actually triggers the responsive layout.
    const mobile = await captureShot({
      browser,
      contextOpts: { ...MOBILE_PROFILE },
      url: target,
      label: 'mobile',
      jobId,
      readMetaToo: false,
    });

    // K-bucket palette as a baseline. AI palette (below) wins when
    // available because it returns brand-identity colours instead of
    // antialiased text greys.
    const baselinePalette = await extractPalette(desktop.buf, 6);
    const meta = desktop.meta ?? {};

    // Claude vision pass over the desktop screenshot. Returns palette,
    // logo bounding box, brand name. Null on any failure - the rest of
    // the pipeline keeps working.
    let aiPalette = null;
    let aiBrandName = null;
    let aiLogoUrl = null;
    try {
      const vision = await callVision({
        screenshotBuf: desktop.buf,
        viewport: DESKTOP_VIEWPORT,
      });
      if (vision?.palette && vision.palette.length > 0) aiPalette = vision.palette;
      if (vision?.brand_name) aiBrandName = vision.brand_name;
      if (vision?.logo) {
        const cropped = await cropLogo({
          screenshotBuf: desktop.buf,
          box: vision.logo,
        });
        if (cropped) {
          aiLogoUrl = await r2Upload(
            'brand-extracts',
            `${jobId}/logo-ai.png`,
            cropped,
            'image/png',
          );
        }
      }
    } catch (e) {
      console.error('[brand-extract] vision pass failed:', e?.message ?? e);
    }

    // Prefer AI logo crop (clean, renderable PNG) over any .ico
    // favicon link we found in the page <head>. Fall back to the head
    // pick when AI didn't find one.
    const headLogo = absolutize(meta.logo, target);

    const brand = {
      url: target,
      title: meta.title ?? null,
      description: meta.description ?? null,
      hero: meta.h1 ?? null,
      brand_name: aiBrandName ?? meta.title ?? null,
      screenshot: desktop.publicUrl,
      screenshot_mobile: mobile.publicUrl,
      image: absolutize(meta.image, target),
      logo: aiLogoUrl ?? headLogo,
      logo_source: aiLogoUrl ? 'ai-crop' : headLogo ? 'meta' : null,
      theme_color: meta.themeColor ?? null,
      palette: aiPalette ?? baselinePalette,
      palette_source: aiPalette ? 'ai' : 'k-bucket',
      extracted_at: new Date().toISOString(),
    };
    return brand;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
