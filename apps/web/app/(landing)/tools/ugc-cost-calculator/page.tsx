'use client';

// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CREDIT_RATE = 30; // credits per second
const DOLLAR_PER_CREDIT = 0.01; // $1 = 100 credits

const DURATIONS = [
  { label: '5 seconds', value: 5 },
  { label: '10 seconds', value: 10 },
  { label: '15 seconds', value: 15 },
] as const;

const COMPETITOR_PRICES: Record<string, Record<number, number>> = {
  makeugc: { 5: 4.5, 10: 6.0, 15: 8.0 },
  arcads: { 5: 5.0, 10: 7.5, 15: 10.0 },
};

export default function UgcCostCalculatorPage() {
  const [duration, setDuration] = useState(10);
  const [quantity, setQuantity] = useState(10);

  const credits = duration * CREDIT_RATE * quantity;
  const cost = credits * DOLLAR_PER_CREDIT;
  const makeugcCost = (COMPETITOR_PRICES.makeugc[duration] ?? 6) * quantity;
  const arcadsCost = (COMPETITOR_PRICES.arcads[duration] ?? 7.5) * quantity;
  const makeugcSavings = makeugcCost - cost;
  const arcadsSavings = arcadsCost - cost;

  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Tool
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            UGC Video Cost Calculator
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            How much does AI UGC video actually cost? Pick your duration and quantity below to see
            the real numbers. Compare <strong className="text-[#121212]">agent-media</strong> pricing
            against MakeUGC and Arcads side by side. No sign-up required.{' '}
            <Link
              href="/#pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              See full pricing plans
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Calculator className="h-6 w-6" />
            Calculate Your Cost
          </h2>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            {/* Inputs */}
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <div>
                <label className="text-sm font-semibold text-[#121212]">
                  Video Duration
                </label>
                <div className="mt-3 flex gap-3">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setDuration(d.value)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        duration === d.value
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-[#d4d4d4] bg-white text-[#6b6b76] hover:border-[#121212]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <label className="text-sm font-semibold text-[#121212]">
                  Number of Videos
                </label>
                <div className="mt-3 flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#d4d4d4] accent-purple-600"
                  />
                  <span className="w-12 text-right font-mono text-lg font-bold text-[#121212]">
                    {quantity}
                  </span>
                </div>
              </div>

              <div className="mt-8 rounded-lg bg-purple-50 p-5">
                <p className="text-sm text-purple-700">
                  <strong>{quantity}</strong> video{quantity !== 1 ? 's' : ''} at{' '}
                  <strong>{duration}s</strong> each
                </p>
                <p className="mt-1 text-sm text-purple-700">
                  <strong>{credits.toLocaleString()}</strong> credits total
                </p>
                <p className="mt-3 text-3xl font-extrabold text-purple-700">
                  ${cost.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-purple-700/70">
                  with <strong>agent-media</strong>
                </p>
              </div>
            </div>

            {/* Comparison */}
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <p className="text-sm font-semibold text-[#121212]">
                Cost Comparison
              </p>
              <div className="mt-6 space-y-4">
                {/* agent-media */}
                <div className="rounded-lg border-2 border-purple-600 bg-purple-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-purple-700">
                      agent-media
                    </span>
                    <span className="text-lg font-extrabold text-purple-700">
                      ${cost.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-purple-700/70">
                    ${(cost / quantity).toFixed(2)} per video
                  </p>
                </div>

                {/* MakeUGC */}
                <div className="rounded-lg border border-[#d4d4d4] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#121212]">
                      MakeUGC
                    </span>
                    <span className="text-lg font-bold text-[#121212]">
                      ${makeugcCost.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#6b6b76]">
                    ${(makeugcCost / quantity).toFixed(2)} per video (estimated, as of April 2026)
                  </p>
                  {makeugcSavings > 0 && (
                    <p className="mt-2 text-xs font-semibold text-green-700">
                      Save ${makeugcSavings.toFixed(2)} with agent-media
                    </p>
                  )}
                </div>

                {/* Arcads */}
                <div className="rounded-lg border border-[#d4d4d4] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#121212]">
                      Arcads
                    </span>
                    <span className="text-lg font-bold text-[#121212]">
                      ${arcadsCost.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#6b6b76]">
                    ${(arcadsCost / quantity).toFixed(2)} per video (estimated, as of April 2026)
                  </p>
                  {arcadsSavings > 0 && (
                    <p className="mt-2 text-xs font-semibold text-green-700">
                      Save ${arcadsSavings.toFixed(2)} with agent-media
                    </p>
                  )}
                </div>
              </div>

              <p className="mt-4 text-xs text-[#6b6b76]">
                Competitor prices are estimates based on publicly available pricing pages as of April 2026.
                Actual costs may vary by plan and usage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How Pricing Works */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            How <span className="text-purple-600">agent-media</span> Pricing Works
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">agent-media</strong> charges 30 credits per second of video.
              A 10-second video costs 300 credits. At $1 per 100 credits, that is $3 per video.
              The rate is the same whether you use the CLI, API, or web dashboard.
            </p>
            <p>
              Monthly plans include a credit allowance that resets each cycle. If you need more, buy
              a credit pack ($39 for 3,900 credits). Packs never expire.
            </p>
          </div>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-semibold text-[#121212]">Plan</th>
                  <th className="px-5 py-4 text-right font-semibold text-[#121212]">Monthly</th>
                  <th className="px-5 py-4 text-right font-semibold text-[#121212]">Credits</th>
                  <th className="px-5 py-4 text-right font-semibold text-[#121212]">10s Videos</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { plan: 'Creator', monthly: '$39', credits: '3,900', videos: '~13' },
                  { plan: 'Pro', monthly: '$69', credits: '6,900', videos: '~23' },
                  { plan: 'Pro Plus', monthly: '$129', credits: '12,900', videos: '~43' },
                  { plan: 'Credit Pack', monthly: '$39 (one-time)', credits: '3,900', videos: '~13' },
                ].map((row) => (
                  <tr key={row.plan} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 font-semibold text-[#121212]">{row.plan}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.monthly}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.credits}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.videos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            <Link
              href="/#pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              View full pricing details
            </Link>
            .
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-8 text-center">
            <h2 className="text-2xl font-bold text-[#121212]">
              Ready to start generating?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-[#6b6b76]">
              Sign up and get your first videos at $3 each. CLI, API, and web dashboard included with every plan.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-[#121212] text-white hover:bg-[#333]"
                >
                  {'>'} Get Started
                </Button>
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
              >
                View Pricing <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-links */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Related Pages
          </h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/use-cases/ugc-video-api"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Video API <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/ai-video-cli"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              AI Video CLI <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/tools/ugc-script-generator"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Script Generator <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/makeugc-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/arcads-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-8 text-xs text-[#6b6b76]">
            Last updated: April 2026
          </p>
        </div>
      </section>
    </div>
  );
}
