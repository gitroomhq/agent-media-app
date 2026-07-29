'use client';

// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WORD_LIMITS: Record<number, number> = {
  5: 12,
  10: 25,
  15: 37,
};

const TEMPLATES = [
  {
    name: 'Hook + Problem + CTA',
    build: (product: string) =>
      `Stop scrolling. If you struggle with ${product}, you need to hear this. I tried everything and nothing worked until now. Link in bio.`,
  },
  {
    name: 'Personal Story',
    build: (product: string) =>
      `Okay so I have been using ${product} for two weeks now. Honestly did not expect much. But the results speak for themselves. You have to try this.`,
  },
  {
    name: 'Controversial Take',
    build: (product: string) =>
      `Unpopular opinion. Most people are doing ${product} completely wrong. Here is what actually works. Trust me, this changed everything for me.`,
  },
  {
    name: 'Before and After',
    build: (product: string) =>
      `Before ${product} I was wasting hours every day. Now I get it done in minutes. Not exaggerating. Let me show you how it works.`,
  },
  {
    name: 'Social Proof',
    build: (product: string) =>
      `Everyone keeps asking me about ${product}. So here is the truth. It actually delivers. I was skeptical too but the results are real. Check it out.`,
  },
];

function trimToWordLimit(text: string, limit: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(' ') + '...';
}

export default function UgcScriptGeneratorPage() {
  const [product, setProduct] = useState('');
  const [duration, setDuration] = useState(10);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [generated, setGenerated] = useState(false);

  const wordLimit = WORD_LIMITS[duration] ?? 25;
  const template = TEMPLATES[templateIndex];
  const rawScript = template.build(product || 'your product');
  const trimmedScript = trimToWordLimit(rawScript, wordLimit);
  const wordCount = trimmedScript.split(/\s+/).filter(Boolean).length;

  function handleGenerate() {
    setGenerated(true);
  }

  function handleShuffle() {
    setTemplateIndex((prev) => (prev + 1) % TEMPLATES.length);
    setGenerated(true);
  }

  return (
    <div>
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#121212]">
            Tool
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            UGC Script Generator
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">
            Writing UGC scripts that fit a 5, 10, or 15-second video is harder than it looks.
            Too many words and the speech sounds rushed. Too few and you waste screen time.
            This tool generates scripts with the right word count for your chosen duration.
            Powered by <strong className="text-[#121212]">agent-media</strong> script templates.{' '}
            <Link
              href="/login"
              className="text-[#121212] underline hover:no-underline"
            >
              Sign up to generate videos
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Generator */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <FileText className="h-6 w-6" />
            Generate a Script
          </h2>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            {/* Inputs */}
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              <div>
                <label
                  htmlFor="product-input"
                  className="text-sm font-semibold text-[#121212]"
                >
                  Product or Topic
                </label>
                <input
                  id="product-input"
                  type="text"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. meal prep app, skincare serum, SaaS tool"
                  className="mt-2 w-full rounded-lg border border-[#d4d4d4] bg-white px-4 py-3 text-sm text-[#121212] placeholder:text-[#6b6b76]/50 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div className="mt-6">
                <label className="text-sm font-semibold text-[#121212]">
                  Video Duration
                </label>
                <div className="mt-3 flex gap-3">
                  {[5, 10, 15].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        duration === d
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-[#d4d4d4] bg-white text-[#6b6b76] hover:border-[#121212]'
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#6b6b76]">
                  Word limit: <strong className="text-[#121212]">{wordLimit} words</strong> for {duration} seconds
                </p>
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  onClick={handleGenerate}
                  className="bg-[#121212] text-white hover:bg-[#333]"
                >
                  Generate Script
                </Button>
                {generated && (
                  <Button
                    onClick={handleShuffle}
                    variant="secondary"
                    className="border-[#d4d4d4] text-[#121212]"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Shuffle Template
                  </Button>
                )}
              </div>
            </div>

            {/* Output */}
            <div className="rounded-lg border border-[#d4d4d4] p-6">
              {generated ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#6b6b76]">
                      Generated Script
                    </p>
                    <span className="rounded bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">
                      {template.name}
                    </span>
                  </div>
                  <div className="mt-4 rounded-lg bg-[#121212]/5 p-5">
                    <p className="text-sm leading-relaxed text-[#121212]">
                      &quot;{trimmedScript}&quot;
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-[#6b6b76]">
                      <strong className="text-[#121212]">{wordCount}</strong> / {wordLimit} words
                    </p>
                    <p className="text-xs text-[#6b6b76]">
                      {duration}s duration
                    </p>
                  </div>
                  <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
                    <p className="text-sm text-purple-700">
                      Ready to turn this into a video? Paste the script into{' '}
                      <strong>agent-media</strong> and pick an actor.
                    </p>
                    <div className="mt-3">
                      <Link href="/login">
                        <Button
                          size="sm"
                          className="bg-purple-600 text-white hover:bg-purple-700"
                        >
                          Generate with agent-media
                        </Button>
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center">
                  <p className="text-sm text-[#6b6b76]">
                    Enter a product or topic and click Generate Script.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Word Count Guide */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Word Count Guide for <span className="text-purple-600">agent-media</span>
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            <strong className="text-[#121212]">agent-media</strong> validates word count before generating.
            If your script is too long for the chosen duration, it gets rejected. This prevents rushed, unnatural speech.
            Here are the limits:
          </p>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-semibold text-[#121212]">Duration</th>
                  <th className="px-5 py-4 text-right font-semibold text-[#121212]">Max Words</th>
                  <th className="px-5 py-4 text-right font-semibold text-[#121212]">Pacing</th>
                  <th className="px-5 py-4 text-right font-semibold text-[#121212]">Cost</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { dur: '5 seconds', words: '12', pacing: '~2.4 words/sec', cost: '~$1.50' },
                  { dur: '10 seconds', words: '25', pacing: '~2.5 words/sec', cost: '~$3.00' },
                  { dur: '15 seconds', words: '37', pacing: '~2.5 words/sec', cost: '~$4.50' },
                ].map((row) => (
                  <tr key={row.dur} className="border-b border-[#d4d4d4] last:border-b-0">
                    <td className="px-5 py-3 text-[#121212]">{row.dur}</td>
                    <td className="px-5 py-3 text-right font-mono text-[#121212]">{row.words}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.pacing}</td>
                    <td className="px-5 py-3 text-right text-[#6b6b76]">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Script Templates */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Script Templates
          </h2>
          <p className="mt-4 text-sm text-[#6b6b76]">
            Every template follows the hook + body + CTA format that works best for short-form video.
            The hook grabs attention in the first 2 seconds. The body delivers the message. The CTA drives action.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t, i) => (
              <div
                key={t.name}
                className="rounded-lg border border-[#d4d4d4] p-4"
              >
                <h3 className="font-semibold text-[#121212]">{t.name}</h3>
                <p className="mt-2 text-xs text-[#6b6b76]">
                  &quot;{trimToWordLimit(t.build('your product'), 15)}&quot;
                </p>
                <button
                  onClick={() => {
                    setTemplateIndex(i);
                    setGenerated(true);
                  }}
                  className="mt-3 text-xs font-medium text-purple-600 hover:underline"
                >
                  Use this template
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tips */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            UGC Script Writing Tips
          </h2>
          <div className="mt-6 space-y-4 text-sm text-[#6b6b76]">
            <p>
              <strong className="text-[#121212]">Start with a hook.</strong> The first sentence decides whether
              someone keeps watching. Questions, bold claims, and pattern interrupts work best. &quot;Stop scrolling&quot;
              is overused but still effective.
            </p>
            <p>
              <strong className="text-[#121212]">Use simple words.</strong> UGC scripts sound spoken, not written.
              Avoid jargon. Short sentences. One idea per sentence. Read it out loud before generating.
            </p>
            <p>
              <strong className="text-[#121212]">End with action.</strong> Tell the viewer what to do: &quot;Link in
              bio,&quot; &quot;Check it out,&quot; &quot;Try it free.&quot; A video without a CTA is a wasted ad spend.
            </p>
            <p>
              <strong className="text-[#121212]">Test multiple versions.</strong> With <strong>agent-media</strong>,
              you can generate 5 versions of the same script with different actors in under 10 minutes. Let the data
              tell you which hook works best.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-8 text-center">
            <h2 className="text-2xl font-bold text-[#121212]">
              Turn scripts into videos
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-[#6b6b76]">
              <strong className="text-[#121212]">agent-media</strong> takes your script, pairs it with an AI actor,
              adds lip-sync, subtitles, and music, and delivers a finished MP4. From terminal, API, or dashboard.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-[#121212] text-white hover:bg-[#333]"
                >
                  {'>'} Start Generating Videos
                </Button>
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
              >
                View Pricing <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-links */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">
            Related Pages
          </h2>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/tools/ugc-cost-calculator"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Cost Calculator <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/ugc-video-api"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              UGC Video API <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/use-cases/ai-video-cli"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              AI Video CLI <ArrowRight className="h-4 w-4" />
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

          <p className="mt-8 text-xs text-[#6b6b76]">
            Last updated: April 2026
          </p>
        </div>
      </section>
    </div>
  );
}
