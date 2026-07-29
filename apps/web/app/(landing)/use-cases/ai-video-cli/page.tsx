// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal, Cpu, FolderCode } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'AI Video CLI: Generate UGC Videos from Your Terminal | agent-media',
  description:
    'Generate AI UGC videos from the command line. npm install, one command, finished MP4. Batch generation, CI/CD integration, Claude Code skill. 200 actors, $3 per video.',
  keywords: [
    'ai video cli',
    'generate video from terminal',
    'video generation cli',
    'ugc video command line',
    'ai video tool cli',
    'agent-media cli',
    'video automation terminal',
    'batch video generation',
    'ci cd video generation',
    'programmatic ugc',
  ],
  openGraph: {
    title: 'AI Video CLI: Generate UGC Videos from Your Terminal',
    description:
      'Generate AI UGC videos from the command line. One command, finished MP4. $3 per video.',
    type: 'article',
    url: 'https://agent-media.ai/use-cases/ai-video-cli',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Video CLI with agent-media',
    description:
      'npm install -g agent-media-cli. Generate UGC videos from your terminal.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/use-cases/ai-video-cli',
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

export default function AiVideoCliPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Developer
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            AI Video CLI: Generate UGC Videos from Your Terminal
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Nobody else ships a CLI for AI video generation. <strong className="text-[#121212]">agent-media</strong> gives you{' '}
            <code className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">npm install -g agent-media-cli</code>,
            and you can generate UGC videos without ever opening a browser. Write scripts in your editor, batch-generate
            across actors, pipe output into your CI/CD pipeline.{' '}
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

      {/* Install & Login */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Terminal className="h-6 w-6" />
            Install and Authenticate
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            The CLI is a single npm package. Install it globally and log in with your{' '}
            <strong className="text-[#121212]">agent-media</strong> account. Authentication opens your browser
            once, then stores the token locally.
          </p>
          <div className="mt-6">
            <CodeBlock title="terminal">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> npm install -g agent-media-cli
              </p>
              <p className="mt-1 text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media login
              </p>
              <p className="mt-1 text-green-600">
                Logged in as you@example.com
              </p>
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* First Video */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Generate Your First Video
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            One command. Script, actor, duration, style. The <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">--sync</code> flag
            waits for the video to finish and downloads the MP4 to your current directory.
          </p>
          <div className="mt-6">
            <CodeBlock title="terminal">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media ugc &quot;This changed everything for me. I used to spend hours on content.&quot; \
              </p>
              <p className="text-[#6b6b76]">{'    '}--actor sofia \</p>
              <p className="text-[#6b6b76]">{'    '}--duration 10 \</p>
              <p className="text-[#6b6b76]">{'    '}--style tiktok \</p>
              <p className="text-[#6b6b76]">{'    '}--tone energetic \</p>
              <p className="text-[#6b6b76]">{'    '}--sync</p>
              <p className="mt-2 text-green-600">
                Generating... done (2m 14s)
              </p>
              <p className="text-green-600">
                Saved: ./sofia-tiktok-10s.mp4
              </p>
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* Browse Actors */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Browse Actors and Variants
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            List all 200 actors from the terminal. Each actor has multiple variants with different outfits and backgrounds.
            Use <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">agent-media actor list</code> to browse and{' '}
            <code className="rounded bg-[#f0f0f3] px-1 text-[#121212]">agent-media actor variants</code> to see a specific actor&apos;s looks.
          </p>
          <div className="mt-6">
            <CodeBlock title="terminal">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media actor list
              </p>
              <p className="mt-1 text-[#6b6b76]">
                sofia      female   10 variants
              </p>
              <p className="text-[#6b6b76]">
                marco      male     10 variants
              </p>
              <p className="text-[#6b6b76]">
                emma       female   10 variants
              </p>
              <p className="text-[#6b6b76]">
                ... (200 actors)
              </p>
              <p className="mt-3 text-[#6b6b76]">
                <span className="text-[#121212]">$</span> agent-media actor variants sofia
              </p>
              <p className="mt-1 text-[#6b6b76]">
                variant-1   crop top, apartment background
              </p>
              <p className="text-[#6b6b76]">
                variant-2   tank top, kitchen background
              </p>
              <p className="text-[#6b6b76]">
                variant-3   fitted tee, office background
              </p>
              <p className="text-[#6b6b76]">
                ... (10 variants)
              </p>
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* Batch Generation */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <FolderCode className="h-6 w-6" />
            Batch Generation via Shell Scripting
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Because it runs in the terminal, you can wrap <strong className="text-[#121212]">agent-media</strong> in
            a shell loop. Generate the same script across 5 actors in one shot. Or loop over a file of scripts and actors.
          </p>
          <div className="mt-6">
            <CodeBlock title="batch.sh">
              <pre className="whitespace-pre-wrap text-[#6b6b76]">{`#!/bin/bash
SCRIPT="Stop scrolling. This product changed my morning routine."
ACTORS=("sofia" "marco" "emma" "naomi" "james")

for ACTOR in "\${ACTORS[@]}"; do
  echo "Generating for $ACTOR..."
  agent-media ugc "$SCRIPT" \\
    --actor "$ACTOR" \\
    --duration 10 \\
    --style tiktok \\
    --sync
done

echo "All videos generated."`}</pre>
            </CodeBlock>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Five videos, five different faces, same script. Upload them all to your ad platform and test which actor
            drives the best click-through rate. Total cost: $15 (1,500 credits).
          </p>
        </div>
      </section>

      {/* CI/CD Integration */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            CI/CD Integration
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Run <strong className="text-[#121212]">agent-media</strong> in GitHub Actions, GitLab CI, or any pipeline
            that supports Node.js. Set your API key as a secret, install the CLI, and generate videos on every push or on a schedule.
          </p>
          <div className="mt-6">
            <CodeBlock title=".github/workflows/generate-ugc.yml">
              <pre className="whitespace-pre-wrap text-[#6b6b76]">{`name: Generate UGC Videos
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install -g agent-media-cli

      - run: agent-media login --token \${{ secrets.AGENT_MEDIA_KEY }}

      - run: |
          agent-media ugc "New week, new routine." \\
            --actor sofia --duration 10 --style tiktok --sync

      - uses: actions/upload-artifact@v4
        with:
          name: ugc-videos
          path: "*.mp4"`}</pre>
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* Claude Code Skill */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Cpu className="h-6 w-6" />
            Claude Code Skill Integration
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            <strong className="text-[#121212]">agent-media</strong> works as a Claude Code skill.
            Your AI coding assistant can generate videos directly from the conversation. Write a prompt
            describing the video you want, and Claude calls the CLI under the hood.
          </p>
          <div className="mt-6">
            <CodeBlock title="claude code">
              <p className="text-[#6b6b76]">
                <span className="text-[#121212]">&gt;</span> Generate a 10-second UGC video with Sofia reviewing a
                fitness app. Use the tiktok subtitle style.
              </p>
              <p className="mt-2 text-green-600">
                Running: agent-media ugc &quot;I found this fitness app...&quot; --actor sofia --style tiktok --duration 10 --sync
              </p>
              <p className="text-green-600">
                Video saved: ./sofia-tiktok-10s.mp4
              </p>
            </CodeBlock>
          </div>
          <p className="mt-4 text-sm text-[#6b6b76]">
            This is useful when you want an AI assistant to handle the creative copy and video generation in one step.
            No context-switching between tools.
          </p>
        </div>
      </section>

      {/* CLI Commands Reference */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            CLI Commands Reference
          </h2>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">Command</th>
                  <th className="px-5 py-4 font-semibold text-[#121212]">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { cmd: 'agent-media login', desc: 'Authenticate with your account (opens browser)' },
                  { cmd: 'agent-media login --token KEY', desc: 'Authenticate with an API key (for CI/CD)' },
                  { cmd: 'agent-media ugc "script" --actor NAME', desc: 'Generate a UGC video' },
                  { cmd: 'agent-media actor list', desc: 'List all 200 available actors' },
                  { cmd: 'agent-media actor variants SLUG', desc: 'Show variants for a specific actor' },
                  { cmd: 'agent-media saas-review --saas "Product Name"', desc: 'Generate a SaaS Review video' },
                  { cmd: '--duration 5|10|15', desc: 'Video length in seconds' },
                  { cmd: '--style NAME', desc: 'Subtitle style (tiktok, hormozi, minimal, etc.)' },
                  { cmd: '--tone NAME', desc: 'Voice tone (energetic, calm, confident, dramatic)' },
                  { cmd: '--sync', desc: 'Wait for video and download MP4' },
                ].map((row) => (
                  <tr key={row.cmd} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 font-mono text-[#121212]">{row.cmd}</td>
                    <td className="px-5 py-3 text-[#6b6b76]">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Why agent-media CLI */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Why the <span className="text-purple-600">agent-media</span> CLI
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'Blue ocean',
                desc: 'No other AI video tool has a CLI. If you work in the terminal, this is the only option.',
              },
              {
                title: 'Scriptable',
                desc: 'Wrap it in bash, python, or any language. Loop over actors, scripts, and durations programmatically.',
              },
              {
                title: 'CI/CD native',
                desc: 'Run in GitHub Actions, GitLab CI, or any pipeline. Generate fresh creatives on a schedule.',
              },
              {
                title: 'Same credits',
                desc: 'CLI, API, and dashboard all share the same credit pool. 300 credits per 10-second video.',
              },
              {
                title: 'Claude Code ready',
                desc: 'Works as an AI coding assistant skill. Let Claude write the script and generate the video in one step.',
              },
              {
                title: 'Fast iteration',
                desc: 'Change one flag, hit enter, get a new video. No clicking through menus or waiting for page loads.',
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
              href="/use-cases/ugc-video-api"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Video API <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs/api-reference"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              Full API Reference <ArrowRight className="h-4 w-4" />
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
                {'>'} Install the CLI
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
            headline: 'AI Video CLI: Generate UGC Videos from Your Terminal',
            description:
              'Generate AI UGC videos from the command line. npm install, one command, finished MP4. Batch generation, CI/CD integration. $3 per video.',
            url: 'https://agent-media.ai/use-cases/ai-video-cli',
            dateModified: '2026-04-01',
          }),
        }}
      />
    </div>
  );
}
