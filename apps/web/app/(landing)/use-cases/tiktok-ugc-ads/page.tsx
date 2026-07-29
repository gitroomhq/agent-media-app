// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'Build a TikTok Ad Pipeline with the agent-media API | agent-media',
  description:
    'Automate TikTok UGC ad generation with the agent-media API and TypeScript SDK. 9:16 vertical video, batch generation, webhooks. $3 per video.',
  keywords: [
    'tiktok ugc api',
    'tiktok video automation',
    'tiktok ad api',
    'tiktok video generation api',
    'ugc video api',
    'programmatic tiktok ads',
    'tiktok creative automation',
    'ai video api',
    'tiktok ad pipeline',
    'vertical video api',
  ],
  openGraph: {
    title: 'Build a TikTok Ad Pipeline with the agent-media API',
    description:
      'Automate TikTok UGC ad generation with the TypeScript SDK. Batch generate, webhook callbacks, 200 AI actors. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/tiktok-ugc-ads',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TikTok Ad Pipeline API — agent-media',
    description:
      'TypeScript SDK + REST API for TikTok UGC video generation. Batch create, webhook delivery, 200 actors.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/tiktok-ugc-ads',
  },
};

export default function TikTokUgcAdsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Build a TikTok Ad Pipeline with the agent-media API
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            TikTok ad accounts burn through creatives fast. Instead of hiring
            creators or building a video pipeline from scratch, call the{' '}
            <strong className="text-[#121212]">agent-media</strong> API.
            Generate 9:16 UGC videos with lip-synced AI actors, TikTok-style
            subtitles, and energetic delivery. Batch generate variants, get
            webhook callbacks when videos are ready, and push directly to your
            ad platform.{' '}
            <Link
              href="/pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              $3 per video
            </Link>
            .
          </p>
        </div>
      </section>

      {/* SDK Quick Start */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Generate a TikTok Ad in 10 Lines
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Install the TypeScript SDK and create a TikTok-optimized UGC
              video. The SDK handles voiceover generation, lip-sync, subtitle
              rendering, and final assembly. You get back a download URL.
            </p>
          </div>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                generate-tiktok-ad.ts
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">import</span> {'{ AgentMedia }'}{' '}
                <span className="text-[#121212]">from</span>{' '}
                &quot;agent-media-sdk&quot;;
              </p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> client ={' '}
                <span className="text-[#121212]">new</span>{' '}
                AgentMedia(process.env.AGENT_MEDIA_API_KEY);
              </p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> video ={' '}
                <span className="text-[#121212]">await</span> client.videos.create({'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'  '}script: &quot;Stop scrolling. This app saved me two hours
                every morning.&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}actor: &quot;sofia&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}aspect_ratio: &quot;9:16&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}subtitle_style: &quot;tiktok&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}voice_tone: &quot;energetic&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}duration: 10,
              </p>
              <p className="text-[#6b6b76]">{'}'});</p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                console.log(video.download_url);{' '}
                <span className="text-[#6b6b76]/50">
                  {'// → https://cdn.agent-media.ai/v/abc123.mp4'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Batch Generation */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Batch Generate 10 Variants with Different Actors
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              TikTok ad testing requires volume. Same script, different faces.
              Use <code className="text-[#121212]">Promise.all</code> to
              generate multiple variants in parallel. Each variant uses a
              different AI actor from the 200+ available.
            </p>
          </div>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                batch-tiktok-variants.ts
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> actors = [
                &quot;sofia&quot;, &quot;emma&quot;, &quot;naomi&quot;,
                &quot;marco&quot;, &quot;liam&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}&quot;priya&quot;, &quot;aisha&quot;, &quot;carlos&quot;,
                &quot;mei&quot;, &quot;jordan&quot;];
              </p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> script =
                &quot;Stop scrolling. This app saved me two hours every
                morning.&quot;;
              </p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> videos ={' '}
                <span className="text-[#121212]">await</span> Promise.all(
              </p>
              <p className="text-[#6b6b76]">
                {'  '}actors.map((actor) =&gt;
              </p>
              <p className="text-[#6b6b76]">
                {'    '}client.videos.create({'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'      '}script,
              </p>
              <p className="text-[#6b6b76]">
                {'      '}actor,
              </p>
              <p className="text-[#6b6b76]">
                {'      '}aspect_ratio: &quot;9:16&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'      '}subtitle_style: &quot;tiktok&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'      '}voice_tone: &quot;energetic&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'      '}duration: 10,
              </p>
              <p className="text-[#6b6b76]">{'    '}{'}'})
              </p>
              <p className="text-[#6b6b76]">{'  '})
              </p>
              <p className="text-[#6b6b76]">);</p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#6b6b76]/50">
                  {'// 10 TikTok-ready videos, each with a different actor'}
                </span>
              </p>
              <p className="text-[#6b6b76]">
                videos.forEach((v) =&gt; console.log(v.actor, v.download_url));
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Webhook Integration */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Async Pipeline with Webhooks
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              For production pipelines, use webhook callbacks instead of
              polling. Submit video jobs with a{' '}
              <code className="text-[#121212]">webhook_url</code>, and
              agent-media will POST the result when the video is ready. This
              lets you decouple generation from downstream processing like
              uploading to TikTok Ads Manager.
            </p>
          </div>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                webhook-pipeline.ts
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]">
                <span className="text-[#6b6b76]/50">
                  {'// 1. Submit job with webhook callback'}
                </span>
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> job ={' '}
                <span className="text-[#121212]">await</span> client.videos.create({'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'  '}script: &quot;This changed everything for me.&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}actor: &quot;sofia&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}aspect_ratio: &quot;9:16&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}subtitle_style: &quot;tiktok&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}voice_tone: &quot;energetic&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}webhook_url: &quot;https://your-app.com/api/video-ready&quot;,
              </p>
              <p className="text-[#6b6b76]">{'}'});</p>
              <p className="mt-1 text-[#6b6b76]">&nbsp;</p>
              <p className="text-[#6b6b76]">
                <span className="text-[#6b6b76]/50">
                  {'// 2. Your webhook receives the completed video'}
                </span>
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">export async function</span>{' '}
                POST(req: Request) {'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'  '}<span className="text-[#121212]">const</span> {'{ video_id, download_url, status }'} ={' '}
                <span className="text-[#121212]">await</span> req.json();
              </p>
              <p className="text-[#6b6b76]">
                {'  '}<span className="text-[#6b6b76]/50">
                  {'// Upload to TikTok Ads Manager, notify Slack, etc.'}
                </span>
              </p>
              <p className="text-[#6b6b76]">{'}'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CLI Workflow */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            CLI for Quick Iteration
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Use the CLI for ad-hoc generation and testing before wiring up
            the API. Same capabilities, faster feedback loop.
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
                  Install the <strong className="text-[#121212]">agent-media</strong> CLI
                  globally and log in with your API key.
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
                  Generate a TikTok ad
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Pass your script, pick an actor, and set TikTok-native
                  defaults. The <code className="text-[#121212]">--sync</code>{' '}
                  flag waits for the video to finish and returns the download URL.
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
                      &quot;Stop scrolling. This product saved me two hours every
                      morning.&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--actor sofia \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--style tiktok \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--duration 10 \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}--tone energetic \
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
                  Batch generate with a loop
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Same script, different actors. Use a shell loop to generate
                  multiple variants for A/B testing.
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
                      sofia emma naomi marco liam; do
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}agent-media ugc &quot;Stop scrolling...&quot; \
                    </p>
                    <p className="text-[#6b6b76]">
                      {'      '}--actor $actor --style tiktok --tone energetic
                      --sync
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}done
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cost Breakdown */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Cost per Video</h2>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Plan
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    Cost / Video
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { item: 'Pay-as-you-go (300 credits)', cost: '~$3' },
                  {
                    item: 'Creator ($39/mo — 4,000 credits)',
                    cost: '~$3 × 13 videos',
                  },
                  { item: 'Pro ($69/mo — 7,000 credits)', cost: '~$3 × 23 videos' },
                  {
                    item: 'Pro Plus ($129/mo — 13,000 credits)',
                    cost: '~$3 × 43 videos',
                  },
                  {
                    item: 'Credit pack ($39 one-time)',
                    cost: '13 videos, never expires',
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
            At $3 per video, generating 10 TikTok ad variants costs $30.
            Hiring UGC creators for the same batch: $1,500 to $5,000 plus
            revision rounds.{' '}
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

      {/* Why Developers Choose agent-media */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why Developers Build on{' '}
            <span className="text-purple-600">agent-media</span>
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'TypeScript SDK + REST API',
                desc: 'First-class TypeScript SDK with full type definitions. Or call the REST API directly from any language. No browser or GUI needed.',
              },
              {
                title: 'Webhook callbacks',
                desc: 'Submit jobs asynchronously and receive a POST when the video is ready. No polling. Plug into your existing event pipeline.',
              },
              {
                title: '200 AI actors',
                desc: 'Diverse faces, ages, and styles available via the actors endpoint. Programmatically select actors based on campaign targeting.',
              },
              {
                title: 'TikTok-native defaults',
                desc: '9:16 aspect ratio, TikTok subtitle style, energetic voice tone. One config object produces platform-optimized output.',
              },
              {
                title: 'Word count validation',
                desc: 'The API rejects scripts that exceed the word limit for the chosen duration. No silent failures or rushed speech.',
              },
              {
                title: 'Idempotent & deterministic',
                desc: 'Same inputs produce consistent results. Safe to retry on failure. Built for CI/CD and automated pipelines.',
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
          <h2 className="text-2xl font-bold text-[#121212]">
            Resources
          </h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              API Documentation <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs/sdk"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              TypeScript SDK <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Pricing <ArrowRight className="h-4 w-4" />
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
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#121212] text-white hover:bg-[#333]"
              >
                {'>'} Get API Key
              </Button>
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Read the Docs <ArrowRight className="h-4 w-4" />
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
              'Build a TikTok Ad Pipeline with the agent-media API',
            description:
              'Automate TikTok UGC ad generation with the agent-media API and TypeScript SDK. Batch generation, webhooks, 200 AI actors. $3 per video.',
            url: 'https://agent-media.ai/use-cases/tiktok-ugc-ads',
            dateModified: '2026-04-14',
          }),
        }}
      />
    </div>
  );
}
