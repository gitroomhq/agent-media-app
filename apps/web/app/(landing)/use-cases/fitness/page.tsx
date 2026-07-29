// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'AI UGC Videos for Fitness Brands: Testimonial Videos at Scale | agent-media',
  description:
    'Generate authentic fitness testimonial and review videos. Before-after templates, energetic delivery, 200 AI actors. $3 per video. CLI and API.',
  keywords: [
    'fitness UGC videos',
    'AI fitness testimonials',
    'supplement video ads',
    'fitness brand video',
    'protein shake review video',
    'before after video template',
    'agent-media fitness',
    'gym supplement marketing',
    'fitness influencer video',
    'workout product video',
  ],
  openGraph: {
    title: 'AI UGC Videos for Fitness Brands: Testimonial Videos at Scale',
    description:
      'Generate fitness testimonial videos with energetic delivery and before-after templates. 200 AI actors. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/fitness',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI UGC Videos for Fitness Brands | agent-media',
    description:
      'Fitness testimonials and review videos. Energetic tone. $3 per video.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/fitness',
  },
};

export default function FitnessPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            AI UGC Videos for Fitness Brands
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Fitness brands thrive on testimonials. Someone tried the product,
            got results, and talks about it on camera. That format sells
            supplements, programs, equipment, and apps. But sourcing real UGC at
            the volume social ads require is expensive and slow.{' '}
            <strong className="text-[#121212]">agent-media</strong> generates
            energetic testimonial videos with 200 AI actors. Before-after
            templates, punchy delivery, and animated subtitles. $3 per video.{' '}
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
            The Problem: Fitness Ads Burn Through Creatives
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Fitness advertising is one of the most competitive categories on
              Meta and TikTok. Supplement brands, workout apps, gym equipment
              companies, and personal trainers are all fighting for the same
              audience. The winning format is clear: a real person talking about
              their experience with the product. The problem is keeping up with
              the demand.
            </p>
            <p>
              Ad fatigue hits fitness ads especially hard. The audience scrolls
              through dozens of supplement testimonials every day. Once they
              have seen your creative three times, CTR drops off a cliff. You
              need fresh faces and fresh angles constantly. Most brands need 10
              to 30 new creatives per month just to maintain performance.
            </p>
            <p>
              Hiring fitness UGC creators costs $200 to $600 per video. Many
              want free product on top of the fee. Turnaround is 1 to 2 weeks.
              Revisions add more time. And you cannot test 20 different hooks
              with 5 different actors at those prices. The math does not work
              for most DTC fitness brands running on thin margins.
            </p>
            <p>
              The brands that win are the ones that can test the most creatives
              per dollar. Same product, different script, different face,
              different hook. Run 20 variations, kill the losers, scale the
              winners. That requires volume that traditional UGC sourcing cannot
              deliver.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Solution: High-Volume Fitness Testimonials
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">agent-media</strong> generates
              fitness testimonial videos from the command line. Write your
              script, pick an actor, choose the energetic voice tone, and get a
              finished video in minutes. The actor speaks directly to camera
              with the energy and conviction that fitness content demands.
            </p>
            <p>
              The <code className="bg-purple-50 px-1 text-purple-700">--template before-after</code>{' '}
              flag structures your script in two parts: the problem and the
              result. The actor describes their situation before using the
              product, then transitions to the outcome. This is the
              highest-converting format for fitness supplement ads.
            </p>
            <p>
              Because everything runs from the CLI, you can generate 20
              variations of the same product in one session. Same script with 5
              different actors. Same actor with 4 different hooks. Upload all 20
              to your ad account and let the algorithm find the winner. At $3
              per video, testing 20 creatives costs $60. That is less than a
              single UGC creator.{' '}
              <Link
                href="/login"
                className="text-[#121212] underline hover:no-underline"
              >
                Start generating fitness videos
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* CLI Workflow */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Step-by-Step: Generate a Fitness Testimonial
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Write a testimonial script, choose the energetic tone, and generate
            a video that looks like a real product review.
          </p>

          <div className="mt-10 space-y-8">
            {/* Step 1 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Install and authenticate
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Install the{' '}
                  <strong className="text-[#121212]">agent-media</strong> CLI
                  and log in.
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
                      <span className="text-[#121212]">$</span> npm install -g
                      agent-media-cli
                    </p>
                    <p className="mt-1 text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media
                      login
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Generate a before-after testimonial
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Use the before-after template with the energetic tone. The
                  actor delivers the script with the intensity fitness content
                  needs.
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
                      &quot;I tried this protein shake for 30 days and here is
                      what happened. More energy, faster recovery, and I
                      actually look forward to my post-workout shake now.&quot;
                      \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor jake \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--tone energetic \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--template before-after \
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
                  Test multiple actors on the same script
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Generate 5 variations with different actors. Upload all 5 to
                  your ad account and let the algorithm pick the winner.
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
                      jake emma marco sofia naomi; do
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}agent-media ugc &quot;I tried this protein
                      shake...&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'      '}--actor $actor --tone energetic \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'      '}--template before-after --sync
                    </p>
                    <p className="text-[#6b6b76]">{'  '}done</p>
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
                  Scale the winners, kill the losers
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  After 48 hours of ad data, you know which actor and hook
                  combination works. Generate more variations of the winning
                  format. Repeat every week to stay ahead of ad fatigue.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Script Ideas */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Fitness Script Formulas That Convert
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">The 30-day challenge.</strong>{' '}
              &quot;I used [product] every day for 30 days. Here are my
              results.&quot; This hook works because it implies commitment and
              real testing. Use the before-after template for structure.
            </p>
            <p>
              <strong className="text-[#121212]">The skeptic convert.</strong>{' '}
              &quot;I did not believe protein powder could taste this good. I
              was wrong.&quot; Start with doubt, end with enthusiasm. The
              energetic tone sells the transformation.
            </p>
            <p>
              <strong className="text-[#121212]">The comparison.</strong>{' '}
              &quot;I have tried every pre-workout on the market. This one
              actually works without the crash.&quot; Position your product
              against the category, not a specific competitor.
            </p>
            <p>
              <strong className="text-[#121212]">The routine reveal.</strong>{' '}
              &quot;My morning routine changed when I added this. Wake up, one
              scoop, gym by 6 AM, and I feel incredible by noon.&quot; Embed
              the product into a lifestyle story.
            </p>
            <p>
              <strong className="text-[#121212]">The specific result.</strong>{' '}
              &quot;I dropped 12 pounds in 8 weeks. No crash diet. Just this
              program and consistency.&quot; Specific numbers always outperform
              vague claims.
            </p>
          </div>
        </div>
      </section>

      {/* Cost */}
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
                    UGC Creator
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    <span className="text-purple-600">agent-media</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { scenario: '1 testimonial video', creator: '$200 - $600', am: '~$3' },
                  { scenario: '20 test creatives', creator: '$4,000 - $12,000', am: '~$60' },
                  { scenario: 'Monthly refresh (30 videos)', creator: '$6,000 - $18,000', am: '~$90' },
                  { scenario: 'Turnaround', creator: '1-2 weeks', am: 'Minutes' },
                  { scenario: 'Actor swap', creator: 'New creator, new fee', am: 'Change one flag' },
                ].map((row) => (
                  <tr
                    key={row.scenario}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-5 py-3 text-[#121212]">{row.scenario}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.creator}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-purple-700">
                      {row.am}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            A Pro Plus plan at $129/month gives you 43 videos. Enough to test
            and refresh creatives every week.{' '}
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

      {/* Why agent-media */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why <span className="text-purple-600">agent-media</span> for Fitness Brands
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Energetic voice tone',
                desc: 'The energetic delivery matches the energy fitness audiences expect. Punchy, excited, and convincing.',
              },
              {
                title: 'Before-after template',
                desc: 'Structures your script as problem then result. The highest-converting format for supplement and program ads.',
              },
              {
                title: '200 AI actors',
                desc: 'Test young and older actors, different body types, different backgrounds. Find which face drives the best CTR.',
              },
              {
                title: 'TikTok-native format',
                desc: '9:16 portrait video with animated subtitles. Ready for TikTok, Instagram Reels, and YouTube Shorts.',
              },
              {
                title: 'Batch testing from CLI',
                desc: 'Loop through actors and scripts in one bash command. Generate 20 variations in minutes, not weeks.',
              },
              {
                title: 'Product image B-roll',
                desc: 'Show your supplement bottle, equipment, or app screenshot as a cutaway scene during the testimonial.',
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
              href="/use-cases/ecommerce"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              E-commerce Videos <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/tiktok-ugc-ads"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              TikTok UGC Ads <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/agencies"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Marketing Agencies <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/makeugc-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/compare/arcads-alternative"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#121212] text-white hover:bg-[#333]"
              >
                {'>'} Start Making Fitness Videos
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
              'AI UGC Videos for Fitness Brands: Testimonial Videos at Scale',
            description:
              'Generate authentic fitness testimonial and review videos. Before-after templates, energetic delivery, 200 AI actors. $3 per video.',
            url: 'https://agent-media.ai/use-cases/fitness',
            dateModified: '2026-04-01',
          }),
        }}
      />
    </div>
  );
}
