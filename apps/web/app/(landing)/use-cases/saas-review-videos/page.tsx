// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'SaaS Review Videos: Generate Social Proof Content with AI | agent-media',
  description:
    'Create SaaS review and testimonial videos with AI actors. Show dashboard screenshots, generate authentic review scripts, and publish social proof content. $3-5 per video.',
  keywords: [
    'SaaS review video',
    'SaaS testimonial video',
    'AI review video generator',
    'social proof video',
    'SaaS marketing video',
    'software review content',
    'agent-media SaaS',
    'AI testimonial generator',
    'product review video',
    'SaaS video marketing',
  ],
  openGraph: {
    title: 'SaaS Review Videos: Generate Social Proof Content with AI',
    description:
      'Create SaaS review and testimonial videos with AI actors. Dashboard screenshots as B-roll. $3-5 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/saas-review-videos',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SaaS Review Videos with agent-media',
    description:
      'AI actors review your SaaS product with dashboard screenshots. Dedicated review command.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/saas-review-videos',
  },
};

export default function SaasReviewVideosPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            SaaS Review Videos: Social Proof Content on Demand
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Social proof drives SaaS conversions. Review videos on landing
            pages, social media, and G2 profiles build trust faster than text
            testimonials.{' '}
            <strong className="text-[#121212]">agent-media</strong> has a
            dedicated review command that generates SaaS review videos with AI
            actors, dashboard screenshots as B-roll, and the saas-review script
            template. $3 to $5 per video.{' '}
            <Link
              href="/pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              See pricing
            </Link>
            .
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Problem: Getting Customers to Record Reviews Is Hard
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Every SaaS founder knows the value of video testimonials. The
              problem is getting customers to actually record them. You send the
              request, they agree, then nothing happens. Three follow-ups later,
              you might get a low-quality selfie video with bad audio.
            </p>
            <p>
              Even when customers do record, the quality is inconsistent.
              Different lighting, different audio setups, different framing. Your
              landing page ends up with a mix of professional and amateur
              content that weakens the overall impression.
            </p>
            <p>
              Some SaaS companies hire actors for scripted testimonials. This
              works but costs $500 to $2,000 per video when you factor in the
              actor, script, recording, and editing. For early-stage SaaS with
              limited marketing budgets, that is a hard spend to justify for
              more than a few videos.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Solution: Dedicated Review Command with Screenshots
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">agent-media</strong> includes a
              dedicated review command built specifically for SaaS review
              content. You provide your product name, dashboard screenshots, and
              optionally a script. The pipeline generates a talking-head review
              where the AI actor discusses your product while your screenshots
              appear as B-roll.
            </p>
            <p>
              The saas-review script template structures the review naturally:
              what the product does, what problem it solves, and why the
              reviewer recommends it. If you skip the script, the AI generates
              one based on your product name and screenshots.
            </p>
            <p>
              You get consistent quality across every video. Same framing, same
              audio quality, same professional look.{' '}
              <strong className="text-[#121212]">agent-media</strong> lets you
              generate 10 review videos with 10 different actors for under $50.
              That is enough social proof content for your landing page, social
              channels, and ad campaigns.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Workflow */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Step-by-Step: Generate a SaaS Review Video
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Use the dedicated review command to create social proof content.
          </p>

          <div className="mt-10 space-y-8">
            {/* Step 1 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Capture your dashboard screenshots
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Take screenshots of your product dashboard, key features, or
                  results screens. These will appear as B-roll in the review
                  video. Upload them or use URLs.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Generate the review video
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Use the review command with your product name and screenshots.{' '}
                  <strong className="text-[#121212]">agent-media</strong>{' '}
                  generates the script and assembles the video automatically.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      terminal
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media
                      review \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--saas &quot;TaskFlow&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--screenshots dashboard.png results.png \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor naomi \
                    </p>
                    <p className="text-[#6b6b76]">{'  '}--sync</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Or write your own review script
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  For more control over the messaging, write the review script
                  yourself and pass it directly. Use the saas-review template
                  for structure.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      terminal
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media ugc
                      &quot;I switched to TaskFlow three months ago. My team
                      ships twice as fast now. The dashboard shows everything in
                      one place.&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor naomi \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--broll-images &quot;dashboard.png,results.png&quot;
                      \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--style minimal \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--tone confident \
                    </p>
                    <p className="text-[#6b6b76]">{'  '}--sync</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Generate multiple reviewers
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Swap actors to create a gallery of review videos. Different
                  faces build stronger social proof than a single testimonial.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      terminal
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> for actor in
                      naomi sofia emma marco priya; do
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}agent-media saas-review --saas &quot;TaskFlow&quot;
                      --screenshots dashboard.png --actor $actor
                    </p>
                    <p className="text-[#6b6b76]">{'  '}done</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Example Script */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Example Review Script (10 Seconds)
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Max 25 words for 10 seconds.{' '}
            <strong className="text-[#121212]">agent-media</strong> validates
            word count to keep the delivery natural and unhurried.
          </p>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-[#121212]/5 p-6">
            <p className="text-sm italic text-[#121212]">
              &quot;I switched to TaskFlow three months ago. My team ships twice
              as fast now. The dashboard shows everything in one place.&quot;
            </p>
            <p className="mt-3 font-mono text-xs text-[#6b6b76]">
              22 words. Clean and natural for a 10-second delivery.
            </p>
          </div>
        </div>
      </section>

      {/* Cost Breakdown */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Cost Breakdown</h2>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Scenario
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    item: '1 review video (10s)',
                    cost: '~$3 (300 credits)',
                  },
                  {
                    item: '1 review video (15s)',
                    cost: '~$4.50 (450 credits)',
                  },
                  {
                    item: '5 review videos (different actors)',
                    cost: '~$15 (1,500 credits)',
                  },
                  {
                    item: '10 review videos (full testimonial set)',
                    cost: '~$30 (3,000 credits)',
                  },
                  {
                    item: 'Creator plan ($39/mo)',
                    cost: '13 review videos per month',
                  },
                ].map((row) => (
                  <tr
                    key={row.item}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-5 py-3 text-[#121212]">{row.item}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.cost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Compare that to hiring actors for scripted testimonials ($500 to
            $2,000 each).{' '}
            <strong className="text-[#121212]">agent-media</strong> gives you a
            full testimonial gallery for the price of one traditional video.{' '}
            <Link
              href="/pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              View full pricing
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Where to Use Review Videos */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Where to Use SaaS Review Videos
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Landing pages',
                desc: 'Embed review videos below the fold on your homepage or pricing page. Video testimonials increase conversion rates compared to text-only social proof.',
              },
              {
                title: 'Social media ads',
                desc: 'Review-style UGC content performs well as paid social ads on Facebook and Instagram. The authentic talking-head format drives higher engagement than branded content.',
              },
              {
                title: 'G2 and review platforms',
                desc: 'Some review platforms accept video testimonials. Upload your AI review videos alongside written reviews to stand out in your category.',
              },
              {
                title: 'Email campaigns',
                desc: 'Include review video thumbnails in onboarding sequences, upgrade prompts, and win-back emails. Video in email increases click-through rates.',
              },
              {
                title: 'Product Hunt launches',
                desc: 'Use review videos in your Product Hunt launch day assets. Multiple testimonials create momentum and credibility with the PH audience.',
              },
              {
                title: 'Sales enablement',
                desc: 'Share review videos in sales decks, follow-up emails, and demo recordings. Social proof at the decision stage reduces objections.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-[#d4d4d4] p-5"
              >
                <h3 className="font-semibold text-[#121212]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#6b6b76]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-links & CTA */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Related Pages</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/use-cases/tiktok-ugc-ads"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              TikTok UGC Ads <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/facebook-ugc-ads"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Facebook UGC Ads <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/shopify-product-videos"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Shopify Product Videos <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/makeugc-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/talking-head-ugc"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Talking Head UGC <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#121212] text-white hover:bg-[#333]"
              >
                {'>'} Start Making Review Videos
              </Button>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              View Pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="mt-8 text-xs text-[#6b6b76]">
            Last updated: April 2026
          </p>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline:
              'SaaS Review Videos: Generate Social Proof Content with AI',
            description:
              'Create SaaS review and testimonial videos with AI actors. Dashboard screenshots as B-roll. $3-5 per video.',
            url: 'https://agent-media.ai/use-cases/saas-review-videos',
            dateModified: '2026-04-01',
          }),
        }}
      />
    </div>
  );
}
