// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X, Terminal, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'MakeUGC Alternative: agent-media vs MakeUGC Comparison | agent-media',
  description:
    'Honest comparison of agent-media and MakeUGC for AI UGC video generation. Feature table, pricing breakdown, and when each tool is the better choice.',
  keywords: [
    'MakeUGC alternative',
    'agent-media vs MakeUGC',
    'MakeUGC comparison',
    'AI UGC generator alternative',
    'best MakeUGC alternative',
    'UGC video generator comparison',
    'MakeUGC pricing',
  ],
  openGraph: {
    title: 'MakeUGC Alternative: agent-media vs MakeUGC',
    description:
      'Side-by-side comparison of features, pricing, and workflows. Find out which AI UGC tool fits your team.',
    type: 'article',
    url: 'https://agent-media.ai/compare/makeugc-alternative',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MakeUGC Alternative: agent-media vs MakeUGC',
    description:
      'Side-by-side comparison of features, pricing, and workflows.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/compare/makeugc-alternative',
  },
};

export default function MakeUgcAlternativePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Compare
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            MakeUGC Alternative: <span className="text-purple-600">agent-media</span> vs MakeUGC
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026 · MakeUGC data verified April 2, 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            MakeUGC is one of the most visible AI UGC platforms with 300+ actors,
            a web-based editor, and product-in-hand features. <strong className="text-[#121212]">agent-media</strong> takes a
            different approach: CLI and API-first workflows, transparent per-second
            pricing, and a developer-focused toolchain.{' '}
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
              <h3 className="font-semibold text-[#121212]">Choose MakeUGC if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You want a browser-based visual editor with built-in editing tools</li>
                <li>You need product-in-hand videos where the avatar holds your product</li>
                <li>You need more than 200 actor options (MakeUGC has 300+)</li>
                <li>You want gesture control and pose customization in the editor</li>
                <li>You need videos longer than 15 seconds (MakeUGC supports up to 25s)</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
              <h3 className="font-semibold text-[#121212]">Choose agent-media if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You want to generate videos from your terminal or CI/CD pipeline</li>
                <li>You need a REST API to integrate UGC generation into your product</li>
                <li>You prefer transparent per-second pricing with no hidden tiers</li>
                <li>You want 17 subtitle styles and overlay text for branded content</li>
                <li>You need pay-as-you-go credit packs that never expire</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Looking for a MakeUGC API?, captures "makeugc api" keyword */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Looking for a MakeUGC API?
          </h2>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            MakeUGC has an API, but it&apos;s only available on their{' '}
            <strong className="text-[#121212]">Enterprise plan with no public pricing</strong>{' '}
           , you have to book a sales call to access it, and it&apos;s not available on
            their Startup, Growth, or Pro plans.
          </p>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            <strong className="text-[#121212]">agent-media&apos;s REST API is available on every plan starting at $39/month.</strong>{' '}
            Full public documentation, OpenAPI spec, webhooks, TypeScript and Python
            SDKs, an MCP server for Claude Code, and a CLI on npm. No sales call. No
            enterprise contract.
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

      {/* MakeUGC at a Glance, captures "makeugc review" intent */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">MakeUGC at a Glance</h2>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            MakeUGC is a browser-based AI UGC platform founded in 2024, headquartered
            in London. It offers 300+ AI actors, a visual editor, product-in-hand
            video generation, and B-roll. Strong choice for marketing teams that
            prefer a no-code editor. Limited for developers who need automation, API
            access, or programmatic workflows.
          </p>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Feature Comparison
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Last verified: April 2, 2026. MakeUGC data sourced from their public
            pricing page and API documentation.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Feature</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">MakeUGC</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'AI Actors', agent: '200', competitor: '300+' },
                  { feature: 'CLI Tool', agentCheck: true, competitorCheck: false },
                  { feature: 'REST API', agent: '$39 plan, public docs', competitor: 'Enterprise only (sales call)' },
                  { feature: 'Web Editor', agent: 'Dashboard (simple)', competitor: 'Full editor with built-in editing' },
                  { feature: 'Product-in-Hand', agentCheck: false, competitorCheck: true },
                  { feature: 'Subtitle Styles', agent: '17', competitor: 'Limited' },
                  { feature: 'Languages', agent: 'Any (BCP-47)', competitor: '35+' },
                  { feature: 'Max Video Duration', agent: '15s (30s PIP)', competitor: 'Up to 25s' },
                  { feature: 'Gesture Control', agentCheck: false, competitorCheck: true },
                  { feature: 'Overlay Text', agentCheck: true, competitorCheck: false },
                  { feature: 'Video Modes', agent: '2 (Standard, PIP)', competitor: '1' },
                  { feature: 'AI Script Generation', agentCheck: true, competitorCheck: true },
                  { feature: 'B-Roll Generation', agentCheck: true, competitorCheck: false },
                  { feature: 'Pay-as-you-go Credits', agentCheck: true, competitorCheck: false },
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
            Pricing Comparison: agent-media vs MakeUGC Pricing
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Last verified: April 2, 2026. MakeUGC pricing sourced from their
            public pricing page. MakeUGC offers a $1 trial.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Plan</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">MakeUGC</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { plan: 'Entry', agent: '$39/mo (3,900 credits)', competitor: '$49/mo' },
                  { plan: 'Mid', agent: '$69/mo (6,900 credits)', competitor: '$69/mo' },
                  { plan: 'Top', agent: '$129/mo (12,900 credits)', competitor: '$119/mo' },
                  { plan: 'Cost per 10s video', agent: '~$3.00', competitor: 'Varies by plan tier' },
                  { plan: 'Pay-as-you-go', agent: '$39 credit pack (never expires)', competitor: 'Not available' },
                  { plan: 'Trial', agent: 'Free tier available', competitor: '$1 trial' },
                ].map((row) => (
                  <tr key={row.plan} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 text-[#121212]">{row.plan}</td>
                    <td className="bg-purple-50 px-5 py-3 text-center text-sm font-medium text-[#121212]">{row.agent}</td>
                    <td className="px-5 py-3 text-center text-sm text-[#6b6b76]">{row.competitor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-[#6b6b76]">
            agent-media uses transparent per-second credit pricing: 30 credits per
            second of video across all plans. MakeUGC uses plan-tier-based video
            limits. Pricing structures differ, so direct per-video cost comparison
            depends on your usage volume.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/pricing" className="text-[#121212] font-medium underline hover:no-underline">Compare agent-media plans in detail</Link>
          </p>
        </div>
      </section>

      {/* When MakeUGC Is Better */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            When MakeUGC Is the Better Choice
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Visual editor workflow.</strong>{' '}
              MakeUGC has a full browser-based editor with built-in video editing
              capabilities. If your team works in a visual editor rather than code,
              MakeUGC provides a more familiar experience. <strong className="text-[#121212]">agent-media</strong> answers with a CLI and REST API that let developers generate videos programmatically, plus a simple web dashboard for quick previews.
            </p>
            <p>
              <strong className="text-[#121212]">Product-in-hand videos.</strong>{' '}
              MakeUGC can generate videos where the AI avatar holds and demonstrates
              your physical product. This is a feature agent-media does not currently offer.
              <strong className="text-[#121212]"> agent-media</strong> compensates with B-roll generation and PIP mode, giving you visual product context through cutaway scenes and floating overlays instead.
            </p>
            <p>
              <strong className="text-[#121212]">Larger actor library.</strong>{' '}
              MakeUGC advertises 300+ AI actors compared to agent-media&apos;s 200. If
              having a wider selection of faces and appearances matters for your
              content diversity, MakeUGC offers more options today. <strong className="text-[#121212]">agent-media</strong> offsets this with actor variant selection, giving you multiple outfit, pose, and background options per actor for greater creative range.
            </p>
            <p>
              <strong className="text-[#121212]">Gesture and pose control.</strong>{' '}
              MakeUGC offers gesture customization within their editor, giving you
              more control over actor body language and movement. <strong className="text-[#121212]">agent-media</strong> focuses on voice tone selection and 17 subtitle styles, which tend to have a bigger impact on ad performance in short-form social content.
            </p>
            <p>
              <strong className="text-[#121212]">Longer videos.</strong>{' '}
              MakeUGC supports videos up to 25 seconds. agent-media caps standard
              mode at 15 seconds, though PIP mode supports up to 30 seconds. <strong className="text-[#121212]">agent-media</strong> is optimized for the 5 to 15 second range where short-form UGC ads perform best on TikTok and Reels.
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
              <strong className="text-[#121212]">Developer and automation workflows.</strong>{' '}
              agent-media was built for developers and growth teams that want to
              generate videos programmatically. The CLI tool lets you create videos
              from your terminal, and the REST API integrates directly into your
              product, CI/CD pipelines, or automation scripts.{' '}
              <strong className="text-[#121212]">MakeUGC&apos;s API is enterprise-only and gated behind a sales call</strong>
              {' '},  the API is limited to higher-priced plans, with no CLI or MCP and no
              published price. agent-media&apos;s REST API is on the $39 Creator plan with{' '}
              <Link href="/docs/api-reference" className="underline hover:text-[#121212]">public documentation</Link>{' '}
              and an{' '}
              <Link href="/docs" className="underline hover:text-[#121212]">npm-installable CLI</Link>{' '}
              you can use today, no sales call required.
            </p>
            <p>
              <strong className="text-[#121212]">Transparent credit pricing.</strong>{' '}
              Every plan uses the same rate: 30 credits per second of video, which
              works out to approximately $3 per 10-second video. There are no hidden
              per-plan rate differences. Plus, agent-media offers $39 credit packs
              that never expire, so you can pay as you go without a monthly commitment.
            </p>
            <p>
              <strong className="text-[#121212]">Subtitle variety.</strong>{' '}
              agent-media ships with 17 subtitle styles including hormozi, tiktok,
              neon, karaoke, and gradient. Subtitles are a major part of UGC
              performance on social platforms, and having more style options lets
              you test and iterate faster.
            </p>
            <p>
              <strong className="text-[#121212]">B-roll and PIP mode.</strong>{' '}
              agent-media generates AI B-roll cutaway scenes and offers a
              picture-in-picture mode where the talking head appears alongside
              floating visual overlays. This is useful for product demos and
              explainer content where you need more than just a talking head.
            </p>
            <p>
              <strong className="text-[#121212]">Claude Code integration.</strong>{' '}
              agent-media has a dedicated Claude Code Skill, so you can generate
              UGC videos directly from your AI coding assistant. No other UGC
              platform offers this level of AI-native developer integration.
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
            Install the CLI, write your script, and generate a finished video in
            one command. No browser required.
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
              <p className="mt-2 text-[#6b6b76]/60"># Generate a UGC video from a script</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video create \<br />
                {'  '}--script &quot;Stop scrolling. This app changed how I manage my morning routine...&quot; \<br />
                {'  '}--duration 10 \<br />
                {'  '}--subtitles hormozi \<br />
                {'  '}--tone energetic
              </p>
              <p className="mt-2 text-[#6b6b76]/60"># Generate with AI script from product description</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video create \<br />
                {'  '}--ai-script &quot;A meal planning app for busy parents&quot; \<br />
                {'  '}--template problem-solution \<br />
                {'  '}--duration 15
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ, featured snippet bait + FAQPage schema source of truth */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Frequently Asked Questions</h2>
          <div className="mt-8 space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">Does MakeUGC have an API?</h3>
              <p className="mt-2 text-[#6b6b76]">
                MakeUGC has API access, but it&apos;s locked to their Enterprise plan
                which requires a sales call with no public pricing. It&apos;s not
                available on Startup, Growth, or Pro plans. agent-media&apos;s REST API is
                available on all plans starting at $39/month, with full public
                documentation and no sales call required.{' '}
                <Link href="/docs/api-reference" className="text-[#121212] underline hover:no-underline">
                  View agent-media API Docs →
                </Link>
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#121212]">Is MakeUGC worth it?</h3>
              <p className="mt-2 text-[#6b6b76]">
                MakeUGC is worth it if you need a browser-based visual editor,
                product-in-hand videos where the avatar holds your product, or
                gesture control. It&apos;s not the right choice if you need API access,
                CLI automation, or programmatic integration, for those use cases,
                agent-media is purpose-built.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#121212]">What is the cheapest MakeUGC alternative?</h3>
              <p className="mt-2 text-[#6b6b76]">
                agent-media starts at $39/month, $10 less than MakeUGC&apos;s $49/month
                entry plan. agent-media also offers pay-as-you-go credit packs from
                $39 that never expire, so you can generate videos without a monthly
                subscription.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#121212]">Can I use agent-media with Claude Code?</h3>
              <p className="mt-2 text-[#6b6b76]">
                Yes. agent-media is the only UGC video platform with a dedicated
                Claude Code Skill and MCP server. Install{' '}
                <code className="rounded bg-[#f0f0f3] px-1 py-0.5 text-sm">@agentmedia/mcp-server</code>{' '}
                and your AI coding assistant can generate videos, check credits, list
                actors, and manage your entire video pipeline from chat. MakeUGC has
                no Claude Code or MCP integration.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#121212]">How do I generate UGC videos programmatically?</h3>
              <p className="mt-2 text-[#6b6b76]">
                Use agent-media&apos;s REST API or TypeScript/Python SDK. A typical
                TypeScript call returns a video URL in about 45 seconds:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[#0d0d0d] p-4 text-sm text-gray-300">
{`const video = await client.createVideo({
  script: 'Your script here...',
  actor_slug: 'sofia',
  tone: 'energetic',
});`}
              </pre>
              <p className="mt-3 text-[#6b6b76]">
                Full API docs:{' '}
                <Link href="/docs/api-reference" className="text-[#121212] underline hover:no-underline">
                  agent-media.ai/docs/api-reference
                </Link>
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#121212]">Does agent-media have a free trial?</h3>
              <p className="mt-2 text-[#6b6b76]">
                agent-media offers a free tier to get started. MakeUGC offers a $1
                trial for 72 hours.
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
            <Link href="/compare/arcads-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/creatify-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Creatify Alternative <ArrowRight className="h-4 w-4" />
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

      {/* JSON-LD, Article + FAQPage (rich FAQ results) + SoftwareApplication */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: 'MakeUGC Alternative: agent-media vs MakeUGC Comparison',
                description:
                  'Honest comparison of agent-media and MakeUGC for AI UGC video generation. Public REST API, CLI, and SDKs vs enterprise-only API.',
                url: 'https://agent-media.ai/compare/makeugc-alternative',
                dateModified: '2026-05-05',
              },
              {
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: 'Does MakeUGC have an API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'MakeUGC has an API but it is only available on their Enterprise plan, which requires booking a sales call with no public pricing. It is not available on Startup, Growth, or Pro plans. agent-media offers a fully public REST API starting at $39/month with complete documentation at agent-media.ai/docs/api-reference.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is the best MakeUGC alternative for developers?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media is the leading MakeUGC alternative for developers. It offers a REST API, TypeScript SDK, Python SDK, CLI tool with 28 commands, and an MCP server for AI coding assistants. No other UGC video platform offers this level of developer tooling.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How does agent-media pricing compare to MakeUGC?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: "agent-media starts at $39/month versus MakeUGC's $49/month entry plan. agent-media uses transparent per-second pricing (30 credits per second, approximately $3 per 10-second video) and offers pay-as-you-go credit packs that never expire. MakeUGC uses plan-tier video limits with no pay-as-you-go option.",
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I generate UGC videos from the command line?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes, agent-media offers a CLI tool with 28 commands for generating UGC videos from the terminal. Install with: npm install -g agent-media-cli. MakeUGC does not offer a CLI tool.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is the cheapest MakeUGC alternative?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: "agent-media starts at $39/month, which is $10/month less than MakeUGC's $49/month entry plan. agent-media also offers pay-as-you-go credit packs from $39 that never expire, so you only pay when you generate videos.",
                    },
                  },
                ],
              },
              {
                '@type': 'SoftwareApplication',
                name: 'agent-media',
                applicationCategory: 'VideoApplication',
                applicationSubCategory: 'AI Video Generator',
                operatingSystem: 'Web, CLI, API',
                offers: {
                  '@type': 'Offer',
                  price: '39',
                  priceCurrency: 'USD',
                  priceSpecification: {
                    '@type': 'UnitPriceSpecification',
                    price: '39',
                    priceCurrency: 'USD',
                    unitText: 'MONTH',
                  },
                },
                description:
                  'API-first AI UGC video generator for developers. Generate talking head videos, B-roll, and product demos via REST API, CLI, TypeScript SDK, Python SDK, or MCP server.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
