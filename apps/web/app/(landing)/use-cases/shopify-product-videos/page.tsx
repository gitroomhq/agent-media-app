// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'Shopify Video API: Generate Product Videos from Webhooks | agent-media',
  description:
    'Automate product video generation from Shopify webhooks. TypeScript SDK, Python client, and CLI examples. Trigger video creation on product.create events.',
  keywords: [
    'shopify video api',
    'shopify product video automation',
    'shopify webhook video',
    'shopify product video api',
    'ecommerce video automation',
    'shopify app video generation',
    'agent-media shopify integration',
    'product video webhook',
    'shopify developer video',
    'programmatic product videos',
  ],
  openGraph: {
    title: 'Shopify Video API: Generate Product Videos from Webhooks',
    description:
      'Automate product video generation from Shopify webhooks. TypeScript SDK, Python, and CLI.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/shopify-product-videos',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shopify Video API with agent-media',
    description:
      'Trigger AI product videos from Shopify webhooks. SDK + CLI examples.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/shopify-product-videos',
  },
};

export default function ShopifyProductVideosPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Generate Product Videos from Your Shopify Webhook
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Register a{' '}
            <code className="rounded bg-[#121212]/5 px-1.5 py-0.5 text-sm font-mono text-[#121212]">
              product.create
            </code>{' '}
            webhook in Shopify, receive the payload, and call the{' '}
            <strong className="text-[#121212]">agent-media</strong> API to
            generate a talking-head video for each new product automatically.
            TypeScript SDK, Python client, and CLI supported.{' '}
            <Link
              href="/docs"
              className="text-[#121212] underline hover:no-underline"
            >
              Read the docs
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Webhook Handler */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Webhook Handler: Next.js / Express
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Receive Shopify{' '}
            <code className="rounded bg-[#121212]/5 px-1.5 py-0.5 font-mono text-[#121212]">
              products/create
            </code>{' '}
            events and trigger video generation. This example uses a Next.js
            API route, but any framework that handles POST requests works.
          </p>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                app/api/shopify/webhook/route.ts
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]/60">
                {'// Verify the Shopify HMAC header in production'}
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">import</span> {'{'}{' '}
                AgentMedia {'}'} <span className="text-[#121212]">from</span>{' '}
                &quot;agent-media&quot;;
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">import</span> {'{'}{' '}
                NextResponse {'}'} <span className="text-[#121212]">from</span>{' '}
                &quot;next/server&quot;;
              </p>
              <br />
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> client ={' '}
                <span className="text-[#121212]">new</span> AgentMedia(
                process.env.AGENT_MEDIA_API_KEY!);
              </p>
              <br />
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">export async function</span>{' '}
                POST(req: Request) {'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'  '}
                <span className="text-[#121212]">const</span> product ={' '}
                <span className="text-[#121212]">await</span> req.json();
              </p>
              <br />
              <p className="text-[#6b6b76]">
                {'  '}
                <span className="text-[#121212]">const</span> video ={' '}
                <span className="text-[#121212]">await</span>{' '}
                client.videos.create({'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'    '}script: product.body_html,
              </p>
              <p className="text-[#6b6b76]">
                {'    '}actor: &quot;emma&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'    '}brollImages: [product.image?.src],
              </p>
              <p className="text-[#6b6b76]">
                {'    '}style: &quot;clean&quot;,
              </p>
              <p className="text-[#6b6b76]">{'    '}duration: 10,</p>
              <p className="text-[#6b6b76]">
                {'    '}template: &quot;product-demo&quot;,
              </p>
              <p className="text-[#6b6b76]">{'  '}{'}'});</p>
              <br />
              <p className="text-[#6b6b76]">
                {'  '}
                <span className="text-[#121212]">return</span>{' '}
                NextResponse.json({'{'} videoId: video.id {'}'});
              </p>
              <p className="text-[#6b6b76]">{'}'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* TypeScript SDK */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            TypeScript SDK: Generate a Product Demo Video
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Use the SDK directly when you need more control -- poll for
            completion, attach metadata, or upload the result back to Shopify
            via the Admin API.
          </p>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                generate-product-video.ts
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">import</span> {'{'}{' '}
                AgentMedia {'}'} <span className="text-[#121212]">from</span>{' '}
                &quot;agent-media&quot;;
              </p>
              <br />
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> client ={' '}
                <span className="text-[#121212]">new</span> AgentMedia(
                process.env.AGENT_MEDIA_API_KEY!);
              </p>
              <br />
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> video ={' '}
                <span className="text-[#121212]">await</span>{' '}
                client.videos.create({'{'}
              </p>
              <p className="text-[#6b6b76]">
                {'  '}aiScript: &quot;Organic bamboo cutting board, 14x10
                inches, knife-friendly surface&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}template: &quot;product-demo&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}actor: &quot;emma&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'  '}brollImages: [
                &quot;https://cdn.shopify.com/s/.../bamboo-board.jpg&quot;],
              </p>
              <p className="text-[#6b6b76]">
                {'  '}style: &quot;clean&quot;,
              </p>
              <p className="text-[#6b6b76]">{'  '}duration: 10,</p>
              <p className="text-[#6b6b76]">{'}'});</p>
              <br />
              <p className="text-[#6b6b76]/60">
                {'// Poll until ready'}
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">const</span> result ={' '}
                <span className="text-[#121212]">await</span>{' '}
                client.videos.wait(video.id);
              </p>
              <p className="text-[#6b6b76]">
                console.log(result.url);{' '}
                <span className="text-[#6b6b76]/60">
                  {'// '}https://media.agent-media.ai/videos/abc123.mp4
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Python Example */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Python: Batch Process Your Catalog
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Pull products from the Shopify Admin API and generate videos for
            every SKU in a single script.
          </p>
          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                batch_generate.py
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">import</span> shopify
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">import</span> agent_media
              </p>
              <br />
              <p className="text-[#6b6b76]">
                client = agent_media.Client(api_key=os.environ[
                &quot;AGENT_MEDIA_API_KEY&quot;])
              </p>
              <p className="text-[#6b6b76]">
                products = shopify.Product.find()
              </p>
              <br />
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">for</span> product{' '}
                <span className="text-[#121212]">in</span> products:
              </p>
              <p className="text-[#6b6b76]">
                {'    '}video = client.videos.create(
              </p>
              <p className="text-[#6b6b76]">
                {'        '}ai_script=product.body_html,
              </p>
              <p className="text-[#6b6b76]">
                {'        '}template=&quot;product-demo&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'        '}actor=&quot;emma&quot;,
              </p>
              <p className="text-[#6b6b76]">
                {'        '}broll_images=[product.image.src],
              </p>
              <p className="text-[#6b6b76]">
                {'        '}style=&quot;clean&quot;,
              </p>
              <p className="text-[#6b6b76]">{'        '}duration=10,</p>
              <p className="text-[#6b6b76]">{'    '})</p>
              <p className="text-[#6b6b76]">
                {'    '}print(f&quot;{'{'}product.title{'}'}: {'{'}video.id
                {'}'}&quot;)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLI Example */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            CLI: One-Off or Scripted
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Generate a single product video from the command line, or wrap it
            in a shell loop for quick batch runs.
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
              <p className="text-[#6b6b76]/60">
                # Generate a single product video
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media video
                create \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--ai-script &quot;Organic bamboo cutting board, 14x10
                inches, knife-friendly surface&quot; \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--template product-demo \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--actor emma \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--broll-images
                &quot;https://cdn.shopify.com/s/.../bamboo-board.jpg&quot; \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--style clean \
              </p>
              <p className="text-[#6b6b76]">
                {'  '}--duration 10 --sync
              </p>
              <br />
              <p className="text-[#6b6b76]/60">
                # Batch: loop over a CSV of products
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> while IFS=, read -r
                name desc img; do
              </p>
              <p className="text-[#6b6b76]">
                {'    '}agent-media video create --ai-script &quot;$desc&quot;
                --actor emma \
              </p>
              <p className="text-[#6b6b76]">
                {'      '}--broll-images &quot;$img&quot; --template
                product-demo --style clean
              </p>
              <p className="text-[#6b6b76]">
                {'  '}done &lt; products.csv
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Shopify Webhook Setup */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Set Up the Webhook in Shopify Admin
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Register the webhook so Shopify sends product data to your
            endpoint automatically.
          </p>

          <div className="mt-10 space-y-8">
            {/* Step 1 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Go to Settings &rarr; Notifications &rarr; Webhooks
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  In your Shopify admin, navigate to{' '}
                  <strong className="text-[#121212]">Settings</strong> &rarr;{' '}
                  <strong className="text-[#121212]">Notifications</strong>{' '}
                  and scroll to the Webhooks section at the bottom.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Create a webhook for Product creation
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Click <strong className="text-[#121212]">Create webhook</strong>.
                  Set the event to{' '}
                  <code className="rounded bg-[#121212]/5 px-1.5 py-0.5 font-mono text-[#121212]">
                    Product creation
                  </code>
                  , format to JSON, and enter your endpoint URL (e.g.{' '}
                  <code className="rounded bg-[#121212]/5 px-1.5 py-0.5 font-mono text-[#121212]">
                    https://yourapp.com/api/shopify/webhook
                  </code>
                  ).
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Verify the HMAC signature
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Shopify signs every webhook with an HMAC header. Verify it
                  against your app&apos;s secret to ensure the payload is
                  authentic. See the{' '}
                  <Link
                    href="/docs"
                    className="text-[#121212] underline hover:no-underline"
                  >
                    docs
                  </Link>{' '}
                  for a verification helper.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#121212]">
                  Test with a new product
                </h3>
                <p className="mt-2 text-sm text-[#6b6b76]">
                  Create a test product in Shopify. Your webhook fires,
                  agent-media generates the video, and you get the video URL
                  back. Poll{' '}
                  <code className="rounded bg-[#121212]/5 px-1.5 py-0.5 font-mono text-[#121212]">
                    client.videos.get(videoId)
                  </code>{' '}
                  or use the{' '}
                  <code className="rounded bg-[#121212]/5 px-1.5 py-0.5 font-mono text-[#121212]">
                    --sync
                  </code>{' '}
                  flag in the CLI to wait for completion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features for Developers */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why Developers Choose agent-media
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Webhook-native architecture',
                desc: 'Receive product events, call the API, get a video URL. Fits into any event-driven pipeline without custom infrastructure.',
              },
              {
                title: 'TypeScript + Python SDKs',
                desc: 'Typed clients with auto-completion. Create videos, poll status, and download results in a few lines of code.',
              },
              {
                title: 'AI script generation',
                desc: 'Pass raw product descriptions. The API generates a natural demo script using the product-demo template. No copywriting needed.',
              },
              {
                title: 'Batch via CLI or API',
                desc: 'Loop over a product CSV or paginate through the Shopify Admin API. Generate videos for the entire catalog programmatically.',
              },
              {
                title: 'Sync and async modes',
                desc: 'Use --sync in the CLI to block until the video is ready, or poll the status endpoint in your application code.',
              },
              {
                title: 'Product image as B-roll',
                desc: 'Pass your Shopify CDN image URL. The pipeline animates it as a cutaway scene so viewers see the actual product.',
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
              href="/use-cases/facebook-ugc-ads"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Facebook UGC Ads <ArrowRight className="h-4 w-4" />
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
              href="/use-cases/talking-head-ugc"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Talking Head UGC <ArrowRight className="h-4 w-4" />
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
              href="/docs"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              API Documentation <ArrowRight className="h-4 w-4" />
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
              'Generate Product Videos from Your Shopify Webhook',
            description:
              'Automate product video generation from Shopify webhooks. TypeScript SDK, Python client, and CLI examples.',
            url: 'https://agent-media.ai/use-cases/shopify-product-videos',
            dateModified: '2026-04-14',
          }),
        }}
      />
    </div>
  );
}
