// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X, Terminal, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'HeyGen Alternative: agent-media vs HeyGen Comparison | agent-media',
  description:
    'Honest comparison of agent-media and HeyGen for AI video generation. Feature table, pricing breakdown, and when each tool is the better choice for UGC.',
  keywords: [
    'HeyGen alternative',
    'agent-media vs HeyGen',
    'HeyGen comparison',
    'AI video generator alternative',
    'best HeyGen alternative',
    'AI UGC vs HeyGen',
    'HeyGen pricing',
  ],
  openGraph: {
    title: 'HeyGen Alternative: agent-media vs HeyGen',
    description:
      'Side-by-side comparison of features, pricing, and workflows. HeyGen is a general-purpose avatar platform; agent-media is purpose-built for UGC.',
    type: 'article',
    url: 'https://agent-media.ai/compare/heygen-alternative',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HeyGen Alternative: agent-media vs HeyGen',
    description:
      'Side-by-side comparison for AI video generation. General-purpose avatars vs UGC-focused workflows.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/compare/heygen-alternative',
  },
};

export default function HeygenAlternativePage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Compare
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            HeyGen Alternative: <span className="text-purple-600">agent-media</span> vs HeyGen
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            HeyGen is a general-purpose AI avatar platform built for corporate
            video, training content, and multilingual translation. <strong className="text-[#121212]">agent-media</strong> is
            purpose-built for UGC-style video ads with developer-first tooling.
            These are different tools solving different problems, so the right
            choice depends entirely on your use case.{' '}
            <Link href="/login" className="text-[#121212] underline hover:no-underline">Try agent-media free</Link>.
          </p>
        </div>
      </section>

      {/* Quick Verdict */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Quick Verdict</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <h3 className="font-semibold text-[#121212]">Choose HeyGen if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You need corporate training, explainer, or presentation videos</li>
                <li>You want 40+ language video translation with lip-sync</li>
                <li>You need custom avatar cloning from your own likeness</li>
                <li>You want interactive avatar experiences for customer-facing use</li>
                <li>You need enterprise features with team management and SSO</li>
              </ul>
            </div>
            <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
              <h3 className="font-semibold text-[#121212]">Choose agent-media if:</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#6b6b76]">
                <li>You are creating UGC-style video ads for social platforms</li>
                <li>You want to generate videos from a CLI or REST API</li>
                <li>You need Hormozi-style word-by-word subtitles optimized for TikTok and Reels</li>
                <li>You prefer transparent per-second pricing starting at $39/mo</li>
                <li>You need B-roll generation and PIP mode for product content</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Key Difference */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
            <h2 className="font-mono text-sm font-semibold text-[#121212]">
              The Core Difference
            </h2>
            <p className="mt-3 text-sm text-[#6b6b76]">
              HeyGen is a <strong className="text-[#121212]">general-purpose avatar platform</strong> designed
              for corporate video, e-learning, and multilingual content. agent-media
              is a <strong className="text-[#121212]">UGC-focused video generator</strong> designed
              for social media ads, product reviews, and performance marketing content.
              HeyGen&apos;s avatars look polished and professional. agent-media&apos;s actors
              are styled to look like real people creating authentic UGC content.
              These are fundamentally different aesthetics serving different audiences.
            </p>
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
            Last verified: April 2, 2026. HeyGen data sourced from their public
            website and feature pages.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Feature</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">HeyGen</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Primary Focus', agent: 'UGC video ads', competitor: 'General-purpose avatars' },
                  { feature: 'AI Actors', agent: '200', competitor: 'Large library' },
                  { feature: 'CLI Tool', agentCheck: true, competitorCheck: false },
                  { feature: 'REST API', agentCheck: true, competitorCheck: true },
                  { feature: 'Avatar Cloning', agentCheck: false, competitorCheck: true },
                  { feature: 'Interactive Avatars', agentCheck: false, competitorCheck: true },
                  { feature: 'Video Translation', agent: 'Dubbing (any BCP-47)', competitor: '40+ languages with lip-sync' },
                  { feature: 'Subtitle Styles', agent: '17', competitor: 'Basic' },
                  { feature: 'B-Roll Generation', agentCheck: true, competitorCheck: false },
                  { feature: 'PIP Mode', agentCheck: true, competitorCheck: false },
                  { feature: 'Overlay Text', agentCheck: true, competitorCheck: false },
                  { feature: 'Script Templates', agent: '8 UGC templates', competitor: 'Corporate templates' },
                  { feature: 'Enterprise Features', agent: 'API-based', competitor: 'SSO, team management, custom training' },
                  { feature: 'Pay-as-you-go Credits', agentCheck: true, competitorCheck: false },
                  { feature: 'Claude Code Skill', agentCheck: true, competitorCheck: false },
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
            Last verified: April 2, 2026. HeyGen uses per-minute and credit-based
            pricing that varies by plan tier. Direct cost comparison depends on
            video length and features used.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Aspect</th>
                  <th className="bg-purple-50 px-5 py-4 text-center font-mono font-bold text-purple-700">agent-media</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">HeyGen</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { aspect: 'Pricing Model', agent: 'Per-second credits (30 credits/sec)', competitor: 'Per-minute / credit-based' },
                  { aspect: 'Entry Plan', agent: '$39/mo (3,900 credits)', competitor: 'Starts at ~$24-29/mo (limited minutes)' },
                  { aspect: 'Mid Plan', agent: '$69/mo (6,900 credits)', competitor: 'Business tier (varies)' },
                  { aspect: 'Top Plan', agent: '$129/mo (12,900 credits)', competitor: 'Enterprise (custom)' },
                  { aspect: 'Cost per 10s video', agent: '~$3.00', competitor: 'Can be lower for short clips' },
                  { aspect: 'Pay-as-you-go', agent: '$39 credit pack (never expires)', competitor: 'Not available' },
                  { aspect: 'Target buyer', agent: 'Developers, growth teams', competitor: 'Enterprises, L&D teams' },
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
            HeyGen&apos;s entry plan can start lower than agent-media&apos;s for
            basic avatar videos, and per-unit cost can be lower for short clips.
            However, the platforms serve different purposes. HeyGen is priced for
            corporate video production; agent-media is priced for UGC ad
            generation. Compare based on your specific use case, not just the
            sticker price.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/pricing" className="text-[#121212] font-medium underline hover:no-underline">Compare agent-media plans in detail</Link>
          </p>
        </div>
      </section>

      {/* When HeyGen Is Better */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            When HeyGen Is the Better Choice
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Corporate and training video.</strong>{' '}
              HeyGen is designed for professional corporate content: training
              videos, product walkthroughs, internal communications, and
              presentations. Their avatars are polished and professional-looking,
              which is exactly what you want for enterprise content. <strong className="text-[#121212]">agent-media</strong> is purpose-built for the opposite aesthetic. Its actors are styled to look like real UGC creators, which performs better on TikTok, Reels, and paid social where authenticity drives engagement.
            </p>
            <p>
              <strong className="text-[#121212]">Multilingual video translation.</strong>{' '}
              HeyGen offers 40+ language video translation with automatic lip-sync
              adjustment. If you need to take one video and translate it into dozens
              of languages while keeping the lip movements natural, HeyGen has
              invested significantly more in this capability. <strong className="text-[#121212]">agent-media</strong> supports dubbing to any BCP-47 language code, so you can localize UGC ads to any market even if the translation workflow is less specialized.
            </p>
            <p>
              <strong className="text-[#121212]">Custom avatar cloning.</strong>{' '}
              HeyGen allows you to create a custom avatar from your own likeness.
              This is valuable for personal brands, company spokespersons, and
              training content where you want a specific person on screen without
              filming. <strong className="text-[#121212]">agent-media</strong> offers 200 actors with variant selection across outfits, poses, and backgrounds, which gives you creative diversity without needing a custom clone.
            </p>
            <p>
              <strong className="text-[#121212]">Interactive avatars.</strong>{' '}
              HeyGen offers interactive avatar experiences where the avatar can
              respond to user input in real time. This is a completely different
              product category from UGC video generation. <strong className="text-[#121212]">agent-media</strong> focuses on pre-rendered video ads optimized for conversion, not real-time interaction. If you need conversational AI avatars, HeyGen is the right tool.
            </p>
            <p>
              <strong className="text-[#121212]">Enterprise features.</strong>{' '}
              HeyGen provides enterprise-grade features including SSO, team
              management, custom avatar training, and dedicated support. <strong className="text-[#121212]">agent-media</strong> answers with API-based integration that developers can build into any existing enterprise workflow, plus pay-as-you-go credit packs for teams that need flexibility over rigid enterprise contracts.
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
              <strong className="text-[#121212]">UGC-style video ads.</strong>{' '}
              agent-media is purpose-built for the kind of authentic, creator-style
              content that performs on TikTok, Instagram Reels, and Facebook ads.
              The 200 AI actors are styled to look like real UGC creators, not
              corporate presenters. The Hormozi-style word-by-word subtitles (hormozi, tiktok, neon,
              etc.) are designed for social media engagement. If you are generating
              ad creative for performance marketing, agent-media is the right tool.
            </p>
            <p>
              <strong className="text-[#121212]">Developer workflow.</strong>{' '}
              agent-media&apos;s CLI and REST API let you generate videos
              programmatically. This is the core product, not an afterthought. You
              can script video generation, integrate it into your product, or
              automate it in CI/CD pipelines. The Claude Code Skill even lets
              your AI coding assistant generate videos. HeyGen has an API, but
              their primary interface is a web-based studio.
            </p>
            <p>
              <strong className="text-[#121212]">B-roll and visual variety.</strong>{' '}
              agent-media generates AI B-roll cutaway scenes and offers a
              picture-in-picture mode for product content. Your videos are not
              limited to a single talking head on a static background. This visual
              variety is important for social media ads where you need to hold
              attention in the first three seconds.
            </p>
            <p>
              <strong className="text-[#121212]">Simpler, transparent pricing for UGC.</strong>{' '}
              If you just need UGC video ads, agent-media&apos;s $39/mo entry plan
              with transparent per-second pricing is straightforward. You pay 30
              credits per second of video, the rate is the same across all plans,
              and credit packs never expire. You do not need to navigate enterprise
              pricing tiers designed for a different use case.
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
            If you are coming from HeyGen, here is what the agent-media workflow
            looks like. Script in, finished UGC video out.
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
              <p className="mt-2 text-[#6b6b76]/60"># Generate a UGC testimonial video</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video create \<br />
                {'  '}--script &quot;OK so I have to tell you about this skincare routine I found...&quot; \<br />
                {'  '}--template testimonial \<br />
                {'  '}--duration 15 \<br />
                {'  '}--subtitles tiktok \<br />
                {'  '}--tone energetic
              </p>
              <p className="mt-2 text-[#6b6b76]/60"># Dub an existing video to Spanish</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video dub \<br />
                {'  '}--video-id abc123 \<br />
                {'  '}--language es
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
              <h3 className="font-semibold text-[#121212]">Is agent-media a HeyGen alternative for UGC ads?</h3>
              <p className="mt-2">
                Yes, for UGC-style social ads specifically, agent-media is purpose-built.
                HeyGen is a general avatar platform optimized for corporate explainers,
                training videos, and multilingual translation. agent-media&apos;s actors,
                B-roll generation, animated subtitles, and 9:16 output are tuned for
                TikTok / Reels / Shorts ad creative.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">How does the HeyGen API compare to agent-media&apos;s API?</h3>
              <p className="mt-2">
                Both have REST APIs. agent-media&apos;s API ships with a 30-command
                CLI, native TypeScript and Python SDKs, an{' '}
                <Link href="/docs/mcp" className="underline hover:text-[#121212]">MCP server</Link>{' '}
                for Claude Code, and webhooks. HeyGen&apos;s API is corporate-feature-rich
                (avatar customization, voice cloning) and now ships an MCP server for
                avatar clips, but it has no CLI and does not run a full script-to-published
                UGC pipeline. Pick HeyGen for avatar flexibility; pick agent-media for
                terminal-native UGC that auto-publishes.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Is agent-media cheaper than HeyGen?</h3>
              <p className="mt-2">
                For UGC ad workloads, yes. agent-media starts at <strong>$39/month</strong>{' '}
                with API + CLI included. HeyGen&apos;s Creator plan starts around $29; its API is pay-as-you-go
                (from $5, billed per second). For programmatic UGC at scale, agent-media&apos;s
                flat credit pricing from $39/month is simpler to budget.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Does agent-media support multilingual dubbing like HeyGen?</h3>
              <p className="mt-2">
                Yes. agent-media supports dubbing existing videos and generating
                multilingual UGC ads. HeyGen offers more languages and lip-sync
                fidelity for long-form corporate translation; agent-media is tuned
                for short-form ads in 30+ languages.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Can I use agent-media with Claude Code or Cursor?</h3>
              <p className="mt-2">
                Yes. agent-media ships an MCP server that runs the full UGC pipeline
                (script, actor, B-roll, captions) and auto-publishes. HeyGen also ships an
                MCP server, but it generates avatar clips rather than complete UGC ads.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Should I use HeyGen or agent-media?</h3>
              <p className="mt-2">
                Use HeyGen if you need custom avatars, voice cloning, or long-form
                corporate / training video. Use agent-media if you need short-form
                UGC ads generated programmatically from a CLI, REST API, or AI agent.
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
            <Link href="/compare/creatify-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Creatify Alternative <ArrowRight className="h-4 w-4" />
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
                headline: 'HeyGen Alternative: agent-media vs HeyGen Comparison',
                description:
                  'Honest comparison of agent-media and HeyGen for AI video generation. UGC ads vs corporate avatars, API and pricing differences.',
                url: 'https://agent-media.ai/compare/heygen-alternative',
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
                    name: 'Is agent-media a HeyGen alternative for UGC ads?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. For UGC-style social ads, agent-media is purpose-built. HeyGen is a general avatar platform optimized for corporate explainers, training, and translation. agent-media actors, B-roll, animated subtitles, and 9:16 output are tuned for TikTok / Reels / Shorts ad creative.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How does the HeyGen API compare to agent-media API?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Both have REST APIs and MCP servers. agent-media ships a 30-command CLI, TypeScript and Python SDKs, an MCP server, and webhooks. HeyGen has an MCP server for avatar clips but no CLI, and it does not run a full UGC pipeline with auto-publishing.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Is agent-media cheaper than HeyGen?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'For UGC ad workloads, yes. agent-media starts at $39/month with API + CLI included. HeyGen Creator plan starts around $29 without API access; the API requires their Team plan ($89+/month).',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Does agent-media support multilingual dubbing like HeyGen?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media supports dubbing and multilingual UGC in 30+ languages. HeyGen offers more languages and stronger long-form lip-sync for corporate translation; agent-media is tuned for short-form ads.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I use agent-media with Claude Code or Cursor?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes. agent-media ships an MCP server that runs the full UGC pipeline and auto-publishes. HeyGen also ships an MCP server, but it generates avatar clips rather than complete UGC ads.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Should I use HeyGen or agent-media?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Use HeyGen for custom avatars, voice cloning, and long-form corporate or training video. Use agent-media for short-form UGC ads generated programmatically from a CLI, REST API, or AI agent.',
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
                  'Developer-first AI UGC video platform. REST API, CLI, TypeScript and Python SDKs, MCP server, 200+ actors, animated subtitles, B-roll. HeyGen alternative for short-form social ads.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
