// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'Automate E-commerce Video Ads with the SDK | agent-media',
  description:
    'Generate product videos programmatically. Python SDK, TypeScript webhooks, CSV batch generation, and product image B-roll. Build video pipelines for your e-commerce catalog.',
  keywords: [
    'ecommerce video api',
    'product video automation',
    'ai product video generation',
    'e-commerce video sdk',
    'product video pipeline',
    'batch video generation api',
    'shopify video webhook',
    'product image B-roll api',
    'programmatic video generation',
    'e-commerce video ads sdk',
  ],
  openGraph: {
    title: 'Automate E-commerce Video Ads with the SDK',
    description:
      'Generate product videos programmatically. Python SDK, TypeScript webhooks, CSV batch generation. Build video pipelines for your catalog.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/ecommerce',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Automate E-commerce Video Ads with the SDK | agent-media',
    description:
      'Build product video pipelines with Python or TypeScript. Batch generate from your catalog. ~$3 per video.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/ecommerce',
  },
};

export default function EcommercePage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Use Case
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Automate E-commerce Video Ads with the SDK
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Your product catalog has hundreds of SKUs. Each one needs video
            for product pages, Meta Ads, and TikTok. Hiring creators does not
            scale.{' '}
            <strong className="text-[#121212]">agent-media</strong> gives you
            a Python SDK, a TypeScript client, and a CLI to generate UGC-style
            product videos programmatically. Pass a script, an actor, and a
            product image. Get a finished mp4 back. ~$3 per video.{' '}
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

      {/* Python SDK */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Python SDK: Generate Videos from Your Product Catalog
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Read products from a database or CSV, generate a video for each
            one. This example loops through a product table and creates
            UGC videos with product images as B-roll.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                generate_catalog_videos.py
              </span>
            </div>
            <div className="p-5 font-mono text-sm">
              <p className="text-[#6b6b76]">
                <span className="text-purple-600">import</span> csv
              </p>
              <p className="text-[#6b6b76]">
                <span className="text-purple-600">from</span> agent_media{' '}
                <span className="text-purple-600">import</span> AgentMedia
              </p>
              <p className="mt-3 text-[#6b6b76]">
                client = AgentMedia(api_key=<span className="text-green-700">&quot;your-api-key&quot;</span>)
              </p>
              <p className="mt-3 text-[#6b6b76]"># Read products from CSV</p>
              <p className="text-[#6b6b76]">
                <span className="text-purple-600">with</span> open(<span className="text-green-700">&quot;products.csv&quot;</span>) <span className="text-purple-600">as</span> f:
              </p>
              <p className="text-[#6b6b76]">
                {'    '}products = list(csv.DictReader(f))
              </p>
              <p className="mt-3 text-[#6b6b76]">
                <span className="text-purple-600">for</span> product <span className="text-purple-600">in</span> products:
              </p>
              <p className="text-[#6b6b76]">
                {'    '}video = client.ugc.create(
              </p>
              <p className="text-[#6b6b76]">
                {'        '}script=product[<span className="text-green-700">&quot;script&quot;</span>],
              </p>
              <p className="text-[#6b6b76]">
                {'        '}actor=<span className="text-green-700">&quot;sofia&quot;</span>,
              </p>
              <p className="text-[#6b6b76]">
                {'        '}product_image=product[<span className="text-green-700">&quot;image_url&quot;</span>],
              </p>
              <p className="text-[#6b6b76]">
                {'        '}broll=<span className="text-purple-600">True</span>,
              </p>
              <p className="text-[#6b6b76]">
                {'        '}sync=<span className="text-purple-600">True</span>,
              </p>
              <p className="text-[#6b6b76]">{'    '})</p>
              <p className="text-[#6b6b76]">
                {'    '}print(f<span className="text-green-700">&quot;{'{'}product[&apos;name&apos;]{'}'}: {'{'}video.url{'}'}&quot;</span>)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TypeScript Webhooks */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            TypeScript: Trigger from E-commerce Webhooks
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            Wire up a Shopify or WooCommerce webhook so every new product
            automatically gets a video. This example handles a{' '}
            <code className="bg-purple-50 px-1 text-purple-700">products/create</code>{' '}
            webhook and queues a video generation job.
          </p>

          <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
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
                <span className="text-purple-600">import</span> {'{ '}AgentMedia{' }'} <span className="text-purple-600">from</span> <span className="text-green-700">&quot;agent-media&quot;</span>;
              </p>
              <p className="mt-3 text-[#6b6b76]">
                <span className="text-purple-600">const</span> client = <span className="text-purple-600">new</span> AgentMedia({'{ '}apiKey: process.env.AGENT_MEDIA_KEY{' }'});
              </p>
              <p className="mt-3 text-[#6b6b76]">
                <span className="text-purple-600">export async function</span> handleProductCreated(product: {'{'}{' '}
              </p>
              <p className="text-[#6b6b76]">
                {'  '}name: string; description: string; image_url: string;
              </p>
              <p className="text-[#6b6b76]">{'}'}) {'{'}</p>
              <p className="text-[#6b6b76]">
                {'  '}<span className="text-purple-600">const</span> script = <span className="text-green-700">`I just tried ${'{'}product.name{'}'} and it&apos;s amazing. `</span>
              </p>
              <p className="text-[#6b6b76]">
                {'    '}+ <span className="text-green-700">`${'{'}product.description{'}'}`</span>;
              </p>
              <p className="mt-2 text-[#6b6b76]">
                {'  '}<span className="text-purple-600">const</span> video = <span className="text-purple-600">await</span> client.ugc.create({'{'}
              </p>
              <p className="text-[#6b6b76]">{'    '}script,</p>
              <p className="text-[#6b6b76]">
                {'    '}actor: <span className="text-green-700">&quot;sofia&quot;</span>,
              </p>
              <p className="text-[#6b6b76]">
                {'    '}productImage: product.image_url,
              </p>
              <p className="text-[#6b6b76]">
                {'    '}broll: <span className="text-purple-600">true</span>,
              </p>
              <p className="text-[#6b6b76]">{'  '}{'}'});</p>
              <p className="mt-2 text-[#6b6b76]">
                {'  '}<span className="text-purple-600">return</span> video.url;
              </p>
              <p className="text-[#6b6b76]">{'}'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Batch from CSV / Database */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Batch Generation from CSV or Database
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              Most e-commerce catalogs live in a database or a product feed
              CSV. The SDK accepts any iterable of product records. Read from
              Postgres, a Shopify export, or a plain CSV file. Each record
              needs three fields: a script (or product description to
              generate one from), an actor name, and a product image URL or
              local path.
            </p>
            <p>
              The{' '}
              <code className="bg-purple-50 px-1 text-purple-700">--product-image</code>{' '}
              flag (CLI) or{' '}
              <code className="bg-purple-50 px-1 text-purple-700">product_image</code>{' '}
              parameter (SDK) inserts your product photo as a B-roll cutaway
              in the video. The actor speaks to camera, then the video cuts
              to your product image before returning to the actor. No
              separate B-roll shoot required.
            </p>
            <p>
              For large catalogs (500+ SKUs), use the SDK&#39;s async mode.
              Submit all jobs without waiting, then poll for completion or
              register a webhook callback. The platform processes jobs in
              parallel, so 500 videos complete in hours, not days.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Quick Start */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            CLI: Quick One-off Generation
          </h2>
          <p className="mt-3 text-sm text-[#6b6b76]">
            For quick tests or one-off videos, use the CLI directly. No code
            required.
          </p>

          <div className="mt-6 space-y-6">
            <div className="rounded-lg border border-[#d4d4d4] bg-white">
              <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                  terminal
                </span>
              </div>
              <div className="p-5 font-mono text-sm">
                <p className="text-[#6b6b76]"># Install</p>
                <p className="text-[#6b6b76]">
                  <span className="text-[#121212]">$</span> npm install -g
                  agent-media-cli
                </p>
                <p className="text-[#6b6b76]">
                  <span className="text-[#121212]">$</span> agent-media login
                </p>
                <p className="mt-3 text-[#6b6b76]"># Generate a single product video</p>
                <p className="text-[#6b6b76]">
                  <span className="text-[#121212]">$</span> agent-media ugc
                  &quot;This moisturizer changed my skin in two weeks.&quot; \
                </p>
                <p className="text-[#6b6b76]">
                  {'  '}--actor sofia \
                </p>
                <p className="text-[#6b6b76]">
                  {'  '}--product-image ./product.jpg \
                </p>
                <p className="text-[#6b6b76]">
                  {'  '}--broll --sync
                </p>
                <p className="mt-3 text-[#6b6b76]"># Batch generate from CSV</p>
                <p className="text-[#6b6b76]">
                  <span className="text-[#121212]">$</span> while IFS=, read -r
                  name script img; do
                </p>
                <p className="text-[#6b6b76]">
                  {'    '}agent-media ugc &quot;$script&quot; \
                </p>
                <p className="text-[#6b6b76]">
                  {'      '}--actor sofia --product-image &quot;$img&quot; --broll --sync
                </p>
                <p className="text-[#6b6b76]">
                  {'  '}done {'<'} products.csv
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cost Breakdown */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Cost at Scale
          </h2>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Catalog Size
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    Freelancer / Agency
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    <span className="text-purple-600">agent-media SDK</span>
                  </th>
                  <th className="px-5 py-4 text-right font-mono font-semibold text-[#121212]">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { catalog: '10 SKUs', freelancer: '$2,000 - $8,000', am: '~$30', time: '~30 min' },
                  { catalog: '50 SKUs', freelancer: '$10,000 - $40,000', am: '~$150', time: '~2 hrs' },
                  { catalog: '200 SKUs', freelancer: '$40,000 - $160,000', am: '~$600', time: '~8 hrs' },
                  { catalog: '500 SKUs', freelancer: '$100,000+', am: '~$1,500', time: '~20 hrs' },
                  { catalog: 'Revisions', freelancer: 'Extra cost + weeks', am: 'Re-run the script', time: 'Same' },
                ].map((row) => (
                  <tr
                    key={row.catalog}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-5 py-3 text-[#121212]">{row.catalog}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.freelancer}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-purple-700">
                      {row.am}
                    </td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">
                      {row.time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Credits cost 30 per second of video. A 10-second product video uses
            300 credits (~$3). Async batch jobs run in parallel on the platform.{' '}
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
            Why Developers Choose{' '}
            <span className="text-purple-600">agent-media</span>
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Python & TypeScript SDKs',
                desc: 'First-class clients for both languages. Type-safe, async-ready, with full API coverage. pip install agent-media or npm install agent-media.',
              },
              {
                title: 'Product image as B-roll',
                desc: 'Pass --product-image and your product photo appears as a cutaway in the video. No separate media pipeline needed.',
              },
              {
                title: 'Webhook-driven pipelines',
                desc: 'Trigger video generation from Shopify, WooCommerce, or any platform that sends webhooks. New product listed? Video generated automatically.',
              },
              {
                title: 'Batch from CSV or database',
                desc: 'Read your product feed from any source. Loop through records and submit jobs. The platform handles parallelism and retries.',
              },
              {
                title: '200 AI actors',
                desc: 'A/B test different actors on the same product. Programmatically generate variants and let your ad platform pick the winner.',
              },
              {
                title: 'REST API for custom integrations',
                desc: 'Full REST API behind the SDKs. Build custom integrations with any language or platform. OpenAPI spec available.',
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

      {/* Integration Tips */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Integration Patterns
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Shopify webhook pipeline.</strong>{' '}
              Listen for{' '}
              <code className="bg-purple-50 px-1 text-purple-700">products/create</code>{' '}
              and{' '}
              <code className="bg-purple-50 px-1 text-purple-700">products/update</code>{' '}
              events. Extract the product title, description, and featured
              image. Call the SDK to generate a video. Upload the result back
              to the product&#39;s media via the Shopify Admin API.
            </p>
            <p>
              <strong className="text-[#121212]">Nightly batch job.</strong>{' '}
              Query your product database for items without videos. Run a
              Python script as a cron job that generates videos for new SKUs
              overnight. Use async mode for throughput.
            </p>
            <p>
              <strong className="text-[#121212]">A/B testing at scale.</strong>{' '}
              For each product, generate 3 to 5 variants with different actors
              and scripts. Upload all variants to your ad account. Let the ad
              platform&#39;s algorithm optimize for the best-performing creative.
            </p>
            <p>
              <strong className="text-[#121212]">Product image quality.</strong>{' '}
              The B-roll cutaway displays your product photo at full frame.
              Use clean, high-resolution product shots. White background
              images from your store work best.
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
              href="/use-cases/agencies"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Marketing Agencies <ArrowRight className="h-4 w-4" />
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
              'Automate E-commerce Video Ads with the agent-media SDK',
            description:
              'Generate product videos programmatically with Python SDK, TypeScript webhooks, and CLI batch generation. Build video pipelines for your e-commerce catalog.',
            url: 'https://agent-media.ai/use-cases/ecommerce',
            dateModified: '2026-04-14',
          }),
        }}
      />
    </div>
  );
}
