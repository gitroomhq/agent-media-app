// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'AI UGC Videos for Real Estate: Listing Videos in Minutes | agent-media',
  description:
    'Generate listing videos from MLS photos. AI actors describe properties while your photos appear as B-roll. Perfect for busy agents. $3 per video.',
  keywords: [
    'real estate video generator',
    'AI listing video',
    'property video from photos',
    'real estate UGC',
    'MLS photo video',
    'real estate agent video',
    'agent-media real estate',
    'property marketing video',
    'listing video automation',
    'real estate content at scale',
  ],
  openGraph: {
    title: 'AI UGC Videos for Real Estate: Listing Videos in Minutes',
    description:
      'Turn MLS photos into listing videos. AI actors describe properties to camera. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/real-estate',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI UGC Videos for Real Estate | agent-media',
    description:
      'MLS photos to listing video. AI actor describes the property. $3 per video.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/real-estate',
  },
};

export default function RealEstatePage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            AI UGC Videos for Real Estate
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Every listing needs a video. Buyers scroll past static photos.
            Agents know this, but filming a walkthrough for every property takes
            hours they do not have.{' '}
            <strong className="text-[#121212]">agent-media</strong> turns your
            MLS photos into listing videos. An AI actor describes the property
            to camera while your photos appear as B-roll cutaways. Write the
            script, pass the images, get a finished video. $3 per listing.{' '}
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
            The Problem: Listings Without Video Get Ignored
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              NAR research shows that listings with video get 403% more
              inquiries than listings without. Zillow and Realtor.com both
              prioritize video listings in search results. Buyers expect to see
              the property before booking a showing.
            </p>
            <p>
              But producing a video tour for every listing is brutal. A
              professional videographer charges $300 to $1,000 per property.
              Scheduling the shoot takes a week. Editing adds another 3 to 5
              days. By the time the video is ready, the listing might already
              have offers.
            </p>
            <p>
              Agents who list 5 to 10 properties per month cannot justify
              spending $5,000 to $10,000 on video every month. So most listings
              go up with photos only. The agent loses visibility, the seller
              loses exposure, and the listing sits longer than it should.
            </p>
            <p>
              Social media makes this even more pressing. Instagram Reels and
              TikTok are becoming major channels for real estate marketing.
              Agents who post video walkthroughs get followers and leads. Agents
              who post photo slideshows get scrolled past.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Solution: MLS Photos to Listing Video
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">agent-media</strong> uses your
              existing listing photos as B-roll. You write a short property
              description (or paste from the MLS), pick an AI actor, and the
              platform generates a video where the actor speaks about the
              property while your photos display as cutaway scenes.
            </p>
            <p>
              The result looks like a real agent or reviewer talking about the
              listing. The front of the house, the kitchen, the backyard. Each
              photo appears at the right moment in the script. The actor
              delivers the description with natural pacing and expression.
            </p>
            <p>
              You can generate one listing video or batch them. If you have 8
              new listings this week, run 8 commands. Each video costs about $3
              and takes minutes to generate. Compare that to scheduling a
              videographer for each property.{' '}
              <Link
                href="/login"
                className="text-[#121212] underline hover:no-underline"
              >
                Try it on your next listing
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
            Step-by-Step: Generate a Listing Video
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Pass your property photos as B-roll images and write a short
            description. The actor presents the listing to camera.
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
                  Generate the listing video
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Write a property description and pass your MLS photos with
                  the <code className="bg-purple-50 px-1 text-purple-700">--broll-images</code> flag.
                  Each photo appears as a cutaway during the script.
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
                      &quot;This stunning 3-bed home just hit the market in
                      Riverside. Updated kitchen, huge backyard, walking
                      distance to top-rated schools.&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor marcus \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--broll \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--broll-images front.jpg,kitchen.jpg,backyard.jpg \
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
                  Customize the delivery
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Use the confident tone for luxury listings. Use calm for
                  family homes. Swap actors to match the neighborhood
                  demographic.
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
                      <span className="text-[#121212]"># Luxury listing</span>
                    </p>
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media ugc
                      &quot;...&quot; --actor victoria --tone confident --sync
                    </p>
                    <p className="mt-2 text-[#6b6b76]">
                      <span className="text-[#121212]"># Family neighborhood</span>
                    </p>
                    <p className="text-[#6b6b76]">
                      <span className="text-[#121212]">$</span> agent-media ugc
                      &quot;...&quot; --actor marcus --tone calm --sync
                    </p>
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
                  Post everywhere
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Upload the finished mp4 to Instagram Reels, TikTok, YouTube
                  Shorts, your website, or the MLS listing itself. The video is
                  ready to publish with no editing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Within Real Estate */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Real Estate Video Ideas
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Listing announcement.</strong>{' '}
              &quot;Just listed! This 3-bed beauty in Riverside has everything
              your family needs.&quot; Use the front exterior, kitchen, and
              primary bedroom as B-roll images.
            </p>
            <p>
              <strong className="text-[#121212]">Neighborhood highlight.</strong>{' '}
              &quot;Thinking about moving to Riverside? Here is what you need
              to know.&quot; Use photos of local parks, schools, and shopping
              areas. Great for building your personal brand as the local expert.
            </p>
            <p>
              <strong className="text-[#121212]">Open house promo.</strong>{' '}
              &quot;Open house this Saturday from 1 to 4. Come see this
              completely remodeled kitchen and the biggest backyard on the
              block.&quot; Post to Instagram Stories and TikTok the day before.
            </p>
            <p>
              <strong className="text-[#121212]">Price reduction alert.</strong>{' '}
              &quot;Price just dropped on this 4-bed home. The seller is
              motivated. Do not miss this one.&quot; Quick to generate, perfect
              for time-sensitive updates.
            </p>
            <p>
              <strong className="text-[#121212]">Market update.</strong>{' '}
              &quot;Rates dropped this week. Here is what that means for buyers
              in our area.&quot; No B-roll needed. Just the actor speaking to
              camera. Great for weekly content.
            </p>
          </div>
        </div>
      </section>

      {/* Cost Comparison */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Cost Comparison</h2>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Scenario
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    Videographer
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    <span className="text-purple-600">agent-media</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { scenario: '1 listing video', vid: '$300 - $1,000', am: '~$3' },
                  { scenario: '10 listings/month', vid: '$3,000 - $10,000', am: '~$30' },
                  { scenario: 'Turnaround', vid: '5-10 business days', am: 'Minutes' },
                  { scenario: 'Reschedule/reshoot', vid: '$150+ per visit', am: 'Re-run the command' },
                  { scenario: 'Social media clips', vid: 'Extra editing cost', am: 'Already 9:16 format' },
                ].map((row) => (
                  <tr
                    key={row.scenario}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-5 py-3 text-[#121212]">{row.scenario}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.vid}
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
            A Pro plan at $69/month covers about 23 listing videos. Most agents
            need fewer than 10 per month.{' '}
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
            Why <span className="text-purple-600">agent-media</span> for Real Estate
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Property photos as B-roll',
                desc: 'Upload front exterior, kitchen, backyard, bedroom. Each appears as a cutaway at the right moment in the script.',
              },
              {
                title: 'Multiple voice tones',
                desc: 'Confident for luxury, calm for family homes, energetic for new construction. Match the delivery to the listing.',
              },
              {
                title: '200 AI actors',
                desc: 'Pick an actor that matches your brand or target buyer demographic. Swap actors with a single CLI flag.',
              },
              {
                title: 'Ready for social',
                desc: 'Videos output in 9:16 portrait format by default. Upload directly to Instagram Reels, TikTok, or YouTube Shorts.',
              },
              {
                title: 'Overlay text',
                desc: 'Add a persistent text banner with the listing address, price, or your contact info. Built into the video.',
              },
              {
                title: 'Minutes, not days',
                desc: 'Generate the video the same day the listing goes live. No scheduling, no waiting for edits, no back-and-forth.',
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
              href="/use-cases/agencies"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Marketing Agencies <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/tiktok-ugc-ads"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              TikTok UGC Ads <ArrowRight className="h-4 w-4" />
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
                {'>'} Start Making Listing Videos
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
              'AI UGC Videos for Real Estate: Listing Videos in Minutes',
            description:
              'Generate listing videos from MLS photos. AI actors describe properties while your photos appear as B-roll. $3 per video.',
            url: 'https://agent-media.ai/use-cases/real-estate',
            dateModified: '2026-04-01',
          }),
        }}
      />
    </div>
  );
}
