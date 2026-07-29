// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/brand-kit
 *
 * Shows the brand snapshot we extracted on /onboarding/preparing:
 *   - desktop screenshot (scrollable inside the card so it feels like
 *     "your website" rather than a thumbnail)
 *   - brand name / og title / description
 *   - logo (AI-cropped PNG; falls back to whatever's in
 *     onboarding_data.brand.logo)
 *   - palette swatches
 *
 * If no brand was extracted (URL skipped or extractor failed) we show
 * an empty state with a one-click "Run extraction" CTA.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, RefreshCw, Globe } from 'lucide-react';

interface Brand {
  url: string;
  title: string | null;
  description: string | null;
  hero?: string | null;
  brand_name?: string | null;
  screenshot: string | null;
  screenshot_mobile?: string | null;
  logo: string | null;
  logo_source?: string | null;
  palette: string[];
  palette_source?: string | null;
}

interface StateResp {
  onboarded_at: string | null;
  onboarding_step: string | null;
  onboarding_data: { brand?: Brand } & Record<string, unknown>;
}

export default function BrandKitPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [reExtracting, setReExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/state', { method: 'GET' });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const body = (await res.json()) as StateResp;
      setBrand(body.onboarding_data?.brand ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReExtract() {
    if (reExtracting) return;
    setReExtracting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/brand-extract', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      if (body?.skipped) {
        setError('No product URL on file – set one in onboarding first.');
      } else if (body?.brand) {
        setBrand(body.brand as Brand);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-extraction failed');
    } finally {
      setReExtracting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Brand Kit
        </p>
        <h1
          className="font-normal"
          style={{
            color: '#E9E9F0',
            fontSize: 'clamp(28px,2.6vw,36px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Your brand
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          What we pulled from your site. Used everywhere the agents need brand context.
        </p>
      </div>

      {loading ? (
        <div
          className="mt-10 flex h-64 items-center justify-center rounded-3xl"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading brand kit…
          </span>
        </div>
      ) : !brand ? (
        <UrlForm onExtracted={(b) => setBrand(b)} setOuterError={setError} />
      ) : (
        <BrandView brand={brand} onReExtract={handleReExtract} reExtracting={reExtracting} />
      )}

      {error ? (
        <div
          className="mt-6 rounded-2xl px-4 py-3 text-sm"
          style={{
            border: '1px solid rgba(255,79,79,0.3)',
            backgroundColor: 'rgba(255,79,79,0.08)',
            color: '#FCA5A5',
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function BrandView({
  brand,
  onReExtract,
  reExtracting,
}: {
  brand: Brand;
  onReExtract: () => void;
  reExtracting: boolean;
}) {
  const hostname = (() => {
    try { return new URL(brand.url).hostname.replace(/^www\./, ''); }
    catch { return brand.url; }
  })();
  const palette = (brand.palette ?? []).filter((c) => typeof c === 'string' && c.length > 0);
  const displayName = brand.brand_name || brand.title || hostname;

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Left - full screenshot in scrollable container */}
      <div
        className="overflow-hidden rounded-3xl"
        style={{
          border: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: '#0B0C11',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#FF5F57' }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#FEBC2E' }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#28C840' }} />
            </span>
            <a
              href={brand.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              {hostname}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <button
            type="button"
            onClick={onReExtract}
            disabled={reExtracting}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-60"
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            {reExtracting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Re-extract
          </button>
        </div>
        <div
          className="max-h-[640px] overflow-y-auto"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {brand.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.screenshot}
              alt="Website screenshot"
              className="block w-full"
            />
          ) : (
            <div className="flex h-64 items-center justify-center" style={{ color: 'rgba(0,0,0,0.35)' }}>
              No screenshot captured
            </div>
          )}
        </div>
      </div>

      {/* Right - identity panel */}
      <div className="flex flex-col gap-4">
        {/* Logo + name card */}
        <div
          className="rounded-3xl p-5"
          style={{
            backgroundColor: '#191A22',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-start gap-4">
            {brand.logo && !/\.ico(\?|$)/i.test(brand.logo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo}
                alt="Logo"
                className="h-14 w-14 shrink-0 rounded-2xl object-contain"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: '#FFFFFF',
                  padding: 6,
                }}
              />
            ) : (
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: '#1F202A',
                }}
                aria-hidden
              >
                <Globe className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p
                className="text-base font-semibold"
                style={{ color: '#E9E9F0', letterSpacing: '-0.01em' }}
              >
                {displayName}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {hostname}
              </p>
            </div>
          </div>
        </div>

        {/* Palette card */}
        <div
          className="rounded-3xl p-5"
          style={{
            backgroundColor: '#191A22',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p
            className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Palette
          </p>
          {palette.length === 0 ? (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              No palette extracted.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {palette.map((hex) => (
                <span
                  key={hex}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-[9px] font-medium"
                  title={hex}
                  style={{
                    backgroundColor: hex,
                    color: 'rgba(255,255,255,0.85)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {hex.replace('#', '')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Messaging card */}
        {brand.title || brand.description ? (
          <div
            className="rounded-3xl p-5"
            style={{
              backgroundColor: '#191A22',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Messaging
            </p>
            {brand.title ? (
              <p className="text-sm font-medium" style={{ color: '#E9E9F0' }}>
                {brand.title}
              </p>
            ) : null}
            {brand.description ? (
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {brand.description}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UrlForm({
  onExtracted,
  setOuterError,
}: {
  onExtracted: (b: Brand) => void;
  setOuterError: (m: string | null) => void;
}) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const raw = url.trim();
    if (!raw || submitting) return;
    // Accept bare domains - prepend https:// when no scheme is present
    // so the user can paste "agent-media.ai" and have it work.
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setSubmitting(true);
    setOuterError(null);
    try {
      // 1. Persist the URL into onboarding_data.product.
      const ansRes = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'product', answer: { url: normalized } }),
      });
      if (!ansRes.ok) {
        const body = await ansRes.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${ansRes.status})`);
      }
      // 2. Run extraction.
      const exRes = await fetch('/api/onboarding/brand-extract', { method: 'POST' });
      const body = await exRes.json().catch(() => ({}));
      if (!exRes.ok) {
        throw new Error(body?.error || `Extraction failed (${exRes.status})`);
      }
      if (body?.brand) onExtracted(body.brand as Brand);
      else throw new Error('Extractor returned no brand');
    } catch (e) {
      setOuterError(e instanceof Error ? e.message : 'Extraction failed');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="mt-10 flex flex-col items-center justify-center gap-5 rounded-3xl py-16 px-6"
      style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#15161D' }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-base font-medium" style={{ color: '#E9E9F0' }}>
          No brand kit yet
        </p>
        <p className="max-w-sm text-center text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Paste your product / SaaS URL and we&rsquo;ll pull a screenshot, logo, palette and messaging straight from it.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex w-full max-w-xl flex-col items-stretch gap-2 sm:flex-row"
      >
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="your-site.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
          className="h-11 flex-1 rounded-full px-5 text-sm outline-none transition-colors placeholder:text-white/30 disabled:opacity-60"
          style={{
            backgroundColor: '#0F1015',
            color: '#E9E9F0',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <button
          type="submit"
          disabled={submitting || url.trim().length === 0}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:-translate-y-0.5"
          style={{
            backgroundColor: '#FFFFFF',
            color: '#0F1015',
            boxShadow: submitting
              ? 'none'
              : '0 8px 24px rgba(167,139,250,0.25), 0 0 0 1px rgba(255,255,255,0.6)',
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Extracting…
            </>
          ) : (
            'Extract brand'
          )}
        </button>
      </form>
    </div>
  );
}
