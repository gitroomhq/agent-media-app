// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'Facebook Video Ads API: Automate UGC Ad Generation | agent-media',
  description:
    'Automate Facebook video ad creation with the agent-media API. TypeScript SDK, batch generation for A/B testing, Meta Ads API integration, and webhook support.',
  keywords: [
    'facebook video ads api',
    'facebook ugc automation',
    'meta ads video api',
    'facebook ad creative api',
    'programmatic video ads',
    'facebook ad automation sdk',
    'meta ads api video upload',
    'ugc video generation api',
    'facebook ad pipeline',
    'video ads typescript sdk',
  ],
  openGraph: {
    title: 'Automate Facebook Ad Videos with the agent-media API',
    description:
      'TypeScript SDK and REST API for generating Facebook-optimized UGC videos. Batch A/B variants, webhook delivery, Meta Ads API integration.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/facebook-ugc-ads',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Facebook Video Ads API | agent-media',
    description:
      'Programmatic UGC video generation for Facebook ad pipelines. SDK, CLI, webhooks.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/facebook-ugc-ads',
  },
};

export default function FacebookUgcAdsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Automate Facebook Ad Videos with the API
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Build Facebook ad pipelines that generate UGC videos
            programmatically. Use the{' '}
            <strong className="text-[#121212]">agent-media</strong> TypeScript
            SDK to create 1:1 and 16:9 creatives, batch A/B variants across
            actors and scripts, and push finished videos directly to Meta Ads
            Manager via their API.{' '}
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
            The Problem: Manual Video Production Doesn&apos;t Scale
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Facebook ad accounts burn through creatives fast. Audiences fatigue
              on the same video within days, so you need a constant pipeline of
              fresh variants. Most teams solve this by hiring creators or using
              browser-based tools that require manual clicks for every video.
            </p>
            <p>
              If you are building ad infrastructure, you need an API. You need to
              generate videos from code, trigger new creatives when performance
              drops, and push them into Meta Ads Manager without a human in the
              loop. Browser tools and manual workflows do not fit into a CI/CD
              pipeline or a cron job.
            </p>
            <p>
              The result: engineering teams either build fragile video pipelines
              from scratch or accept a manual bottleneck in an otherwise
              automated ad system.
            </p>
          </div>
        </div>
      </section>

      {/* SDK: Generate a Facebook Ad */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Generate a Facebook Ad with the SDK
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Install the SDK with <code className="text-[#121212]">npm i agent-media</code> and
            generate a Facebook-optimized video in a few lines.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                generate-facebook-ad.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`import AgentMedia from "agent-media";

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY,
});

// Generate a 1:1 square video for Facebook Feed
const video = await client.videos.create({
  script: "I tried every budgeting app. This one actually stuck.",
  actor: "sofia",
  aspectRatio: "1:1",   // Facebook Feed / Instagram
  subtitleStyle: "hormozi",
  duration: 10,
});

// video.url → https://media.agent-media.ai/xxx.mp4
console.log(video.url);`}
            </pre>
          </div>

          <p className="mt-4 text-sm text-[#6b6b76]">
            Use <code className="text-[#121212]">aspectRatio: &quot;16:9&quot;</code> for
            Facebook In-Stream and Reels, or{' '}
            <code className="text-[#121212]">&quot;9:16&quot;</code> for Stories.
            The API returns a hosted mp4 URL you can pass directly to Meta.
          </p>
        </div>
      </section>

      {/* Batch A/B Variants */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Batch Generation: A/B Test Actors and Scripts
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Generate multiple variants in parallel. Test different actors with
            the same script, or different scripts with the same actor.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                batch-variants.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`import AgentMedia from "agent-media";

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY,
});

const script = "I tried every budgeting app. This one actually stuck.";
const actors = ["sofia", "emma", "naomi", "marco", "priya"];

// Generate 5 A/B variants in parallel
const videos = await Promise.all(
  actors.map((actor) =>
    client.videos.create({
      script,
      actor,
      aspectRatio: "1:1",
      subtitleStyle: "hormozi",
      duration: 10,
    })
  )
);

// Each video has a unique actor, same script
for (const video of videos) {
  console.log(\`\${video.actor}: \${video.url}\`);
}`}
            </pre>
          </div>
        </div>
      </section>

      {/* Meta Ads API Integration */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Push Videos to Meta Ads Manager
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            The API returns a hosted video URL. Upload it to your Meta Ad
            Account using the Marketing API, then create ad creatives from it.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                upload-to-meta.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`import AgentMedia from "agent-media";

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY,
});

// 1. Generate the video
const video = await client.videos.create({
  script: "Stop scrolling. This changed how I save money.",
  actor: "sofia",
  aspectRatio: "1:1",
  subtitleStyle: "bold",
  duration: 10,
});

// 2. Upload to Meta via Marketing API
const adAccountId = process.env.META_AD_ACCOUNT_ID;
const metaToken = process.env.META_ACCESS_TOKEN;

const res = await fetch(
  \`https://graph.facebook.com/v21.0/\${adAccountId}/advideos\`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: metaToken,
      file_url: video.url,   // hosted mp4 from agent-media
      title: \`UGC Ad — \${video.actor}\`,
    }),
  }
);

const { id: videoId } = await res.json();
console.log("Meta video ID:", videoId);`}
            </pre>
          </div>

          <p className="mt-4 text-sm text-[#6b6b76]">
            From here, use the Meta Marketing API to create an{' '}
            <code className="text-[#121212]">adcreative</code> referencing the
            video ID and attach it to your campaign. The full pipeline runs
            without any browser interaction.
          </p>
        </div>
      </section>

      {/* CLI Example */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            CLI: Quick Ad Creation
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Use the CLI for one-off generation or shell scripts. The{' '}
            <code className="text-[#121212]">--sync</code> flag waits for the
            video to finish and prints the URL.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
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
                <span className="text-[#121212]"># Generate a 1:1 Facebook Feed ad</span>
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media ugc
                &quot;Stop scrolling. This changed how I save money.&quot; \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--actor sofia --style hormozi --aspect-ratio 1:1 --duration
                10 --sync
              </p>
              <p className="mt-4 text-[#6b6b76]">
                <span className="text-[#121212]"># Generate 5 variants in a loop</span>
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> for actor in sofia
                emma naomi marco priya; do \
              </p>
              <p className="text-[#6b6b76]">
                {'    '}agent-media ugc &quot;Stop scrolling...&quot; --actor
                $actor --style hormozi --sync; \
              </p>
              <p className="text-[#6b6b76]">{'  '}done</p>
            </div>
          </div>
        </div>
      </section>

      {/* Webhook */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Webhook: Async Processing
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            For production pipelines, use webhooks instead of polling. Set a{' '}
            <code className="text-[#121212]">webhookUrl</code> and
            agent-media will POST the completed video to your endpoint.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                webhook-example.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`// Fire-and-forget: agent-media POSTs to your endpoint when done
const video = await client.videos.create({
  script: "This app saved me $400 last month.",
  actor: "emma",
  aspectRatio: "1:1",
  subtitleStyle: "hormozi",
  duration: 10,
  webhookUrl: "https://your-api.com/hooks/video-ready",
});

// video.id is returned immediately
// Your webhook receives the full payload when rendering completes:
// {
//   "id": "vid_abc123",
//   "status": "completed",
//   "url": "https://media.agent-media.ai/xxx.mp4",
//   "actor": "emma",
//   "duration": 10,
//   "aspectRatio": "1:1"
// }`}
            </pre>
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
                  { item: '1 ad creative (10s)', cost: '~$3 (300 credits)' },
                  {
                    item: '5 A/B variants (same script)',
                    cost: '~$15 (1,500 credits)',
                  },
                  {
                    item: '10 creatives per week',
                    cost: '~$30 (3,000 credits)',
                  },
                  {
                    item: 'Creator plan ($39/mo)',
                    cost: '13 creatives per month',
                  },
                  {
                    item: 'Pro Plus plan ($129/mo)',
                    cost: '43 creatives per month',
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
            Five A/B variants for $15 via API, versus $750+ with freelance
            creators.{' '}
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

      {/* Why agent-media for Facebook */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why <span className="text-purple-600">agent-media</span> for Facebook Ad Pipelines
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'TypeScript SDK + REST API',
                desc: 'First-class TypeScript SDK with full type safety. Or hit the REST API directly from any language. No browser automation required.',
              },
              {
                title: '200+ actors, all via API',
                desc: 'Select actors by ID. Diverse demographics and styles. Generate variants programmatically without browsing a catalog.',
              },
              {
                title: 'Webhook delivery',
                desc: 'Fire-and-forget video generation. Your endpoint receives the finished video URL when rendering completes. No polling needed.',
              },
              {
                title: 'Meta Ads API compatible',
                desc: 'Returns hosted mp4 URLs that work directly with the Meta Marketing API file_url parameter. Zero download/re-upload steps.',
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
              href="/use-cases/shopify-product-videos"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Shopify Product Videos <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/saas-review-videos"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              SaaS Review Videos <ArrowRight className="h-4 w-4" />
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
                {'>'} Get API Key
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
              'Automate Facebook Ad Videos with the agent-media API',
            description:
              'TypeScript SDK and REST API for generating Facebook-optimized UGC videos. Batch A/B variants, webhook delivery, Meta Ads API integration.',
            url: 'https://agent-media.ai/use-cases/facebook-ugc-ads',
            dateModified: '2026-04-14',
          }),
        }}
      />
    </div>
  );
}
