// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - "How It Works" section.
 *
 * Cryptix layout: 2-column header (title+sub left, CTA right), then a
 * 3-card row below. Each step card carries a numbered badge, a visual
 * mockup, and a title + body. Step 1 = install (terminal). Step 2 =
 * chat prompt to any agent. Step 3 = handoff (agent + AgentMedia logos)
 * with auto-publish to socials. Sits inside the same grid wrapper as
 * WhyChoose + AgentsGrid so the vertical lines continue across all
 * three sections.
 */

import Link from 'next/link';
import {
  siClaude,
  siInstagram,
  siTiktok,
  siYoutube,
} from 'simple-icons';
import type { SimpleIcon as SimpleIconType } from 'simple-icons';
import { AgentMediaLogo } from '@/components/agent-media-logo';

const GRID_LINE = 'rgba(255,255,255,0.08)';

function BrandIcon({
  icon,
  size = 22,
  colorOverride,
}: {
  icon: SimpleIconType;
  size?: number;
  colorOverride?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={icon.path} fill={colorOverride ?? `#${icon.hex}`} />
    </svg>
  );
}

function NumberBadge({ n }: { n: number }) {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium"
      style={{
        backgroundColor: 'var(--cryptix-surface-2)',
        boxShadow: `inset 0 0 0 1px ${GRID_LINE}`,
        color: 'var(--cryptix-text)',
      }}
    >
      {n}
    </div>
  );
}

function MockupShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        backgroundColor: 'var(--cryptix-bg)',
        boxShadow: `inset 0 0 0 1px ${GRID_LINE}`,
      }}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{
          backgroundColor: 'var(--cryptix-surface-2)',
          borderBottom: `1px solid ${GRID_LINE}`,
        }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#FF5F57' }} />
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#FEBC2E' }} />
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#28C840' }} />
      </div>
      <div
        className="px-4 py-4 font-mono text-[12px] leading-6"
        style={{ color: 'var(--cryptix-text)' }}
      >
        {children}
      </div>
    </div>
  );
}

function InstallMockup() {
  return (
    <MockupShell>
      <p>
        <span style={{ color: 'var(--cryptix-mint)' }}>$</span>{' '}
        npm i -g agent-media-cli
      </p>
      <p style={{ color: 'var(--cryptix-text-muted)' }} className="mt-1">
        added 1 package in 2.4s
      </p>
      <p style={{ color: 'var(--cryptix-mint)' }}>
        ✓ agent-media v2.0.0 installed
      </p>
    </MockupShell>
  );
}

function AskMockup() {
  // Chat-style: user message to agent on top, agent acknowledgement below.
  return (
    <div
      className="overflow-hidden rounded-xl p-4"
      style={{
        backgroundColor: 'var(--cryptix-bg)',
        boxShadow: `inset 0 0 0 1px ${GRID_LINE}`,
      }}
    >
      <div className="flex flex-col gap-3">
        <div
          className="self-end rounded-2xl rounded-br-md px-4 py-2.5 text-sm"
          style={{
            backgroundColor: 'var(--cryptix-mint)',
            color: 'var(--cryptix-bg)',
            maxWidth: '92%',
          }}
        >
          Create a TikTok about our new pricing launch
        </div>
        <div
          className="self-start flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm"
          style={{
            backgroundColor: 'var(--cryptix-surface-2)',
            color: 'var(--cryptix-text)',
            maxWidth: '92%',
          }}
        >
          <BrandIcon icon={siClaude} size={16} />
          <span>On it - generating now.</span>
        </div>
      </div>
    </div>
  );
}

function HandoffMockup() {
  // Two logos handing off to a row of social platforms below.
  return (
    <div
      className="overflow-hidden rounded-xl p-5"
      style={{
        backgroundColor: 'var(--cryptix-bg)',
        boxShadow: `inset 0 0 0 1px ${GRID_LINE}`,
      }}
    >
      <div className="flex items-center justify-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: 'var(--cryptix-surface-2)',
            boxShadow: `inset 0 0 0 1px ${GRID_LINE}`,
          }}
        >
          <BrandIcon icon={siClaude} size={26} />
        </div>
        <span
          className="text-xl"
          style={{ color: 'var(--cryptix-text-muted)' }}
        >
          +
        </span>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: 'var(--cryptix-surface-2)',
            boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.3)',
          }}
        >
          <AgentMediaLogo size={28} />
        </div>
      </div>
      <div
        aria-hidden
        className="mx-auto my-4 h-px w-1/2"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.7) 50%, transparent 100%)',
        }}
      />
      <div className="flex items-center justify-center gap-3">
        <BrandIcon icon={siTiktok} size={22} colorOverride="#FFFFFF" />
        <BrandIcon icon={siInstagram} size={22} />
        <BrandIcon icon={siYoutube} size={22} />
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Install the CLI',
    body: 'One npm command. Your agent now has a fully-equipped video studio it can call from any tool.',
    mockup: <InstallMockup />,
  },
  {
    title: 'Ask your agent',
    body: 'Ask Claude, Cursor, or any agent to create ANY video for your social channels - no extra context needed.',
    mockup: <AskMockup />,
  },
  {
    title: 'Generate & publish',
    body: 'Your agent and AgentMedia work together - script, render, optionally caption, and auto-post to every channel.',
    mockup: <HandoffMockup />,
  },
];

export function Home2HowItWorks() {
  return (
    <section id="how-it-works" className="relative pb-24 pt-20">
      {/* Full-width horizontal rule at top of section */}
      <div
        className="w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      <div className="mx-auto max-w-6xl px-6 pt-16">
        {/* Header row: title+sub left, CTA right */}
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-2">
          <div>
            <h2
              className="font-normal"
              style={{
                color: 'var(--cryptix-text)',
                fontSize: 'clamp(28px, 3.6vw, 48px)',
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
              }}
            >
              How It Works
            </h2>
            <p
              className="mt-4 max-w-md"
              style={{
                color: 'var(--cryptix-text-muted)',
                fontSize: '16px',
                lineHeight: 1.55,
              }}
            >
              A simple, agentic pipeline. Your AI scripts, renders, and posts
              video - in three commands or one webhook.
            </p>
          </div>
          <div className="flex lg:justify-end">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-base font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--cryptix-mint)' }}
            >
              Create account now
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>

      </div>

      {/* Full-width horizontal rule above the step row */}
      <div
        className="mt-16 w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      {/* Step columns - no card bg/rounded shape; columns separated by
       * hairlines like Cryptix. The mockup panel inside each column keeps
       * its own subtle surface so it reads as a screenshot. */}
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="flex flex-col px-8 py-12"
              style={{
                borderLeft: i > 0 ? `1px solid ${GRID_LINE}` : 'none',
                // Soft mint halo concentrated at the top-center of each
                // column, fading to transparent - gives the Cryptix
                // "lit-from-above" feel without an outlined card.
                background:
                  'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(167,139,250,0.06), transparent 65%)',
              }}
            >
              <NumberBadge n={i + 1} />
              <div className="mt-6">{step.mockup}</div>
              <h3
                className="mt-7 text-lg font-medium"
                style={{ color: 'var(--cryptix-text)' }}
              >
                {step.title}
              </h3>
              <p
                className="mt-2 text-sm"
                style={{ color: 'var(--cryptix-text-muted)', lineHeight: 1.55 }}
              >
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Full-width horizontal rule below the step row */}
      <div
        className="w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />
    </section>
  );
}
