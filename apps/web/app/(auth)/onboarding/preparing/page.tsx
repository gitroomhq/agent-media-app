// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step - "Preparing your brand".
 *
 * Two-column reveal:
 *
 *   LEFT  -- 4-step checklist that the user watches tick through.
 *            Each step only flips to "done" when its underlying piece
 *            of data is actually verified (screenshot + logo via image
 *            preload, palette + messaging via data presence). We never
 *            advance past a step until it's REALLY done - that was the
 *            biggest complaint with the previous fake animation.
 *
 *   RIGHT -- A single asset card that swaps to show whichever step is
 *            currently active (screenshot, then logo, then palette,
 *            then headline + description).
 *
 * After all four steps complete we replace the right card with an
 * "All set" success state and reveal a single "Done" CTA. Done click
 * marks onboarding complete and routes to /subscribe (plan select).
 *
 * If a piece is genuinely missing (the user skipped the URL step, or
 * the extractor couldn't find a logo / palette / etc.) we mark just
 * that step "skipped" with a faint note and keep walking - we don't
 * pretend it succeeded.
 *
 * If the brand-extract API itself fails we surface the error in the
 * right column and still show Done so the user is never trapped.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Check, AlertCircle, ImageOff } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

interface Brand {
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
}

type StepKey = 'screenshot' | 'logo' | 'palette' | 'content';
type StepStatus = 'pending' | 'active' | 'done' | 'skipped';
type Phase = 'fetching' | 'verifying' | 'ready' | 'error';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'screenshot', label: 'Capturing screenshot' },
  { key: 'logo',       label: 'Pulling logo' },
  { key: 'palette',    label: 'Extracting color palette' },
  { key: 'content',    label: 'Reading your messaging' },
];

// Minimum dwell time on each step once we enter it, even if its data
// is already cached. Keeps the reveal from feeling like a flash and
// gives the user time to actually look at the asset.
const MIN_STEP_MS = 5000;
// Hard cap on how long we wait for an asset to load before moving on
// with a 'skipped' status.
const STEP_TIMEOUT_MS = 8000;

/** Preload an image URL. Resolves true on success, false on error / .ico. */
function preloadImage(src: string | null | undefined, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    // Browsers don't render .ico inside <img> reliably, so treat them
    // as a load failure for preview purposes.
    if (/\.ico(\?|$)/i.test(src)) return resolve(false);
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    setTimeout(() => finish(false), timeoutMs);
  });
}

export default function OnboardingPreparingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('fetching');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  // statuses[i] is the per-step status. Mutated by the verification
  // effect as each step completes / times out / is skipped.
  const [statuses, setStatuses] = useState<StepStatus[]>(() =>
    STEPS.map((_, i) => (i === 0 ? 'active' : 'pending')),
  );
  // index of the step we are currently working on (0..STEPS.length). When
  // it reaches STEPS.length we transition to 'ready'.
  const [currentIdx, setCurrentIdx] = useState(0);
  const startedRef = useRef(false);
  useOnboardingEvent('preparing');

  // Kick off the extraction once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/brand-extract', { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error || `Failed (${res.status})`);
          setPhase('error');
          return;
        }
        if (body?.skipped) {
          // No URL was given. Mark every step skipped and let the user
          // through - there's nothing to preview.
          setStatuses(STEPS.map(() => 'skipped'));
          setCurrentIdx(STEPS.length);
          setPhase('ready');
          return;
        }
        setBrand(body.brand as Brand);
        setPhase('verifying');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Network error');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Strict per-step verification. Only runs once brand-extract has
  // returned ('verifying'). Each step blocks until its own asset is
  // genuinely loaded / its data is genuinely present.
  useEffect(() => {
    if (phase !== 'verifying' || !brand || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      // Helper: settle one step with the given status, then advance.
      function settleStep(idx: number, status: 'done' | 'skipped') {
        if (cancelled) return;
        setStatuses((prev) => {
          const next = [...prev];
          next[idx] = status;
          if (idx + 1 < STEPS.length) next[idx + 1] = 'active';
          return next;
        });
        setCurrentIdx(idx + 1);
      }

      for (let i = 0; i < STEPS.length; i += 1) {
        if (cancelled) return;
        const enteredAt = Date.now();
        const step = STEPS[i];
        let status: 'done' | 'skipped' = 'skipped';

        if (step.key === 'screenshot') {
          const ok = await preloadImage(brand.screenshot, STEP_TIMEOUT_MS);
          status = ok ? 'done' : 'skipped';
        } else if (step.key === 'logo') {
          const ok = await preloadImage(brand.logo, STEP_TIMEOUT_MS);
          status = ok ? 'done' : 'skipped';
        } else if (step.key === 'palette') {
          const palette = (brand.palette ?? []).filter(
            (c) => typeof c === 'string' && c.length > 0,
          );
          status = palette.length > 0 ? 'done' : 'skipped';
        } else if (step.key === 'content') {
          status = brand.title || brand.description || brand.hero ? 'done' : 'skipped';
        }

        // Enforce minimum dwell time so the user can actually see the
        // step before it ticks off.
        const elapsed = Date.now() - enteredAt;
        if (elapsed < MIN_STEP_MS) {
          await new Promise((r) => setTimeout(r, MIN_STEP_MS - elapsed));
        }
        if (cancelled) return;
        settleStep(i, status);
      }

      if (!cancelled) setPhase('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, brand]);

  async function handleDone() {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await fetch('/api/onboarding/complete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Complete failed (${res.status})`);
      }
      logOnboardingEvent('completed', 'completed', {
        had_brand: brand ? 'yes' : 'no',
      });
      router.push('/onboarding/plan');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish');
      setCompleting(false);
    }
  }

  // What does the right column show? Drive off currentIdx / phase.
  //   - phase=fetching: skeleton "looking at your site..."
  //   - phase=verifying or in-flight step: the asset for the active step
  //   - phase=ready: "All set" + Done CTA
  //   - phase=error: error message + Done escape
  const focusKey: StepKey | null = useMemo(() => {
    if (phase === 'error' || phase === 'ready') return null;
    const idx = Math.min(currentIdx, STEPS.length - 1);
    return STEPS[idx].key;
  }, [phase, currentIdx]);

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-black">
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/onboarding/tool"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>AgentMedia</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <h1
              className="font-normal text-black"
              style={{
                fontSize: 'clamp(24px, 2.4vw, 36px)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              {phase === 'ready' ? 'Your brand is ready' : 'Preparing your brand'}
            </h1>
            <p className="mt-3 text-sm" style={{ color: 'rgba(0,0,0,0.55)' }}>
              {phase === 'error'
                ? 'We hit a snag, but you can keep going.'
                : phase === 'ready'
                  ? 'Here’s what we pulled from your site.'
                  : 'Hold on – we’re reading your site to set up your defaults.'}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
            {/* LEFT - checklist */}
            <ul className="flex flex-col gap-3">
              {STEPS.map((step, i) => {
                const status = statuses[i];
                const isActive = status === 'active';
                const isDone = status === 'done';
                const isSkipped = status === 'skipped';
                return (
                  <li
                    key={step.key}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm"
                    style={{
                      border: '1px solid rgba(0,0,0,0.08)',
                      backgroundColor: isDone || isSkipped ? '#F6F6F6' : '#FFFFFF',
                    }}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: isDone ? '#0E0E0E' : '#FFFFFF',
                        border: isDone
                          ? '1px solid #0E0E0E'
                          : '1px solid rgba(0,0,0,0.18)',
                      }}
                      aria-hidden
                    >
                      {isDone ? (
                        <Check className="h-3.5 w-3.5 text-white" />
                      ) : isActive ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'rgba(0,0,0,0.55)' }} />
                      ) : isSkipped ? (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }} />
                      ) : null}
                    </span>
                    <span className="flex-1" style={{ color: isDone || isActive ? '#000' : 'rgba(0,0,0,0.55)' }}>
                      {step.label}
                    </span>
                    {isSkipped ? (
                      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.4)' }}>
                        not found
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* RIGHT - current asset / success / error */}
            <div
              className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl p-6"
              style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#FAFAFA' }}
            >
              <RightPanel
                phase={phase}
                focusKey={focusKey}
                brand={brand}
                error={error}
              />
            </div>
          </div>

          {phase === 'ready' || phase === 'error' ? (
            <div className="mt-10 flex justify-center">
              <div
                onClickCapture={(e) => {
                  e.preventDefault();
                  if (!completing) handleDone();
                }}
                aria-disabled={completing}
                style={{
                  opacity: completing ? 0.5 : 1,
                  pointerEvents: completing ? 'none' : 'auto',
                }}
              >
                <Home2CTAButton href="#" variant="dark" size="lg" showArrow={false}>
                  {completing ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Finishing
                    </span>
                  ) : (
                    'Done'
                  )}
                </Home2CTAButton>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function RightPanel({
  phase,
  focusKey,
  brand,
  error,
}: {
  phase: Phase;
  focusKey: StepKey | null;
  brand: Brand | null;
  error: string | null;
}) {
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-600">{error || 'Extraction failed'}</p>
        <p className="text-xs" style={{ color: 'rgba(0,0,0,0.55)' }}>
          You can still continue — we’ll use neutral defaults.
        </p>
      </div>
    );
  }

  if (phase === 'fetching') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'rgba(0,0,0,0.4)' }} />
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.55)' }}>
          Looking at your site…
        </p>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: '#0E0E0E' }}
          aria-hidden
        >
          <Check className="h-6 w-6 text-white" />
        </span>
        <p className="text-base font-medium text-black">All set</p>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.55)' }}>
          Click Done to choose a plan and start creating.
        </p>
      </div>
    );
  }

  // phase === 'verifying' — show the asset that matches focusKey.
  if (!brand || !focusKey) return null;

  if (focusKey === 'screenshot') {
    if (!brand.screenshot) return <NotFoundChip label="screenshot" />;
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <p className="text-center text-xs uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Desktop screenshot
        </p>
        <div
          className="overflow-hidden rounded-2xl"
          style={{ border: '1px solid rgba(0,0,0,0.08)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.screenshot} alt="Desktop screenshot" className="block h-auto w-full" />
        </div>
      </div>
    );
  }

  if (focusKey === 'logo') {
    if (!brand.logo || /\.ico(\?|$)/i.test(brand.logo)) {
      return <NotFoundChip label="logo" />;
    }
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Logo
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brand.logo}
          alt="Logo"
          className="h-20 w-20 rounded-2xl object-contain"
          style={{ border: '1px solid rgba(0,0,0,0.08)', padding: 8, backgroundColor: '#fff' }}
        />
      </div>
    );
  }

  if (focusKey === 'palette') {
    const palette = (brand.palette ?? []).filter((c) => typeof c === 'string' && c.length > 0);
    if (palette.length === 0) return <NotFoundChip label="color palette" />;
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Palette
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {palette.map((hex) => (
            <span
              key={hex}
              className="flex h-12 w-12 items-center justify-center rounded-full text-[10px] font-medium"
              title={hex}
              style={{
                backgroundColor: hex,
                border: '1px solid rgba(0,0,0,0.08)',
                color: 'rgba(255,255,255,0.85)',
                textShadow: '0 1px 0 rgba(0,0,0,0.25)',
              }}
            >
              {hex}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // focusKey === 'content'
  if (!brand.title && !brand.description && !brand.hero) {
    return <NotFoundChip label="messaging" />;
  }
  return (
    <div className="flex w-full max-w-md flex-col gap-3 text-left">
      <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>
        Messaging
      </p>
      {brand.title ? (
        <p className="text-base font-medium text-black">{brand.title}</p>
      ) : null}
      {brand.description ? (
        <p className="text-sm leading-snug" style={{ color: 'rgba(0,0,0,0.65)' }}>
          {brand.description}
        </p>
      ) : brand.hero ? (
        <p className="text-sm leading-snug" style={{ color: 'rgba(0,0,0,0.65)' }}>
          {brand.hero}
        </p>
      ) : null}
    </div>
  );
}

function NotFoundChip({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <ImageOff className="h-7 w-7" style={{ color: 'rgba(0,0,0,0.3)' }} />
      <p className="text-sm" style={{ color: 'rgba(0,0,0,0.55)' }}>
        No {label} found
      </p>
    </div>
  );
}
