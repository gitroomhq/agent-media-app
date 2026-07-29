// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// /cheapest-ai-ugc-video: cost hub ranking AI UGC tools. Targets GSC demand
// ("ai ugc cost", "cheapest video model", "ai ugc pricing").

import type { Metadata } from 'next';
import Link from 'next/link';
import { AS_OF, PRICING_COMPETITORS } from '@/seo/pricing-data';

export const metadata: Metadata = {
  title: 'Cheapest AI UGC Video Generators (2026): true cost per video | AgentMedia',
  description:
    'The cheapest way to generate AI UGC videos at scale, ranked by cost per video and pricing model. AgentMedia from $39/mo (~$3/video) with API, CLI, and MCP included.',
  keywords: ['cheapest ai ugc video', 'ai ugc cost', 'ai ugc pricing', 'cheapest ai video generator', 'cost per ugc video'],
  alternates: { canonical: 'https://agent-media.ai/cheapest-ai-ugc-video' },
  openGraph: {
    title: 'Cheapest AI UGC Video Generators (2026)',
    description: 'Ranked by true cost per video. AgentMedia from $39/mo with API + CLI + MCP.',
    type: 'article',
    url: 'https://agent-media.ai/cheapest-ai-ugc-video',
  },
};

const faqs = [
  { q: 'What is the cheapest AI UGC video generator?', a: 'For volume, credit-based tools beat per-seat subscriptions. AgentMedia is ~$3 per 10-second video from $39/month, and the same credits work across API, CLI, MCP, and the web app.' },
  { q: 'How much does an AI UGC video cost?', a: `It ranges from about $1-5 per short video on credit-based tools to $30+ per video-equivalent on capped subscriptions. Prices as of ${AS_OF}; verify on each vendor's site.` },
  { q: 'Is there a free AI UGC video generator?', a: 'Most tools offer trial credits rather than an ongoing free tier. AgentMedia lets you start on the $39 Creator plan and scale credits as you publish more.' },
];

function jsonLd(): string {
  return JSON.stringify([
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ]);
}

export default function CheapestAiUgcVideoPage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#6b6b76]">Cost comparison</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">Cheapest AI UGC video generators (2026)</h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Ranked by real cost per video and pricing model. Credit-based pricing scales better than per-seat
            subscriptions for high-volume UGC, and AgentMedia&apos;s credits work across API, CLI, MCP, and the web app,
            ~$3 per 10-second video from $39/month.
          </p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-neutral-50 text-left">
                  <th className="px-4 py-3 font-semibold">Tool</th>
                  <th className="px-4 py-3 font-semibold">Pricing model</th>
                  <th className="px-4 py-3 font-semibold">Entry price</th>
                  <th className="px-4 py-3 font-semibold">Developer surface</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#eee] bg-purple-50 font-medium">
                  <td className="px-4 py-3">AgentMedia</td>
                  <td className="px-4 py-3">Credits (~$3/video)</td>
                  <td className="px-4 py-3">$39/mo</td>
                  <td className="px-4 py-3">REST + SDKs + CLI + MCP</td>
                </tr>
                {PRICING_COMPETITORS.map((c) => (
                  <tr key={c.slug} className="border-b border-[#eee]">
                    <td className="px-4 py-3">
                      <Link href={`/pricing/${c.slug}`} className="underline underline-offset-4 hover:text-purple-600">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3">{c.model}</td>
                    <td className="px-4 py-3">{c.entryPrice}</td>
                    <td className="px-4 py-3">{c.hasDeveloperSurface}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#9a9aa2]">Competitor prices are approximate, publicly reported as of {AS_OF}. Verify on each vendor&apos;s site. AgentMedia prices are exact.</p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold">FAQ</h2>
          <dl className="mt-8 space-y-6">
            {faqs.map((f, i) => (
              <div key={i}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 max-w-2xl text-[#6b6b76]">{f.a}</dd>
              </div>
            ))}
          </dl>
          <Link href="/login" className="mt-10 inline-block rounded-full bg-[#121212] px-8 py-3 font-medium text-white hover:opacity-90">Start from $39/mo</Link>
        </div>
      </section>
    </div>
  );
}
