// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - Pricing section.
 *
 * Cryptix layout: 2-column header (title left, subtitle right), then a
 * 3-column row of plan blocks. The blocks have NO background of their
 * own - they sit inside the existing vertical grid wrapper and are
 * separated by those rules. The middle plan promotes via a "Popular"
 * badge + mint-filled Get-started button; the others use a hairline
 * outlined button. No monthly/yearly toggle.
 */

import { Check } from 'lucide-react';
import { Home2CTAButton } from '@/components/home2-cta-button';

const GRID_LINE = 'rgba(255,255,255,0.08)';

interface Plan {
  name: string;
  monthly: number;
  description: string;
  popular?: boolean;
  intro: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    name: 'Creator',
    monthly: 39,
    description: 'For creators shipping UGC content consistently.',
    intro: 'Included',
    features: ['3,900 credits / month'],
  },
  {
    name: 'Pro',
    monthly: 69,
    description: 'For professionals running production-scale content pipelines.',
    popular: true,
    intro: 'Everything in Creator, plus:',
    features: ['6,900 credits / month'],
  },
  {
    name: 'Pro Plus',
    monthly: 129,
    description: 'For high-volume teams and agencies.',
    intro: 'Everything in Pro, plus:',
    features: [
      '12,900 credits / month',
      'Early access to improved UGC tools',
    ],
  },
];

function PlanColumn({ plan }: { plan: Plan }) {
  const isHero = plan.popular;
  return (
    <div className="flex flex-col px-8 py-12">
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-medium"
          style={{ color: 'var(--cryptix-text)' }}
        >
          {plan.name}
        </h3>
        {plan.popular && (
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{
              color: 'var(--cryptix-text)',
              boxShadow: `inset 0 0 0 1px ${GRID_LINE}`,
            }}
          >
            Popular
          </span>
        )}
      </div>

      <div className="mt-6 flex items-baseline gap-1">
        <span
          className="font-normal"
          style={{
            color: 'var(--cryptix-text)',
            fontSize: 'clamp(36px, 4vw, 52px)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          ${plan.monthly}
        </span>
        <span
          className="text-sm"
          style={{ color: 'var(--cryptix-text-muted)' }}
        >
          /month
        </span>
      </div>

      {/* min-height forces all descriptions to occupy the same vertical
       * space so the Get-started buttons line up horizontally across the
       * three columns regardless of whether the copy wraps to 1 or 2
       * lines. */}
      <p
        className="mt-3 text-sm"
        style={{
          color: 'var(--cryptix-text-muted)',
          lineHeight: 1.5,
          minHeight: '3.25rem',
        }}
      >
        {plan.description}
      </p>

      {/* self-start prevents the parent flex-col's default `stretch`
       * from blowing the button out to full column width - keeps it a
       * content-width pill like the Cryptix reference. */}
      <div className="mt-7 self-start">
        <Home2CTAButton
          href="/login"
          variant={isHero ? 'light' : 'dark'}
          showArrow={false}
        >
          Get started
        </Home2CTAButton>
      </div>

      <div className="my-7 flex items-center gap-3">
        <div className="h-px flex-1" style={{ backgroundColor: GRID_LINE }} />
        <span
          className="text-xs"
          style={{ color: 'var(--cryptix-text-muted)' }}
        >
          {plan.intro}
        </span>
        <div className="h-px flex-1" style={{ backgroundColor: GRID_LINE }} />
      </div>

      <ul className="flex flex-col gap-3">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-sm"
            style={{ color: 'var(--cryptix-text)' }}
          >
            <Check
              size={16}
              strokeWidth={2}
              color="var(--cryptix-mint)"
              className="mt-0.5 flex-shrink-0"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Home2Pricing() {
  return (
    <section id="pricing" className="relative pb-32 pt-20">
      {/* Full-width horizontal rule at top of section */}
      <div
        className="w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      <div className="mx-auto max-w-6xl px-6 pt-16">
        {/* Header row */}
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-2">
          <h2
            className="font-normal"
            style={{
              color: 'var(--cryptix-text)',
              fontSize: 'clamp(28px, 3.6vw, 48px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
            }}
          >
            Choose your plan.
            <br />
            Start shipping today.
          </h2>
          <p
            className="max-w-md"
            style={{
              color: 'var(--cryptix-text-muted)',
              fontSize: '16px',
              lineHeight: 1.55,
            }}
          >
            Transparent pricing for every agent. Scale as your agent ships more
            content - no hidden fees or surprise overages.
          </p>
        </div>
      </div>

      {/* Full-width horizontal rule above the plan row */}
      <div
        className="mt-16 w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      {/* Plan columns - no card bg; separated by the grid wrapper's
       * existing vertical lines. We also draw explicit column dividers so
       * the separation reads cleanly inside max-w-6xl. */}
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {PLANS.map((plan, i) => (
            <div
              key={plan.name}
              style={{
                borderLeft: i > 0 ? `1px solid ${GRID_LINE}` : 'none',
              }}
            >
              <PlanColumn plan={plan} />
            </div>
          ))}
        </div>
      </div>

      {/* Full-width horizontal rule below the plan row */}
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
