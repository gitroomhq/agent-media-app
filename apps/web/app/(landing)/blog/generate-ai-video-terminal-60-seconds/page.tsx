// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Rewritten June 2026 for the v2 surface (selfie / character / subtitle
// generators). The old version described the retired v1 pipeline
// (TTS, B-roll stages) and a --face flag that no longer exists.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'How to Create UGC Videos with AI in 60 Seconds',
  description:
    'Go from a script to a published UGC video in one command. Describe the actor, paste the script, set the scene — AgentMedia generates a realistic 9:16 selfie video and posts it, with captions on request.',
  keywords: [
    'AI UGC video',
    'create UGC with AI',
    'AI selfie video',
    'UGC video generator',
    'agent-media CLI',
    'AI video creator',
    'UGC automation',
  ],
  openGraph: {
    title: 'How to Create UGC Videos with AI in 60 Seconds',
    description:
      'Script in, published UGC video out — one command with AgentMedia.',
    type: 'article',
    url: 'https://agent-media.ai/blog/generate-ai-video-terminal-60-seconds',
    publishedTime: '2026-06-10T00:00:00Z',
  },
  alternates: {
    canonical:
      'https://agent-media.ai/blog/generate-ai-video-terminal-60-seconds',
  },
};

/* -- JSON-LD --------------------------------------------------------- */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Create UGC Videos with AI in 60 Seconds',
  description:
    'Use the AgentMedia CLI to generate a realistic UGC selfie video from a text description, then optionally caption it and auto-publish.',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Describe your actor',
      text: 'Write one sentence describing the person — no photo or filming needed. AgentMedia generates a realistic, consistent actor.',
    },
    {
      '@type': 'HowToStep',
      name: 'Write the script and scene',
      text: 'Give the line the actor says and a one-line scene direction (where they are, what they hold, what they do).',
    },
    {
      '@type': 'HowToStep',
      name: 'Run agent-media selfie',
      text: 'One CLI command generates the character, storyboard, and final 9:16 video at 5, 10, or 15 seconds.',
    },
    {
      '@type': 'HowToStep',
      name: 'Optionally caption, then publish',
      text: 'Want captions? Burn styled subtitles with the subtitle generator on request, then auto-publish to TikTok, Instagram, and YouTube.',
    },
  ],
};

/* -- Page ------------------------------------------------------------ */

export default function GenerateAiVideoTerminalPage() {
  return (
    <article className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* -- Header -------------------------------------------------- */}
      <header>
        <div className="flex items-center gap-3 text-sm text-[#6b6b76]">
          <Link href="/blog" className="hover:text-[#121212]">
            Blog
          </Link>
          <span>/</span>
          <time dateTime="2026-06-10">June 10, 2026</time>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          How to Create UGC Videos with AI in 60 Seconds
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          UGC converts better than studio content because it feels like a real
          person talking to camera. The problem has always been production:
          $150–500 per creator video, a week of turnaround, and briefs that
          come back wrong. AgentMedia collapses all of that into one command —
          you describe the actor and the line, it returns a realistic,
          ready-to-post 9:16 video. No photo, no actors, no editor.
        </p>
      </header>

      {/* -- How it works --------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          How the selfie generator works
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The selfie generator is AgentMedia&apos;s core product. From a text
          description it builds the entire video in three stages:
        </p>
        <ol className="mt-6 space-y-3">
          {[
            {
              step: 'Actor generation',
              desc: 'A realistic person is generated from your one-line description, with a character sheet that locks their look.',
            },
            {
              step: 'Photographic storyboard',
              desc: 'A wireframe board plans the framing, gesture, and scene action so the delivery matches your direction.',
            },
            {
              step: 'Video render',
              desc: 'The final 9:16 video is generated at 5, 10, or 15 seconds — natural motion, expressions, and delivery.',
            },
          ].map((item, i) => (
            <li key={item.step} className="flex items-start gap-3 text-[#6b6b76]">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#121212] text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <strong className="text-[#121212]">{item.step}.</strong>{' '}
                {item.desc}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          You never pick a model or touch a timeline. Script and direction in,
          finished video out.
        </p>
      </section>

      {/* -- Step 1 ---------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Step 1: Describe your actor
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          One sentence is enough. Age, look, energy — whatever matters for your
          audience. No photo upload, no filming, no licensing conversation.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <div className="p-5 font-mono text-sm leading-relaxed text-[#6b6b76]">
            <p>&quot;25yo asian woman, long wavy dark hair, soft smile&quot;</p>
          </div>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Running a campaign? Persist the actor once as a character and every
          video stays on-model:{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            agent-media character
          </code>{' '}
          returns a{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            char_xxxxxxxxxx
          </code>{' '}
          id you can reuse in every generation — same face, every variant.
        </p>
      </section>

      {/* -- Step 2 ---------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Step 2: Write the script and the scene
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Two inputs: what the actor says, and what is happening in the frame.
          The scene direction is what makes the output feel like real UGC
          rather than a floating talking head.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <div className="p-5 font-mono text-sm leading-relaxed text-[#6b6b76]">
            <p>script: &quot;I keep getting DMs about my hair oil routine&quot;</p>
            <p className="mt-2">
              scene: &quot;standing by a bright vanity, showing a small amber
              hair-oil bottle and scrunching one curl mid-line&quot;
            </p>
          </div>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Keep scripts conversational and under ~30 words for a 10-second
          video. Hooks that work on TikTok work here: start mid-story, name
          something specific, skip the brand intro.
        </p>
      </section>

      {/* -- Step 3 ---------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Step 3: Run one command
        </h2>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <div className="space-y-1 p-5 font-mono text-sm">
            <p className="text-[#6b6b76]">
              <span className="text-[#121212]">$</span> agent-media selfie \
            </p>
            <p className="pl-4 text-[#6b6b76]">
              --description &quot;25yo asian woman, long wavy dark hair, soft smile&quot; \
            </p>
            <p className="pl-4 text-[#6b6b76]">
              --script &quot;I keep getting DMs about my hair oil routine&quot; \
            </p>
            <p className="pl-4 text-[#6b6b76]">
              --scene-action &quot;standing by a bright vanity, showing a small amber hair-oil bottle&quot; \
            </p>
            <p className="pl-4 text-[#6b6b76]">--duration 10</p>
            <p className="mt-3 text-[#6b6b76]">Generating actor + character sheet...</p>
            <p className="text-[#6b6b76]">Planning storyboard...</p>
            <p className="text-[#6b6b76]">Rendering 9:16 video (10s)...</p>
            <p className="mt-2 text-[#121212]">✓ ugc-final.mp4 — ready to post</p>
          </div>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The same generation runs from wherever you work: the web app, the
          REST API, the TypeScript or Python SDK — or inside Claude, Cursor,
          and n8n via the{' '}
          <Link href="/blog/mcp-server-ai-video-generation" className="text-[#121212] underline">
            MCP server
          </Link>
          . Output is 1080p vertical, no watermark.
        </p>
      </section>

      {/* -- Step 4 ---------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Step 4: Optionally caption it, then publish
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Captions are optional — ask for them when you want them. Most viewers
          watch with sound off, so they often carry the message. When requested,
          the subtitle generator burns styled, word-synced captions onto any
          video — it transcribes automatically, or you can pass your own
          transcript:
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <div className="space-y-1 p-5 font-mono text-sm">
            <p className="text-[#6b6b76]">
              <span className="text-[#121212]">$</span> agent-media subtitle ugc-final.mp4
            </p>
            <p className="text-[#6b6b76]">
              <span className="text-[#121212]">$</span> agent-media publish --channels tiktok,instagram,youtube
            </p>
          </div>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Publishing is built in — schedule it or fire-and-forget to TikTok,
          Instagram, YouTube, and X. Your agent can run the whole loop: write
          the post copy, generate the video, post it.
        </p>
      </section>

      {/* -- Cost ------------------------------------------------------ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">What it costs</h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Plans are credit-based and start at $39/month (Creator, 3,900
          credits); a 10-second selfie video costs a few hundred credits, so a
          single subscription covers a steady posting schedule that would cost
          thousands of dollars with hired creators. Exact per-generator pricing
          is on the{' '}
          <Link href="/pricing" className="text-[#121212] underline">
            pricing page
          </Link>
          . Videos come in 5, 10, and 15-second durations — and the fastest way
          to find your winning ad is to generate five hooks and let the
          algorithm tell you which one works.
        </p>
      </section>

      {/* -- CTA ----------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Ready to create your first UGC video?
        </h2>
        <p className="mt-3 text-[#6b6b76]">
          One description, one command, one published video — in about a
          minute.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-[#f0f0f3] px-6 py-3 font-mono text-sm">
          <span className="text-[#121212]">$</span>{' '}
          <span className="text-[#6b6b76]">
            npm i -g agent-media-cli && agent-media login
          </span>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/login">
            <Button size="lg">
              <Terminal className="mr-2 h-4 w-4" />
              Get Started
            </Button>
          </Link>
          <Link href="/how-to">
            <Button variant="secondary" size="lg">
              Browse UGC Guides <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </article>
  );
}
