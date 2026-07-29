// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Code2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'UGC Video API: Generate AI Videos via REST API | agent-media',
  description:
    'Public REST API for AI UGC video generation. POST a script, get a finished video. 200 actors, lip-sync, subtitles. Bearer auth, JSON responses, polling flow. $3 per video.',
  keywords: [
    'ugc video api',
    'ai video generation api',
    'video api rest',
    'ugc video generation api',
    'ai video api',
    'programmatic video generation',
    'agent-media api',
    'video generation endpoint',
    'ugc automation api',
    'ai ugc api',
  ],
  openGraph: {
    title: 'UGC Video API: Generate AI Videos via REST API',
    description:
      'Public REST API for AI UGC video generation. POST a script, get a finished video. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/ugc-video-api',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UGC Video API with agent-media',
    description:
      'REST API for AI UGC videos. 200 actors. Bearer auth. JSON in, MP4 out.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/ugc-video-api',
  },
};

function CodeBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#d4d4d4] bg-white">
      <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-3 font-mono text-xs text-[#6b6b76]">{title}</span>
      </div>
      <div className="overflow-x-auto p-5 font-mono text-sm">{children}</div>
    </div>
  );
}

export default function UgcVideoApiPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Developer
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            UGC Video API: Generate Videos with a POST Request
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Most AI video tools lock you into a browser. <strong className="text-[#121212]">agent-media</strong> exposes
            a public REST API at <code className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">agent-media.ai/api/v1/</code>.
            Send a script, pick an actor, get back a finished MP4 with lip-sync, subtitles, and music.
            Bearer token auth. JSON responses. Standard polling flow.{' '}
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

      {/* Authentication */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Code2 className="h-6 w-6" />
            Authentication
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Every request requires a Bearer token. Generate an API key from your{' '}
            <Link
              href="/login"
              className="text-[#121212] underline hover:no-underline"
            >
              dashboard
            </Link>
            . Keys start with <code className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">ma_</code> and
            are scoped to your account.
          </p>
          <CodeBlock title="authentication header">
            <p className="text-[#6b6b76]">
              Authorization: Bearer ma_your_api_key_here
            </p>
          </CodeBlock>
          <p className="mt-4 text-sm text-[#6b6b76]">
            All endpoints return JSON. Error responses include a <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">message</code> field
            with a human-readable explanation.
          </p>
        </div>
      </section>

      {/* Endpoints */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            API Endpoints
          </h2>

          {/* POST /api/v1/videos */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold text-[#121212]">
              <code className="rounded bg-purple-50 px-2 py-1 text-purple-700">POST /api/v1/videos</code>
            </h3>
            <p className="mt-3 text-sm text-[#6b6b76]">
              Submit a video generation job. Returns a job ID immediately. The video renders asynchronously.
              Poll the status endpoint to check progress.
            </p>
            <div className="mt-4">
              <CodeBlock title="curl">
                <pre className="whitespace-pre-wrap text-[#6b6b76]">{`curl -X POST https://agent-media.ai/api/v1/videos \\
  -H "Authorization: Bearer ma_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "script": "Stop scrolling. This app saves me two hours every morning.",
    "actor": "sofia",
    "duration": 10,
    "subtitle_style": "tiktok",
    "voice_tone": "energetic",
    "aspect_ratio": "9:16"
  }'`}</pre>
              </CodeBlock>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#6b6b76]">
                Response (202 Accepted)
              </p>
              <CodeBlock title="json">
                <pre className="whitespace-pre-wrap text-[#6b6b76]">{`{
  "id": "vid_abc123",
  "status": "processing",
  "credits_charged": 300,
  "estimated_seconds": 120,
  "created_at": "2026-04-15T10:30:00Z"
}`}</pre>
              </CodeBlock>
            </div>
          </div>

          {/* Request body params */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#6b6b76]">
              Request Body Parameters
            </p>
            <div className="overflow-x-auto rounded-lg border border-[#d4d4d4]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                    <th className="px-5 py-3 font-mono font-semibold text-[#121212]">Field</th>
                    <th className="px-5 py-3 font-mono font-semibold text-[#121212]">Type</th>
                    <th className="px-5 py-3 font-mono font-semibold text-[#121212]">Required</th>
                    <th className="px-5 py-3 font-semibold text-[#121212]">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { field: 'script', type: 'string', required: 'Yes', desc: 'The spoken script. Word count validated against duration.' },
                    { field: 'actor', type: 'string', required: 'Yes', desc: 'Actor slug. Get slugs from GET /api/v1/actors.' },
                    { field: 'duration', type: 'number', required: 'Yes', desc: '5, 10, or 15 seconds.' },
                    { field: 'subtitle_style', type: 'string', required: 'No', desc: 'One of 17 styles: tiktok, hormozi, minimal, clean, bold, etc. Default: tiktok.' },
                    { field: 'voice_tone', type: 'string', required: 'No', desc: 'energetic, calm, confident, or dramatic. Default: energetic.' },
                    { field: 'aspect_ratio', type: 'string', required: 'No', desc: '9:16, 16:9, or 1:1. Default: 9:16.' },
                    { field: 'music_genre', type: 'string', required: 'No', desc: 'chill, energetic, corporate, dramatic, or upbeat.' },
                    { field: 'overlay_text', type: 'string', required: 'No', desc: 'Persistent branded text banner on the video.' },
                  ].map((row) => (
                    <tr key={row.field} className="border-b border-[#d4d4d4] last:border-b-0">
                      <td className="px-5 py-3 font-mono text-[#121212]">{row.field}</td>
                      <td className="px-5 py-3 font-mono text-[#6b6b76]">{row.type}</td>
                      <td className="px-5 py-3 text-[#6b6b76]">{row.required}</td>
                      <td className="px-5 py-3 text-[#6b6b76]">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GET /api/v1/videos/:id */}
          <div className="mt-12">
            <h3 className="text-lg font-semibold text-[#121212]">
              <code className="rounded bg-purple-50 px-2 py-1 text-purple-700">GET /api/v1/videos/:id</code>
            </h3>
            <p className="mt-3 text-sm text-[#6b6b76]">
              Check the status of a video job. When <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">status</code> is{' '}
              <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">completed</code>, the{' '}
              <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">output_url</code> field contains a direct link to the MP4.
            </p>
            <div className="mt-4">
              <CodeBlock title="curl">
                <pre className="whitespace-pre-wrap text-[#6b6b76]">{`curl https://agent-media.ai/api/v1/videos/vid_abc123 \\
  -H "Authorization: Bearer ma_your_api_key"`}</pre>
              </CodeBlock>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#6b6b76]">
                Response (completed)
              </p>
              <CodeBlock title="json">
                <pre className="whitespace-pre-wrap text-[#6b6b76]">{`{
  "id": "vid_abc123",
  "status": "completed",
  "output_url": "https://media.agent-media.ai/videos/vid_abc123.mp4",
  "duration": 10,
  "credits_charged": 300,
  "created_at": "2026-04-15T10:30:00Z",
  "completed_at": "2026-04-15T10:32:15Z"
}`}</pre>
              </CodeBlock>
            </div>
          </div>

          {/* GET /api/v1/actors */}
          <div className="mt-12">
            <h3 className="text-lg font-semibold text-[#121212]">
              <code className="rounded bg-purple-50 px-2 py-1 text-purple-700">GET /api/v1/actors</code>
            </h3>
            <p className="mt-3 text-sm text-[#6b6b76]">
              List all available actors. Returns slug, name, gender, and variant count. Use the slug when creating videos.
            </p>
            <div className="mt-4">
              <CodeBlock title="curl">
                <pre className="whitespace-pre-wrap text-[#6b6b76]">{`curl https://agent-media.ai/api/v1/actors \\
  -H "Authorization: Bearer ma_your_api_key"`}</pre>
              </CodeBlock>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#6b6b76]">
                Response (truncated)
              </p>
              <CodeBlock title="json">
                <pre className="whitespace-pre-wrap text-[#6b6b76]">{`{
  "actors": [
    {
      "slug": "sofia",
      "name": "Sofia",
      "gender": "female",
      "variants": 10
    },
    {
      "slug": "marco",
      "name": "Marco",
      "gender": "male",
      "variants": 10
    }
  ],
  "total": 200
}`}</pre>
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      {/* Polling Flow */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Zap className="h-6 w-6" />
            Polling Flow: Submit, Poll, Download
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Video generation takes 1 to 3 minutes. The recommended pattern: submit the job, then poll every 10 seconds
            until the status is <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">completed</code> or{' '}
            <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">failed</code>.
          </p>
          <div className="mt-6">
            <CodeBlock title="bash polling script">
              <pre className="whitespace-pre-wrap text-[#6b6b76]">{`# Submit the video
VIDEO_ID=$(curl -s -X POST https://agent-media.ai/api/v1/videos \\
  -H "Authorization: Bearer ma_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"script":"This changed everything for me.","actor":"sofia","duration":10}' \\
  | jq -r '.id')

echo "Submitted: $VIDEO_ID"

# Poll until done
while true; do
  STATUS=$(curl -s https://agent-media.ai/api/v1/videos/$VIDEO_ID \\
    -H "Authorization: Bearer ma_your_api_key" \\
    | jq -r '.status')

  echo "Status: $STATUS"

  if [ "$STATUS" = "completed" ]; then
    OUTPUT=$(curl -s https://agent-media.ai/api/v1/videos/$VIDEO_ID \\
      -H "Authorization: Bearer ma_your_api_key" \\
      | jq -r '.output_url')
    echo "Download: $OUTPUT"
    break
  fi

  if [ "$STATUS" = "failed" ]; then
    echo "Video generation failed."
    break
  fi

  sleep 10
done`}</pre>
            </CodeBlock>
          </div>
          <div className="mt-8 rounded-lg border border-[#d4d4d4] bg-purple-50 p-5">
            <p className="text-sm text-purple-700">
              <strong>Status values:</strong>{' '}
              <code className="rounded bg-white/60 px-1">processing</code> (rendering in progress),{' '}
              <code className="rounded bg-white/60 px-1">completed</code> (MP4 ready at output_url),{' '}
              <code className="rounded bg-white/60 px-1">failed</code> (check the error field for details).
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            API Pricing
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            The API uses the same credit system as the CLI and dashboard. 30 credits per second of video.
          </p>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Duration</th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">Credits</th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">Cost</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { dur: '5 seconds', credits: '150', cost: '~$1.50' },
                  { dur: '10 seconds', credits: '300', cost: '~$3.00' },
                  { dur: '15 seconds', credits: '450', cost: '~$4.50' },
                ].map((row) => (
                  <tr key={row.dur} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 text-[#121212]">{row.dur}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.credits}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            AI script generation adds 5 credits per request.{' '}
            <Link
              href="/pricing"
              className="text-[#121212] underline hover:no-underline"
            >
              View full pricing plans
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Why agent-media API */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why the <span className="text-purple-600">agent-media</span> API
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Public API with real docs',
                desc: 'Full REST API documentation at /docs/api. Not a hidden enterprise endpoint. Every developer gets the same access.',
              },
              {
                title: 'Standard Bearer auth',
                desc: 'No OAuth dance. Generate an API key, add it as a Bearer token, and start making requests. Keys are scoped to your account.',
              },
              {
                title: 'Predictable JSON responses',
                desc: 'Every endpoint returns consistent JSON shapes. Status codes follow HTTP conventions. No guessing.',
              },
              {
                title: '200 actors via API',
                desc: 'List actors, pick variants, and specify outfits programmatically. No browser needed to browse the actor library.',
              },
              {
                title: 'Word count validation',
                desc: 'The API rejects scripts that exceed the word limit for the chosen duration. 12 words for 5s, 25 for 10s, 37 for 15s.',
              },
              {
                title: 'Same pricing everywhere',
                desc: 'API, CLI, and dashboard all use the same credit pool. No API surcharge. 300 credits per 10-second video.',
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
            Related Pages
          </h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/docs/api-reference"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Full API Reference <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/ai-video-cli"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              AI Video CLI <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/tools/ugc-cost-calculator"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Cost Calculator <ArrowRight className="h-4 w-4" />
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
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#121212] text-white hover:bg-[#333]"
              >
                {'>'} Get Your API Key
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
            '@type': 'TechArticle',
            headline: 'UGC Video API: Generate AI Videos via REST API',
            description:
              'Public REST API for AI UGC video generation. POST a script, get a finished video. 200 actors, lip-sync, subtitles. $3 per video.',
            url: 'https://agent-media.ai/use-cases/ugc-video-api',
            dateModified: '2026-04-01',
          }),
        }}
      />
    </div>
  );
}
