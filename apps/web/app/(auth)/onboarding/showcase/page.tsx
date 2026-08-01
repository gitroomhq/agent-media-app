// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step 2 - "AgentMedia is your content machine".
 *
 * Six portrait video tiles in a 3x2 grid (1 column on mobile) under a
 * short two-row headline, with a single Continue button. The videos
 * are pulled from the same R2 bucket the homepage uses so we don't
 * have to host duplicates.
 *
 * Clicking Continue marks the user as onboarded
 * (POST /api/onboarding/complete) and sends them to /subscribe.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

const R2_BASE =
  'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01';

const SHOWCASE_VIDEOS = [
  `${R2_BASE}/497dd5c3-efa0-44f5-be47-187dcfd4fa38/ugc-final.mp4`,
  `${R2_BASE}/7e17e7f7-acd3-4e48-8143-1a871229f442/ugc-final.mp4`,
  `${R2_BASE}/cb69983d-2773-4624-ac55-8d47c15cd0c6/ugc-final.mp4`,
  `${R2_BASE}/e229b1d5-b14b-46e8-84ee-0dc5c7d7bb49/ugc-final.mp4`,
  `${R2_BASE}/05291571-03cc-4d49-adcb-069822817582/character-video-final.mp4`,
];

export default function OnboardingShowcasePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  useOnboardingEvent('showcase');

  function handleContinue() {
    setSubmitting(true);
    logOnboardingEvent('showcase', 'completed');
    router.push('/onboarding/product');
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-white text-black">
      {/* Top brand */}
      <header className="flex w-full items-center justify-between px-6 py-5">
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>agent-media</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        <h1
          className="font-normal text-black"
          style={{
            fontSize: 'clamp(20px, 2vw, 28px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          Are you ready to boost your social?
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          Let&apos;s prepare your brand
        </p>

        {/* Single row of 5 portrait thumbnails - kept tiny so the whole
         *  step still fits on one screen. */}
        <div className="mt-6 grid w-full max-w-[400px] grid-cols-5 gap-2">
          {SHOWCASE_VIDEOS.map((src) => (
            <div
              key={src}
              className="relative overflow-hidden rounded-lg bg-black"
              style={{ aspectRatio: '9 / 16' }}
            >
              <video
                src={src}
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
          ))}
        </div>

        <div
          className="mt-8"
          onClickCapture={(e) => {
            e.preventDefault();
            if (!submitting) handleContinue();
          }}
          aria-disabled={submitting}
          style={{ opacity: submitting ? 0.7 : 1 }}
        >
          <Home2CTAButton href="#" variant="dark" size="lg" showArrow={false}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Continue
              </span>
            ) : (
              'Continue'
            )}
          </Home2CTAButton>
        </div>
      </main>
    </div>
  );
}
