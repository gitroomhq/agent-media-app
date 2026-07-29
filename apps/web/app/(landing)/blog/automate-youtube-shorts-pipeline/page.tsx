// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    '5 UGC Video Styles That Convert (And How to Generate Them)',
  description:
    'Discover the 5 UGC subtitle styles in agent-media — Hormozi, Bold, Karaoke, TikTok, and Minimal — and learn which style converts best for your content type.',
  keywords: [
    'UGC video styles',
    'best subtitle style for ads',
    'hormozi subtitle style',
    'UGC ad format',
    'AI UGC styles',
    'agent-media subtitle styles',
    'UGC video generation',
  ],
  openGraph: {
    title:
      '5 UGC Video Styles That Convert (And How to Generate Them)',
    description:
      'Discover the 5 UGC subtitle styles in agent-media and learn which converts best for your content type.',
    type: 'article',
    url: 'https://agent-media.ai/blog/automate-youtube-shorts-pipeline',
    publishedTime: '2026-03-06T00:00:00Z',
  },
  alternates: {
    canonical:
      'https://agent-media.ai/blog/automate-youtube-shorts-pipeline',
  },
};

/* -- JSON-LD --------------------------------------------------------- */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  name: '5 UGC Video Styles That Convert (And How to Generate Them)',
  description:
    'A breakdown of the 5 UGC subtitle styles available in agent-media, with guidance on which style converts best for different content types and audiences.',
  datePublished: '2026-03-06T00:00:00Z',
  author: {
    '@type': 'Organization',
    name: 'agent-media',
  },
};

/* -- Page ------------------------------------------------------------ */

export default function AutomateYoutubeShortsPage() {
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
          <time dateTime="2026-03-06">March 6, 2026</time>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          5 UGC Video Styles That Convert (And How to Generate Them)
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          Not all UGC is created equal. The subtitle style, pacing, and visual
          treatment of your video can make or break its performance.
          agent-media&apos;s UGC pipeline includes 5 distinct styles — each
          designed for a different content type and audience. This guide breaks
          down every style, shows you when to use it, and gives you the exact
          CLI command to generate it.
        </p>
      </header>

      {/* -- Style 1: Hormozi ---------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          1. Hormozi — Bold Animated Word Highlights
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Inspired by Alex Hormozi&apos;s viral content format. Each key word
          pops with color emphasis and animated highlighting. The energy is
          high, the pacing is fast, and every sentence feels like a punch.
          This style forces attention because the viewer&apos;s eye is
          constantly drawn to the next highlighted word.
        </p>
        <p className="mt-3 text-[#6b6b76] leading-relaxed">
          <span className="font-semibold text-[#121212]">Best for:</span>{' '}
          Business and coaching content, product pitches, educational content,
          motivational clips, and anything where you need to hold attention
          through sheer energy.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">
              Terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`$ agent-media ugc -s "Stop scrolling. This one tip made me $47k last month." --style hormozi`}
          </pre>
        </div>
      </section>

      {/* -- Style 2: Bold ------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          2. Bold — Clean, Professional Captions
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Large centered captions with a clean, professional look. No
          animations, no distractions — just crisp text that communicates
          authority. The Bold style lets the content speak for itself while
          ensuring every word is readable on any screen size.
        </p>
        <p className="mt-3 text-[#6b6b76] leading-relaxed">
          <span className="font-semibold text-[#121212]">Best for:</span>{' '}
          SaaS demos, corporate content, professional services, B2B marketing,
          and any context where credibility matters more than flash.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">
              Terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`$ agent-media ugc -s "Here's how our platform reduced churn by 34% in 90 days." --style bold`}
          </pre>
        </div>
      </section>

      {/* -- Style 3: Karaoke ---------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          3. Karaoke — Word-by-Word Sync
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Each word highlights exactly as it is spoken, like karaoke lyrics.
          The viewer follows along word by word, which creates a hypnotic
          reading experience. This style excels at emotional pacing — the
          viewer absorbs the message at exactly the speed you intended.
        </p>
        <p className="mt-3 text-[#6b6b76] leading-relaxed">
          <span className="font-semibold text-[#121212]">Best for:</span>{' '}
          Music content, storytelling, emotional content, testimonials,
          personal narratives, and anything where timing and rhythm matter.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">
              Terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`$ agent-media ugc -s "I never thought I'd say this, but it changed everything." --style karaoke`}
          </pre>
        </div>
      </section>

      {/* -- Style 4: TikTok ----------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          4. TikTok — Trendy with Emoji Accents
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The native language of short-form social. Trendy formatting, dynamic
          positioning, and emoji accents that match the energy of the content.
          This style feels like it was made by a creator who lives on the
          platform — because the formatting mirrors what performs best in the
          For You page algorithm.
        </p>
        <p className="mt-3 text-[#6b6b76] leading-relaxed">
          <span className="font-semibold text-[#121212]">Best for:</span>{' '}
          Gen Z audiences, lifestyle content, casual product reviews, day-in-my-life
          content, hauls, and anything targeting a younger demographic.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">
              Terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`$ agent-media ugc -s "OK but this skincare routine is actually insane." --style tiktok`}
          </pre>
        </div>
      </section>

      {/* -- Style 5: Minimal ---------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          5. Minimal — Clean and Unobtrusive
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Small, clean captions positioned at the bottom of the frame. The
          text is there for accessibility and clarity, but it never competes
          with the visual content. This is the style you choose when the face,
          the product, or the footage should be the star — not the subtitles.
        </p>
        <p className="mt-3 text-[#6b6b76] leading-relaxed">
          <span className="font-semibold text-[#121212]">Best for:</span>{' '}
          Premium brands, luxury products, serious topics, real estate,
          fashion, and any content where visual elegance matters.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">
              Terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`$ agent-media ugc -s "Crafted from Italian leather. Designed to last a lifetime." --style minimal`}
          </pre>
        </div>
      </section>

      {/* -- Which style should you use? ----------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Which style should you use?
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The right style depends on your content type and audience. Here is a
          quick decision table:
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Content Type
                </th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Recommended Style
                </th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Why
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  content: 'Business / coaching',
                  style: 'hormozi',
                  why: 'High energy holds attention, word highlights emphasize key points',
                },
                {
                  content: 'SaaS / B2B demo',
                  style: 'bold',
                  why: 'Professional and readable, builds trust with decision-makers',
                },
                {
                  content: 'Testimonial / story',
                  style: 'karaoke',
                  why: 'Word-by-word sync creates emotional connection',
                },
                {
                  content: 'Lifestyle / Gen Z',
                  style: 'tiktok',
                  why: 'Native platform feel, emoji accents match audience expectations',
                },
                {
                  content: 'Luxury / premium brand',
                  style: 'minimal',
                  why: 'Unobtrusive captions let the visual content shine',
                },
                {
                  content: 'Product pitch',
                  style: 'hormozi',
                  why: 'Animated highlights drive urgency and action',
                },
                {
                  content: 'Educational explainer',
                  style: 'bold',
                  why: 'Clean readability for information-dense content',
                },
                {
                  content: 'Music / creative',
                  style: 'karaoke',
                  why: 'Rhythmic word sync matches musical pacing',
                },
              ].map((row) => (
                <tr
                  key={row.content}
                  className="border-b border-[#d4d4d4] last:border-b-0"
                >
                  <td className="px-4 py-3 text-[#121212]">{row.content}</td>
                  <td className="px-4 py-3 font-mono text-[#121212]">
                    {row.style}
                  </td>
                  <td className="px-4 py-3 text-[#6b6b76]">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -- A/B testing with different styles ----------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          A/B testing with different styles
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The fastest way to find your winning style is to test. Generate the
          same script in multiple styles, post them as separate videos, and
          measure which one performs. With agent-media, switching styles is
          just a flag change — same script, same face, different output.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 font-mono text-xs text-[#6b6b76]">
              Terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm text-[#6b6b76]">
{`# Generate the same script in all 5 styles
SCRIPT="This product changed my morning routine forever."

agent-media ugc -s "$SCRIPT" --style hormozi -o test-hormozi.mp4
agent-media ugc -s "$SCRIPT" --style bold    -o test-bold.mp4
agent-media ugc -s "$SCRIPT" --style karaoke -o test-karaoke.mp4
agent-media ugc -s "$SCRIPT" --style tiktok  -o test-tiktok.mp4
agent-media ugc -s "$SCRIPT" --style minimal -o test-minimal.mp4`}
          </pre>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Post all five versions to the same platform at similar times. After
          48 hours, compare watch time, completion rate, and engagement. You
          will almost always find that one style dramatically outperforms the
          others for your specific niche. Once you have that data, standardize
          on the winner and iterate from there.
        </p>
      </section>

      {/* -- Combining styles with the right face -------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Combining styles with the right face
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The subtitle style is only half the equation. The face photo you
          use — and how it pairs with the style — determines whether the video
          feels authentic or off. Here are the combinations that work:
        </p>
        <div className="mt-6 space-y-4">
          {[
            {
              combo: 'Professional headshot + bold',
              result:
                'Corporate and authoritative. Perfect for LinkedIn, B2B ads, and SaaS marketing. The clean captions match the polished photo.',
            },
            {
              combo: 'Casual selfie + tiktok',
              result:
                'Authentic and relatable. Feels like a real person sharing a genuine opinion. The emoji accents and dynamic positioning reinforce the casual energy.',
            },
            {
              combo: 'High-energy photo + hormozi',
              result:
                'Maximum impact. The animated word highlights paired with an expressive face create urgency. Great for coaches, course sellers, and product launches.',
            },
            {
              combo: 'Neutral expression + karaoke',
              result:
                'Draws focus to the words. The face provides presence while the word-by-word sync carries the emotional weight. Ideal for testimonials.',
            },
            {
              combo: 'Elegant portrait + minimal',
              result:
                'Premium feel. The small, unobtrusive captions let the visual quality of the photo set the tone. Use for luxury brands and high-end services.',
            },
          ].map((item) => (
            <div
              key={item.combo}
              className="rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <p className="font-mono text-sm font-semibold text-[#121212]">
                {item.combo}
              </p>
              <p className="mt-2 text-sm text-[#6b6b76]">{item.result}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Cost section -------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          What does it cost?
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          All five styles cost the same: 30 credits per second of output
          video. There is no premium charge for Hormozi or Karaoke — the style
          flag does not affect pricing. Here is what that looks like in
          practice:
        </p>
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-[#d4d4d4] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-sm font-semibold text-[#121212]">
                5-second video
              </p>
              <p className="font-mono text-sm text-[#6b6b76]">150 credits</p>
            </div>
          </div>
          <div className="rounded-lg border border-[#d4d4d4] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-sm font-semibold text-[#121212]">
                10-second video
              </p>
              <p className="font-mono text-sm text-[#6b6b76]">300 credits</p>
            </div>
          </div>
          <div className="rounded-lg border border-[#d4d4d4] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-sm font-semibold text-[#121212]">
                15-second video
              </p>
              <p className="font-mono text-sm text-[#6b6b76]">450 credits</p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          On the Creator plan ($39/month, 3,900 credits), a 10-second video
          costs 300 credits — meaning you can generate roughly 13 UGC videos
          per month. If you are running A/B tests across all 5 styles, that
          gives you 2-3 full test cycles with unique scripts. The Pro plan
          ($69/month, 6,900 credits) gives you about 23 videos, and Pro Plus
          ($129/month, 12,900 credits) gives you 43.
        </p>
      </section>

      {/* -- CTA ----------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Start creating
        </h2>
        <p className="mt-3 text-[#6b6b76]">
          Five styles. One command. Pick your look, generate your video, and
          ship it. Plans start at $39/month.
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-[#f0f0f3] px-6 py-3 font-mono text-sm">
          <span className="text-[#121212]">$</span>{' '}
          <span className="text-[#6b6b76]">
            agent-media ugc -s &quot;Your script here&quot; --style hormozi
          </span>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/login">
            <Button size="lg">
              <Terminal className="mr-2 h-4 w-4" />
              Get Started
            </Button>
          </Link>
          <Link href="/pricing">
            <Button variant="secondary" size="lg">
              View Pricing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </article>
  );
}
