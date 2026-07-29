// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// /ai-ugc: head-term hub. GSC: "ai ugc" 160 impressions @ pos 12 with 0 clicks
// (biggest single head-term leak). Definition + spokes to every cluster.

import type { Metadata } from 'next';
import Link from 'next/link';
import { INTEGRATION_PAIRS } from '@/seo/integration-data';
import { PRICING_COMPETITORS } from '@/seo/pricing-data';

export const metadata: Metadata = {
  title: 'AI UGC: what it is, how it works, and the best tools (2026) | AgentMedia',
  description:
    'AI UGC means AI-generated user-generated-content video: realistic talking-head ads, testimonials, and demos from a script. How it works, what it costs, and how to automate it via API, CLI, and MCP.',
  keywords: ['ai ugc', 'ugc ai', 'what is ai ugc', 'ai ugc video', 'ai ugc ads', 'ai ugc generator', 'ai ugc automation'],
  alternates: { canonical: 'https://agent-media.ai/ai-ugc' },
  openGraph: {
    title: 'AI UGC: what it is, how it works, and the best tools (2026)',
    description: 'AI-generated UGC video from a script. How it works and how to automate it.',
    type: 'article',
    url: 'https://agent-media.ai/ai-ugc',
  },
};

const faqs = [
  { q: 'What is AI UGC?', a: 'AI UGC is user-generated-content-style video created by AI instead of a human creator: a realistic AI actor delivers a script as a talking-head ad, testimonial, unboxing, or demo. You get the authentic, native-to-feed look of UGC without sourcing creators or filming.' },
  { q: 'How does AI UGC work?', a: 'You provide a script (or a product and let the tool write one), pick an AI actor, and the platform generates voiceover, a talking-head video, B-roll, and captions, then assembles and can auto-publish it. With AgentMedia this is one command from the terminal, API, or an AI agent.' },
  { q: 'Is AI UGC good for ads?', a: 'Yes, it is built for paid social. AI UGC lets you test many hooks and variations per product cheaply, which is exactly what dropshipping, ecommerce, and app-install campaigns need.' },
  { q: 'How much does AI UGC cost?', a: 'AgentMedia is ~$3 per 10-second video from $39/month, with credits that work across the API, CLI, MCP, and web app. See the cost comparison for how tools stack up.' },
];

const spokeSections = [
  {
    title: 'Generate AI UGC',
    links: [
      { href: '/ai-ugc-video-generator', label: 'AI UGC video generator' },
      { href: '/ai-ugc-ads', label: 'AI UGC ads' },
      { href: '/skills', label: 'Install the Claude / Cursor skill' },
      { href: '/cli', label: 'AI UGC from the CLI' },
    ],
  },
  {
    title: 'Automate it (agent-native)',
    links: INTEGRATION_PAIRS.filter((p) => p.integration.slug === 'mcp').slice(0, 4).map((p) => ({ href: `/compare/${p.slug}`, label: `${p.competitor.name} MCP alternative` })),
  },
  {
    title: 'Compare cost',
    links: [
      { href: '/cheapest-ai-ugc-video', label: 'Cheapest AI UGC video tools' },
      ...PRICING_COMPETITORS.slice(0, 3).map((c) => ({ href: `/pricing/${c.slug}`, label: `${c.name} pricing` })),
    ],
  },
  {
    title: 'By use case',
    links: [
      { href: '/use-cases/tiktok-ugc-ads', label: 'TikTok UGC ads' },
      { href: '/use-cases/shopify-product-videos', label: 'Shopify product videos' },
      { href: '/use-cases/facebook-ugc-ads', label: 'Facebook UGC ads' },
      { href: '/use-cases/ecommerce', label: 'Ecommerce UGC' },
    ],
  },
];

function jsonLd(): string {
  return JSON.stringify([
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@context': 'https://schema.org', '@type': 'DefinedTerm', name: 'AI UGC', description: 'AI-generated user-generated-content-style video: a realistic AI actor delivers a script as an ad, testimonial, or demo.', inDefinedTermSet: 'https://agent-media.ai/ai-ugc' },
  ]);
}

export default function AiUgcHubPage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#6b6b76]">AI UGC</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">AI UGC: what it is, how it works, and the best tools</h1>
          <p className="mt-6 max-w-3xl text-lg text-[#6b6b76]">
            <strong className="text-[#121212]">AI UGC</strong> is user-generated-content-style video made by AI instead of a
            human creator. A realistic AI actor delivers your script as a talking-head ad, testimonial, unboxing, or demo.
            You get the native-to-feed authenticity of UGC without sourcing creators, briefs, or filming. AgentMedia
            generates it and auto-publishes it, from one command in your terminal, API, or AI agent.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/login" className="rounded-full bg-[#121212] px-6 py-3 font-medium text-white hover:opacity-90">Generate AI UGC</Link>
            <Link href="/cheapest-ai-ugc-video" className="rounded-full border border-[#d4d4d4] px-6 py-3 font-medium text-[#121212] hover:bg-neutral-50">Compare cost</Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
            {spokeSections.map((s) => (
              <div key={s.title}>
                <h2 className="text-xl font-bold text-[#121212]">{s.title}</h2>
                <ul className="mt-4 space-y-2">
                  {s.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[#6b6b76] underline underline-offset-4 hover:text-purple-600">{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold">Frequently asked questions</h2>
          <dl className="mt-8 space-y-6">
            {faqs.map((f, i) => (
              <div key={i}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 max-w-3xl text-[#6b6b76]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
