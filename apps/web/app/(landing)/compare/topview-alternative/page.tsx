// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Topview Alternative — agent-media | Developer-First UGC Video',
  description:
    'Topview is a UGC video tool with a browser editor. agent-media adds a REST API, TypeScript and Python SDKs, a 30-command CLI, and an MCP server for Claude Code. Plans from $39/mo.',
  keywords: [
    'topview alternative',
    'topview vs agent-media',
    'topview api',
    'topview alternative developers',
    'cheaper than topview',
    'ugc generator alternative',
  ],
  openGraph: {
    title: 'Topview Alternative — agent-media',
    description: 'Topview meets a developer API, CLI, and MCP server.',
    type: 'article',
    url: 'https://agent-media.ai/compare/topview-alternative',
  },
  alternates: { canonical: 'https://agent-media.ai/compare/topview-alternative' },
};

export default function TopviewAlternativePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">Compare</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Topview Alternative: <span className="text-purple-600">agent-media</span> vs Topview
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Topview is a polished browser-based UGC video tool with template
            workflows for performance marketers. <strong className="text-[#121212]">agent-media</strong>{' '}
            takes the same UGC output and exposes it through a REST API,
            TypeScript and Python SDKs, a 30-command CLI, and an MCP server
            — making it the first developer-first option in the category.{' '}
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
              <h3 className="font-semibold text-[#121212]">Choose Topview if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• You want a polished browser editor with templates</li>
                <li>• You don&apos;t need API or CLI access</li>
                <li>• You&apos;re an ad creator iterating manually on creative</li>
                <li>• You prefer point-and-click over scripts</li>
              </ul>
            </div>
            <div className="rounded-lg border-2 border-[#121212] p-6">
              <h3 className="font-semibold text-[#121212]">Choose agent-media if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• You need a REST API, CLI, or MCP server</li>
                <li>• You generate ads programmatically from code</li>
                <li>• You want pay-as-you-go credits that never expire</li>
                <li>• You need a Claude Code Skill for AI-native generation</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Looking for a Topview API?</h2>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            Topview <strong className="text-[#121212]">does not offer a public REST API</strong>.
            Their workflows live entirely in the browser editor. There&apos;s no
            developer plan, no CLI, no SDK, and no MCP server.
          </p>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            <strong className="text-[#121212]">agent-media is API-first.</strong> Generate UGC
            videos programmatically from your $39 Creator plan — TypeScript and
            Python SDKs, a 30-command CLI, and an MCP server for Claude Code, all
            included.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/docs/api-reference"
              className="inline-flex items-center gap-1 rounded-md border border-[#121212] bg-[#121212] px-4 py-2 text-sm font-semibold text-white hover:bg-[#333]"
            >
              View API Docs <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 rounded-md border border-[#121212]/30 px-4 py-2 text-sm font-semibold text-[#121212] hover:border-[#121212]"
            >
              See Pricing
            </Link>
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
                  <th className="px-4 py-3 font-semibold text-[#121212]">Topview</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">agent-media</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4d4d4]">
                {[
                  ['REST API', 'No', 'Yes ($39 Creator)'],
                  ['Native CLI', 'No', 'Yes (30 commands)'],
                  ['TypeScript / Python SDK', 'No', 'Yes'],
                  ['MCP server (Claude Code)', 'No', 'Yes'],
                  ['Browser editor', 'Yes', 'Yes'],
                  ['UGC actors', 'Polished library', '200+'],
                  ['Animated subtitles', 'Yes', 'Yes (Hormozi style)'],
                  ['B-roll generation', 'Yes', 'Yes'],
                  ['Pay-as-you-go credits', 'No', 'Yes (never expire)'],
                  ['Webhooks', 'No', 'Yes (HTTPS callback)'],
                  ['OpenAPI spec', 'No', 'Yes'],
                ].map(([f, t, a]) => (
                  <tr key={f}>
                    <td className="px-4 py-3 font-medium">{f}</td>
                    <td className="px-4 py-3 text-[#6b6b76]">{t}</td>
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
              <h3 className="font-semibold text-[#121212]">Topview</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• Subscription plans with monthly video caps</li>
                <li>• Unused video allocations expire monthly</li>
                <li>• <X className="inline h-4 w-4" /> No API, no CLI, no SDK, no MCP server</li>
                <li>• <X className="inline h-4 w-4" /> No webhooks or programmatic generation</li>
              </ul>
            </div>
            <div className="rounded-lg border-2 border-[#121212] p-6">
              <h3 className="font-semibold text-[#121212]">agent-media</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>• Creator: <strong>$39/mo</strong> — full developer stack included</li>
                <li>• Pay-as-you-go credits — never expire</li>
                <li>• <Check className="inline h-4 w-4" /> REST API + CLI + SDKs + MCP</li>
                <li>• <Check className="inline h-4 w-4" /> Webhooks (HTTPS callback) + public OpenAPI spec</li>
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
              <h3 className="font-semibold text-[#121212]">Does Topview have an API?</h3>
              <p className="mt-2">
                No. Topview is browser-only with no public API, CLI, SDK, or MCP
                server. agent-media is API-first from the $39 Creator — REST API,
                TypeScript and Python SDKs, 30-command CLI, and MCP server for
                Claude Code.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">What is the cheapest Topview alternative?</h3>
              <p className="mt-2">
                agent-media starts at <strong>$39/month</strong> with the full
                developer stack included. For purely manual GUI work, Topview&apos;s
                entry plan is comparable; for any programmatic workflow,
                agent-media is the clear cost winner.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I generate UGC videos programmatically without Topview?</h3>
              <p className="mt-2">
                Yes. agent-media&apos;s{' '}
                <Link href="/docs/api-reference" className="underline hover:text-[#121212]">REST API</Link>{' '}
                accepts a script and an actor ID and returns a finished MP4
                (optional captions + B-roll). Trigger from CI/CD, a
                cron job, or your own product.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does agent-media have similar actor quality to Topview?</h3>
              <p className="mt-2">
                agent-media has 200+ AI actors covering diverse demographics,
                ages, and locations. Topview&apos;s actor library is in a similar
                range. For most ad-creator use cases, both are sufficient.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does Topview work with Claude Code or MCP?</h3>
              <p className="mt-2">
                No. Topview has no MCP server and no Claude Code integration.
                agent-media ships an{' '}
                <Link href="/mcp" className="underline hover:text-[#121212]">MCP server</Link>{' '}
                that exposes UGC video generation as a Claude Code tool.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Should I use Topview or agent-media?</h3>
              <p className="mt-2">
                Use Topview if your workflow is GUI-only and you prefer
                templates. Use agent-media if you want the same UGC output with
                a REST API, CLI, and MCP server — for programmatic generation
                from code or AI agents.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Related Comparisons</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/compare/makeugc-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/arcads-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/creatify-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Creatify Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/cheapest-ai-video" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Cheapest AI Video <ArrowRight className="h-4 w-4" />
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
                headline: 'Topview Alternative: agent-media vs Topview Comparison',
                description:
                  'Topview is browser-only; agent-media adds REST API, CLI, SDKs, and MCP server. UGC ads with developer tooling.',
                url: 'https://agent-media.ai/compare/topview-alternative',
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
                    name: 'Does Topview have an API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'No. Topview is browser-only with no public API, CLI, SDK, or MCP server. agent-media is API-first from the $39 Creator.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is the cheapest Topview alternative?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media starts at $39/month with the full developer stack included. For programmatic workflows, agent-media is the cost winner.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I generate UGC videos programmatically without Topview?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media REST API accepts a script and actor ID and returns a finished MP4. Trigger from CI/CD, a cron job, or your own product.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does agent-media have similar actor quality to Topview?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media has 200+ AI actors covering diverse demographics. Topview actor library is in a similar range.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does Topview work with Claude Code or MCP?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'No. Topview has no MCP server. agent-media ships an MCP server that exposes UGC video generation as a Claude Code tool.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Should I use Topview or agent-media?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Use Topview for GUI-only manual work. Use agent-media for the same UGC output with a REST API, CLI, and MCP server.',
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
                  'Developer-first AI UGC video platform. REST API, CLI, TypeScript and Python SDKs, MCP server. Topview alternative for programmatic ad creative.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
