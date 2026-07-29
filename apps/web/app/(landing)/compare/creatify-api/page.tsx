// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Creatify API Alternative — agent-media | Cheaper, More Open',
  description:
    'Direct comparison: Creatify API ($63 Pro tier) vs agent-media API ($39 Creator). REST endpoints, SDKs, CLI, MCP server, webhooks, idempotency. Pick the right UGC video API.',
  keywords: [
    'creatify api',
    'creatify api alternative',
    'creatify api pricing',
    'creatify rest api',
    'creatify vs agent-media api',
    'ugc video api comparison',
  ],
  openGraph: {
    title: 'Creatify API Alternative — agent-media',
    description: 'Direct API-vs-API comparison. agent-media is cheaper and more open.',
    type: 'article',
    url: 'https://agent-media.ai/compare/creatify-api',
  },
  alternates: { canonical: 'https://agent-media.ai/compare/creatify-api' },
};

export default function CreatifyApiPage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">Compare APIs</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Creatify API vs <span className="text-purple-600">agent-media</span> API
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            If you&apos;re evaluating a UGC video API, here&apos;s the direct
            comparison: Creatify&apos;s API is gated behind their <strong className="text-[#121212]">$63
            Pro plan</strong>, in beta, with no native CLI or SDKs. agent-media&apos;s
            API ships on the <strong className="text-[#121212]">$39 Creator</strong>{' '}
            with TypeScript and Python SDKs, a 30-command CLI, and an MCP server
            for Claude Code, all included.{' '}
            <Link href="/login" className="text-[#121212] underline hover:no-underline">
              Try agent-media free
            </Link>.
          </p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">API Feature Matrix</h2>
          <div className="mt-8 overflow-hidden rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f5f5f5]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[#121212]">Feature</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">Creatify API</th>
                  <th className="px-4 py-3 font-semibold text-[#121212]">agent-media API</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4d4d4]">
                {[
                  ['Lowest plan with API access', '$63/mo (Pro, beta)', '$39/mo (Creator)'],
                  ['API status', 'Beta', 'Production'],
                  ['REST API', 'Yes', 'Yes'],
                  ['Native TypeScript SDK', 'No', 'Yes'],
                  ['Native Python SDK', 'No', 'Yes'],
                  ['Native CLI', 'No', 'Yes (30 commands)'],
                  ['MCP server (Claude Code)', 'No', 'Yes'],
                  ['Webhooks', 'Limited', 'Yes (HTTPS callback)'],
                  ['OpenAPI spec', 'No', 'Yes'],
                  ['Async / sync mode', 'Async only', 'Both'],
                  ['Pay-as-you-go credits', 'No', 'Yes (never expire)'],
                ].map(([f, c, a]) => (
                  <tr key={f}>
                    <td className="px-4 py-3 font-medium">{f}</td>
                    <td className="px-4 py-3 text-[#6b6b76]">{c}</td>
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
          <h2 className="text-2xl font-bold text-[#121212]">Side-by-side: same job, two APIs</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-[#d4d4d4]">
              <div className="border-b border-[#d4d4d4] bg-[#f5f5f5] px-5 py-3 text-sm font-semibold text-[#121212]">
                Creatify API
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-[#121212]">
{`# Requires Pro plan ($63+/mo)
curl -X POST https://api.creatify.ai/v1/links \\
  -H "X-API-ID: $ID" \\
  -H "X-API-KEY: $KEY" \\
  -d '{ "link": "https://yourproduct.com" }'

# Then poll
curl https://api.creatify.ai/v1/links/{id} \\
  -H "X-API-ID: $ID" -H "X-API-KEY: $KEY"

# No native SDK, no CLI, no MCP`}
              </pre>
            </div>
            <div className="overflow-hidden rounded-lg border-2 border-[#121212]">
              <div className="border-b border-[#121212] bg-[#121212] px-5 py-3 text-sm font-semibold text-white">
                agent-media API
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-[#121212]">
{`# Available on Creator ($39/mo)
curl -X POST https://api.agent-media.ai/v1/generate/ugc_video \\
  -H "Authorization: Bearer $AGENT_MEDIA_API_KEY" \\
  -d '{ "actor_slug":"sofia", "script":"..." }'

# Or use the SDK / CLI / MCP
import { AgentMedia } from '@agentmedia/sdk';
const job = await client.submitVideo({ actor_slug: 'sofia', script: '...' });`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Why developers pick agent-media</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {[
              { title: 'Cheaper API access', desc: 'API on the $39 Creator vs Creatify\'s $63 Pro. ~38% lower entry cost.' },
              { title: 'Full SDK ecosystem', desc: 'TypeScript, Python, CLI, MCP — all first-party. Creatify ships none of these.' },
              { title: 'Production status', desc: 'agent-media\'s API is generally available. Creatify\'s API is beta — features can break or change.' },
              { title: 'Webhooks + OpenAPI', desc: 'Pass webhook_url for async delivery to your HTTPS endpoint. Public OpenAPI spec lets you generate clients for any language.' },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border border-[#d4d4d4] p-5">
                <Check className="h-5 w-5 text-[#121212]" />
                <h3 className="mt-3 font-semibold text-[#121212]">{f.title}</h3>
                <p className="mt-1 text-sm text-[#6b6b76]">{f.desc}</p>
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
              <h3 className="font-semibold text-[#121212]">Does Creatify have an API?</h3>
              <p className="mt-2">
                Yes, but it&apos;s beta-status and gated behind their Pro plan
                ($63/mo) and higher tiers. agent-media&apos;s production API is
                on the $39 Creator with TypeScript and Python SDKs, a 30-command
                CLI, and an MCP server included.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">How much does the Creatify API cost?</h3>
              <p className="mt-2">
                API access starts at the Pro plan ($63/mo) and scales up.
                agent-media&apos;s starter at $39/mo includes full API access.
                For pay-as-you-go usage, agent-media also offers credits that
                never expire.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does Creatify have a TypeScript or Python SDK?</h3>
              <p className="mt-2">
                Not at the time of writing. Developers have to write their own
                HTTP client. agent-media ships native SDKs:{' '}
                <Link href="/sdk/typescript" className="underline hover:text-[#121212]">@agentmedia/sdk</Link>{' '}
                on npm and{' '}
                <Link href="/sdk/python" className="underline hover:text-[#121212]">agent-media</Link>{' '}
                on PyPI — both with built-in polling and type hints.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does Creatify support MCP / Claude Code?</h3>
              <p className="mt-2">
                No. agent-media is the only AI UGC video tool with a published{' '}
                <Link href="/mcp" className="underline hover:text-[#121212]">MCP server</Link>{' '}
                today.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I migrate from Creatify API to agent-media?</h3>
              <p className="mt-2">
                Yes. Both APIs accept actor ID + script + duration shape.
                Migration usually takes one afternoon — swap base URL, update
                auth header, and translate response field names. Use the
                TypeScript SDK to skip most of the porting.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Which API is better for production?</h3>
              <p className="mt-2">
                agent-media&apos;s API is generally available, with webhook
                callbacks, a public OpenAPI spec, and SSRF-validated webhook
                URLs. Creatify&apos;s API is beta — signal to weigh seriously
                for production workloads.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Try the cheaper, more open API</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-[#121212] text-white hover:bg-[#333]">
                {'>'} Get Free API Key
              </Button>
            </Link>
            <Link href="/docs/api-reference" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Read API Docs <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/creatify-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Full Creatify Comparison <ArrowRight className="h-4 w-4" />
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
                headline: 'Creatify API vs agent-media API — Direct Comparison',
                description:
                  'Creatify API ($63 Pro, beta) vs agent-media API ($39 Creator, GA). SDKs, CLI, MCP, webhooks, idempotency comparison.',
                url: 'https://agent-media.ai/compare/creatify-api',
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
                    name: 'Does Creatify have an API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes, but beta-status and gated behind their Pro plan ($63/mo). agent-media production API is on the $39 Creator with TypeScript and Python SDKs, a 30-command CLI, and an MCP server included.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How much does the Creatify API cost?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'API access starts at the Pro plan ($63/mo) and scales up. agent-media starter at $39/mo includes full API access plus pay-as-you-go credits that never expire.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does Creatify have a TypeScript or Python SDK?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Not at the time of writing. agent-media ships native SDKs: @agentmedia/sdk on npm and agent-media on PyPI with built-in polling and type hints.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does Creatify support MCP / Claude Code?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'No. agent-media is the only AI UGC video tool with a published MCP server today.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I migrate from Creatify API to agent-media?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. Both APIs accept actor ID + script + duration shape. Migration usually takes one afternoon. Use the TypeScript SDK to skip most of the porting.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Which API is better for production?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media API is generally available with webhook callbacks, a public OpenAPI spec, and SSRF-validated webhook URLs. Creatify API is beta.',
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
                  'Production REST API for AI UGC video generation. TypeScript and Python SDKs, CLI, MCP server, webhooks, idempotency keys. Creatify API alternative.',
                url: 'https://agent-media.ai/ugc-video-api',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
