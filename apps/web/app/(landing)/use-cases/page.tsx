// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCaseData, allUseCaseSlugs } from './use-case-data';

export const metadata: Metadata = {
  title: 'Use Cases — AI UGC & Video Generation from the Terminal | agent-media CLI',
  description:
    'Explore use cases for agent-media CLI: UGC pipeline with talking heads and subtitles, TikTok & Reels content, product demos, cinematic B-roll, marketing graphics, YouTube Shorts pipelines, and API integrations.',
  keywords: [
    'AI video use cases',
    'AI image use cases',
    'TikTok video generator',
    'product demo video AI',
    'AI B-roll',
    'marketing graphics AI',
    'YouTube Shorts automation',
    'TikTok UGC ads',
    'Facebook ad creative',
    'Shopify product video',
    'SaaS review video',
    'agent-media CLI',
  ],
  openGraph: {
    title: 'Use Cases — agent-media CLI',
    description:
      '10 ways to use AI UGC and video generation from your terminal. From TikTok ads to Shopify product videos.',
    type: 'website',
    url: 'https://agent-media.ai/use-cases',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases',
  },
};

const cardDescriptions: Record<string, string> = {
  'tiktok-reels-content':
    'Generate 9:16 vertical videos optimized for TikTok, Instagram Reels, and YouTube Shorts.',
  'product-demo-videos':
    'Create animated product showcases and walkthrough videos from text or product photos.',
  'talking-head-ugc':
    'Full UGC pipeline: script → talking heads, B-roll, voiceover, and optional animated captions in one command.',
  'cinematic-b-roll':
    'Generate sweeping drone shots, time-lapses, and atmospheric footage for video projects.',
  'marketing-graphics':
    'Create social media graphics, ad creatives, and marketing images with accurate text.',
  'youtube-shorts-pipeline':
    'Build automated pipelines for batch-generating YouTube Shorts on a schedule.',
};

const standaloneUseCases = [
  {
    slug: 'tiktok-ugc-ads',
    title: 'TikTok UGC Ads',
    description:
      'Generate authentic 9:16 TikTok ad creatives with 200 AI actors, lip-sync, and tiktok-style subtitles. $3 per video.',
    tags: ['UGC Pipeline', 'TikTok'],
  },
  {
    slug: 'facebook-ugc-ads',
    title: 'Facebook UGC Ads',
    description:
      'A/B test Facebook ad creatives by swapping actors, tones, and subtitle styles. Same script, five variations for $15.',
    tags: ['UGC Pipeline', 'Facebook'],
  },
  {
    slug: 'shopify-product-videos',
    title: 'Shopify Product Videos',
    description:
      'Talking-head product videos for every SKU. Product image as B-roll, AI script generation, batch via CLI. 100 videos for $300.',
    tags: ['UGC Pipeline', 'E-commerce'],
  },
  {
    slug: 'saas-review-videos',
    title: 'SaaS Review Videos',
    description:
      'Generate social proof testimonial videos with dashboard screenshots as B-roll. Dedicated review command. $3-5 per video.',
    tags: ['UGC Pipeline', 'SaaS'],
  },
];

export default function UseCasesPage() {
  const useCases = allUseCaseSlugs.map((slug) => useCaseData[slug]);

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            {'>'} Use Cases
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            What can you build with agent-media?
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            From viral TikTok content to automated video pipelines, agent-media
            CLI gives developers and creators a single tool for every AI media
            generation workflow. Explore the use cases below to find the right
            models and commands for your project.
          </p>
        </div>
      </section>

      {/* ── Use Case Grid ─────────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((uc) => (
              <Link
                key={uc.slug}
                href={`/use-cases/${uc.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[#d4d4d4] bg-white transition-all hover:shadow-md"
              >
                {uc.videoUrl && (
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    <video
                      src={uc.videoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="none"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="text-lg font-semibold text-[#121212] group-hover:text-[#6b6b76]">
                    {uc.title}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#6b6b76]">
                    {cardDescriptions[uc.slug]}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {uc.recommendedModels.map((m) => (
                      <span
                        key={m.slug}
                        className="rounded bg-[#121212]/10 px-2 py-0.5 font-mono text-xs text-[#121212]"
                      >
                        {m.model}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm text-[#121212] opacity-0 transition-opacity group-hover:opacity-100">
                    View use case <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Standalone Use Cases ────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Platform-Specific Guides
          </h2>
          <p className="mt-3 text-[#6b6b76]">
            Step-by-step workflows for specific platforms and use cases.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {standaloneUseCases.map((uc) => (
              <Link
                key={uc.slug}
                href={`/use-cases/${uc.slug}`}
                className="group flex flex-col rounded-2xl border border-[#d4d4d4] bg-white p-6 transition-all hover:shadow-md"
              >
                <h3 className="text-lg font-semibold text-[#121212] group-hover:text-[#6b6b76]">
                  {uc.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#6b6b76]">
                  {uc.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {uc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-[#121212]/10 px-2 py-0.5 font-mono text-xs text-[#121212]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-1 text-sm text-[#121212] opacity-0 transition-opacity group-hover:opacity-100">
                  Read guide <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-20">
        <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-[#121212]">
            Ready to start generating?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[#6b6b76]">
            Install agent-media CLI and run your first generation in under 60
            seconds. Seven AI models, one command, no provider accounts.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/login">
              <Button size="lg">{'>'} Get Started</Button>
            </Link>
            <Link href="/docs">
              <Button variant="secondary" size="lg">
                View Docs
              </Button>
            </Link>
          </div>
          <p className="mt-6 font-mono text-xs text-[#6b6b76]">
            npm install -g agent-media-cli
          </p>
        </div>
      </section>
    </div>
  );
}
