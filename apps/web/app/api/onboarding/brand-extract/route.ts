// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/onboarding/brand-extract
 *
 * Proxy to the standalone brand-extractor service (Playwright +
 * Chromium). Lives at services/brand-extractor in this repo, deployed
 * to Railway as its own service so the Chromium image doesn't bloat
 * the media-worker.
 *
 * Flow:
 *   1. Read profiles.onboarding_data.product.url for the current user.
 *   2. POST it to ${BRAND_EXTRACTOR_URL}/brand-extract with X-Worker-Secret.
 *   3. Persist the returned brand object into
 *      profiles.onboarding_data.brand and echo it to the client.
 *
 * Env:
 *   BRAND_EXTRACTOR_URL    - e.g. https://brand-extractor-production.up.railway.app
 *   BRAND_EXTRACTOR_SECRET - same value as the service's WORKER_SECRET
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type ProductAnswer =
  | { url: string }
  | { skipped: true }
  | Record<string, unknown>;

interface ExtractedBrand {
  url: string;
  title: string | null;
  description: string | null;
  hero?: string | null;
  screenshot: string | null;
  screenshot_mobile?: string | null;
  image: string | null;
  logo: string | null;
  theme_color?: string | null;
  palette: string[];
  extracted_at: string;
}

interface ExtractorResponse {
  ok?: boolean;
  brand?: ExtractedBrand;
  error?: string;
}

const SERVICE_URL = process.env.BRAND_EXTRACTOR_URL;
const SERVICE_SECRET = process.env.BRAND_EXTRACTOR_SECRET;

export async function POST() {
  if (!SERVICE_URL || !SERVICE_SECRET) {
    return NextResponse.json(
      {
        error:
          'brand-extractor not configured (BRAND_EXTRACTOR_URL / BRAND_EXTRACTOR_SECRET)',
      },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('onboarding_data')
    .eq('id', user.id)
    .single();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const onboardingData =
    (profile?.onboarding_data && typeof profile.onboarding_data === 'object'
      ? (profile.onboarding_data as Record<string, unknown>)
      : {}) ?? {};
  const productAnswer = onboardingData.product as ProductAnswer | undefined;
  const url =
    productAnswer && typeof productAnswer === 'object' && 'url' in productAnswer
      ? String((productAnswer as { url: unknown }).url || '').trim()
      : '';
  if (!url) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_url' });
  }

  // Hand off to the worker. ~5-15s typical; 30s upper bound matches our
  // Vercel function timeout headroom.
  let extractorJson: ExtractorResponse;
  try {
    const resp = await fetch(`${SERVICE_URL.replace(/\/$/, '')}/brand-extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': SERVICE_SECRET,
      },
      body: JSON.stringify({ url, job_id: `onboarding-${user.id}` }),
      signal: AbortSignal.timeout(30_000),
    });
    extractorJson = (await resp.json()) as ExtractorResponse;
    if (!resp.ok || !extractorJson?.ok || !extractorJson.brand) {
      return NextResponse.json(
        { error: extractorJson?.error || `brand-extractor ${resp.status}` },
        { status: 502 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'brand-extractor fetch failed' },
      { status: 502 },
    );
  }

  const brand = extractorJson.brand;
  const merged = { ...onboardingData, brand };
  const { error: writeErr } = await supabase
    .from('profiles')
    .update({ onboarding_data: merged })
    .eq('id', user.id);
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, brand });
}
