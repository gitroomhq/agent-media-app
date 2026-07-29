// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Tier-1 money page. Target keywords (Semrush US, June 2026):
// "ai ugc video generator" (480/mo), "ai ugc generator" (140/mo),
// "ugc ai generator" (70/mo), "ai ugc" (880/mo, secondary).

import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPARISON_ROWS } from '@/seo/pseo-data';

export const metadata: Metadata = {
  title: 'AI UGC Video Generator — Realistic UGC Ads in 60 Seconds | AgentMedia',
  description:
    'Generate realistic AI UGC videos — actor, script delivery, captions — and auto-publish to TikTok, Instagram, and YouTube. From the web app, CLI, API, or any AI agent. Plans from $39/mo.',
  alternates: { canonical: 'https://agent-media.ai/ai-ugc-video-generator' },
  openGraph: {
    title: 'AI UGC Video Generator — AgentMedia',
    description:
      'Realistic AI UGC videos with auto-publishing to TikTok, Instagram, and YouTube. One command, 60 seconds.',
    type: 'website',
    url: 'https://agent-media.ai/ai-ugc-video-generator',
  },
};

const FAQS = [
  {
    q: 'What is an AI UGC video generator?',
    a: 'A tool that creates user-generated-content-style videos — a realistic person talking to camera in 9:16 — from a text script, without filming anyone. AgentMedia generates the actor, the delivery, and the captions, then auto-publishes the result to TikTok, Instagram, and YouTube.',
  },
  {
    q: 'Do I need to upload a photo or hire an actor?',
    a: 'No. Describe the actor in a sentence ("25yo woman, warm smile, natural look") and AgentMedia generates a consistent, realistic person. You can persist a character so every video in a campaign keeps the same face.',
  },
  {
    q: 'How is AgentMedia different from MakeUGC, Arcads, or Creatify?',
    a: 'Two ways: automation surface and publishing. AgentMedia is the only UGC generator with a full developer surface — REST API, TypeScript/Python SDKs, a CLI, and an MCP server for AI agents — and it auto-publishes finished videos to your channels. Competitors stop at a web editor and a download button.',
  },
  {
    q: 'How much does it cost?',
    a: 'Plans start at $39/month (3,900 credits). A 10-second UGC video typically costs a few hundred credits — see agent-media.ai/pricing for exact numbers. No watermarks on any plan.',
  },
  {
    q: 'Can AI agents like Claude or Cursor use it?',
    a: 'Yes — that is the core design. Install the Claude skill (npx skills add gitroomhq/agent-media) or connect the MCP server, and your agent can script, generate, and post videos end to end - captions optional.',
  },
];

function jsonLd(): string {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'AgentMedia',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web, CLI',
      offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
      aggregateRating: undefined,
      url: 'https://agent-media.ai/ai-ugc-video-generator',
    },
  ]);
}

export default function AiUgcVideoGeneratorPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <article>
        <h1 className="text-4xl font-bold tracking-tight">
          AI UGC Video Generator
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-neutral-300">
          Hiring a UGC creator costs $150–500 per video and takes a week. AgentMedia generates a
          realistic 9:16 UGC video — actor, script delivery, burned-in captions — in about 60
          seconds, then publishes it to TikTok, Instagram, and YouTube for you. No photo, no
          filming, no editor.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-neutral-300">
          Use it from the web app, or automate it: the same pipeline is available as a CLI, a REST
          API with TypeScript and Python SDKs, and an MCP server — so Claude, Cursor, n8n, or any
          AI agent can produce and post video on its own.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/login" className="rounded-full bg-white px-6 py-3 font-medium text-black">
            Generate your first video
          </Link>
          <Link
            href="/skill"
            className="rounded-full border border-neutral-600 px-6 py-3 font-medium text-neutral-200"
          >
            Install the Claude skill
          </Link>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">One command, finished video</h2>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-sm text-neutral-300">
          <code>{`agent-media selfie \\
  --description "25yo woman, warm smile, natural look" \\
  --script "I keep getting DMs about my hair oil routine" \\
  --scene-action "by a bright vanity, showing a small amber bottle" \\
  --duration 10`}</code>
        </pre>
        <p className="mt-3 text-neutral-300">
          The output is studio-quality 1080p vertical video with animated captions and no
          watermark. Persist a character (<code className="text-neutral-200">char_xxxxxxxxxx</code>)
          to keep the same actor across an entire campaign.
        </p>

        <h2 className="mt-14 text-2xl font-semibold">How AgentMedia compares</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-700 text-left">
                {['Tool', 'API & SDKs', 'CLI', 'MCP (AI agents)', 'Auto-publish', 'Pricing'].map(
                  (h) => (
                    <th key={h} className="py-2 pr-4 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr
                  key={row.name}
                  className={`border-b border-neutral-800 ${i === 0 ? 'bg-neutral-900/60 font-medium' : ''}`}
                >
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4">{row.api}</td>
                  <td className="py-2 pr-4">{row.cli}</td>
                  <td className="py-2 pr-4">{row.mcp}</td>
                  <td className="py-2 pr-4">{row.autoPublish}</td>
                  <td className="py-2 pr-4">{row.pricingModel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-neutral-400">
          Detailed comparisons: <Link href="/compare/makeugc-alternative" className="underline">MakeUGC</Link>,{' '}
          <Link href="/compare/arcads-alternative" className="underline">Arcads</Link>,{' '}
          <Link href="/compare/creatify-alternative" className="underline">Creatify</Link>,{' '}
          <Link href="/compare/heygen-alternative" className="underline">HeyGen</Link> — or browse{' '}
          <Link href="/best" className="underline">all tool comparisons</Link>.
        </p>

        <h2 className="mt-14 text-2xl font-semibold">Frequently asked questions</h2>
        <dl className="mt-4 space-y-6">
          {FAQS.map((f) => (
            <div key={f.q}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-neutral-300">{f.a}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-14 rounded-2xl border border-neutral-700 bg-neutral-900/60 p-8 text-center">
          <h2 className="text-2xl font-semibold">Ship your first UGC video today</h2>
          <p className="mt-2 text-neutral-300">
            Script in, published post out — from your terminal, your editor, or your agent.
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-full bg-white px-6 py-3 font-medium text-black">
            Get started free
          </Link>
        </section>

        <p className="mt-10 text-sm text-neutral-400">
          Related: <Link href="/ai-ugc-ads" className="underline">AI UGC ads</Link> ·{' '}
          <Link href="/use-cases/ugc-video-api" className="underline">UGC video API</Link> ·{' '}
          <Link href="/how-to" className="underline">UGC video guides</Link>
        </p>
      </article>
    </main>
  );
}
