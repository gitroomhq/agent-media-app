// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, XCircle, AlertTriangle, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'AI UGC Pricing Comparison 2026: Cost Per Video Across 5 Platforms | agent-media',
  description:
    'We compared public pricing pages for agent-media, MakeUGC, Arcads, Creatify, and HeyGen. Here is what each platform actually costs per video in 2026.',
  keywords: [
    'ai ugc pricing comparison',
    'ai ugc cost',
    'ai ugc price per video',
    'makeugc pricing',
    'arcads pricing',
    'creatify pricing',
    'heygen pricing',
    'agent-media pricing',
    'ai video generator cost 2026',
    'ugc video cost comparison',
  ],
  openGraph: {
    title:
      'AI UGC Pricing Comparison 2026: Cost Per Video Across 5 Platforms',
    description:
      'Side-by-side pricing breakdown of agent-media, MakeUGC, Arcads, Creatify, and HeyGen. Verified April 2, 2026.',
    type: 'article',
    url: 'https://agent-media.ai/blog/ai-ugc-pricing-comparison-2026',
    publishedTime: '2026-04-02T00:00:00Z',
  },
  alternates: {
    canonical: 'https://agent-media.ai/blog/ai-ugc-pricing-comparison-2026',
  },
};

/* -- Pricing table data -------------------------------------------------- */

interface PlatformPricing {
  platform: string;
  plan: string;
  monthly: string;
  videosIncluded: string;
  costPerVideo: string;
  maxDuration: string;
  sourceUrl: string;
  highlight?: boolean;
}

const pricingData: PlatformPricing[] = [
  {
    platform: 'agent-media',
    plan: 'Creator',
    monthly: '$39',
    videosIncluded: '~13 (10s each)',
    costPerVideo: '~$3.00',
    maxDuration: '10s (15s on Pro)',
    sourceUrl: 'https://agent-media.ai/pricing',
    highlight: true,
  },
  {
    platform: 'MakeUGC',
    plan: 'Startup',
    monthly: '$49',
    videosIncluded: '5 videos',
    costPerVideo: '~$9.80',
    maxDuration: '25s',
    sourceUrl: 'https://makeugc.com/pricing',
  },
  {
    platform: 'Arcads',
    plan: 'Product',
    monthly: '$110',
    videosIncluded: '~10 videos',
    costPerVideo: '~$11.00',
    maxDuration: 'Up to 60s',
    sourceUrl: 'https://www.arcads.ai/pricing',
  },
  {
    platform: 'Creatify',
    plan: 'Creator',
    monthly: '$59',
    videosIncluded: 'Credit-based (varies)',
    costPerVideo: 'Varies by length',
    maxDuration: 'Up to 60s',
    sourceUrl: 'https://www.creatify.ai/pricing',
  },
  {
    platform: 'HeyGen',
    plan: 'Creator',
    monthly: '$29',
    videosIncluded: 'Credit-based (3 credits)',
    costPerVideo: '~$9.67 per credit',
    maxDuration: 'Up to 5 min',
    sourceUrl: 'https://www.heygen.com/pricing',
  },
];

/* -- Feature inclusion data ---------------------------------------------- */

interface FeatureRow {
  feature: string;
  agentMedia: boolean | string;
  makeUgc: boolean | string;
  arcads: boolean | string;
  creatify: boolean | string;
  heyGen: boolean | string;
}

const featureData: FeatureRow[] = [
  {
    feature: 'CLI tool',
    agentMedia: true,
    makeUgc: false,
    arcads: false,
    creatify: false,
    heyGen: false,
  },
  {
    feature: 'REST API',
    agentMedia: true,
    makeUgc: true,
    arcads: true,
    creatify: true,
    heyGen: 'Enterprise',
  },
  {
    feature: 'AI script generation',
    agentMedia: true,
    makeUgc: true,
    arcads: true,
    creatify: true,
    heyGen: true,
  },
  {
    feature: 'Subtitle styles',
    agentMedia: '17 styles',
    makeUgc: 'Limited',
    arcads: 'Limited',
    creatify: 'Limited',
    heyGen: 'Basic',
  },
  {
    feature: 'Scene direction',
    agentMedia: true,
    makeUgc: true,
    arcads: false,
    creatify: true,
    heyGen: false,
  },
  {
    feature: 'Pay-as-you-go credits',
    agentMedia: true,
    makeUgc: false,
    arcads: false,
    creatify: true,
    heyGen: true,
  },
  {
    feature: 'Credits never expire',
    agentMedia: true,
    makeUgc: 'N/A',
    arcads: 'N/A',
    creatify: false,
    heyGen: false,
  },
  {
    feature: 'Custom avatar cloning',
    agentMedia: false,
    makeUgc: true,
    arcads: false,
    creatify: false,
    heyGen: true,
  },
  {
    feature: 'Product-in-hand',
    agentMedia: false,
    makeUgc: true,
    arcads: false,
    creatify: false,
    heyGen: false,
  },
  {
    feature: 'Web-based editor',
    agentMedia: 'Dashboard',
    makeUgc: 'Full editor',
    arcads: 'Full editor',
    creatify: 'Full editor',
    heyGen: 'Full editor',
  },
];

/* -- Hidden cost data ---------------------------------------------------- */

interface HiddenCost {
  issue: string;
  platforms: string;
  detail: string;
}

const hiddenCosts: HiddenCost[] = [
  {
    issue: 'Monthly credit expiry',
    platforms: 'HeyGen, Creatify',
    detail:
      'Unused credits expire at the end of each billing cycle. If you buy 10 credits and use 6, you lose 4.',
  },
  {
    issue: 'Overage pricing',
    platforms: 'MakeUGC, Arcads',
    detail:
      'Generating more videos than your plan includes means upgrading to the next tier. No per-video top-up option.',
  },
  {
    issue: 'Feature gating by plan',
    platforms: 'HeyGen, Arcads, Creatify',
    detail:
      'API access, custom avatars, and advanced features are often locked behind higher-tier plans. The cheapest plan may not include what you need.',
  },
  {
    issue: 'Per-seat pricing',
    platforms: 'HeyGen, Creatify',
    detail:
      'Team features require additional per-seat charges. A 5-person team can double or triple the effective monthly cost.',
  },
  {
    issue: 'Export limitations',
    platforms: 'Various',
    detail:
      'Some platforms watermark output on lower tiers or limit export resolution. Check the fine print before committing.',
  },
];

/* -- Helper component ---------------------------------------------------- */

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <CheckCircle className="mx-auto h-4 w-4 text-green-600" />;
  }
  if (value === false) {
    return <XCircle className="mx-auto h-4 w-4 text-[#6b6b76]/40" />;
  }
  return <span className="text-xs">{value}</span>;
}

/* -- Page ---------------------------------------------------------------- */

export default function AiUgcPricingComparison2026Page() {
  return (
    <article className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
      {/* -- Header ------------------------------------------------------- */}
      <header>
        <div className="flex items-center gap-3 text-sm text-[#6b6b76]">
          <Link href="/blog" className="hover:text-[#121212]">
            Blog
          </Link>
          <span>/</span>
          <time dateTime="2026-04-02">April 2, 2026</time>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          AI UGC Pricing Comparison 2026: What Each Platform Actually Costs
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          AI UGC tools promise cheap video creation. But the real cost per video
          depends on plan structure, credit systems, and feature gating. We checked
          the public pricing pages for five platforms on April 2, 2026 and calculated
          the actual cost per video at each tier.
        </p>
      </header>

      {/* -- Methodology -------------------------------------------------- */}
      <section className="mt-12 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[#121212]">
          Methodology
        </h2>
        <p className="mt-3 text-sm text-[#6b6b76]">
          We visited each platform&apos;s public pricing page on April 2, 2026. We recorded
          the cheapest paid plan, calculated the number of videos included, and divided
          the monthly price by the number of videos to get cost per video. For credit-based
          platforms, we used the default credit allocation and standard video length. No
          promotional pricing or annual discounts were used. All prices are in USD.
        </p>
        <p className="mt-2 text-xs text-[#6b6b76]">
          Last verified: April 2, 2026. Pricing may have changed since this analysis.
        </p>
      </section>

      {/* -- CTA 1 -------------------------------------------------------- */}
      <div className="mt-10 rounded-lg bg-purple-50 p-5">
        <p className="text-sm text-purple-700">
          <strong><span className="text-purple-600">agent-media</span></strong> starts
          at $39/mo with transparent per-second pricing. No credit expiry on purchased
          packs. See the full breakdown on the{' '}
          <Link href="/pricing" className="font-semibold text-purple-700 underline">
            pricing page
          </Link>.
        </p>
      </div>

      {/* -- Cost per video table ----------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          Cost per video: side-by-side comparison
        </h2>
        <p className="mt-4 text-[#6b6b76]">
          This table shows the lowest paid plan on each platform and the effective cost
          per video. Lower is better.
        </p>

        <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Platform</th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Plan</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">Monthly</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">Videos</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">Cost/Video</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">Max Length</th>
              </tr>
            </thead>
            <tbody>
              {pricingData.map((row) => (
                <tr
                  key={row.platform}
                  className={`border-b border-[#d4d4d4] last:border-b-0 ${
                    row.highlight ? 'bg-purple-50' : ''
                  }`}
                >
                  <td className={`px-4 py-3 font-semibold ${row.highlight ? 'text-purple-700' : 'text-[#121212]'}`}>
                    {row.platform}
                  </td>
                  <td className="px-4 py-3 text-[#6b6b76]">{row.plan}</td>
                  <td className="px-4 py-3 text-center text-[#6b6b76]">{row.monthly}</td>
                  <td className="px-4 py-3 text-center text-[#6b6b76]">{row.videosIncluded}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${row.highlight ? 'text-purple-700' : 'text-[#121212]'}`}>
                    {row.costPerVideo}
                  </td>
                  <td className="px-4 py-3 text-center text-[#6b6b76]">{row.maxDuration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-[#6b6b76]">
          Sources:{' '}
          {pricingData.map((row, i) => (
            <span key={row.platform}>
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#121212] underline"
              >
                {row.platform}
              </a>
              {i < pricingData.length - 1 ? ', ' : ''}
            </span>
          ))}
          . Last verified: April 2, 2026.
        </p>
      </section>

      {/* -- The math ----------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          The math: 25 videos per month
        </h2>
        <p className="mt-4 text-[#6b6b76]">
          Suppose you need 25 short UGC videos per month for ad testing. Here is what
          that costs on each platform, based on their published pricing.
        </p>

        <div className="mt-8 space-y-4">
          {[
            {
              platform: 'agent-media',
              detail: 'Pro plan at $69/mo gives you 6,900 credits. Each 10s video costs 300 credits. That is 23 videos. Add a $39 credit pack for 13 more. Total: ~$108/mo for 36 videos. Cost per video: ~$3.00.',
              highlight: true,
            },
            {
              platform: 'MakeUGC',
              detail: 'Startup plan ($49/mo) gives you 5 videos. To reach 25, you need at least the Scale plan at $149/mo for 20 videos, then upgrade again. Approximate cost: $149-249/mo. Cost per video: $6.00-$10.00.',
              highlight: false,
            },
            {
              platform: 'Arcads',
              detail: 'Product plan ($110/mo) includes roughly 10 videos. You would need the Growth plan at $250/mo for 25+ videos. Cost per video: ~$10.00.',
              highlight: false,
            },
            {
              platform: 'Creatify',
              detail: 'Credit-based. The Creator plan ($59/mo) provides limited credits. Generating 25 videos likely requires the Business plan. Cost varies by video length and features used.',
              highlight: false,
            },
            {
              platform: 'HeyGen',
              detail: 'Creator plan ($29/mo) gives 3 credits. To generate 25 videos, you need the Business plan at $89/mo (30 credits). Cost per video: ~$2.97 per credit, but each video may cost multiple credits depending on length.',
              highlight: false,
            },
          ].map((item) => (
            <div
              key={item.platform}
              className={`rounded-lg border p-5 ${
                item.highlight
                  ? 'border-purple-200 bg-purple-50'
                  : 'border-[#d4d4d4] bg-white'
              }`}
            >
              <p className={`font-semibold ${item.highlight ? 'text-purple-700' : 'text-[#121212]'}`}>
                {item.platform}
              </p>
              <p className="mt-2 text-sm text-[#6b6b76]">{item.detail}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-[#6b6b76]">
          All calculations based on pricing pages as of April 2, 2026. Actual costs
          may differ based on video length, plan changes, and feature usage.
        </p>
      </section>

      {/* -- What's included ---------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          What&apos;s included: feature breakdown
        </h2>
        <p className="mt-4 text-[#6b6b76]">
          Price per video is only part of the equation. What you get for that price
          varies significantly across platforms.
        </p>

        <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-3 py-3 font-mono text-xs font-semibold text-[#121212]">Feature</th>
                <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-purple-700 bg-purple-50">agent-media</th>
                <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">MakeUGC</th>
                <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">Arcads</th>
                <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">Creatify</th>
                <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">HeyGen</th>
              </tr>
            </thead>
            <tbody>
              {featureData.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-[#d4d4d4] last:border-b-0"
                >
                  <td className="px-3 py-3 font-semibold text-[#121212] text-xs">{row.feature}</td>
                  <td className="px-3 py-3 text-center bg-purple-50"><FeatureCell value={row.agentMedia} /></td>
                  <td className="px-3 py-3 text-center"><FeatureCell value={row.makeUgc} /></td>
                  <td className="px-3 py-3 text-center"><FeatureCell value={row.arcads} /></td>
                  <td className="px-3 py-3 text-center"><FeatureCell value={row.creatify} /></td>
                  <td className="px-3 py-3 text-center"><FeatureCell value={row.heyGen} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-[#6b6b76]">
          Feature availability based on each platform&apos;s public documentation and pricing
          pages. Last verified: April 2, 2026.
        </p>
      </section>

      {/* -- Hidden costs ------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          Hidden costs to watch for
        </h2>
        <p className="mt-4 text-[#6b6b76]">
          The sticker price is not always the real price. Several platforms have
          pricing structures that increase your actual cost beyond the monthly fee.
        </p>

        <div className="mt-8 space-y-4">
          {hiddenCosts.map((cost) => (
            <div
              key={cost.issue}
              className="flex gap-4 rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="font-semibold text-[#121212]">{cost.issue}</p>
                <p className="mt-1 text-xs font-medium text-[#6b6b76]">
                  Affects: {cost.platforms}
                </p>
                <p className="mt-1 text-sm text-[#6b6b76]">{cost.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg bg-purple-50 p-5">
          <p className="text-sm text-purple-700">
            <strong><span className="text-purple-600">agent-media</span></strong> uses
            transparent per-second pricing: 30 credits per second of video. Monthly plan
            credits reset each cycle, but purchased credit packs never expire. No per-seat
            charges. No feature gating between plans (CLI, API, and all 17 subtitle styles
            are available on every plan). Check the{' '}
            <Link href="/pricing" className="font-semibold text-purple-700 underline">
              pricing page
            </Link>{' '}
            for full details.
          </p>
        </div>
      </section>

      {/* -- When competitors win ----------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          When other platforms are the better choice
        </h2>
        <p className="mt-4 text-[#6b6b76]">
          No single tool wins every scenario. Here is where each competitor has a
          genuine advantage.
        </p>

        <div className="mt-8 space-y-4">
          {[
            {
              platform: 'MakeUGC',
              strength: 'Best web-based editor and product-in-hand feature. If you need avatars physically holding your product, MakeUGC is the only option that does this well.',
              agentMediaAnswer: 'agent-media focuses on script-to-video speed via CLI and API. If you prefer a visual editor over a terminal, MakeUGC has a stronger web experience.',
            },
            {
              platform: 'Arcads',
              strength: 'Largest actor library (1,000+ actors claimed). Good for teams that need maximum visual variety across campaigns.',
              agentMediaAnswer: 'agent-media has 200 actors with multiple variant looks per actor. Fewer total actors, but each one comes with outfit and background options.',
            },
            {
              platform: 'HeyGen',
              strength: 'Long-form video support (up to 5 minutes) and avatar cloning. Best for enterprise teams creating training content or long explainer videos.',
              agentMediaAnswer: 'agent-media maxes at 15 seconds (30s in PIP mode). Built for short-form social content, not long-form.',
            },
            {
              platform: 'Creatify',
              strength: 'URL-to-video feature that scrapes product pages and generates ads automatically. Good for e-commerce teams with large catalogs.',
              agentMediaAnswer: 'agent-media has AI script generation from product descriptions, but does not auto-scrape URLs. You provide the script or product info.',
            },
          ].map((item) => (
            <div
              key={item.platform}
              className="rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <p className="font-semibold text-[#121212]">{item.platform}</p>
              <p className="mt-2 text-sm text-[#6b6b76]">{item.strength}</p>
              <p className="mt-2 text-sm text-[#6b6b76]">
                <span className="font-semibold text-purple-700">agent-media:</span>{' '}
                {item.agentMediaAnswer}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Verdict ------------------------------------------------------ */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          Verdict: who wins at each volume
        </h2>
        <p className="mt-4 text-[#6b6b76]">
          The best platform depends on how many videos you need and how you create them.
        </p>

        <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Volume</th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Best option</th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Why</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  volume: '1-5 videos/mo',
                  best: 'HeyGen or agent-media',
                  why: 'HeyGen Creator is $29/mo for 3 credits. agent-media Creator is $39/mo for ~13 videos. Both are affordable at low volume.',
                },
                {
                  volume: '10-25 videos/mo',
                  best: 'agent-media',
                  why: 'At $3/video with transparent pricing, agent-media is the cheapest option for moderate volume. No plan-hopping required.',
                },
                {
                  volume: '25-50 videos/mo',
                  best: 'agent-media',
                  why: 'Pro Plus ($129/mo) covers 43 videos at 10s each. Competitors cost $250+ for similar volume.',
                },
                {
                  volume: '50+ videos/mo',
                  best: 'agent-media + credit packs',
                  why: 'Top-up with $39 credit packs that never expire. No forced tier upgrade. Scale linearly at ~$3/video.',
                },
                {
                  volume: 'Long-form (2-5 min)',
                  best: 'HeyGen',
                  why: 'agent-media is capped at 15s. For long-form training or explainer content, HeyGen supports up to 5 minutes.',
                },
              ].map((row) => (
                <tr
                  key={row.volume}
                  className="border-b border-[#d4d4d4] last:border-b-0"
                >
                  <td className="px-4 py-3 font-semibold text-[#121212]">{row.volume}</td>
                  <td className="px-4 py-3 text-[#6b6b76]">{row.best}</td>
                  <td className="px-4 py-3 text-[#6b6b76]">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -- Summary / TL;DR ---------------------------------------------- */}
      <section className="mt-16 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[#121212]">
          TL;DR
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-[#6b6b76]">
          <li>
            <strong className="text-[#121212]">Cheapest per video:</strong>{' '}
            <span className="text-purple-600">agent-media</span> at ~$3.00 per 10s video across all plans.
          </li>
          <li>
            <strong className="text-[#121212]">Best for high volume:</strong>{' '}
            <span className="text-purple-600">agent-media</span>. Credit packs never expire, and pricing scales linearly.
          </li>
          <li>
            <strong className="text-[#121212]">Best web editor:</strong> MakeUGC. Strongest browser-based workflow.
          </li>
          <li>
            <strong className="text-[#121212]">Best for long-form:</strong> HeyGen. Up to 5-minute videos.
          </li>
          <li>
            <strong className="text-[#121212]">Most actors:</strong> Arcads. 1,000+ actors claimed.
          </li>
          <li>
            <strong className="text-[#121212]">Most hidden costs:</strong> Credit-based platforms with monthly expiry and feature gating.
          </li>
        </ul>
      </section>

      {/* -- CTA ---------------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-purple-200 bg-purple-50 p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Try <span className="text-purple-600">agent-media</span> at $3 per video
        </h2>
        <p className="mt-3 text-purple-700">
          Transparent pricing. No credit expiry on purchased packs. CLI, API, and web
          dashboard included on every plan.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/login">
            <Button size="lg">
              <Terminal className="mr-2 h-4 w-4" />
              Start Creating
            </Button>
          </Link>
          <Link href="/pricing">
            <Button variant="secondary" size="lg">
              See Pricing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* -- Footer note -------------------------------------------------- */}
      <footer className="mt-12 border-t border-[#d4d4d4] pt-6">
        <p className="text-xs text-[#6b6b76]">
          All pricing data sourced from public pricing pages on April 2, 2026. Prices are
          in USD and reflect monthly billing (not annual). This comparison is maintained
          by the <span className="text-purple-600">agent-media</span> team and may reflect
          our perspective. We encourage you to verify current pricing on each platform&apos;s
          website before making a purchase decision.
        </p>
        <p className="mt-4 text-xs text-[#6b6b76]">
          Related:{' '}
          <Link href="/blog/best-ai-ugc-generator-for-developers" className="text-[#121212] underline">
            Best AI UGC Generator for Developers
          </Link>
          {' | '}
          <Link href="/blog/generate-ai-video-terminal-60-seconds" className="text-[#121212] underline">
            Create UGC Videos in 60 Seconds
          </Link>
          {' | '}
          <Link href="/pricing" className="text-[#121212] underline">
            agent-media Pricing
          </Link>
        </p>
      </footer>
    </article>
  );
}
