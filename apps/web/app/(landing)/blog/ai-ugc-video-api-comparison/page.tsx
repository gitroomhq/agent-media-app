// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, XCircle, Terminal, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const canonicalUrl =
  'https://agent-media.ai/blog/ai-ugc-video-api-comparison';

export const metadata: Metadata = {
  title:
    'AI UGC Video API Comparison 2026: agent-media vs Arcads vs HeyGen vs D-ID vs MakeUGC | agent-media',
  description:
    'Developer-focused comparison of UGC video APIs: SDK availability, CLI tools, webhook support, pricing, and integration depth across five platforms.',
  keywords: [
    'ugc video api',
    'ai video api comparison',
    'talking head video api',
    'ugc video api comparison',
    'ai ugc sdk',
    'ai video generation api',
    'heygen api',
    'd-id api',
    'arcads api',
    'makeugc api',
    'agent-media api',
  ],
  openGraph: {
    title:
      'AI UGC Video API Comparison 2026: agent-media vs Arcads vs HeyGen vs D-ID vs MakeUGC',
    description:
      'SDK availability, CLI tools, webhook support, pricing, and integration depth across five UGC video platforms. Updated April 14, 2026.',
    type: 'article',
    url: canonicalUrl,
    publishedTime: '2026-04-14T00:00:00Z',
  },
  alternates: {
    canonical: canonicalUrl,
  },
};

/* -- JSON-LD structured data -------------------------------------------- */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline:
    'AI UGC Video API Comparison 2026: agent-media vs Arcads vs HeyGen vs D-ID vs MakeUGC',
  description:
    'Developer-focused comparison of UGC video APIs: SDK availability, CLI tools, webhook support, pricing, and integration depth across five platforms.',
  datePublished: '2026-04-14T00:00:00Z',
  dateModified: '2026-04-14T00:00:00Z',
  author: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  publisher: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': canonicalUrl,
  },
};

/* -- Comparison table data ---------------------------------------------- */

interface FeatureRow {
  feature: string;
  agentMedia: boolean | string;
  arcads: boolean | string;
  heyGen: boolean | string;
  dId: boolean | string;
  makeUgc: boolean | string;
}

const comparisonData: FeatureRow[] = [
  {
    feature: 'TypeScript SDK',
    agentMedia: true,
    arcads: false,
    heyGen: false,
    dId: false,
    makeUgc: false,
  },
  {
    feature: 'Python SDK',
    agentMedia: true,
    arcads: false,
    heyGen: false,
    dId: 'Community',
    makeUgc: false,
  },
  {
    feature: 'CLI tool',
    agentMedia: true,
    arcads: false,
    heyGen: false,
    dId: false,
    makeUgc: false,
  },
  {
    feature: 'MCP Server',
    agentMedia: true,
    arcads: false,
    heyGen: true,
    dId: false,
    makeUgc: false,
  },
  {
    feature: 'OpenAPI spec',
    agentMedia: true,
    arcads: false,
    heyGen: true,
    dId: true,
    makeUgc: false,
  },
  {
    feature: 'Self-serve API',
    agentMedia: true,
    arcads: 'Pro plan only',
    heyGen: 'Enterprise',
    dId: true,
    makeUgc: 'Basic',
  },
  {
    feature: 'Webhook support',
    agentMedia: true,
    arcads: false,
    heyGen: true,
    dId: true,
    makeUgc: false,
  },
  {
    feature: 'Actors',
    agentMedia: '200+',
    arcads: '300-1000',
    heyGen: '100+',
    dId: '50+',
    makeUgc: '150+',
  },
  {
    feature: 'Full UGC pipeline',
    agentMedia: true,
    arcads: 'Partial',
    heyGen: false,
    dId: false,
    makeUgc: 'Partial',
  },
  {
    feature: 'Entry price',
    agentMedia: '$39/mo',
    arcads: '$110/mo',
    heyGen: '$48/mo',
    dId: '$5.90/mo',
    makeUgc: '$29/mo',
  },
  {
    feature: 'Per-video cost (est.)',
    agentMedia: '~$3',
    arcads: '~$11',
    heyGen: '~$10',
    dId: '~$2',
    makeUgc: '~$6',
  },
  {
    feature: 'Languages',
    agentMedia: '29',
    arcads: '40+',
    heyGen: '40+',
    dId: '30+',
    makeUgc: '20+',
  },
];

/* -- Platform deep dives ------------------------------------------------ */

interface PlatformDeepDive {
  name: string;
  tagline: string;
  strengths: string[];
  limitations: string[];
  highlight?: boolean;
}

const deepDives: PlatformDeepDive[] = [
  {
    name: 'agent-media',
    tagline: 'Developer-first. Full SDK ecosystem.',
    strengths: [
      'First-party TypeScript and Python SDKs with full type safety',
      'CLI tool for terminal-based video generation and automation',
      'MCP Server for AI agent integration',
      'Full UGC generation: realistic actor, scene direction, and styled subtitles via one API',
      '200+ actors with multiple variant looks per actor',
      '$39/mo entry with transparent per-second pricing',
      'Webhook callbacks for async workflows',
    ],
    limitations: [
      'Max 15s per clip (30s in PIP mode) — built for short-form only',
      'Fewer actors than Arcads (200 vs 1,000)',
      'No custom avatar cloning (yet)',
    ],
    highlight: true,
  },
  {
    name: 'Arcads',
    tagline: 'Best for marketing teams. Largest actor library.',
    strengths: [
      'Largest actor library (300-1,000 actors claimed)',
      'Strong script generation for marketing copy',
      'Good browser-based workflow for non-technical teams',
      '40+ languages supported',
    ],
    limitations: [
      'API only on Pro plan ($250+/mo)',
      'No SDK, CLI, or MCP server',
      'No webhook support — polling only',
      'No OpenAPI spec — integration requires reverse-engineering',
      '~$11/video makes high-volume expensive',
    ],
  },
  {
    name: 'HeyGen',
    tagline: 'Enterprise-grade. Streaming avatars.',
    strengths: [
      'Streaming avatar API for real-time interactive use cases',
      'New MCP server for AI agent workflows',
      'Published OpenAPI spec and webhook support',
      'Long-form video support (up to 5 minutes)',
      'Custom avatar cloning on enterprise plans',
    ],
    limitations: [
      'No first-party TypeScript or Python SDK',
      'Self-serve API limited — full access requires enterprise plan',
      '$48/mo entry, but API features gated behind higher tiers',
      'No CLI tool for automation',
      'No full UGC generation (talking head only, no scene direction or subtitles)',
    ],
  },
  {
    name: 'D-ID',
    tagline: 'Talking head specialist. Fast generation.',
    strengths: [
      'Fastest lip-sync generation among competitors',
      'Simple, well-documented REST API',
      'Low entry price ($5.90/mo)',
      'Published OpenAPI spec with webhook support',
      'Good for single talking-head clips',
      'Community Python SDK available',
    ],
    limitations: [
      'No full UGC generation — talking heads only, no scene direction or subtitles',
      'Smaller actor library (50+ presenters)',
      'No first-party SDK or CLI',
      'No MCP server',
      'Per-credit pricing can spike at scale',
    ],
  },
  {
    name: 'MakeUGC',
    tagline: 'Cheapest entry. Basic API.',
    strengths: [
      'Lowest entry price ($29/mo)',
      '150+ actors available',
      'Basic API for video generation',
      'Good browser-based editor for non-technical users',
      'Includes secondary footage support',
    ],
    limitations: [
      'No SDK, CLI, or MCP server',
      'No webhook support — polling only',
      'No OpenAPI spec',
      'API is basic — limited automation capability',
      'No pay-as-you-go option',
    ],
  },
];

/* -- Decision matrix ---------------------------------------------------- */

interface DecisionRow {
  useCase: string;
  recommendation: string;
  why: string;
}

const decisionMatrix: DecisionRow[] = [
  {
    useCase: 'Building automation at scale',
    recommendation: 'agent-media',
    why: 'Only platform with SDK + API + CLI + MCP. Built for programmatic workflows.',
  },
  {
    useCase: 'Marketing team, browser workflow',
    recommendation: 'Arcads or MakeUGC',
    why: 'Both have strong visual editors. Arcads for actor variety, MakeUGC for budget.',
  },
  {
    useCase: 'Enterprise, streaming avatars',
    recommendation: 'HeyGen',
    why: 'Only platform with real-time streaming avatar API. Enterprise support included.',
  },
  {
    useCase: 'Just talking heads, no pipeline',
    recommendation: 'D-ID',
    why: 'Fastest lip-sync. Clean API. Low entry price. No bloat.',
  },
  {
    useCase: 'AI agent integration',
    recommendation: 'agent-media or HeyGen',
    why: 'Both offer MCP servers. agent-media adds CLI and SDK for deeper integration.',
  },
  {
    useCase: 'Long-form video (2-5 min)',
    recommendation: 'HeyGen',
    why: 'Supports up to 5 minutes. agent-media caps at 15s per clip.',
  },
  {
    useCase: 'Lowest cost per video',
    recommendation: 'D-ID or agent-media',
    why: 'D-ID starts at ~$2/video. agent-media at ~$3/video with full pipeline included.',
  },
];

/* -- Helper component --------------------------------------------------- */

function FeatureCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <CheckCircle className="mx-auto h-4 w-4 text-green-600" />;
  }
  if (value === false) {
    return <XCircle className="mx-auto h-4 w-4 text-[#6b6b76]/40" />;
  }
  return <span className="text-xs">{value}</span>;
}

/* -- Page --------------------------------------------------------------- */

export default function AiUgcVideoApiComparisonPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
        {/* -- Header ----------------------------------------------------- */}
        <header>
          <div className="flex items-center gap-3 text-sm text-[#6b6b76]">
            <Link href="/blog" className="hover:text-[#121212]">
              Blog
            </Link>
            <span>/</span>
            <time dateTime="2026-04-14">April 14, 2026</time>
            <span className="ml-auto">~10 min read</span>
          </div>
          <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
            AI UGC Video API Comparison 2026: agent-media vs Arcads vs HeyGen vs
            D-ID vs MakeUGC
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
            If you are building video automation, the API is the product. This
            comparison focuses on what matters to developers: SDK availability,
            CLI tools, API access models, webhook support, and integration depth.
            We checked each platform&apos;s documentation and developer resources
            on April 14, 2026.
          </p>
        </header>

        {/* -- Intro for developers --------------------------------------- */}
        <section className="mt-12 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[#121212]">
            Why this comparison exists
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Most UGC platform comparisons focus on UI features and actor counts.
            Developers building automated pipelines care about different things:
            Can I call it from my CI/CD? Is there a typed SDK? Does it support
            webhooks or am I stuck polling? Can I generate videos from a terminal?
            This guide answers those questions.
          </p>
        </section>

        {/* -- CTA 1 ------------------------------------------------------ */}
        <div className="mt-10 rounded-lg bg-purple-50 p-5">
          <p className="text-sm text-purple-700">
            <strong>
              <span className="text-purple-600">agent-media</span>
            </strong>{' '}
            is the only UGC platform with a TypeScript SDK, Python SDK, CLI, and
            MCP Server.{' '}
            <Link
              href="/pricing"
              className="font-semibold text-purple-700 underline"
            >
              See pricing
            </Link>{' '}
            or{' '}
            <Link
              href="/login"
              className="font-semibold text-purple-700 underline"
            >
              start building
            </Link>
            .
          </p>
        </div>

        {/* -- Main comparison table -------------------------------------- */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#121212]">
            API feature comparison: side by side
          </h2>
          <p className="mt-4 text-[#6b6b76]">
            This table covers the developer-facing capabilities of each platform.
            Check marks indicate first-party, production-ready support.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-3 py-3 font-mono text-xs font-semibold text-[#121212]">
                    Feature
                  </th>
                  <th className="bg-purple-50 px-3 py-3 text-center font-mono text-xs font-semibold text-purple-700">
                    agent-media
                  </th>
                  <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">
                    Arcads
                  </th>
                  <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">
                    HeyGen
                  </th>
                  <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">
                    D-ID
                  </th>
                  <th className="px-3 py-3 text-center font-mono text-xs font-semibold text-[#121212]">
                    MakeUGC
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-3 py-3 text-xs font-semibold text-[#121212]">
                      {row.feature}
                    </td>
                    <td className="bg-purple-50 px-3 py-3 text-center">
                      <FeatureCell value={row.agentMedia} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <FeatureCell value={row.arcads} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <FeatureCell value={row.heyGen} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <FeatureCell value={row.dId} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <FeatureCell value={row.makeUgc} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-[#6b6b76]">
            Based on each platform&apos;s public documentation, API docs, and
            developer resources. Last verified: April 14, 2026. &quot;Full UGC
            generation&quot; means a realistic actor, scene direction, and styled subtitles in a
            single API call.
          </p>
        </section>

        {/* -- Deep dives ------------------------------------------------- */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#121212]">
            Platform deep dives
          </h2>
          <p className="mt-4 text-[#6b6b76]">
            Each platform has a different philosophy. Here is what developers
            should know about each one.
          </p>

          <div className="mt-8 space-y-6">
            {deepDives.map((platform) => (
              <div
                key={platform.name}
                className={`rounded-lg border p-6 ${
                  platform.highlight
                    ? 'border-purple-200 bg-purple-50'
                    : 'border-[#d4d4d4] bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3
                      className={`text-lg font-bold ${
                        platform.highlight
                          ? 'text-purple-700'
                          : 'text-[#121212]'
                      }`}
                    >
                      {platform.name}
                    </h3>
                    <p className="mt-1 text-sm text-[#6b6b76]">
                      {platform.tagline}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-green-700">
                      Strengths
                    </p>
                    <ul className="mt-2 space-y-1">
                      {platform.strengths.map((s) => (
                        <li
                          key={s}
                          className="flex items-start gap-2 text-sm text-[#6b6b76]"
                        >
                          <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-700">
                      Limitations
                    </p>
                    <ul className="mt-2 space-y-1">
                      {platform.limitations.map((l) => (
                        <li
                          key={l}
                          className="flex items-start gap-2 text-sm text-[#6b6b76]"
                        >
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b6b76]/40" />
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* -- Code example ----------------------------------------------- */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#121212]">
            What integration actually looks like
          </h2>
          <p className="mt-4 text-[#6b6b76]">
            The difference between &quot;has an API&quot; and &quot;developer-first&quot; shows up
            in the integration code. Here is a side-by-side of generating a video
            with a typed SDK versus raw HTTP.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-purple-200 bg-[#121212] p-4">
              <p className="mb-3 font-mono text-xs font-semibold text-purple-400">
                agent-media (TypeScript SDK)
              </p>
              <pre className="overflow-x-auto text-xs leading-relaxed text-gray-300">
                <code>{`import { AgentMedia } from 'agent-media';

const client = new AgentMedia();

const video = await client.videos.create({
  actorId: 'actor_abc123',
  script: 'Your product copy here.',
  subtitleStyle: 'bold-pop',
  includeBroll: true,
});

// Webhook delivers the result
// No polling required`}</code>
              </pre>
            </div>
            <div className="rounded-lg border border-[#d4d4d4] bg-[#121212] p-4">
              <p className="mb-3 font-mono text-xs font-semibold text-gray-400">
                Typical competitor (raw HTTP)
              </p>
              <pre className="overflow-x-auto text-xs leading-relaxed text-gray-300">
                <code>{`const res = await fetch(
  'https://api.example.com/v1/videos',
  {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      actor_id: 'abc123',
      script: 'Your product copy here.',
    }),
  }
);

// Poll for status every 5 seconds
// No webhook, no types, no SDK`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* -- Decision matrix -------------------------------------------- */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#121212]">
            Which API should you choose?
          </h2>
          <p className="mt-4 text-[#6b6b76]">
            The right platform depends on your use case, not just the feature
            count. Here is a decision matrix based on common developer scenarios.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                    Use case
                  </th>
                  <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                    Best choice
                  </th>
                  <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody>
                {decisionMatrix.map((row) => (
                  <tr
                    key={row.useCase}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-4 py-3 font-semibold text-[#121212]">
                      {row.useCase}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        row.recommendation.includes('agent-media')
                          ? 'text-purple-700'
                          : 'text-[#6b6b76]'
                      }`}
                    >
                      {row.recommendation}
                    </td>
                    <td className="px-4 py-3 text-[#6b6b76]">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* -- API access comparison -------------------------------------- */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-[#121212]">
            API access: the fine print
          </h2>
          <p className="mt-4 text-[#6b6b76]">
            Not all API access is equal. Some platforms gate API access behind
            enterprise plans or require sales calls. Here is what &quot;API
            available&quot; actually means on each platform.
          </p>

          <div className="mt-8 space-y-4">
            {[
              {
                platform: 'agent-media',
                detail:
                  'API keys available on all plans ($39/mo and up). TypeScript SDK, Python SDK, and CLI installable via npm/pip. OpenAPI spec published. Webhooks configurable per project. No sales call required.',
                highlight: true,
              },
              {
                platform: 'Arcads',
                detail:
                  'API access requires Pro plan ($250+/mo). No published SDK or OpenAPI spec. Integration requires building your own HTTP client from their documentation. No webhook support — you must poll for video status.',
                highlight: false,
              },
              {
                platform: 'HeyGen',
                detail:
                  'Basic API on Creator plan ($48/mo) with limited endpoints. Full API and streaming avatar access requires Enterprise plan (custom pricing, sales call). MCP server recently launched. OpenAPI spec published. Webhooks supported.',
                highlight: false,
              },
              {
                platform: 'D-ID',
                detail:
                  'API access on all plans including free trial. Clean REST API with published OpenAPI spec. Webhook support for async jobs. No first-party SDK, but a community Python client exists. Fastest time-to-first-video for developers.',
                highlight: false,
              },
              {
                platform: 'MakeUGC',
                detail:
                  'Basic API available on paid plans. Limited documentation. No SDK, CLI, OpenAPI spec, or webhook support. Best suited for browser-based workflows, not programmatic integration.',
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
                <p
                  className={`font-semibold ${
                    item.highlight ? 'text-purple-700' : 'text-[#121212]'
                  }`}
                >
                  {item.platform}
                </p>
                <p className="mt-2 text-sm text-[#6b6b76]">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* -- TL;DR ------------------------------------------------------ */}
        <section className="mt-16 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-[#121212]">
            TL;DR
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-[#6b6b76]">
            <li>
              <strong className="text-[#121212]">
                Best developer experience:
              </strong>{' '}
              <span className="text-purple-600">agent-media</span>. Only
              platform with TypeScript SDK, Python SDK, CLI, and MCP Server.
            </li>
            <li>
              <strong className="text-[#121212]">Most actors:</strong> Arcads.
              300-1,000 actors. But API requires $250+/mo Pro plan.
            </li>
            <li>
              <strong className="text-[#121212]">Best enterprise API:</strong>{' '}
              HeyGen. Streaming avatars, MCP server, OpenAPI spec. Enterprise
              pricing.
            </li>
            <li>
              <strong className="text-[#121212]">
                Simplest talking head API:
              </strong>{' '}
              D-ID. Fast lip-sync, clean REST API, low entry price. No full
              pipeline.
            </li>
            <li>
              <strong className="text-[#121212]">Cheapest entry:</strong>{' '}
              MakeUGC at $29/mo. But limited API, no dev tools.
            </li>
            <li>
              <strong className="text-[#121212]">
                Full pipeline via API:
              </strong>{' '}
              Only <span className="text-purple-600">agent-media</span> combines
              a realistic actor, scene direction, and styled subtitles in a single API call.
            </li>
          </ul>
        </section>

        {/* -- CTA -------------------------------------------------------- */}
        <section className="mt-20 rounded-lg border border-purple-200 bg-purple-50 p-8 text-center">
          <h2 className="text-2xl font-bold text-[#121212]">
            Try the{' '}
            <span className="text-purple-600">agent-media</span> API
          </h2>
          <p className="mt-3 text-purple-700">
            TypeScript SDK. Python SDK. CLI. MCP Server. API keys on every plan.
            No sales call. Start generating videos in minutes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link href="/login">
              <Button size="lg">
                <Terminal className="mr-2 h-4 w-4" />
                Start Building
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="secondary" size="lg">
                See Pricing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#6b6b76]">
            <Code2 className="mr-1 inline h-3 w-3" />
            npm install agent-media
          </p>
        </section>

        {/* -- Footer note ------------------------------------------------ */}
        <footer className="mt-12 border-t border-[#d4d4d4] pt-6">
          <p className="text-xs text-[#6b6b76]">
            All data sourced from public documentation and developer resources on
            April 14, 2026. This comparison is maintained by the{' '}
            <span className="text-purple-600">agent-media</span> team and
            reflects our perspective. We have tried to be fair and honest — we
            explicitly note where competitors are stronger. Verify current
            features on each platform&apos;s website before making integration
            decisions.
          </p>
          <p className="mt-4 text-xs text-[#6b6b76]">
            Related:{' '}
            <Link
              href="/blog/ai-ugc-pricing-comparison-2026"
              className="text-[#121212] underline"
            >
              AI UGC Pricing Comparison 2026
            </Link>
            {' | '}
            <Link
              href="/blog/best-ai-ugc-generator-for-developers"
              className="text-[#121212] underline"
            >
              Best AI UGC Generator for Developers
            </Link>
            {' | '}
            <Link
              href="/blog/mcp-server-ai-video-generation"
              className="text-[#121212] underline"
            >
              MCP Server for AI Video
            </Link>
            {' | '}
            <Link
              href="/blog/automate-ugc-video-ads-api"
              className="text-[#121212] underline"
            >
              Automate UGC Video Ads via API
            </Link>
          </p>
        </footer>
      </article>
    </>
  );
}
