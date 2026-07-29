// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Root marketing homepage — the Cryptix-styled agentic landing.
 *
 * What used to live at /home2 is now the root /. The old marketing
 * landing was removed in the June 2026 content cleanup; once we're happy
 * with this surface in prod we can delete it.
 *
 * This page deliberately renders OUTSIDE the (landing) route group so
 * it does NOT inherit (landing)/layout.tsx's LandingHeader + footer.
 * Instead it brings its own chrome (Home2Header + Home2Footer) — same
 * components home2/layout.tsx used to wrap with.
 */

import Link from 'next/link';
import { Home2Header } from '@/components/home2-header';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { Home2Flow } from '@/components/home2-flow';
import { Home2LaserHero } from '@/components/home2-laser-hero';
import { Home2Positioning } from '@/components/home2-positioning';
import { Home2WhyChoose } from '@/components/home2-why-choose';
import { Home2AgentsGrid } from '@/components/home2-agents-grid';
import { Home2HowItWorks } from '@/components/home2-how-it-works';
import { Home2Pricing } from '@/components/home2-pricing';
import { Home2Faq } from '@/components/home2-faq';
import { Home2VideoShowcase } from '@/components/home2-video-showcase';
import { Home2SpotlightVideo } from '@/components/home2-spotlight-video';
import { Home2Ready } from '@/components/home2-ready';
import { Home2Footer } from '@/components/home2-footer';
import { Home2Integrations } from '@/components/home2-integrations';
import { SkillInstallBlock } from '@/components/home2-skill-install';

export default function RootHomePage() {
  return (
    <div className="theme-cryptix relative min-h-screen overflow-x-hidden">
      <Home2Header />

      <main className="relative">
        {/* ── Mint halo bleed ─────────────────────────────────────── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-[640px]"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(60, 80, 180, 0.10), transparent 70%)',
          }}
        />

        <section className="relative z-10 mx-auto flex max-w-6xl flex-col items-start px-6 pb-12 pt-12 text-left sm:pt-24">
          <h1
            className="max-w-3xl text-[34px] font-normal sm:text-5xl lg:text-6xl xl:text-[68px]"
            style={{
              color: 'var(--cryptix-text)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            The EASIEST way
            <br />
            to create UGC videos
          </h1>

          <p
            className="mt-7 max-w-xl text-base leading-relaxed sm:text-lg"
            style={{ color: 'var(--cryptix-text-muted)' }}
          >
            One CLI. Generates the video, writes the post copy, posts it.
            Works in Claude Code, Cursor, n8n, and any agentic tool.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Home2CTAButton href="/login" variant="light">Get started</Home2CTAButton>
            <Link
              href="/skills"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
              style={{ color: 'var(--cryptix-text)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              <span aria-hidden>↳</span>
              <span>Browse all skills</span>
            </Link>
          </div>

          {/* Skill install — compact, slots under the CTA without pushing the laser hero */}
          <div className="mt-6 w-full max-w-2xl">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Install the Claude skill
            </p>
            <SkillInstallBlock />
          </div>
        </section>

        <Home2LaserHero />
        <Home2Flow />
        <Home2VideoShowcase />
        <Home2SpotlightVideo />
        <Home2Positioning />

        {/* ── Featured grid wrapper ──────────────────────────────── */}
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          >
            {[-720, -576, 576, 720].map((offset) => (
              <div
                key={offset}
                className="absolute inset-y-0 w-px"
                style={{
                  left: `calc(50% + ${offset}px)`,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              />
            ))}
          </div>
          <Home2WhyChoose />
          <Home2AgentsGrid />
          <Home2HowItWorks />
          <Home2Pricing />
          <Home2Faq />
        </div>

        <Home2Integrations />
        <Home2Ready />
        <Home2Footer />
      </main>
    </div>
  );
}
