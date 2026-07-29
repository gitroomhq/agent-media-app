// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X, Terminal, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Arcads Alternative: agent-media vs Arcads Comparison | agent-media',
  description:
    'Honest comparison of agent-media and Arcads for AI UGC video generation. Feature table, pricing breakdown, and when each tool is the better choice.',
  keywords: [
    'Arcads alternative',
    'agent-media vs Arcads',
    'Arcads comparison',
    'AI UGC generator alternative',
    'best Arcads alternative',
    'UGC video generator comparison',
    'Arcads pricing',
  ],
  openGraph: {
    title: 'Arcads Alternative: agent-media vs Arcads',
    description:
      'Side-by-side comparison of features, pricing, and workflows. Find out which AI UGC tool fits your team.',
    type: 'article',
    url: 'https://agent-media.ai/compare/arcads-alternative',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arcads Alternative: agent-media vs Arcads',
    description:
      'Side-by-side comparison of features, pricing, and workflows.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/compare/arcads-alternative',
  },
};

export default function ArcadsAlternativePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Compare
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Arcads Alternative: <span className="text-purple-600">agent-media</span> vs Arcads
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Arcads is one of the most well-funded players in AI UGC, with $16M in
            seed funding and 1,000+ actors. It targets performance marketers who
            want high-volume ad creative. <strong className="text-[#121212]">agent-media</strong> takes a different approach:
            developer-first tooling, transparent credit pricing, and workflows
            built around the terminal and API.{' '}
            <Link href="/login" className="text-[#121212] underline hover:no-underline">Try agent-media free</Link>{' '}
            or read the full breakdown below.
          </p>
        </div>
      </section>

      {/* Quick Verdict */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Quick Verdict</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <h3 className="font-semibold text-[#121212]">Choose Arcads if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You need the largest possible actor library (1,000+ actors)</li>
                <li>You are a performance marketing team running high-volume ad campaigns</li>
                <li>You want a platform with significant venture backing and enterprise ambitions</li>
                <li>Your budget comfortably supports $110-$220/mo plans</li>
                <li>You need localized content pages and multilingual ad workflows</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
              <h3 className="font-semibold text-[#121212]">Choose agent-media if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You want to generate videos from your terminal or integrate via REST API</li>
                <li>You prefer transparent per-second pricing starting at $39/mo</li>
                <li>You need pay-as-you-go credit packs that never expire</li>
                <li>You want Hormozi-style word-by-word subtitles and B-roll generation built in</li>
                <li>You want a Claude Code Skill for AI-native video generation</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Looking for an Arcads API? — captures "arcads api" keyword */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Looking for an Arcads API?
          </h2>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            Arcads <strong className="text-[#121212]">does not offer a public REST API</strong>. There&apos;s no developer
            plan, no SDK, no CLI, and no MCP server. If you want to generate UGC
            videos programmatically — from a script, a CI/CD pipeline, or your own
            product — Arcads requires a manual workflow through their browser editor.
          </p>
          <p className="mt-4 max-w-3xl text-[#6b6b76]">
            <strong className="text-[#121212]">agent-media is API-first.</strong> A REST API on the $39 Creator plan,
            TypeScript and Python SDKs, an{' '}
            <Link href="/docs" className="underline hover:text-[#121212]">npm-installable CLI</Link>{' '}
            with 30 commands, and an MCP server for Claude Code. Generate UGC videos
            programmatically from your terminal or your own service.
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
            Last verified: April 14, 2026. Arcads data sourced from their public
            homepage and feature pages.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Feature</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Arcads</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'AI Actors', agent: '200+', competitor: '300–1,000+' },
                  { feature: 'TypeScript SDK', agentCheck: true, competitorCheck: false },
                  { feature: 'Python SDK', agentCheck: true, competitorCheck: false },
                  { feature: 'CLI Tool', agentCheck: true, competitorCheck: false },
                  { feature: 'MCP Server (AI agents)', agentCheck: true, competitorCheck: false },
                  { feature: 'OpenAPI Spec', agentCheck: true, competitorCheck: true },
                  { feature: 'REST API', agentCheck: true, competitor: 'Pro plan only' },
                  { feature: 'Self-serve API access', agentCheck: true, competitorCheck: false },
                  { feature: 'Web Dashboard', agentCheck: true, competitorCheck: true },
                  { feature: 'Subtitle Styles', agent: '17', competitor: 'Limited' },
                  { feature: 'Languages', agent: 'Any (BCP-47)', competitor: '35+' },
                  { feature: 'Video Modes', agent: 'Standard + PIP', competitor: '10+ (fashion, unboxing, etc.)' },
                  { feature: 'B-Roll Generation', agentCheck: true, agentCheck2: true, competitorCheck: true },
                  { feature: 'Pay-as-you-go Credits', agentCheck: true, competitorCheck: false },
                  { feature: 'AI Script Generation', agentCheck: true, competitorCheck: true },
                  { feature: 'Script Templates', agent: '8', competitor: 'Ad-focused' },
                  { feature: 'Actor Variant Selection', agentCheck: true, competitorCheck: false },
                  { feature: 'Custom Avatar Cloning', competitorCheck: false, competitor: 'Pro plan only' },
                  { feature: 'Music Genres', agent: '5', competitor: 'Available' },
                  { feature: 'Webhooks', agentCheck: true, competitorCheck: true },
                  { feature: 'Entry Price', agent: '$39/mo', competitor: '$110/mo' },
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
            Last verified: April 14, 2026. Arcads is one of the most expensive
            platforms in the AI UGC category.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Plan</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Arcads</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { plan: 'Entry', agent: '$39/mo (3,900 credits)', competitor: '$110/mo' },
                  { plan: 'Mid', agent: '$69/mo (6,900 credits)', competitor: 'N/A' },
                  { plan: 'Top', agent: '$129/mo (12,900 credits)', competitor: '$220/mo' },
                  { plan: 'Cost per 10s video', agent: '~$3.00', competitor: 'Varies by plan' },
                  { plan: 'Pay-as-you-go', agent: '$39 credit pack (never expires)', competitor: 'Not available' },
                  { plan: 'Price difference', agent: '$39-$129/mo', competitor: '$110-$220/mo' },
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
            Arcads&apos; entry plan starts at $110/mo, which is nearly 3x
            agent-media&apos;s $39/mo Creator plan. agent-media uses transparent
            per-second credit pricing: 30 credits per second of video across all
            plans. The cost-per-video comparison depends on your volume, but
            agent-media&apos;s entry price is significantly lower.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/pricing" className="text-[#121212] font-medium underline hover:no-underline">See agent-media pricing details</Link>
          </p>
        </div>
      </section>

      {/* When Arcads Is Better */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            When Arcads Is the Better Choice
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Massive actor library.</strong>{' '}
              Arcads advertises 1,000+ AI actors, which is 5x agent-media&apos;s
              current library of 200. If you are running campaigns where you need
              dozens of different faces and demographics to test creative
              variations, Arcads gives you more options to work with. <strong className="text-[#121212]">agent-media</strong> answers with actor variant selection, letting you choose different outfits, poses, and backgrounds per actor to multiply your creative options from 200 base actors.
            </p>
            <p>
              <strong className="text-[#121212]">Performance marketing focus.</strong>{' '}
              Arcads is built specifically for performance marketers running paid
              ad campaigns at scale. Their workflow is optimized for generating
              high volumes of ad variations for A/B testing. <strong className="text-[#121212]">agent-media</strong> answers with CLI and API-driven batch generation, so developer-led growth teams can script hundreds of variations and integrate directly into their testing pipelines.
            </p>
            <p>
              <strong className="text-[#121212]">Venture-backed platform.</strong>{' '}
              With $16M in seed funding, Arcads has resources to invest in
              platform development, support, and enterprise features. For
              organizations that prioritize platform stability and long-term vendor
              viability, Arcads&apos; funding provides a degree of confidence. <strong className="text-[#121212]">agent-media</strong> is open-source and developer-community driven, which offers a different kind of stability through transparency and portability.
            </p>
            <p>
              <strong className="text-[#121212]">Multilingual site presence.</strong>{' '}
              Arcads has localized site versions in German, French, Spanish, Dutch,
              Portuguese, and Japanese. <strong className="text-[#121212]">agent-media</strong> supports dubbing to any BCP-47 language code, so while the platform interface is English, the video output works in any language you need.
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
              <strong className="text-[#121212]">Significantly lower entry price.</strong>{' '}
              agent-media starts at $39/mo versus Arcads&apos; $110/mo. That is a
              $71/mo difference at the entry tier. For startups, indie developers,
              and small teams testing AI UGC, agent-media lets you start generating
              videos without a $110+ monthly commitment. The $39 pay-as-you-go
              credit pack makes it even more accessible for occasional use.
            </p>
            <p>
              <strong className="text-[#121212]">Full developer ecosystem.</strong>{' '}
              agent-media ships a CLI, TypeScript SDK, Python SDK, MCP server for
              AI coding assistants, and an OpenAPI spec for auto-generating clients
              in any language. Arcads has a REST API — gated behind their Pro plan —
              but no SDK, no CLI, no MCP server, and no npm or PyPI packages.
              agent-media&apos;s entire product is built around the developer
              experience: script in, finished video out, all from code.
            </p>
            <p>
              <strong className="text-[#121212]">Transparent pricing model.</strong>{' '}
              agent-media charges 30 credits per second of video across all plans.
              A 10-second video costs approximately $3 regardless of which plan you
              are on. There are no confusing tier-based rate differences. You know
              exactly what each video costs before you generate it.
            </p>
            <p>
              <strong className="text-[#121212]">MCP server for AI agents.</strong>{' '}
              agent-media is the only UGC tool with a published MCP server. Use it
              in Claude Code, Cursor, or Windsurf — just say &quot;make a UGC video
              about X&quot; and your AI coding assistant handles the rest. Arcads has
              no AI agent integration.
            </p>
            <p>
              <strong className="text-[#121212]">Hormozi-style word-by-word subtitles.</strong>{' '}
              From hormozi to karaoke to neon, agent-media ships with 17 subtitle
              styles that you can apply to any video. Subtitles are one of the
              biggest performance levers in UGC ads, and having more style options
              means more creative variations to test.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Example */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            How It Works: Developer Workflow
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Generate UGC ads from your terminal, SDK, or AI coding assistant.
            No browser, no drag-and-drop editor. Arcads requires a Pro plan
            just to access the API. agent-media gives you five ways to integrate.
          </p>
          <div className="mt-8 space-y-6">
            {/* CLI */}
            <div className="rounded-lg border border-[#d4d4d4] bg-white">
              <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                <span className="ml-2 text-xs text-[#6b6b76]">CLI</span>
              </div>
              <div className="space-y-3 p-5 font-mono text-sm">
                <p className="text-[#6b6b76]/60"># Install and generate a UGC ad in one command</p>
                <p className="text-[#6b6b76]">
                  <span className="text-[#121212]">$</span> npm install -g agent-media-cli
                </p>
                <p className="text-[#6b6b76]">
                  <span className="text-[#121212]">$</span> agent-media ugc &quot;This tool saved my team 5 hours a week.&quot; \<br />
                  {'  '}--actor sofia --style hormozi --duration 10 --sync
                </p>
              </div>
            </div>
            {/* SDK */}
            <div className="rounded-lg border border-[#d4d4d4] bg-white">
              <div className="flex items-center justify-between border-b border-[#d4d4d4] px-4 py-3">
                <span className="text-xs font-medium text-[#6b6b76]">TypeScript SDK</span>
                <span className="rounded bg-[#f0f0f3] px-2 py-0.5 text-xs text-[#6b6b76]">npm install @agentmedia/sdk</span>
              </div>
              <div className="p-5 font-mono text-sm text-[#6b6b76]">
                <p><span className="text-blue-600">const</span> video = <span className="text-blue-600">await</span> client.<span className="text-amber-700">createVideo</span>({'{'}</p>
                <p className="pl-4">script: <span className="text-green-700">&apos;This tool saved my team 5 hours a week.&apos;</span>,</p>
                <p className="pl-4">actor_slug: <span className="text-green-700">&apos;sofia&apos;</span>,</p>
                <p className="pl-4">tone: <span className="text-green-700">&apos;energetic&apos;</span>,</p>
                <p>{'}'});</p>
                <p className="mt-1">console.log(video.video_url);</p>
              </div>
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
              <h3 className="font-semibold text-[#121212]">Does Arcads have an API?</h3>
              <p className="mt-2">
                No. Arcads does not offer a public REST API, SDK, CLI, or MCP server.
                Workflows run through their browser dashboard. agent-media is API-first
                — REST, TypeScript and Python SDKs, a 30-command CLI, and an MCP server
                for Claude Code, all on the $39 Creator plan.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">What is the cheapest Arcads alternative?</h3>
              <p className="mt-2">
                agent-media starts at <strong>$39/month</strong>. Arcads&apos; entry plan is
                roughly 3× higher and uses a video-count cap rather than transparent
                credits. For programmatic UGC at lower per-video cost, agent-media is
                the cheaper option.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I generate UGC videos programmatically without Arcads?</h3>
              <p className="mt-2">
                Yes. agent-media&apos;s <Link href="/docs/api-reference" className="underline hover:text-[#121212]">REST API</Link>{' '}
                accepts a script and an actor ID and returns a finished MP4
                (optional captions + B-roll). Trigger it from CI/CD,
                a cron job, or your own product.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does agent-media have similar actor variety to Arcads?</h3>
              <p className="mt-2">
                agent-media has 200+ AI actors covering diverse demographics, ages, and
                locations — sufficient for most performance-marketing use cases. Arcads
                claims 1,000+ actors. If breadth of actors is your single most important
                criterion, Arcads still leads on count; if you also need an API, CLI, or
                programmatic access, agent-media is the fit.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does Arcads work with Claude Code or MCP?</h3>
              <p className="mt-2">
                No. Arcads has no MCP server and no Claude Code integration. agent-media
                ships an{' '}
                <Link href="/docs/mcp" className="underline hover:text-[#121212]">MCP server</Link>{' '}
                that exposes UGC video generation as a Claude Code tool — generate ads
                from within an agent loop or a Claude session.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Is agent-media a good Arcads alternative for performance marketing?</h3>
              <p className="mt-2">
                For high-volume manual ad creative through a polished GUI, Arcads is
                purpose-built. For programmatic UGC at scale — generating hundreds of
                ad variants from spreadsheets, copy tests, or A/B pipelines —
                agent-media&apos;s API and CLI make it the better fit.
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
                headline: 'Arcads Alternative: agent-media vs Arcads Comparison',
                description:
                  'Honest comparison of agent-media and Arcads for AI UGC video generation. Pricing, API, CLI, and feature differences.',
                url: 'https://agent-media.ai/compare/arcads-alternative',
                datePublished: '2026-04-14',
                dateModified: '2026-05-05',
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
                      text: 'No. Arcads does not offer a public REST API, SDK, CLI, or MCP server. Workflows run through their browser dashboard. agent-media is API-first with REST, TypeScript and Python SDKs, a 30-command CLI, and an MCP server for Claude Code on the $39 Creator plan.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is the cheapest Arcads alternative?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media starts at $39/month. Arcads entry plan is roughly 3× higher and uses a video-count cap rather than transparent credits.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I generate UGC videos programmatically without Arcads?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media REST API accepts a script and actor ID and returns a finished MP4 (optional captions + B-roll). Trigger it from CI/CD, a cron job, or your own product.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does agent-media have similar actor variety to Arcads?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media has 200+ AI actors covering diverse demographics. Arcads claims 1,000+. If actor count is your single most important criterion, Arcads leads on breadth; if you also need API, CLI, or programmatic access, agent-media fits better.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does Arcads work with Claude Code or MCP?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'No. Arcads has no MCP server and no Claude Code integration. agent-media ships an MCP server that exposes UGC video generation as a Claude Code tool.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Is agent-media a good Arcads alternative for performance marketing?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'For manual ad creative through a polished GUI, Arcads is purpose-built. For programmatic UGC at scale — generating hundreds of variants from spreadsheets or A/B pipelines — agent-media is the better fit.',
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
                  'Developer-first AI UGC video platform. REST API, CLI, TypeScript and Python SDKs, MCP server, 200+ actors, animated subtitles, B-roll. Arcads alternative for programmatic ad creative.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
