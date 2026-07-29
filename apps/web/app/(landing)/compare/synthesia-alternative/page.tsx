// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Synthesia Alternative — agent-media | UGC Ads vs Corporate Avatars',
  description:
    'Synthesia is built for corporate explainers and L&D. agent-media is built for UGC ads with a developer API, CLI, and MCP server. Pricing, feature, and use-case comparison.',
  keywords: [
    'synthesia alternative',
    'synthesia vs agent-media',
    'cheaper than synthesia',
    'synthesia api alternative',
    'synthesia for developers',
    'ugc alternative to synthesia',
  ],
  openGraph: {
    title: 'Synthesia Alternative — agent-media',
    description: 'Synthesia for corporate; agent-media for UGC ads with API + CLI + MCP.',
    type: 'article',
    url: 'https://agent-media.ai/compare/synthesia-alternative',
  },
  alternates: { canonical: 'https://agent-media.ai/compare/synthesia-alternative' },
};

export default function SynthesiaAlternativePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">Compare</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Synthesia Alternative: <span className="text-purple-600">agent-media</span> vs Synthesia
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Synthesia is the leader in corporate AI avatar video — training,
            internal comms, multilingual L&amp;D. <strong className="text-[#121212]">agent-media</strong>{' '}
            takes a different lane: short-form UGC ads with a developer-first
            API, CLI, and MCP server. These tools solve different problems —
            here&apos;s how to choose.{' '}
            <Link href="/login" className="text-[#121212] underline hover:no-underline">
              Try agent-media free
            </Link>.
          </p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Quick Verdict</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <h3 className="font-semibold text-[#121212]">Choose Synthesia if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• You need custom avatars from a person you can record</li>
                <li>• Your output is corporate training, L&amp;D, or internal comms</li>
                <li>• You need 140+ language voiceover for long-form content</li>
                <li>• Your buyer is HR, training, or learning tech</li>
              </ul>
            </div>
            <div className="rounded-lg border-2 border-[#121212] p-6">
              <h3 className="font-semibold text-[#121212]">Choose agent-media if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• You want short-form UGC ads for TikTok / Reels / Shorts</li>
                <li>• You need a REST API, CLI, or MCP server</li>
                <li>• You generate ads programmatically from code or AI agents</li>
                <li>• You need transparent per-second pricing starting at $39/mo</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Feature Comparison</h2>
          <div className="mt-8 overflow-hidden rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f5f5f5]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[#121212]">Feature</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">Synthesia</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">agent-media</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4d4d4]">
                {[
                  ['REST API', 'Yes (Enterprise)', 'Yes ($39 Creator)'],
                  ['Native CLI', 'No', 'Yes (30 commands)'],
                  ['Python / TypeScript SDK', 'Limited', 'Yes (full SDKs)'],
                  ['MCP server (Claude Code)', 'No', 'Yes'],
                  ['UGC-style 9:16 output', 'Possible', 'Native'],
                  ['Animated subtitles', 'Limited', 'Yes (Hormozi style)'],
                  ['B-roll generation', 'No', 'Yes'],
                  ['Custom avatars from your face', 'Yes', 'No'],
                  ['Long-form translation (1hr+)', 'Yes (best-in-class)', 'No'],
                  ['Corporate L&D features', 'Yes', 'No'],
                  ['Starting price', '$29/mo (no API)', '$39/mo (API included)'],
                ].map(([f, s, a]) => (
                  <tr key={f}>
                    <td className="px-4 py-3 font-medium">{f}</td>
                    <td className="px-4 py-3 text-[#6b6b76]">{s}</td>
                    <td className="px-4 py-3 text-[#6b6b76]">{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Pricing Comparison</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <h3 className="font-semibold text-[#121212]">Synthesia</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• Starter: starts around <strong>$29/mo</strong> — limited minutes, no API</li>
                <li>• Creator: starts around <strong>$89/mo</strong> — more minutes, no API</li>
                <li>• Enterprise: custom — API + custom avatars</li>
                <li>• <X className="inline h-4 w-4" /> No CLI, no MCP server</li>
                <li>• <X className="inline h-4 w-4" /> API requires Enterprise tier</li>
              </ul>
            </div>
            <div className="rounded-lg border-2 border-[#121212] p-6">
              <h3 className="font-semibold text-[#121212]">agent-media</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• Creator: <strong>$39/mo</strong> — 3,900 credits, API + CLI + SDKs included</li>
                <li>• Pro: <strong>$69/mo</strong> — 6,900 credits, up to 15s clips</li>
                <li>• Pro Plus: <strong>$129/mo</strong> — 12,900 credits</li>
                <li>• <Check className="inline h-4 w-4" /> Pay-as-you-go credit packs — never expire</li>
                <li>• <Check className="inline h-4 w-4" /> MCP server for Claude Code on every paid plan</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Frequently Asked Questions</h2>
          <div className="mt-6 max-w-3xl space-y-6 text-[#6b6b76]">
            <div>
              <h3 className="font-semibold text-[#121212]">Is agent-media a Synthesia alternative?</h3>
              <p className="mt-2">
                For UGC-style social ads — yes. agent-media is purpose-built for
                short-form ads with developer tooling. For corporate explainers,
                L&amp;D, and long-form translation, Synthesia remains the
                category leader. Different jobs, different tools.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does Synthesia have a public API?</h3>
              <p className="mt-2">
                Synthesia&apos;s API requires their Enterprise tier (custom
                pricing). agent-media&apos;s API is on the $39 Creator — plus
                TypeScript and Python SDKs, a 30-command CLI, and an MCP
                server, all included.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Is agent-media cheaper than Synthesia?</h3>
              <p className="mt-2">
                For comparable API access, yes — agent-media&apos;s $39 Creator
                vs Synthesia&apos;s Enterprise tier. For low-volume non-API
                use, Synthesia&apos;s $29 Starter is comparable. agent-media
                also offers pay-as-you-go credits that never expire.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I make TikTok ads with Synthesia?</h3>
              <p className="mt-2">
                You can, but the toolset is optimized for corporate use. 9:16
                output works, but UGC-tuned actors, B-roll, and animated
                subtitles aren&apos;t the default workflow. agent-media is
                purpose-built for this lane.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does agent-media work with Claude Code?</h3>
              <p className="mt-2">
                Yes. agent-media ships an{' '}
                <Link href="/mcp" className="underline hover:text-[#121212]">MCP server</Link>{' '}
                that exposes UGC video generation as a Claude Code tool.
                Synthesia has no MCP integration today.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Should I use Synthesia or agent-media?</h3>
              <p className="mt-2">
                Use Synthesia for corporate training, internal comms, and
                long-form multilingual avatar video. Use agent-media for
                short-form UGC ads generated programmatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Related Comparisons</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/compare/heygen-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              HeyGen Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/makeugc-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/arcads-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/creatify-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Creatify Alternative <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-[#121212] text-white hover:bg-[#333]">
                {'>'} Get Started with agent-media
              </Button>
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              View Pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: 'Synthesia Alternative: agent-media vs Synthesia Comparison',
                description:
                  'Synthesia for corporate explainers vs agent-media for UGC ads. API, CLI, MCP, and pricing comparison.',
                url: 'https://agent-media.ai/compare/synthesia-alternative',
                datePublished: '2026-05-05',
                dateModified: '2026-05-05',
                author: { '@type': 'Organization', name: 'agent-media' },
                publisher: { '@type': 'Organization', name: 'agent-media' },
              },
              {
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: 'Is agent-media a Synthesia alternative?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'For UGC-style social ads — yes. agent-media is purpose-built for short-form ads with developer tooling. For corporate explainers, L&D, and long-form translation, Synthesia remains the category leader.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does Synthesia have a public API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Synthesia API requires their Enterprise tier (custom pricing). agent-media API is on the $39 Creator — plus TypeScript and Python SDKs, a 30-command CLI, and an MCP server.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Is agent-media cheaper than Synthesia?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'For comparable API access, yes — agent-media $39 Creator vs Synthesia Enterprise tier. agent-media also offers pay-as-you-go credits that never expire.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I make TikTok ads with Synthesia?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'You can, but the toolset is optimized for corporate use. agent-media is purpose-built for short-form UGC ads.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does agent-media work with Claude Code?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media ships an MCP server that exposes UGC video generation as a Claude Code tool. Synthesia has no MCP integration today.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Should I use Synthesia or agent-media?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Use Synthesia for corporate training, internal comms, and long-form multilingual avatar video. Use agent-media for short-form UGC ads generated programmatically.',
                    },
                  },
                ],
              },
              {
                '@type': 'SoftwareApplication',
                name: 'agent-media',
                applicationCategory: 'VideoApplication',
                applicationSubCategory: 'AI UGC Video Generator',
                operatingSystem: 'Web, CLI, API',
                offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
                description:
                  'Developer-first AI UGC video platform. REST API, CLI, TypeScript and Python SDKs, MCP server. Synthesia alternative for short-form social ads.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
