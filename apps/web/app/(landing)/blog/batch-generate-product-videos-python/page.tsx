// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal, FileSpreadsheet, Repeat, Webhook, Zap, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'How to Batch Generate 100 Product Videos with Python | agent-media',
  description:
    'A step-by-step Python tutorial for batch generating product videos from a CSV. Install the SDK, read your product data, add concurrency with asyncio, handle failures, and use webhooks.',
  keywords: [
    'batch generate product videos',
    'programmatic video generation python',
    'ai video python sdk',
    'generate videos from csv',
    'batch video generation api',
    'python video automation',
    'agent-media python sdk',
    'product video generator',
    'ai ugc video python',
    'bulk video creation api',
  ],
  openGraph: {
    title: 'How to Batch Generate 100 Product Videos with Python',
    description:
      'Read a CSV, loop through 100 products, generate a UGC-style video for each — all with a single Python script and the agent-media SDK.',
    type: 'article',
    url: 'https://agent-media.ai/blog/batch-generate-product-videos-python',
    publishedTime: '2026-04-14T00:00:00Z',
  },
  alternates: {
    canonical: 'https://agent-media.ai/blog/batch-generate-product-videos-python',
  },
};

/* -- JSON-LD ------------------------------------------------------------ */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Batch Generate 100 Product Videos with Python',
  description:
    'A step-by-step guide to batch generating product videos from a CSV using the agent-media Python SDK.',
  totalTime: 'PT30M',
  estimatedCost: {
    '@type': 'MonetaryAmount',
    currency: 'USD',
    value: '300',
  },
  tool: [
    { '@type': 'HowToTool', name: 'Python 3.8+' },
    { '@type': 'HowToTool', name: 'agent-media Python SDK' },
    { '@type': 'HowToTool', name: 'agent-media API key' },
  ],
  supply: [
    { '@type': 'HowToSupply', name: 'CSV file with product data' },
  ],
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Install the SDK',
      text: 'Install the agent-media Python SDK with pip install agent-media.',
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Prepare your data',
      text: 'Create a CSV file with columns for product_name, description, and actor_slug.',
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Write the generation script',
      text: 'Write a Python script that reads the CSV and calls client.create_video() for each row.',
    },
    {
      '@type': 'HowToStep',
      position: 4,
      name: 'Add concurrency',
      text: 'Use asyncio and the async client to generate multiple videos in parallel.',
    },
    {
      '@type': 'HowToStep',
      position: 5,
      name: 'Handle failures gracefully',
      text: 'Add retry logic, structured logging, and write results to an output CSV.',
    },
    {
      '@type': 'HowToStep',
      position: 6,
      name: 'Add webhooks',
      text: 'Pass a webhook_url to receive results asynchronously instead of polling.',
    },
  ],
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
  datePublished: '2026-04-14T00:00:00Z',
};

/* -- Helpers ------------------------------------------------------------ */

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
      <div className="flex items-center gap-2 border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-3">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-2 font-mono text-xs text-[#6b6b76]">{label}</span>
      </div>
      <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
        {children}
      </pre>
    </div>
  );
}

function StepHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#121212] text-sm font-bold text-white">
        {step}
      </span>
      <h2 className="text-2xl font-bold text-[#121212]">{title}</h2>
    </div>
  );
}

/* -- Page --------------------------------------------------------------- */

export default function BatchGenerateProductVideosPythonPage() {
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
          <span className="ml-auto">~8 min read</span>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          How to Batch Generate 100 Product Videos with Python
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          You have 100 products. Each one needs a UGC-style video ad — a
          real-looking person talking about the product with subtitles, music,
          and a CTA. Doing this manually would take weeks. With the
          agent-media Python SDK you can script the entire process, read your
          product catalog from a CSV, and generate every video
          programmatically.
        </p>
      </header>

      {/* -- Prerequisites ----------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          What you need
        </h2>
        <div className="mt-6 space-y-3">
          {[
            {
              icon: Terminal,
              label: 'Python 3.8+',
              desc: 'Any recent Python version works. The SDK supports 3.8 through 3.13.',
            },
            {
              icon: Zap,
              label: 'An agent-media account',
              desc: 'Sign up at agent-media.ai and grab your API key from the dashboard. It starts with ma_.',
            },
            {
              icon: FileSpreadsheet,
              label: 'Your product data',
              desc: 'A CSV, a database query, a JSON file — anything that gives you product names, descriptions, and the actor you want for each.',
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

      {/* -- Step 1: Install the SDK ------------------------------------ */}
      <section className="mt-16">
        <StepHeading step={1} title="Install the SDK" />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Install the official Python SDK from PyPI. It includes both a
          synchronous and an async client, automatic retries, and typed
          response objects.
        </p>
        <CodeBlock label="terminal">
{`pip install agent-media`}
        </CodeBlock>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Then set your API key as an environment variable:
        </p>
        <CodeBlock label=".env">
{`AGENT_MEDIA_API_KEY=ma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
        </CodeBlock>
      </section>

      {/* -- Step 2: Prepare your data ---------------------------------- */}
      <section className="mt-16">
        <StepHeading step={2} title="Prepare your data" />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Create a CSV with one row per video. At minimum you need a product
          name, a script or description for the actor to read, and the actor
          slug. You can export this from Shopify, your CMS, or a simple
          spreadsheet.
        </p>
        <CodeBlock label="products.csv">
{`product_name,description,actor_slug
Hydra Serum,"I have been using this serum for two weeks and my skin has never looked better. It absorbs instantly and does not leave a greasy feel.",sofia
Protein Pro,"This protein powder mixes clean with no chalky taste. One scoop after my workout and I am good to go.",marcus
Sleep Stack,"I started taking this before bed and I fall asleep in minutes. No groggy mornings either.",aisha
Daily Greens,"I hate vegetables but this tastes like a green apple smoothie. I drink it every morning now.",james
Glow Oil,"Two drops of this and my skin literally glows. My friends keep asking what I changed.",luna`}
        </CodeBlock>
        <p className="mt-4 text-sm text-[#6b6b76]">
          Tip: write scripts in first person, conversational tone. These will
          be spoken by the AI actor as a natural UGC testimonial.
        </p>
      </section>

      {/* -- Step 3: Basic generation script ----------------------------- */}
      <section className="mt-16">
        <StepHeading step={3} title="Write the basic generation script" />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          This script reads your CSV, loops through each row, and calls{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            client.create_video()
          </code>{' '}
          for every product. It waits for each video to finish before moving
          to the next one.
        </p>
        <CodeBlock label="generate.py">
{`import csv
import os
from agent_media import AgentMedia

client = AgentMedia(api_key=os.environ["AGENT_MEDIA_API_KEY"])

with open("products.csv") as f:
    reader = csv.DictReader(f)
    for row in reader:
        video = client.create_video(
            script=row["description"],
            actor=row["actor_slug"],
            subtitle_style="hormozi",
            wait_for_completion=True,
        )
        print(f"[{row['product_name']}] {video.url}")`}
        </CodeBlock>
        <p className="mt-4 text-sm text-[#6b6b76]">
          This works but it is sequential — each video waits for the previous
          one to finish rendering. For 100 products that means a long wait.
          Let us fix that.
        </p>
      </section>

      {/* -- Step 4: Add concurrency ------------------------------------ */}
      <section className="mt-16">
        <StepHeading step={4} title="Add concurrency with asyncio" />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The SDK ships an async client that works with{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            asyncio
          </code>
          . Instead of generating one video at a time, you can fire off
          multiple requests in parallel using{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            asyncio.gather()
          </code>
          . The example below batches requests in groups of 10 to avoid
          overwhelming the API.
        </p>
        <CodeBlock label="generate_async.py">
{`import asyncio
import csv
import os
from agent_media import AsyncAgentMedia

client = AsyncAgentMedia(api_key=os.environ["AGENT_MEDIA_API_KEY"])

BATCH_SIZE = 10


async def generate_video(row: dict) -> dict:
    video = await client.create_video(
        script=row["description"],
        actor=row["actor_slug"],
        subtitle_style="hormozi",
        wait_for_completion=True,
    )
    return {"product": row["product_name"], "url": video.url}


async def main():
    with open("products.csv") as f:
        rows = list(csv.DictReader(f))

    results = []
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_results = await asyncio.gather(
            *[generate_video(row) for row in batch]
        )
        results.extend(batch_results)
        print(f"Batch {i // BATCH_SIZE + 1} complete: {len(batch)} videos")

    for r in results:
        print(f"[{r['product']}] {r['url']}")


asyncio.run(main())`}
        </CodeBlock>
        <p className="mt-4 text-sm text-[#6b6b76]">
          10 videos generating in parallel instead of one at a time. For 100
          products that is 10 batches — dramatically faster than sequential
          processing.
        </p>
      </section>

      {/* -- Step 5: Handle failures ------------------------------------ */}
      <section className="mt-16">
        <StepHeading step={5} title="Handle failures gracefully" />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          When you are generating 100 videos, some will inevitably fail — a
          network hiccup, a transient API error, an invalid actor slug. The
          production-ready version adds retry logic, structured logging, and
          writes results to an output CSV so you know exactly which products
          succeeded and which need a rerun.
        </p>
        <CodeBlock label="generate_robust.py">
{`import asyncio
import csv
import logging
import os
from agent_media import AsyncAgentMedia

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

client = AsyncAgentMedia(api_key=os.environ["AGENT_MEDIA_API_KEY"])

BATCH_SIZE = 10
MAX_RETRIES = 3


async def generate_with_retry(row: dict) -> dict:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            video = await client.create_video(
                script=row["description"],
                actor=row["actor_slug"],
                subtitle_style="hormozi",
                wait_for_completion=True,
            )
            logger.info(f"OK: {row['product_name']}")
            return {
                "product_name": row["product_name"],
                "status": "success",
                "url": video.url,
                "credits": video.credits_cost,
            }
        except Exception as e:
            logger.warning(
                f"Attempt {attempt}/{MAX_RETRIES} failed for "
                f"{row['product_name']}: {e}"
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)

    logger.error(f"FAILED: {row['product_name']}")
    return {
        "product_name": row["product_name"],
        "status": "failed",
        "url": "",
        "credits": 0,
    }


async def main():
    with open("products.csv") as f:
        rows = list(csv.DictReader(f))

    results = []
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        batch_results = await asyncio.gather(
            *[generate_with_retry(row) for row in batch]
        )
        results.extend(batch_results)

    # Write output CSV
    with open("output.csv", "w", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["product_name", "status", "url", "credits"]
        )
        writer.writeheader()
        writer.writerows(results)

    succeeded = sum(1 for r in results if r["status"] == "success")
    logger.info(f"Done: {succeeded}/{len(results)} videos generated")


asyncio.run(main())`}
        </CodeBlock>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The output CSV gives you a clear record of what was generated:
        </p>
        <CodeBlock label="output.csv">
{`product_name,status,url,credits
Hydra Serum,success,https://media.agent-media.ai/videos/abc123.mp4,306
Protein Pro,success,https://media.agent-media.ai/videos/def456.mp4,252
Sleep Stack,failed,,,0`}
        </CodeBlock>
        <p className="mt-4 text-sm text-[#6b6b76]">
          Filter the output for failed rows and rerun just those — no need
          to regenerate the entire batch.
        </p>
      </section>

      {/* -- Step 6: Webhooks ------------------------------------------- */}
      <section className="mt-16">
        <StepHeading step={6} title="Use webhooks instead of polling" />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The examples above use{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            wait_for_completion=True
          </code>
          , which polls the API until each video is ready. For production
          systems you probably want fire-and-forget: submit all 100 jobs,
          then let agent-media POST the results to your server when each
          video finishes.
        </p>
        <CodeBlock label="generate_webhook.py">
{`import csv
import os
from agent_media import AgentMedia

client = AgentMedia(api_key=os.environ["AGENT_MEDIA_API_KEY"])

WEBHOOK_URL = "https://your-app.com/api/video-complete"

with open("products.csv") as f:
    reader = csv.DictReader(f)
    for row in reader:
        job = client.create_video(
            script=row["description"],
            actor=row["actor_slug"],
            subtitle_style="hormozi",
            webhook_url=WEBHOOK_URL,
            metadata={"product_name": row["product_name"]},
        )
        print(f"Queued: {row['product_name']} -> {job.id}")`}
        </CodeBlock>
        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          When each video finishes, agent-media sends a POST to your webhook:
        </p>
        <CodeBlock label="webhook payload">
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
  "metadata": {
    "product_name": "Hydra Serum"
  },
  "timestamp": "2026-04-14T12:34:56Z"
}`}
        </CodeBlock>
        <p className="mt-4 text-sm text-[#6b6b76]">
          The{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            metadata
          </code>{' '}
          field passes through untouched, so you can match each webhook
          callback to the original product in your database.
        </p>
      </section>

      {/* -- Cost breakdown --------------------------------------------- */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-[#121212]" />
          <h2 className="text-2xl font-bold text-[#121212]">
            Cost breakdown: 100 product videos
          </h2>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Video generation costs 30 credits per second of output. A typical
          10-second product video costs 300 credits. Here is what 100 videos
          looks like:
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">Item</th>
                <th className="px-4 py-3 text-right font-mono font-semibold text-[#121212]">Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                { item: 'Videos', value: '100' },
                { item: 'Avg duration', value: '~10 seconds' },
                { item: 'Credits per video', value: '~300' },
                { item: 'Total credits', value: '~30,000' },
                { item: 'Cost (at $0.01/credit)', value: '~$300' },
                { item: 'Cost per video', value: '~$3.00' },
              ].map((row) => (
                <tr
                  key={row.item}
                  className="border-b border-[#d4d4d4] last:border-b-0"
                >
                  <td className="px-4 py-3 text-[#121212]">{row.item}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#6b6b76]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[#6b6b76]">
          Compare that to hiring 100 UGC creators at $50-200 each. The API
          approach is roughly 20-60x cheaper and delivers in minutes, not
          weeks. See the full tier breakdown on the{' '}
          <Link href="/pricing" className="font-semibold text-[#121212] underline">
            pricing page
          </Link>
          .
        </p>
      </section>

      {/* -- TypeScript version ----------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-[#121212]">
          TypeScript equivalent
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Prefer TypeScript? The same batch generation pattern works with the{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm font-mono">
            @agentmedia/sdk
          </code>{' '}
          npm package. Here is the async version with batching:
        </p>
        <CodeBlock label="generate.ts">
{`import { AgentMedia } from "@agentmedia/sdk";
import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY,
});

interface Product {
  product_name: string;
  description: string;
  actor_slug: string;
}

const rows: Product[] = parse(readFileSync("products.csv"), {
  columns: true,
  skip_empty_lines: true,
});

const BATCH_SIZE = 10;
const results: { product: string; url: string }[] = [];

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const videos = await Promise.all(
    batch.map((row) =>
      client.createVideo({
        script: row.description,
        actor: row.actor_slug,
        subtitleStyle: "hormozi",
        waitForCompletion: true,
      })
    )
  );

  for (let j = 0; j < batch.length; j++) {
    results.push({
      product: batch[j].product_name,
      url: videos[j].url,
    });
  }

  console.log(\`Batch \${Math.floor(i / BATCH_SIZE) + 1} done\`);
}

// Write results
const output = results
  .map((r) => \`\${r.product},\${r.url}\`)
  .join("\\n");
writeFileSync("output.csv", "product,url\\n" + output);
console.log(\`Generated \${results.length} videos\`);`}
        </CodeBlock>
      </section>

      {/* -- CTA -------------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-[#d4d4d4] bg-[#ededed] p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Start generating product videos at scale
        </h2>
        <p className="mt-3 text-[#6b6b76]">
          100 products. 100 videos. One Python script. Get your API key and
          start generating today.
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
          <Link href="/blog/automate-ugc-video-ads-api" className="underline hover:text-[#121212]">
            API automation guide
          </Link>
          <Link href="/blog/best-ai-ugc-generator-for-developers" className="underline hover:text-[#121212]">
            SDK comparison
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
            href="/blog/automate-ugc-video-ads-api"
            className="text-[#121212] underline"
          >
            Automate UGC Video Ads with the API
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
            href="/blog/mcp-server-ai-video-generation"
            className="text-[#121212] underline"
          >
            MCP Server for AI Video Generation
          </Link>
        </p>
      </footer>
    </article>
  );
}
