// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal, Code, Webhook, Layers, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'Automate UGC Video Ads with the agent-media API | agent-media',
  description:
    'Learn how to automate UGC video creation at scale using the agent-media API. TypeScript and Python SDK examples, webhook integration, CLI usage, and batch generation for growth teams.',
  keywords: [
    'automate ugc video creation',
    'ugc video automation',
    'programmatic ugc video',
    'ai ugc api automation',
    'ugc video api',
    'ai video generation api',
    'batch ugc video generation',
    'agent-media api',
    'agent-media sdk',
    'ugc video ads at scale',
  ],
  openGraph: {
    title: 'Automate UGC Video Ads with the agent-media API',
    description:
      'Generate 50-100 UGC video variants per campaign programmatically. TypeScript SDK, Python SDK, CLI, and webhook examples.',
    type: 'article',
    url: 'https://agent-media.ai/blog/automate-ugc-video-ads-api',
    publishedTime: '2026-04-14T00:00:00Z',
  },
  alternates: {
    canonical: 'https://agent-media.ai/blog/automate-ugc-video-ads-api',
  },
};

/* -- JSON-LD ------------------------------------------------------------ */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Automate UGC Video Ads with the agent-media API',
  description:
    'A step-by-step tutorial for automating UGC video ad creation using the agent-media API, TypeScript SDK, Python SDK, and CLI.',
  datePublished: '2026-04-14T00:00:00Z',
  author: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  publisher: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
};

/* -- Page --------------------------------------------------------------- */

export default function AutomateUgcVideoAdsApiPage() {
  return (
    <article className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* -- Hero -------------------------------------------------------- */}
      <header className="rounded-lg bg-[#ededed] p-8 sm:p-12">
        <div className="flex items-center gap-3 text-sm text-[#6b6b76]">
          <Link href="/blog" className="hover:text-[#121212]">
            Blog
          </Link>
          <span>/</span>
          <time dateTime="2026-04-14">April 14, 2026</time>
          <span className="ml-auto">~7 min read</span>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          Automate UGC Video Ads with the agent-media API
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          Manually creating UGC video ads does not scale. Growth teams and
          agencies need 50 to 100 creative variants per campaign — different
          actors, scripts, hooks, and CTAs — and producing each one by hand is
          a bottleneck. The agent-media API lets you generate UGC videos
          programmatically so you can ship creative at the speed of your ad
          spend.
        </p>
      </header>

      {/* -- The problem ------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          The problem: manual UGC does not scale
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          A typical paid social workflow looks like this: write a script, hire a
          creator, wait for delivery, request revisions, export variants. For a
          single video that takes days. For a campaign with 50 variants across
          different actors and hooks, it takes weeks and thousands of dollars.
        </p>
        <div className="mt-6 space-y-3">
          {[
            {
              icon: Layers,
              label: 'Volume',
              desc: 'Meta and TikTok reward creative volume. Winning campaigns test 20-50 ad variants per week.',
            },
            {
              icon: Zap,
              label: 'Speed',
              desc: 'By the time you get a revision back from a creator, the trend has moved on.',
            },
            {
              icon: Code,
              label: 'Integration',
              desc: 'Growth teams want to trigger video generation from their existing pipelines — not click through a web UI.',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-4 rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#121212]" />
              <div>
                <p className="font-semibold text-[#121212]">{item.label}</p>
                <p className="mt-1 text-sm text-[#6b6b76]">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -- The solution ------------------------------------------------ */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          The solution: generate UGC videos programmatically
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The agent-media API exposes the full UGC pipeline — script splitting,
          a realistic AI actor, natural speech delivery, scene direction, and styled subtitles — as a
          single API call. You send a script and an actor, and you get back a
          finished MP4. No editor, no uploads, no waiting for human creators.
        </p>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Everything below works with the TypeScript SDK, the Python SDK, or
          raw HTTP calls. Pick whichever fits your stack.
        </p>
      </section>

      {/* -- Step 1: Get your API key ----------------------------------- */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#121212] text-sm font-bold text-white">
            1
          </span>
          <h2 className="text-2xl font-bold text-[#121212]">
            Get your API key
          </h2>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Sign up at{' '}
          <Link href="/login" className="font-semibold text-[#121212] underline">
            agent-media.ai
          </Link>
          , go to your dashboard, and copy your API key. It starts with{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            ma_
          </code>
          . Set it as an environment variable so your code can pick it up:
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">.env</span>
          </div>
          <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`AGENT_MEDIA_API_KEY=ma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
          </pre>
        </div>
      </section>

      {/* -- Step 2: Install the SDK ------------------------------------ */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#121212] text-sm font-bold text-white">
            2
          </span>
          <h2 className="text-2xl font-bold text-[#121212]">
            Install the SDK
          </h2>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Install the official SDK for your language. Both packages wrap the
          REST API with typed helpers and automatic retries.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-[#d4d4d4]">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-2 font-mono text-xs text-[#6b6b76]">TypeScript</span>
            </div>
            <pre className="bg-[#0d0d0d] p-5 font-mono text-sm text-[#e0e0e0]">
{`npm install @agentmedia/sdk`}
            </pre>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#d4d4d4]">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-2 font-mono text-xs text-[#6b6b76]">Python</span>
            </div>
            <pre className="bg-[#0d0d0d] p-5 font-mono text-sm text-[#e0e0e0]">
{`pip install agent-media`}
            </pre>
          </div>
        </div>
      </section>

      {/* -- Step 3: Generate your first video -------------------------- */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#121212] text-sm font-bold text-white">
            3
          </span>
          <h2 className="text-2xl font-bold text-[#121212]">
            Generate your first video
          </h2>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          A single{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            createVideo()
          </code>{' '}
          call sends your script to the UGC pipeline and returns a video URL
          when it finishes. The{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            waitForCompletion
          </code>{' '}
          option polls until the video is ready.
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">generate-video.ts</span>
          </div>
          <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`import { AgentMedia } from "@agentmedia/sdk";

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY,
});

const video = await client.createVideo({
  script:
    "I tried this protein powder for 30 days and the results " +
    "were insane. It mixes clean, no chalky taste, and I actually " +
    "look forward to drinking it. Link in bio.",
  actor: "sofia",
  subtitleStyle: "hormozi",
  waitForCompletion: true,
});

console.log(video.url);
// https://media.agent-media.ai/videos/abc123.mp4`}
          </pre>
        </div>
        <p className="mt-4 text-sm text-[#6b6b76]">
          That is it. One function call, one finished video. The response
          includes the video URL, duration, credit cost, and metadata.
        </p>
      </section>

      {/* -- Step 4: Batch generate variants ---------------------------- */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#121212] text-sm font-bold text-white">
            4
          </span>
          <h2 className="text-2xl font-bold text-[#121212]">
            Batch generate variants
          </h2>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The real power of API-driven UGC is batch generation. Loop over a
          matrix of actors and scripts to produce dozens of variants in
          parallel. Each combination becomes a unique ad creative you can
          A/B test.
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">batch-generate.ts</span>
          </div>
          <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`import { AgentMedia } from "@agentmedia/sdk";

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY,
});

const actors = ["sofia", "marcus", "aisha", "james", "luna"];

const scripts = [
  "This changed my morning routine. I wake up, one scoop, done.",
  "I was skeptical but after two weeks the results speak for " +
    "themselves. Just try it.",
  "My trainer recommended this and honestly it is the best " +
    "supplement I have ever used. Link in bio.",
];

const jobs = actors.flatMap((actor) =>
  scripts.map((script) =>
    client.createVideo({
      script,
      actor,
      subtitleStyle: "hormozi",
    })
  )
);

// 15 variants generated in parallel
const videos = await Promise.all(jobs);

for (const video of videos) {
  console.log(\`[\${video.actor}] \${video.url}\`);
}`}
          </pre>
        </div>
        <p className="mt-4 text-sm text-[#6b6b76]">
          5 actors multiplied by 3 scripts equals 15 unique ad creatives — generated
          with a single script run. Scale the matrix to 10 actors and 10 scripts
          for 100 variants.
        </p>
      </section>

      {/* -- Step 5: Webhooks ------------------------------------------- */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#121212] text-sm font-bold text-white">
            5
          </span>
          <h2 className="text-2xl font-bold text-[#121212]">
            Use webhooks for async processing
          </h2>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          For production pipelines, you probably do not want to hold a
          connection open while the video renders. Pass a{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            webhookUrl
          </code>{' '}
          and agent-media will POST the result to your endpoint when the video
          is ready.
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">with-webhook.ts</span>
          </div>
          <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`// Fire and forget — no waitForCompletion needed
const job = await client.createVideo({
  script: "This serum changed my skin in two weeks...",
  actor: "sofia",
  subtitleStyle: "karaoke",
  webhookUrl: "https://your-app.com/api/video-complete",
});

console.log(job.id); // "job_abc123" — track it in your DB`}
          </pre>
        </div>
        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          When the video finishes, agent-media sends a POST request to your
          webhook URL with this payload:
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">webhook payload</span>
          </div>
          <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`{
  "event": "video.completed",
  "jobId": "job_abc123",
  "status": "completed",
  "video": {
    "url": "https://media.agent-media.ai/videos/abc123.mp4",
    "duration": 10.2,
    "actor": "sofia",
    "creditsCost": 306
  },
  "timestamp": "2026-04-14T12:34:56Z"
}`}
          </pre>
        </div>
      </section>

      {/* -- Python example --------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          Python SDK example
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The same flow works with the Python SDK. The API is identical — just
          a different language.
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">generate_video.py</span>
          </div>
          <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`import asyncio
from agent_media import AgentMedia

client = AgentMedia()

async def main():
    actors = ["sofia", "marcus", "aisha"]
    script = (
        "I tried this protein powder for 30 days and the "
        "results were insane. It mixes clean, no chalky taste."
    )

    tasks = [
        client.create_video(
            script=script,
            actor=actor,
            subtitle_style="hormozi",
            wait_for_completion=True,
        )
        for actor in actors
    ]

    videos = await asyncio.gather(*tasks)

    for video in videos:
        print(f"[{video.actor}] {video.url}")

asyncio.run(main())`}
          </pre>
        </div>
      </section>

      {/* -- CLI example ------------------------------------------------ */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          CLI: one command, one video
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          If you prefer the terminal over code, the agent-media CLI wraps the
          same API in a single command. Great for quick tests, shell scripts,
          and CI/CD pipelines.
        </p>
        <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">terminal</span>
          </div>
          <div className="space-y-1 bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed">
            <p className="text-[#e0e0e0]">
              <span className="text-[#6b6b76]">$</span> agent-media ugc \
            </p>
            <p className="pl-4 text-[#e0e0e0]">
              &quot;I tried this protein powder for 30 days and the results were insane.&quot; \
            </p>
            <p className="pl-4 text-[#e0e0e0]">
              --actor sofia \
            </p>
            <p className="pl-4 text-[#e0e0e0]">
              --style hormozi \
            </p>
            <p className="pl-4 text-[#e0e0e0]">
              --sync
            </p>
            <p className="mt-3 text-[#6b6b76]">Splitting script into 3 scenes...</p>
            <p className="text-[#6b6b76]">Generating actor + character sheet...</p>
            <p className="text-[#6b6b76]">Generating talking heads (3 scenes)...</p>
            <p className="text-[#6b6b76]">Assembling timeline...</p>
            <p className="text-[#6b6b76]">Rendering subtitles (hormozi)...</p>
            <p className="text-[#6b6b76]">Adding music + CTA overlay...</p>
            <p className="mt-2 text-[#6b6b76]">Completed in 52s | 252 credits</p>
            <p className="text-[#e0e0e0]">
              https://media.agent-media.ai/videos/def456.mp4
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-[#6b6b76]">
          Pipe it into a loop, a Makefile, or a GitHub Action. The CLI returns
          the video URL to stdout so you can chain it with other tools.
        </p>
      </section>

      {/* -- Use cases -------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          Real-world use cases
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Teams are using the agent-media API across industries to automate
          creative production at scale.
        </p>
        <div className="mt-6 space-y-4">
          {[
            {
              title: 'E-commerce product videos',
              desc: 'Generate UGC-style product reviews for every SKU in your catalog. Feed product descriptions into the script field, pick 3-5 actors, and batch generate. Use different hooks for different audiences — price-focused for deal hunters, quality-focused for premium buyers.',
            },
            {
              title: 'SaaS testimonial ads',
              desc: 'Create testimonial-style ads without waiting for real customer videos. Write scripts based on actual reviews and case studies, generate them as UGC videos, and run them as social proof ads on Meta and TikTok.',
            },
            {
              title: 'TikTok ad variant testing',
              desc: 'TikTok ads burn out fast. The API lets you generate 20-50 variants per week with different actors, hooks, and subtitle styles. Feed performance data back into your script matrix to iterate on what converts.',
            },
            {
              title: 'Agency creative operations',
              desc: 'Agencies managing multiple clients can build a single pipeline that generates creatives across all accounts. One API integration replaces dozens of creator relationships and revision cycles.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <p className="font-semibold text-[#121212]">{item.title}</p>
              <p className="mt-2 text-sm text-[#6b6b76] leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Pricing ---------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          Pricing: credits per second
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The API uses the same credit system as the dashboard. Video generation
          costs 30 credits per second of output. A 10-second video costs 300
          credits, roughly $3.00.
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Plan</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">Monthly</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">Credits</th>
                <th className="px-4 py-3 text-center font-mono font-semibold text-[#121212]">~Videos (10s)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { plan: 'Creator', monthly: '$39', credits: '3,900', videos: '~13' },
                { plan: 'Pro', monthly: '$69', credits: '6,900', videos: '~23' },
                { plan: 'Pro Plus', monthly: '$129', credits: '12,900', videos: '~43' },
              ].map((row) => (
                <tr
                  key={row.plan}
                  className="border-b border-[#d4d4d4] last:border-b-0"
                >
                  <td className="px-4 py-3 font-semibold text-[#121212]">{row.plan}</td>
                  <td className="px-4 py-3 text-center text-[#6b6b76]">{row.monthly}</td>
                  <td className="px-4 py-3 text-center font-mono text-[#6b6b76]">{row.credits}</td>
                  <td className="px-4 py-3 text-center text-[#6b6b76]">{row.videos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[#6b6b76]">
          Need more? Add credit packs at $39 for 3,900 credits. Purchased
          credits never expire. See the full breakdown on the{' '}
          <Link href="/pricing" className="font-semibold text-[#121212] underline">
            pricing page
          </Link>
          .
        </p>
      </section>

      {/* -- CTA -------------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-[#d4d4d4] bg-[#ededed] p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Start automating UGC video creation
        </h2>
        <p className="mt-3 text-[#6b6b76]">
          One API call. One finished video. Scale to hundreds of variants per
          campaign without touching a video editor.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/login">
            <Button size="lg">
              <Terminal className="mr-2 h-4 w-4" />
              Get Your API Key
            </Button>
          </Link>
          <Link href="/pricing">
            <Button variant="secondary" size="lg">
              View Pricing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-[#6b6b76]">
          <Link href="/blog/best-ai-ugc-generator-for-developers" className="underline hover:text-[#121212]">
            API comparison
          </Link>
          <Link href="/blog/generate-ai-video-terminal-60-seconds" className="underline hover:text-[#121212]">
            Quick start guide
          </Link>
          <Link href="/blog/ai-ugc-pricing-comparison-2026" className="underline hover:text-[#121212]">
            Pricing comparison
          </Link>
        </div>
      </section>

      {/* -- Footer ----------------------------------------------------- */}
      <footer className="mt-12 border-t border-[#d4d4d4] pt-6">
        <p className="text-xs text-[#6b6b76]">
          Published April 14, 2026 by the agent-media team. Code examples use
          the latest SDK versions as of publication. Check the API docs for the
          most up-to-date reference.
        </p>
        <p className="mt-4 text-xs text-[#6b6b76]">
          Related:{' '}
          <Link
            href="/blog/best-ai-ugc-generator-for-developers"
            className="text-[#121212] underline"
          >
            Best AI UGC Generator for Developers
          </Link>
          {' | '}
          <Link
            href="/blog/generate-ai-video-terminal-60-seconds"
            className="text-[#121212] underline"
          >
            Create UGC Videos in 60 Seconds
          </Link>
          {' | '}
          <Link
            href="/blog/ai-ugc-pricing-comparison-2026"
            className="text-[#121212] underline"
          >
            AI UGC Pricing Comparison 2026
          </Link>
        </p>
      </footer>
    </article>
  );
}
