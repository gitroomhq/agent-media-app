// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X, Terminal, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Creatify Alternative: agent-media vs Creatify Comparison | agent-media',
  description:
    'Honest comparison of agent-media and Creatify for AI video generation. Feature table, pricing breakdown, and when each tool is the better choice.',
  keywords: [
    'Creatify alternative',
    'agent-media vs Creatify',
    'Creatify comparison',
    'AI UGC generator alternative',
    'best Creatify alternative',
    'AI video generator comparison',
    'Creatify pricing',
  ],
  openGraph: {
    title: 'Creatify Alternative: agent-media vs Creatify',
    description:
      'Side-by-side comparison of features, pricing, and workflows. Find out which AI video tool fits your team.',
    type: 'article',
    url: 'https://agent-media.ai/compare/creatify-alternative',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Creatify Alternative: agent-media vs Creatify',
    description:
      'Side-by-side comparison of features, pricing, and workflows.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/compare/creatify-alternative',
  },
};

export default function CreatifyAlternativePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Compare
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Creatify Alternative: <span className="text-purple-600">agent-media</span> vs Creatify
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Creatify focuses on turning product URLs into video ads with a
            template-driven approach and credit-based pricing. <strong className="text-[#121212]">agent-media</strong> focuses
            on script-to-video workflows for developers and growth teams, with a
            CLI, REST API, and transparent per-second pricing.{' '}
            <Link href="/pricing" className="text-[#121212] underline hover:no-underline">See agent-media pricing</Link>{' '}
            or read on for the full comparison.
          </p>
        </div>
      </section>

      {/* Quick Verdict */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Quick Verdict</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <h3 className="font-semibold text-[#121212]">Choose Creatify if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You want URL-to-video generation from a product page link</li>
                <li>You prefer an ad template library with pre-built creative formats</li>
                <li>You want a 7-day free trial to test the platform before paying</li>
                <li>You work primarily in a browser-based visual editor</li>
                <li>You need a wide variety of ad format templates for different platforms</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
              <h3 className="font-semibold text-[#121212]">Choose agent-media if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You want to generate videos from your terminal or via REST API</li>
                <li>You prefer transparent per-second pricing over credit-based systems</li>
                <li>You need Hormozi-style word-by-word subtitles and built-in B-roll generation</li>
                <li>You want pay-as-you-go credit packs that never expire</li>
                <li>You need to integrate video generation into code or CI/CD pipelines</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Looking for a Creatify API? — captures "creatify api" keyword */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Looking for a Creatify API?
          </h2>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            Creatify offers a beta API gated behind their <strong className="text-[#121212]">Pro plan ($63/mo)</strong>{' '}
            and higher tiers. There is no public CLI, no MCP server, and no native
            TypeScript or Python SDK. Programmatic access requires the Pro plan
            even for testing.
          </p>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            <strong className="text-[#121212]">agent-media is API-first from day one.</strong> The REST API is
            available on the $39 Creator plan. TypeScript and Python SDKs, an{' '}
            <Link href="/docs" className="underline hover:text-[#121212]">npm-installable CLI</Link>{' '}
            with 30 commands, and an MCP server for Claude Code — all included.
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

      {/* Feature Comparison Table */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Feature Comparison
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Last verified: April 2, 2026. Creatify data sourced from their public
            website and pricing pages.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Feature</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Creatify</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'AI Actors', agent: '200', competitor: 'Available' },
                  { feature: 'CLI Tool', agentCheck: true, competitorCheck: false },
                  { feature: 'REST API', agentCheck: true, competitorCheck: false },
                  { feature: 'URL-to-Video', agentCheck: false, competitorCheck: true },
                  { feature: 'Ad Template Library', agent: '8 script templates', competitor: 'Extensive template library' },
                  { feature: 'Subtitle Styles', agent: '17', competitor: 'Limited' },
                  { feature: 'B-Roll Generation', agentCheck: true, competitorCheck: false },
                  { feature: 'PIP Mode', agentCheck: true, competitorCheck: false },
                  { feature: 'Overlay Text', agentCheck: true, competitorCheck: false },
                  { feature: 'AI Script Generation', agentCheck: true, competitorCheck: true },
                  { feature: 'Free Trial', agent: 'Free tier available', competitor: '7-day free trial' },
                  { feature: 'Pay-as-you-go Credits', agentCheck: true, competitorCheck: false },
                  { feature: 'Voice Tones', agent: '4', competitor: 'Available' },
                  { feature: 'Music Genres', agent: '5', competitor: 'Available' },
                  { feature: 'Claude Code Skill', agentCheck: true, competitorCheck: false },
                  { feature: 'Actor Variant Selection', agentCheck: true, competitorCheck: false },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 text-[#121212]">{row.feature}</td>
                    <td className="bg-purple-50 px-5 py-3 text-center">
                      {row.agentCheck !== undefined ? (
                        row.agentCheck ? (
                          <Check className="mx-auto h-4 w-4 text-[#121212]" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-[#6b6b76]/40" />
                        )
                      ) : (
                        <span className="text-sm font-medium text-[#121212]">{row.agent}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {row.competitorCheck !== undefined ? (
                        row.competitorCheck ? (
                          <Check className="mx-auto h-4 w-4 text-[#121212]" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-[#6b6b76]/40" />
                        )
                      ) : (
                        <span className="text-sm text-[#6b6b76]">{row.competitor}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing Comparison */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Pricing Comparison
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Last verified: April 2, 2026. Creatify uses credit-based pricing,
            which makes direct plan-to-plan comparison more complex.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Aspect</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Creatify</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { aspect: 'Pricing Model', agent: 'Per-second credits (30 credits/sec)', competitor: 'Credit-based (varies by action)' },
                  { aspect: 'Entry Plan', agent: '$39/mo (3,900 credits)', competitor: 'Credit-based tiers' },
                  { aspect: 'Mid Plan', agent: '$69/mo (6,900 credits)', competitor: 'Credit-based tiers' },
                  { aspect: 'Top Plan', agent: '$129/mo (12,900 credits)', competitor: 'Credit-based tiers' },
                  { aspect: 'Cost per 10s video', agent: '~$3.00', competitor: 'Varies by credit usage' },
                  { aspect: 'Pay-as-you-go', agent: '$39 credit pack (never expires)', competitor: 'Not available' },
                  { aspect: 'Free trial', agent: 'Free tier available', competitor: '7-day free trial' },
                ].map((row) => (
                  <tr key={row.aspect} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 text-[#121212]">{row.aspect}</td>
                    <td className="bg-purple-50 px-5 py-3 text-center text-sm font-medium text-[#121212]">{row.agent}</td>
                    <td className="px-5 py-3 text-center text-sm text-[#6b6b76]">{row.competitor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-[#6b6b76]">
            Creatify uses a credit system where different actions consume different
            amounts of credits, which makes it harder to predict your per-video
            cost upfront. agent-media uses a straightforward model: 30 credits per
            second of video, consistent across all plans. This transparency makes
            it easier to budget for video generation at scale.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/login" className="text-[#121212] font-medium underline hover:no-underline">Start generating videos with agent-media</Link>
          </p>
        </div>
      </section>

      {/* When Creatify Is Better */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            When Creatify Is the Better Choice
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">URL-to-video generation.</strong>{' '}
              Creatify&apos;s standout feature is the ability to paste a product
              page URL and get a video ad generated from the page content. This is
              a genuinely useful workflow for e-commerce teams that want to turn
              product listings into video ads quickly. <strong className="text-[#121212]">agent-media</strong> answers with AI script generation, where you describe your product and the AI writes the script for you, plus 8 proven templates like testimonial, product-demo, and before-after.
            </p>
            <p>
              <strong className="text-[#121212]">Ad template library.</strong>{' '}
              Creatify provides a library of pre-built ad templates designed for
              different platforms and use cases. If you want to start with a proven
              creative format and customize from there, Creatify&apos;s template
              approach may save time. <strong className="text-[#121212]">agent-media</strong> offers 8 script templates
              (monologue, testimonial, saas-review, etc.) combined with Hormozi-style word-by-word subtitles, giving you more control over the final look of each video.
            </p>
            <p>
              <strong className="text-[#121212]">7-day free trial.</strong>{' '}
              Creatify offers a 7-day free trial that lets you test the platform
              before committing. <strong className="text-[#121212]">agent-media</strong> offers a permanent free tier so you can evaluate the platform on your own timeline without a countdown.
            </p>
            <p>
              <strong className="text-[#121212]">Browser-based visual workflow.</strong>{' '}
              If your team is more comfortable in a visual browser-based editor
              than a terminal or API, Creatify&apos;s interface may feel more
              natural. <strong className="text-[#121212]">agent-media</strong> has a web dashboard for quick previews, and its CLI and API workflow is the real advantage for teams that want to automate and scale video production.
            </p>
          </div>
        </div>
      </section>

      {/* When agent-media Wins */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            When <span className="text-purple-600">agent-media</span> Wins
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Transparent, predictable pricing.</strong>{' '}
              Creatify&apos;s credit-based pricing means different actions cost
              different amounts of credits, making it harder to predict your
              monthly spend. agent-media charges a flat 30 credits per second of
              video across all plans, so a 10-second video always costs
              approximately $3. No surprises, no complex credit math.
            </p>
            <p>
              <strong className="text-[#121212]">Developer and API integration.</strong>{' '}
              agent-media provides a full CLI tool and REST API as core features.
              You can generate videos from your terminal, integrate video creation
              into your product, or automate generation in CI/CD pipelines.
              Creatify does not offer a public CLI or documented REST API for
              programmatic video generation.
            </p>
            <p>
              <strong className="text-[#121212]">Hormozi-style word-by-word subtitles.</strong>{' '}
              Subtitles drive engagement on social platforms, and agent-media ships
              with 17 distinct styles including hormozi, tiktok, neon, gradient,
              and karaoke. This gives you more options to test which subtitle style
              performs best for your audience.
            </p>
            <p>
              <strong className="text-[#121212]">B-roll and PIP mode.</strong>{' '}
              agent-media generates AI B-roll scenes and offers a picture-in-picture
              video mode. Your videos can include cutaway scenes and floating visual
              overlays, not just a static talking head. This adds visual variety
              that keeps viewers engaged.
            </p>
            <p>
              <strong className="text-[#121212]">Pay-as-you-go flexibility.</strong>{' '}
              agent-media offers $39 credit packs that never expire, so you can
              generate videos without a monthly subscription. This is ideal for
              teams with irregular video needs or seasonal campaigns where you do
              not want to pay for unused monthly credits.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Example */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            How It Works: CLI Workflow
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Where Creatify starts with a URL, agent-media starts with a script or
            product description. One command, one finished video.
          </p>
          <div className="mt-8 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <div className="space-y-3 p-5 font-mono text-sm">
              <p className="text-[#6b6b76]/60"># Install agent-media CLI</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> npm install -g agent-media-cli
              </p>
              <p className="mt-2 text-[#6b6b76]/60"># Generate a product demo video from a description</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video create \<br />
                {'  '}--ai-script &quot;A smart water bottle that tracks hydration and syncs with Apple Health&quot; \<br />
                {'  '}--template product-demo \<br />
                {'  '}--duration 10 \<br />
                {'  '}--subtitles pop
              </p>
              <p className="mt-2 text-[#6b6b76]/60"># Generate a before-after comparison video</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video create \<br />
                {'  '}--script &quot;Before this app, I spent 2 hours every Sunday meal prepping. Now it takes 20 minutes...&quot; \<br />
                {'  '}--template before-after \<br />
                {'  '}--subtitles gradient \<br />
                {'  '}--tone dramatic
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Frequently Asked Questions</h2>
          <div className="mt-6 max-w-3xl space-y-6 text-[#6b6b76]">
            <div>
              <h3 className="font-semibold text-[#121212]">Does Creatify have an API?</h3>
              <p className="mt-2">
                Creatify offers a beta API gated behind their Pro plan ($63/mo) and
                higher tiers. agent-media&apos;s REST API is available on the $39
                starter plan, plus TypeScript and Python SDKs, a 30-command CLI, and
                an MCP server — all included from day one.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">What is the cheapest Creatify alternative?</h3>
              <p className="mt-2">
                agent-media starts at <strong>$39/month</strong>. Creatify&apos;s entry plan
                with API access is $63/month. For programmatic UGC at lower starting
                cost, agent-media is the cheaper option.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I use Creatify from a CLI or terminal?</h3>
              <p className="mt-2">
                No. Creatify does not ship a CLI. agent-media has an{' '}
                <Link href="/docs" className="underline hover:text-[#121212]">npm-installable CLI</Link>{' '}
                with 30 commands, including <code className="rounded bg-[#f5f5f5] px-1 py-0.5 text-[#121212]">agent-media generate ugc-video</code>.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does agent-media work with Claude Code?</h3>
              <p className="mt-2">
                Yes. agent-media ships an{' '}
                <Link href="/docs/mcp" className="underline hover:text-[#121212]">MCP server</Link>{' '}
                that exposes UGC video generation as a tool inside Claude Code or any
                MCP-compatible client. Creatify has no MCP server.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">How does pricing compare between agent-media and Creatify?</h3>
              <p className="mt-2">
                agent-media uses transparent <strong>per-second credits</strong> that
                never expire. Creatify uses monthly credit allocations that reset.
                For burst-y or pipeline workloads, agent-media&apos;s pay-as-you-go
                model is more efficient.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does agent-media support URL-to-video like Creatify?</h3>
              <p className="mt-2">
                agent-media&apos;s primary mode is script-to-video — you bring a
                script (or generate one from your own LLM) and choose an actor.
                Creatify&apos;s URL-to-video template flow is purpose-built for ad
                creators iterating from product pages; agent-media is purpose-built
                for developers piping scripts through code.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Related Comparisons & CTA */}
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
            <Link href="/compare/heygen-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              HeyGen Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/cheapest-ai-video" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Cheapest AI Video Rankings <ArrowRight className="h-4 w-4" />
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

      {/* JSON-LD: Article + FAQPage + SoftwareApplication */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: 'Creatify Alternative: agent-media vs Creatify Comparison',
                description:
                  'Honest comparison of agent-media and Creatify for AI video generation. Pricing, API, CLI, and feature differences.',
                url: 'https://agent-media.ai/compare/creatify-alternative',
                datePublished: '2026-04-02',
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
                      text: 'Creatify offers a beta API gated behind their Pro plan ($63/mo) and higher tiers. agent-media REST API is available on the $39 Creator plan, plus TypeScript and Python SDKs, a 30-command CLI, and an MCP server.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is the cheapest Creatify alternative?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media starts at $39/month. Creatify entry plan with API access is $63/month.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I use Creatify from a CLI or terminal?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'No. Creatify does not ship a CLI. agent-media has an npm-installable CLI with 30 commands including agent-media generate ugc-video.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does agent-media work with Claude Code?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media ships an MCP server that exposes UGC video generation as a tool inside Claude Code or any MCP-compatible client. Creatify has no MCP server.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How does pricing compare between agent-media and Creatify?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media uses transparent per-second credits that never expire. Creatify uses monthly credit allocations that reset. For burst workloads, agent-media is more efficient.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does agent-media support URL-to-video like Creatify?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media is script-to-video first. Creatify URL-to-video template flow is purpose-built for ad creators iterating from product pages; agent-media is purpose-built for developers piping scripts through code.',
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
                  'Developer-first AI UGC video platform. REST API, CLI, TypeScript and Python SDKs, MCP server, 200+ actors, animated subtitles, B-roll. Creatify alternative for programmatic ad creative.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
