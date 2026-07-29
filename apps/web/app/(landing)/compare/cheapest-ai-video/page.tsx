// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X, Terminal, ArrowRight, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Cheapest AI Video & Image Generation — Cost Rankings | agent-media',
  description:
    'Which AI model gives you the most for your money? Cost-per-generation rankings for all 7 agent-media models, from $0.08 per image to $1.60 per video clip.',
  keywords: [
    'cheapest AI video generator',
    'AI image generation cost',
    'affordable AI video',
    'AI video price comparison',
    'cheapest text to video',
    'AI generation credits',
    'budget AI video model',
  ],
  openGraph: {
    title: 'Cheapest AI Video & Image Generation — Cost Rankings',
    description: 'All 7 AI models ranked by cost per generation. Image from $0.08, video from $0.50.',
    type: 'article',
    url: 'https://agent-media.ai/compare/cheapest-ai-video',
  },
  alternates: {
    canonical: 'https://agent-media.ai/compare/cheapest-ai-video',
  },
};

export default function CheapestAiVideoPage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Compare
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Cheapest AI Video &amp; Image Generation — Cost Rankings
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wide text-[#6b6b76]">
            Last updated: May 2026
          </p>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Budget matters, especially when you are generating dozens or hundreds of assets
            per month. We ranked all seven AI models available through agent-media CLI by
            cost per generation so you can maximize output without blowing through your
            credits. Image models start at just $0.08 per image, and the most affordable
            video model comes in at $0.50 per 5-second clip.
          </p>
          <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">
              You don&apos;t need to choose. agent-media automatically selects the best model for every scene.
            </p>
            <p className="mt-1 text-sm text-orange-700">
              We tested these models so you don&apos;t have to. Just describe what you want — our pipeline picks the optimal model for quality, speed, and cost.
            </p>
          </div>
        </div>
      </section>

      {/* Cost Rankings Table */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Complete Cost Rankings
          </h2>
          <p className="mt-3 text-[#6b6b76]">
            Costs are based on typical generation parameters. Video costs assume a standard
            5-second clip for equal comparison. Credits are converted at the Pro plan rate
            ($69 for 6,900 credits = $0.01/credit).
          </p>
          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Rank</th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Model</th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Type</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Cost / Gen</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Credits</th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Quality</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { rank: 1, model: 'AI Image Flex', type: 'Image', cost: '~$0.08', credits: '25-50', quality: 'Good', slug: 'image-flex' },
                  { rank: 2, model: 'AI Image Pro', type: 'Image', cost: '~$0.15', credits: '50-100', quality: 'Excellent', slug: 'image-pro' },
                  { rank: 3, model: 'AI Image Creative', type: 'Image', cost: '~$0.15', credits: '50-100', quality: 'Excellent', slug: 'image-creative' },
                  { rank: 4, model: 'AI Video Pro', type: 'Video', cost: '~$0.50', credits: '200-400', quality: 'Excellent', slug: 'video-pro' },
                  { rank: 5, model: 'AI Video Fast', type: 'Video', cost: '~$0.50', credits: '200-400', quality: 'Excellent', slug: 'video-fast' },
                  { rank: 6, model: 'AI Video Realism', type: 'Video', cost: '~$0.65', credits: '250-600', quality: 'Excellent', slug: 'video-realism' },
                  { rank: 7, model: 'AI Video Cinematic', type: 'Video', cost: '~$1.60', credits: '300-500', quality: 'Premium', slug: 'video-cinematic' },
                ].map((row) => (
                  <tr key={row.slug} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3">
                      <span className={`font-mono font-bold ${row.rank <= 3 ? 'text-[#121212]' : 'text-[#6b6b76]'}`}>
                        #{row.rank}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold text-[#121212]">{row.model}</td>
                    <td className="px-5 py-3 text-[#6b6b76]">{row.type}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.cost}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.credits}</td>
                    <td className="px-5 py-3 text-[#6b6b76]">{row.quality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Plan Value Analysis */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Monthly Plan Value — What Your Credits Buy
          </h2>
          <p className="mt-3 text-[#6b6b76]">
            Here is what each plan gets you across different model types. The Pro plan at
            $69/mo offers the best per-credit value for serious creators.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Plan</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Credits</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">AI Image Flex</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">AI Video Pro</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#6b6b76]">AI Video Cinematic</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { plan: 'Creator ($39/mo)', credits: '3,900', fast: '~78-156', pro: '~10-20', cinematic: '~8-13' },
                  { plan: 'Pro ($69/mo)', credits: '6,900', fast: '~138-276', pro: '~17-35', cinematic: '~14-23' },
                  { plan: 'Pro Plus ($129/mo)', credits: '12,900', fast: '~258-516', pro: '~32-65', cinematic: '~26-43' },
                ].map((row) => (
                  <tr key={row.plan} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 text-[#121212]">{row.plan}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.credits}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.fast}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.pro}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.cinematic}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Individual Model Cards */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Cost Breakdown by Model
          </h2>
          <div className="mt-8 space-y-8">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#121212]">
                <DollarSign className="h-5 w-5 text-[#121212]" />
                AI Image Flex — Best Budget Pick (~$0.08/image)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                At just 25-50 credits per image, AI Image Flex is the most economical model by a wide
                margin. A single Pro plan month buys you 100 to 200 images. Quality is slightly
                below AI Image Pro, but for thumbnail generation, social media batches, and concept
                exploration, it delivers excellent value. This is the model to use when volume
                matters more than pixel-perfect output.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Image Pro &amp; AI Image Creative — Tied at ~$0.15/image
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                Both premium image models cost the same per generation. The choice between them
                is purely aesthetic — AI Image Pro for photorealism and text rendering, AI Image Creative
                for artistic style and complex compositions. At this price point, you can generate
                roughly 50 to 100 images per month on the Pro plan with either model.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Video Pro &amp; AI Video Fast — Best Video Value (~$0.50/clip)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                AI Video Pro and AI Video Fast are tied as the most affordable video models. Both cost 200-400
                credits per clip depending on duration, translating to roughly $0.50 for a 5-second
                video. Compare that to AI Video Realism at $0.65 or AI Video Cinematic at $1.60 — if budget is your primary
                constraint, these two give you the most video footage per dollar. AI Video Pro covers
                general-purpose content while AI Video Fast specializes in human motion.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Video Realism — Mid-Range Creative (~$0.65/clip)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                AI Video Realism sits in the middle of the video cost spectrum. It costs 30% more than AI Video Pro
                per generation but offers longer maximum durations (12 seconds vs 10 seconds) and
                a distinctive creative style. The extra cost is justified when you need its
                specific artistic interpretation or longer clip lengths that reduce the number of
                separate generations needed for a project.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Video Cinematic — Premium Cinematic (~$1.60/clip)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                AI Video Cinematic is the most expensive model at roughly 3x the cost of AI Video Pro per generation.
                The premium buys you 4K resolution, built-in audio generation, lip sync, and the
                fastest video generation speed (~90 seconds). For professional content where
                quality and turnaround time justify the cost, AI Video Cinematic offers capabilities that cheaper
                models simply cannot match. Use it for hero content; use AI Video Pro or AI Video Fast for
                supporting footage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Best Value Pick */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
            <h2 className="font-mono text-sm font-semibold text-[#121212]">Best Value Strategy</h2>
            <p className="mt-3 text-sm text-[#6b6b76]">
              <strong className="text-[#121212]">For maximum volume:</strong> Use AI Image Flex for images ($0.08)
              and AI Video Pro for video ($0.50). This combination stretches your credits the furthest while
              maintaining strong output quality.{' '}
              <strong className="text-[#121212]">For premium projects:</strong> Use AI Image Pro for polished images
              and mix AI Video Cinematic (hero shots) with AI Video Pro (supporting clips) for video. This tiered approach
              gives you cinematic quality where it matters most without spending premium-level credits on every clip.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Quick Start */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Quick Start — Try the Most Affordable Models
          </h2>
          <div className="mt-8 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <div className="space-y-3 p-5 font-mono text-sm">
              <p className="text-[#6b6b76]/60"># Cheapest image — AI Image Flex, ~$0.08</p>
              <p className="text-[#6b6b76]"><span className="text-[#121212]">$</span> agent-media ugc &quot;Vintage polaroid photo of a mountain cabin in autumn&quot; --actor sofia --sync</p>
              <p className="mt-2 text-[#6b6b76]/60"># Cheapest video — AI Video Pro, ~$0.50</p>
              <p className="text-[#6b6b76]"><span className="text-[#121212]">$</span> agent-media ugc &quot;Timelapse of storm clouds rolling over a wheat field&quot; --actor sofia -d 5 --sync</p>
              <p className="mt-2 text-[#6b6b76]/60"># Check your credit balance</p>
              <p className="text-[#6b6b76]"><span className="text-[#121212]">$</span> agent-media credits</p>
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
              <h3 className="font-semibold text-[#121212]">What is the cheapest AI video generator?</h3>
              <p className="mt-2">
                Among the models exposed through agent-media, the cheapest video
                option is around <strong>$0.50 per 5-second clip</strong>. For finished
                UGC ads (script + actor + B-roll + subtitles in one call), agent-media
                ranges roughly $0.40–$0.85 per ad depending on duration and model.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">What is the cheapest AI image generator with API access?</h3>
              <p className="mt-2">
                agent-media&apos;s entry-level image models start at <strong>$0.08 per image</strong>{' '}
                via API. Cheaper still if you batch through the CLI.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Is agent-media cheaper than Runway, HeyGen, or Creatify?</h3>
              <p className="mt-2">
                For programmatic UGC video, yes. agent-media&apos;s starter plan is{' '}
                <strong>$39/month</strong> with API + CLI access included. Comparable
                tiers on Runway, HeyGen Team, and Creatify Pro range from $63–$89/month
                for equivalent API access. Per-clip costs are also lower at agent-media&apos;s
                pay-as-you-go credit rate.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Do agent-media credits expire?</h3>
              <p className="mt-2">
                No. Pay-as-you-go credits never expire. Subscription credits roll over
                month-to-month for active subscribers. This is unusual in the AI video
                space — most competitors expire credits monthly.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">Which AI video model gives the best quality per dollar?</h3>
              <p className="mt-2">
                For 9:16 UGC ad output specifically, Seedance 2.0 image-to-video at
                approximately <strong>$0.50 per 5-second clip</strong> is the strongest
                quality-per-dollar pick. For cinematic motion, Kling V3 is higher
                fidelity at higher cost. The full ranking is in the table above.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#121212]">How can I minimize AI generation cost?</h3>
              <p className="mt-2">
                Three tactics: (1) generate at the cheapest tier first and only
                upscale the winners; (2) use 5-second clips and stitch where possible
                rather than long single takes; (3) batch through the CLI to amortize
                pipeline overhead. agent-media&apos;s per-second credit model rewards
                this workflow.
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
            <Link href="/compare/fastest-ai-video" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Fastest AI Models <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/arcads-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Arcads Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/creatify-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Creatify Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/best" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Best UGC Tools by Use Case <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-[#121212] text-white hover:bg-[#333]">{'>'} Get Started</Button>
            </Link>
            <Link href="/compare/fastest-ai-video" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              See Speed Rankings <ArrowRight className="h-4 w-4" />
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
                headline: 'Cheapest AI Video & Image Generation — Cost Rankings',
                description:
                  'Cost rankings for the 7 AI models exposed through agent-media CLI. Image models from $0.08; video clips from $0.50.',
                url: 'https://agent-media.ai/compare/cheapest-ai-video',
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
                    name: 'What is the cheapest AI video generator?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Among models exposed through agent-media, the cheapest video option is around $0.50 per 5-second clip. For finished UGC ads (script + actor + B-roll + subtitles), agent-media ranges roughly $0.40–$0.85 per ad.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What is the cheapest AI image generator with API access?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'agent-media entry-level image models start at $0.08 per image via API.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Is agent-media cheaper than Runway, HeyGen, or Creatify?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'For programmatic UGC video, yes. agent-media starter plan is $39/month with API + CLI access included. Comparable tiers on Runway, HeyGen Team, and Creatify Pro range from $63–$89/month.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Do agent-media credits expire?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'No. Pay-as-you-go credits never expire. Subscription credits roll over month-to-month for active subscribers.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Which AI video model gives the best quality per dollar?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'For 9:16 UGC ad output, Seedance 2.0 image-to-video at approximately $0.50 per 5-second clip is the strongest quality-per-dollar pick. For cinematic motion, Kling V3 is higher fidelity at higher cost.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How can I minimize AI generation cost?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Generate at the cheapest tier first and upscale winners; use 5-second clips and stitch rather than long single takes; batch through the CLI to amortize pipeline overhead.',
                    },
                  },
                ],
              },
              {
                '@type': 'SoftwareApplication',
                name: 'agent-media CLI',
                applicationCategory: 'MultimediaApplication',
                applicationSubCategory: 'AI Video and Image Generator',
                operatingSystem: 'macOS, Linux, Windows',
                offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
                description:
                  'CLI tool offering 7 AI models for UGC, video, and image generation, ranked by cost from $0.08 per image to $1.60 per video clip.',
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
