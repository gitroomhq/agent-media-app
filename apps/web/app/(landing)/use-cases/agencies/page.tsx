// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'White-Label Video Generation API for Agencies | agent-media',
  description:
    'Embed AI video generation into your agency platform. TypeScript SDK, multi-tenant support, batch generation, webhooks. White-label UGC video API at $3 per video.',
  keywords: [
    'white label video api',
    'video generation api for agencies',
    'ugc api agency',
    'white label ugc api',
    'video api multi-tenant',
    'agency video sdk',
    'embed video generation',
    'bulk video api',
    'ugc video automation api',
    'white label video generation',
  ],
  openGraph: {
    title: 'White-Label Video Generation API for Agencies',
    description:
      'Embed AI video generation into your agency platform. TypeScript SDK, multi-tenant support, batch generation, webhooks. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/agencies',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'White-Label Video Generation API for Agencies | agent-media',
    description:
      'Embed video generation into your platform. TypeScript SDK, multi-tenant, webhooks. $3 per video.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/agencies',
  },
};

export default function AgenciesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            White-Label Video Generation API for Agencies
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Your clients want UGC video content inside your platform, not
            on someone else&apos;s. The{' '}
            <strong className="text-[#121212]">agent-media</strong> API
            lets you embed video generation directly into your agency
            dashboard. TypeScript SDK, multi-tenant client isolation, batch
            generation for campaigns, and webhook callbacks when videos are
            ready. White-label output with zero agent-media branding. $3
            per video, your margin, your pricing.{' '}
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
            The Problem: Building Video Generation Is Hard
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Your agency platform already manages campaigns, creatives, and
              client accounts. Now clients are asking for AI-generated UGC
              videos. Building a video pipeline from scratch means stitching
              together text-to-speech, lip sync, avatar rendering, and video
              compositing. That is 6 to 12 months of engineering work and a
              team of ML specialists you do not have.
            </p>
            <p>
              Redirecting clients to a third-party tool breaks the experience.
              They leave your platform, create another account, learn another
              interface. Your agency loses control of the workflow and the
              relationship. Worse, the client starts wondering why they need
              you at all.
            </p>
            <p>
              What you need is an API that handles the entire video pipeline
              behind the scenes while your platform stays front and center.
              One integration, multi-tenant isolation per client, and output
              that arrives with no third-party branding attached.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            The Solution: Embed Video Generation via API
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">agent-media</strong> exposes
              a REST API and TypeScript SDK that your engineering team can
              integrate in a single sprint. Wrap the SDK in a branded service
              layer, generate videos on behalf of any client, and deliver
              finished mp4 files through your own UI. The client never sees
              agent-media.
            </p>
            <p>
              Multi-tenant support means you isolate actors, scripts, and
              brand assets per client. Batch endpoints let you kick off entire
              campaign variants in one call. Webhooks notify your system when
              each video completes so your client dashboard updates in real
              time.
            </p>
            <p>
              Production cost is $3 per video. If you bill clients $100 to
              $300 per video, your gross margin is 97% to 99%. Video
              generation becomes your most profitable feature, not an
              engineering cost center.{' '}
              <Link
                href="/login"
                className="text-[#121212] underline hover:no-underline"
              >
                Get your API key
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Code Examples */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Integration Examples
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Wrap the SDK in your branded service. Generate videos for any
            client with their brand assets.
          </p>

          <div className="mt-10 space-y-8">
            {/* Branded Service Wrapper */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Wrap the SDK in a branded service
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Initialize the SDK once and expose your own interface. Your
                  platform calls{' '}
                  <code className="bg-purple-50 px-1 text-purple-700">videoService.generate()</code>{' '}
                  — clients never see the underlying API.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      video-service.ts
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-purple-600">import</span>{' '}
                      {'{ AgentMedia }'}{' '}
                      <span className="text-purple-600">from</span>{' '}
                      <span className="text-green-700">&apos;@agent-media/sdk&apos;</span>
                    </p>
                    <p className="mt-2 text-[#6b6b76]">
                      <span className="text-purple-600">const</span> client ={' '}
                      <span className="text-purple-600">new</span>{' '}
                      AgentMedia({'{'} apiKey: process.env.AGENT_MEDIA_KEY {'}'})
                    </p>
                    <p className="mt-4 text-[#6b6b76]">
                      <span className="text-purple-600">export async function</span>{' '}
                      <span className="text-[#121212]">generateForClient</span>(
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}clientId: <span className="text-purple-600">string</span>,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}script: <span className="text-purple-600">string</span>,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}actorId: <span className="text-purple-600">string</span>,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}brandAssets: {'{ logoUrl: string; colors: string[] }'}
                    </p>
                    <p className="text-[#6b6b76]">{')'} {'{'}</p>
                    <p className="text-[#6b6b76]">
                      {'  '}<span className="text-purple-600">const</span> video ={' '}
                      <span className="text-purple-600">await</span> client.videos.create({'{'}
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}script,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}actor: actorId,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}metadata: {'{ clientId, ...brandAssets }'},
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}webhook: <span className="text-green-700">`https://your-app.com/hooks/video/$&#123;clientId&#125;`</span>
                    </p>
                    <p className="text-[#6b6b76]">{'  })'}</p>
                    <p className="text-[#6b6b76]">
                      {'  '}<span className="text-purple-600">return</span> video
                    </p>
                    <p className="text-[#6b6b76]">{'}'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-tenant batch */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Batch generate for a campaign
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Submit an array of video jobs in one API call. Each job can
                  target a different actor, script variant, or client. The
                  batch endpoint returns a job ID you can poll or receive via
                  webhook.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      campaign-batch.ts
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-purple-600">const</span> batch ={' '}
                      <span className="text-purple-600">await</span> client.videos.createBatch({'{'}
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}jobs: [
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}{'{'} script: <span className="text-green-700">&quot;This serum changed my skin...&quot;</span>, actor: <span className="text-green-700">&quot;sofia&quot;</span>, metadata: {'{ clientId: &quot;skincare-co&quot; }'} {'}'},
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}{'{'} script: <span className="text-green-700">&quot;Best pre-workout I&apos;ve tried...&quot;</span>, actor: <span className="text-green-700">&quot;jake&quot;</span>, metadata: {'{ clientId: &quot;fit-supps&quot; }'} {'}'},
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}{'{'} script: <span className="text-green-700">&quot;We saved 5 hours per week...&quot;</span>, actor: <span className="text-green-700">&quot;marcus&quot;</span>, metadata: {'{ clientId: &quot;saas-app&quot; }'} {'}'},
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}],
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}webhook: <span className="text-green-700">&quot;https://your-app.com/hooks/batch&quot;</span>
                    </p>
                    <p className="text-[#6b6b76]">{'}'})</p>
                    <p className="mt-2 text-[#6b6b76]">
                      <span className="text-[#6b6b76]">{'// batch.id → poll or wait for webhook'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Webhook handler */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Receive webhooks in your client dashboard
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  When a video finishes rendering, agent-media sends a POST to
                  your webhook URL with the video URL, status, and metadata.
                  Use it to update your client dashboard in real time.
                </p>
                <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                      webhook-handler.ts
                    </span>
                  </div>
                  <div className="p-5 font-mono text-sm">
                    <p className="text-[#6b6b76]">
                      <span className="text-purple-600">export async function</span>{' '}
                      <span className="text-[#121212]">POST</span>(req: Request) {'{'}
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}<span className="text-purple-600">const</span>{' '}
                      {'{ videoId, status, url, metadata }'} ={' '}
                      <span className="text-purple-600">await</span> req.json()
                    </p>
                    <p className="mt-2 text-[#6b6b76]">
                      {'  '}<span className="text-[#6b6b76]">{"// Update your client's dashboard"}</span>
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}<span className="text-purple-600">await</span> db.videos.create({'{'}
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}clientId: metadata.clientId,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}videoUrl: url,
                    </p>
                    <p className="text-[#6b6b76]">
                      {'    '}status,
                    </p>
                    <p className="text-[#6b6b76]">{'  })'}</p>
                    <p className="mt-2 text-[#6b6b76]">
                      {'  '}<span className="text-[#6b6b76]">{'// Notify the client'}</span>
                    </p>
                    <p className="text-[#6b6b76]">
                      {'  '}<span className="text-purple-600">await</span>{' '}
                      notifyClient(metadata.clientId, <span className="text-green-700">&quot;Your video is ready&quot;</span>)
                    </p>
                    <p className="text-[#6b6b76]">{'}'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing at Scale */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Pricing at Scale
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Each video costs roughly $3 in credits. A Pro Plus plan at
              $129/month gives you 12,900 credits (about 43 videos). Need
              more? Credit packs at $39 for 3,900 credits let you scale on
              demand. Credits never expire.
            </p>
            <p>
              For high-volume agencies, the math is straightforward. Bill
              clients $100 to $300 per video through your platform. Your cost
              is $3. The API integration turns video generation into your
              highest-margin feature.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Monthly Volume
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    API Cost
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    Client Revenue
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    <span className="text-purple-600">Gross Margin</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { vol: '10 videos', cost: '$30', rev: '$1,500', margin: '$1,470 (98%)' },
                  { vol: '25 videos', cost: '$75', rev: '$3,750', margin: '$3,675 (98%)' },
                  { vol: '43 videos (Pro Plus)', cost: '$129', rev: '$6,450', margin: '$6,321 (98%)' },
                  { vol: '100 videos', cost: '$300', rev: '$15,000', margin: '$14,700 (98%)' },
                ].map((row) => (
                  <tr
                    key={row.vol}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-5 py-3 text-[#121212]">{row.vol}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.cost}
                    </td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.rev}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-purple-700">
                      {row.margin}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Revenue assumes $150/video client rate. Your actual pricing may
            vary.{' '}
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
            Why <span className="text-purple-600">agent-media</span> for Agency Platforms
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'TypeScript SDK',
                desc: 'First-class TypeScript support with full type definitions. npm install, import, and start generating. No REST boilerplate needed.',
              },
              {
                title: 'Multi-tenant isolation',
                desc: 'Tag every video with client metadata. Assign dedicated actors per client so competing brands never share faces.',
              },
              {
                title: 'Batch generation',
                desc: 'Submit an array of video jobs in one API call. Generate an entire campaign of variants for multiple clients at once.',
              },
              {
                title: 'Webhook callbacks',
                desc: 'Receive real-time POST notifications when videos complete. Update your client dashboard without polling.',
              },
              {
                title: 'White-label output',
                desc: 'Videos have no agent-media watermark or branding. Serve them through your own CDN. Clients see your platform, not ours.',
              },
              {
                title: '200 AI actors',
                desc: 'Different clients, different audiences, different faces. Assign exclusive actors per client to avoid overlap across competing brands.',
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

      {/* Integration Architecture */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Integration Architecture
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Service layer pattern.</strong>{' '}
              Wrap the agent-media SDK in a service class inside your backend.
              Your API routes call the service, the service calls agent-media.
              If you ever need to swap providers, you change one file.
            </p>
            <p>
              <strong className="text-[#121212]">Client metadata for multi-tenancy.</strong>{' '}
              Every API call accepts a{' '}
              <code className="bg-purple-50 px-1 text-purple-700">metadata</code>{' '}
              object. Store the client ID, brand colors, logo URL, and any
              custom fields. This metadata flows through to webhooks, so your
              handler knows exactly which client to notify.
            </p>
            <p>
              <strong className="text-[#121212]">Webhook-driven updates.</strong>{' '}
              Video rendering takes 2 to 5 minutes. Instead of polling, register
              a webhook URL per client or per batch. agent-media POSTs the
              finished video URL, status, and your metadata back to your server.
              Update the client dashboard and send a notification.
            </p>
            <p>
              <strong className="text-[#121212]">Credit management at scale.</strong>{' '}
              Use credit packs to pre-purchase volume. Track usage per client in
              your own billing system. Bill clients per video, per month, or as
              part of a retainer. The API returns credit balance so you can
              enforce limits in your platform.
            </p>
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
              href="/use-cases/fitness"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Fitness Brands <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/real-estate"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Real Estate <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/ugc-video-api"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Video API <ArrowRight className="h-4 w-4" />
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
            '@type': 'Article',
            headline:
              'White-Label Video Generation API for Agencies',
            description:
              'Embed AI video generation into your agency platform. TypeScript SDK, multi-tenant support, batch generation, webhooks. White-label UGC video API at $3 per video.',
            url: 'https://agent-media.ai/use-cases/agencies',
            dateModified: '2026-04-14',
          }),
        }}
      />
    </div>
  );
}
