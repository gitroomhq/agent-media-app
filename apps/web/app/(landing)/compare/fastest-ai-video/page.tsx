// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X, Terminal, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Fastest AI Video & Image Generators — Speed Rankings | agent-media',
  description:
    'Which AI model generates the fastest? Speed benchmarks for all 7 models available through agent-media CLI, ranked from 5 seconds to 3 minutes.',
  keywords: [
    'fastest AI video generator',
    'AI image generation speed',
    'fastest AI model',
    'AI video benchmark',
    'AI video speed',
    'AI image speed',
    'AI generation time comparison',
  ],
  openGraph: {
    title: 'Fastest AI Video & Image Generators — Speed Rankings',
    description: 'All 7 AI models ranked by generation speed. From 5 seconds to 3 minutes.',
    type: 'article',
    url: 'https://agent-media.ai/compare/fastest-ai-video',
  },
  alternates: {
    canonical: 'https://agent-media.ai/compare/fastest-ai-video',
  },
};

export default function FastestAiVideoPage() {
  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Compare
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Fastest AI Video &amp; Image Generators — Speed Rankings
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            When you are iterating on creative ideas or building an automated pipeline,
            generation speed directly impacts your workflow. We benchmarked all seven AI
            models available through agent-media CLI and ranked them from fastest to slowest.
            Image models dominate the top spots, but among video generators, the spread is
            significant — from 90 seconds to over 3 minutes per clip.
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

      {/* Speed Rankings Table */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Complete Speed Rankings
          </h2>
          <p className="mt-3 text-[#6b6b76]">
            Times represent typical generation on standard prompts. Actual speed varies by
            prompt complexity, server load, and output duration.
          </p>
          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Rank</th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Model</th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Type</th>
                  <th className="px-5 py-4 text-center font-mono font-semibold text-[#121212]">Speed</th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Provider</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { rank: 1, model: 'AI Image Flex', type: 'Image', speed: '~5 seconds', provider: 'agent-media', slug: 'image-flex' },
                  { rank: 2, model: 'AI Image Pro', type: 'Image', speed: '~10 seconds', provider: 'agent-media', slug: 'image-pro' },
                  { rank: 3, model: 'AI Image Creative', type: 'Image', speed: '~15 seconds', provider: 'agent-media', slug: 'image-creative' },
                  { rank: 4, model: 'AI Video Cinematic', type: 'Video', speed: '~90 seconds (8s)', provider: 'agent-media', slug: 'video-cinematic' },
                  { rank: 5, model: 'AI Video Pro', type: 'Video', speed: '~2 min (5s)', provider: 'agent-media', slug: 'video-pro' },
                  { rank: 6, model: 'AI Video Fast', type: 'Video', speed: '~2 min (5s)', provider: 'agent-media', slug: 'video-fast' },
                  { rank: 7, model: 'AI Video Realism', type: 'Video', speed: '~3 min (8s)', provider: 'agent-media', slug: 'video-realism' },
                ].map((row) => (
                  <tr key={row.slug} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3">
                      <span className={`font-mono font-bold ${row.rank <= 3 ? 'text-[#121212]' : 'text-[#6b6b76]'}`}>
                        #{row.rank}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold text-[#121212]">{row.model}</td>
                    <td className="px-5 py-3 text-[#6b6b76]">{row.type}</td>
                    <td className="px-5 py-3 text-center font-mono text-[#6b6b76]">{row.speed}</td>
                    <td className="px-5 py-3 text-[#6b6b76]">{row.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Image Model Breakdown */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Image Models — Sub-15-Second Generation
          </h2>
          <div className="mt-8 space-y-8">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#121212]">
                <Zap className="h-5 w-5 text-[#121212]" />
                AI Image Flex — The Speed Champion (~5 seconds)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                AI Image Flex is the fastest model in the entire lineup. At roughly five seconds per
                image, it generates results faster than most people can evaluate the previous one.
                Quality is slightly below AI Image Pro, but for concept exploration, batch thumbnails,
                and rapid prototyping, the tradeoff is well worth it. At just 25-50 credits per image,
                it is also the cheapest model available.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Image Pro — Production Quality at 10 Seconds
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                Double the generation time of Flex, but with noticeably sharper output, better text
                rendering, and more reliable photorealism. If you are producing final assets rather
                than drafts, the extra five seconds per image is a minor penalty for significantly
                improved quality. AI Image Pro remains faster than every video model in the lineup.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Image Creative — Artistic Quality at 15 Seconds
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                The slowest image model at 15 seconds, but still well within real-time iteration
                territory. AI Image Creative trades speed for a more distinctive artistic style with
                richer color palettes and more complex scene compositions. The 5-second gap between
                Creative and Pro is negligible for single images but adds up in batch workflows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Video Model Breakdown */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Video Models — 90 Seconds to 3 Minutes
          </h2>
          <div className="mt-8 space-y-8">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#121212]">
                <Zap className="h-5 w-5 text-[#121212]" />
                AI Video Cinematic — Fastest Video Model (~90 seconds for 8s)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                AI Video Cinematic delivers an 8-second video clip in about 90 seconds, nearly
                twice as fast as AI Video Pro or AI Video Fast for the same output duration. It also
                produces the highest resolution (4K) and includes synchronized audio generation. The
                tradeoff is cost — Cinematic is the most expensive video model at ~$1.60 per clip.
                For professional workflows where time equals money, the speed advantage often
                justifies the premium.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Video Pro &amp; AI Video Fast — Tied at ~2 Minutes
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                Both models generate a 5-second clip in approximately two minutes. AI Video Pro and
                AI Video Fast share similar infrastructure speed but target different content types —
                Pro for general-purpose photorealism and Fast for human body motion. If speed is your
                only criterion, these two are interchangeable; choose based on output quality for your
                specific subject matter.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#121212]">
                AI Video Realism — Slowest but Longest Duration (~3 minutes for 8s)
              </h3>
              <p className="mt-2 text-sm text-[#6b6b76]">
                AI Video Realism is the slowest video model, taking about three minutes for an
                8-second clip. However, it compensates with the longest maximum duration (12 seconds)
                and a unique creative interpretation style. The extra processing time reflects
                Realism&apos;s more complex generation pipeline, which contributes to its distinctive
                artistic output. For batch workflows, factor in the roughly 2x time penalty versus
                Cinematic.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Best Value Pick */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-6">
            <h2 className="font-mono text-sm font-semibold text-[#121212]">Best Value for Speed</h2>
            <p className="mt-3 text-sm text-[#6b6b76]">
              <strong className="text-[#121212]">For images:</strong> AI Image Flex at ~5 seconds and ~$0.08 per image
              is unbeatable for speed-to-cost ratio. Use AI Image Pro when you need higher quality without
              sacrificing much speed.{' '}
              <strong className="text-[#121212]">For video:</strong> AI Video Cinematic at ~90 seconds is the fastest,
              but costs 3x more than Pro or Fast. If you can tolerate two-minute waits, AI Video Pro
              offers the best balance of speed, quality, and cost for general video work.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Quick Start */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Quick Start — Try the Fastest Models
          </h2>
          <div className="mt-8 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <div className="space-y-3 p-5 font-mono text-sm">
              <p className="text-[#6b6b76]/60"># Fastest image — AI Image Flex, ~5s</p>
              <p className="text-[#6b6b76]"><span className="text-[#121212]">$</span> agent-media ugc &quot;Neon-lit Tokyo street at night, rain reflections&quot; --actor sofia --sync</p>
              <p className="mt-2 text-[#6b6b76]/60"># Fastest video — AI Video Cinematic, ~90s</p>
              <p className="text-[#6b6b76]"><span className="text-[#121212]">$</span> agent-media ugc &quot;Drone shot over a coral reef, tropical fish, crystal water&quot; --actor sofia -d 8 --sync</p>
              <p className="mt-2 text-[#6b6b76]/60"># Best speed/cost video — AI Video Pro, ~2 min</p>
              <p className="text-[#6b6b76]"><span className="text-[#121212]">$</span> agent-media ugc &quot;A cat knocking objects off a desk in slow motion&quot; --actor sofia -d 5 --sync</p>
            </div>
          </div>
        </div>
      </section>

      {/* Related Comparisons & CTA */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Related Comparisons</h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/compare/cheapest-ai-video" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Cheapest AI Models <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/makeugc-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              MakeUGC Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/compare/heygen-alternative" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              HeyGen Alternative <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/best" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              Best UGC Tools by Use Case <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-[#121212] text-white hover:bg-[#333]">{'>'} Get Started</Button>
            </Link>
            <Link href="/compare/cheapest-ai-video" className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline">
              See Cheapest AI Models <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'agent-media CLI',
            applicationCategory: 'MultimediaApplication',
            operatingSystem: 'macOS, Linux, Windows',
            description:
              'CLI tool offering 7 AI models for UGC, video, and image generation, ranked by speed from 5 seconds to 3 minutes.',
            url: 'https://agent-media.ai/compare/fastest-ai-video',
          }),
        }}
      />
    </div>
  );
}
