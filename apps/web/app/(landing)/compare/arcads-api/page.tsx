// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Arcads API Alternative, agent-media | The UGC Ad API That Exists',
  description:
    'Arcads only offers API access on its Enterprise plan. agent-media is the self-serve UGC video API: REST, TypeScript and Python SDKs, CLI, MCP server, webhooks, from $39/mo.',
  keywords: [
    'arcads api',
    'arcads api alternative',
    'arcads rest api',
    'arcads api pricing',
    'arcads vs agent-media api',
    'ai ugc api',
  ],
  openGraph: {
    title: 'Arcads API Alternative, agent-media',
    description: 'Arcads gates its API to Enterprise plans. agent-media is the self-serve, API-first UGC video platform.',
    type: 'article',
    url: 'https://agent-media.ai/compare/arcads-api',
  },
  alternates: { canonical: 'https://agent-media.ai/compare/arcads-api' },
};

export default function ArcadsApiPage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">Compare APIs</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Looking for an <span className="text-purple-600">Arcads API</span>?
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: July 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Arcads <strong className="text-[#121212]">only offers API access on its
            Enterprise plan</strong>. There&apos;s no self-serve API, no SDK, no CLI, and no
            MCP server. If you want to generate UGC ads programmatically without an
            enterprise contract, agent-media is the self-serve alternative. REST, TypeScript and
            Python SDKs, a 30-command CLI, and an MCP server for Claude Code,
            all on the <strong className="text-[#121212]">$39 Creator plan</strong>.{' '}
            <Link href="/login" className="text-[#121212] underline hover:no-underline">
              Try agent-media free
            </Link>.
          </p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            How Arcads API access compares
          </h2>
          <div className="mt-8 overflow-hidden rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f5f5f5]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[#121212]">Capability</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">Arcads</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">agent-media</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4d4d4]">
                {[
                  ['Self-serve REST API', 'Enterprise only', 'Yes ($39 Creator)'],
                  ['TypeScript SDK', 'No', 'Yes (@agentmedia/sdk)'],
                  ['Python SDK', 'No', 'Yes (agent-media on PyPI)'],
                  ['Native CLI', 'No', 'Yes (30 commands)'],
                  ['MCP server (Claude Code)', 'No', 'Yes'],
                  ['Webhooks', 'Enterprise API', 'Yes (HTTPS callback)'],
                  ['OpenAPI spec', 'No', 'Yes'],
                  ['Programmatic ad generation', 'Enterprise API only', 'Yes'],
                  ['Actor library', '1,000+', '200+'],
                  ['Lowest plan with API', 'Enterprise (custom)', '$39/mo (API included)'],
                ].map(([f, a, m]) => (
                  <tr key={f}>
                    <td className="px-4 py-3 font-medium">{f}</td>
                    <td className="px-4 py-3 text-[#6b6b76]">{a}</td>
                    <td className="px-4 py-3 text-[#6b6b76]">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            What the agent-media API actually does
          </h2>
          <p className="mt-3 max-w-2xl text-[#6b6b76]">
            One REST call. Actor + script in. Finished MP4 with subtitles and
            B-roll out.
          </p>
          <div className="mt-8 overflow-hidden rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-2 font-mono text-xs text-[#6b6b76]">bash · curl</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-sm leading-6 text-[#121212]">
{`curl -X POST https://api.agent-media.ai/v1/generate/ugc_video \\
  -H "Authorization: Bearer $AGENT_MEDIA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "actor_slug": "sofia",
    "script": "Try this AI tool that builds your UGC ads in seconds.",
    "target_duration": 10,
    "subtitle_style": "hormozi"
  }'`}
            </pre>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Same call with the{' '}
            <Link href="/sdk/typescript" className="underline hover:text-[#121212]">TypeScript SDK</Link>,{' '}
            <Link href="/sdk/python" className="underline hover:text-[#121212]">Python SDK</Link>,{' '}
            <Link href="/cli" className="underline hover:text-[#121212]">CLI</Link>, or{' '}
            <Link href="/mcp" className="underline hover:text-[#121212]">MCP server</Link>.
          </p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Use cases that need an API</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {[
              { title: 'Spreadsheet-driven ad batches', desc: 'Generate 100 ad variants from a CSV of product copy. Arcads requires manually clicking through each. agent-media: one CLI loop.' },
              { title: 'CI/CD ad refreshes', desc: 'Re-render ads weekly when product copy changes. Arcads has no automation. agent-media: GitHub Action calls our API on a schedule.' },
              { title: 'AI-agent generation', desc: 'Have Claude or GPT write 10 hooks and pipe each through the API. With Arcads, your agent needs an Enterprise contract first, and there is still no MCP for it to call.' },
              { title: 'In-product video generation', desc: 'Let your customers click "make a UGC ad of this" in your dashboard. Arcads can\'t white-label; agent-media can.' },
            ].map((u) => (
              <div key={u.title} className="rounded-lg border border-[#d4d4d4] p-5">
                <Check className="h-5 w-5 text-[#121212]" />
                <h3 className="mt-3 font-semibold text-[#121212]">{u.title}</h3>
                <p className="mt-2 text-sm text-[#6b6b76]">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Frequently Asked Questions</h2>
          <div className="mt-6 max-w-3xl space-y-6 text-[#6b6b76]">
            <div>
              <h3 className="font-semibold text-[#121212]">Does Arcads have an API?</h3>
              <p className="mt-2">
                Only on Enterprise plans. Arcads has no self-serve API, SDK, CLI, or MCP
                server, so self-serve plans run through the browser dashboard.
                agent-media offers a self-serve, API-first alternative from $39/mo.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Is there an Arcads API alternative I can use today?</h3>
              <p className="mt-2">
                Yes,{' '}
                <Link href="/ugc-video-api" className="underline hover:text-[#121212]">
                  agent-media&apos;s UGC video API
                </Link>{' '}
                is production-grade, GA, and on the $39 Creator plan. REST plus
                TypeScript / Python SDKs, a 30-command CLI, and an MCP server.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">How much does an Arcads-style API cost?</h3>
              <p className="mt-2">
                With agent-media: <strong>$39/month</strong> for full API access
                including the SDKs, CLI, and MCP server. Pay-as-you-go credits
                also available, and they never expire.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Will Arcads ship an API?</h3>
              <p className="mt-2">
                Arcads publishes API docs, but access is limited to Enterprise plans. If
                you need a self-serve API today, agent-media ships one from $39/mo
                with SDKs, a CLI, and an MCP server.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Are agent-media&apos;s actors comparable to Arcads?</h3>
              <p className="mt-2">
                agent-media has 200+ AI actors covering diverse demographics,
                ages, and locations. Arcads claims 1,000+. If raw actor count
                matters most to you, Arcads leads on breadth; if API access
                matters at all, agent-media is the only choice.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I generate ads at scale with the agent-media API?</h3>
              <p className="mt-2">
                Yes. The API is built for batch and pipeline workloads , 
                submit many jobs in parallel and consume credits as they
                render. Higher monthly credit allocations are available on
                Pro Plus and enterprise plans.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Related Comparisons</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/compare/arcads-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Full Arcads Comparison <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/creatify-api" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Creatify API Comparison <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/makeugc-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/ugc-video-api" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              UGC Video API <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-[#121212] text-white hover:bg-[#333]">
                {'>'} Get Free API Key
              </Button>
            </Link>
            <Link href="/docs/api-reference" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Read API Docs <ArrowRight className="h-4 w-4" />
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
                headline: 'Arcads API Alternative, agent-media',
                description:
                  'Arcads gates its API to Enterprise plans. agent-media is the self-serve UGC video API: REST, SDKs, CLI, MCP server, webhooks, from $39/mo.',
                url: 'https://agent-media.ai/compare/arcads-api',
                datePublished: '2026-05-05',
                dateModified: '2026-07-14',
                author: { '@type': 'Organization', name: 'agent-media' },
                publisher: { '@type': 'Organization', name: 'agent-media' },
              },
              {
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: 'Does Arcads have an API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Only on Enterprise plans. Arcads has no self-serve API, SDK, CLI, or MCP server; self-serve plans run through the browser dashboard.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Is there an Arcads API alternative I can use today?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media UGC video API is production-grade, GA, and on the $39 Creator plan. REST plus TypeScript / Python SDKs, a 30-command CLI, and an MCP server.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How much does an Arcads-style API cost?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'With agent-media: $39/month for full API access including SDKs, CLI, and MCP server. Pay-as-you-go credits also available, and they never expire.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Will Arcads ship an API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Arcads publishes API docs, but access is limited to Enterprise plans. If you need a self-serve API today, agent-media ships one from $39/mo.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Are agent-media actors comparable to Arcads?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media has 200+ AI actors covering diverse demographics. Arcads claims 1,000+. If raw actor count matters most, Arcads leads on breadth; if API access matters at all, agent-media is the only choice.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I generate ads at scale with the agent-media API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. Built for batch and pipeline workloads, submit many jobs in parallel and consume credits as they render. Higher monthly credit allocations are available on Pro Plus and enterprise plans.',
                    },
                  },
                ],
              },
              {
                '@type': 'SoftwareApplication',
                name: 'agent-media UGC Video API',
                applicationCategory: 'DeveloperApplication',
                applicationSubCategory: 'AI Video Generation API',
                operatingSystem: 'Web, REST API',
                offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
                description:
                  'Production REST API for AI UGC video generation. TypeScript and Python SDKs, CLI, MCP server, webhooks. The API alternative for Arcads users.',
                url: 'https://agent-media.ai/ugc-video-api',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
