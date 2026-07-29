// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Tier-1 money page. Target keywords (Semrush US, June 2026):
// "ai ugc ads" (320/mo, arcads #1), "ugc ads ai" (260/mo),
// "ugc video ads" (170/mo), "ugc ads" (1,000/mo, secondary).

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI UGC Ads — Generate & Auto-Publish Video Ads at Scale | AgentMedia',
  description:
    'Create AI UGC video ads that look like real creator content — and auto-publish them to TikTok, Instagram, and YouTube. Test 20 ad angles before lunch. From $39/mo.',
  alternates: { canonical: 'https://agent-media.ai/ai-ugc-ads' },
  openGraph: {
    title: 'AI UGC Ads — AgentMedia',
    description:
      'Generate UGC-style video ads and auto-publish to every channel. Test 20 angles before lunch.',
    type: 'website',
    url: 'https://agent-media.ai/ai-ugc-ads',
  },
};

const FAQS = [
  {
    q: 'What are AI UGC ads?',
    a: 'Video ads that look like authentic creator content — a real-seeming person talking to camera about a product — generated entirely by AI. They run as TikTok Spark Ads, Instagram Reels ads, and YouTube Shorts placements, where polished studio creative underperforms.',
  },
  {
    q: 'Why do UGC-style ads outperform studio creative?',
    a: 'Feed-native content earns more watch time, and watch time drives delivery. UGC-style ads typically see lower CPMs and higher hook rates than produced spots on TikTok and Reels. The catch has always been production volume — which is the part AgentMedia automates.',
  },
  {
    q: 'How fast can I test new ad angles?',
    a: 'Each video takes about a minute to generate. Write five hooks, generate five variants, push them live the same morning. With the API or CLI you can batch-generate from a CSV of hooks and let your agent iterate on whatever wins.',
  },
  {
    q: 'Does AgentMedia publish the ads too?',
    a: 'It auto-publishes organic posts to TikTok, Instagram, YouTube, and X — useful for creative testing via Spark Ads. For paid campaigns, download the finished MP4 (no watermark) and upload it to your ads manager.',
  },
  {
    q: 'Can I keep the same actor across a campaign?',
    a: 'Yes. Persist a character once and reference it in every generation — the face, energy, and style stay consistent across all your ad variants.',
  },
];

function jsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });
}

const STEPS = [
  {
    title: 'Write hooks, not briefs',
    body: 'Five first-lines beat one polished script. "I keep getting DMs about..." outperforms "Introducing our new..." every time.',
  },
  {
    title: 'Generate a variant per hook',
    body: 'One CLI command or API call per variant. Same character, different opening — about a minute each.',
  },
  {
    title: 'Test, kill, scale',
    body: 'Push variants as organic posts or Spark Ads, kill the losers in 48 hours, and regenerate around the winning angle.',
  },
];

export default function AiUgcAdsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <article>
        <h1 className="text-4xl font-bold tracking-tight">AI UGC Ads</h1>
        <p className="mt-5 text-lg leading-relaxed text-neutral-300">
          The teams winning on TikTok and Reels right now test 15–20 creative variants per product.
          At $150–500 per creator video, almost nobody can afford that — which is exactly why
          generated UGC ads work. AgentMedia produces realistic creator-style video ads from a
          script in about a minute each, keeps the same AI actor across every variant, and
          publishes straight to your channels.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/login" className="rounded-full bg-white px-6 py-3 font-medium text-black">
            Make your first ad
          </Link>
          <Link
            href="/ai-ugc-video-generator"
            className="rounded-full border border-neutral-600 px-6 py-3 font-medium text-neutral-200"
          >
            See how generation works
          </Link>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">The creative-testing playbook</h2>
        <ol className="mt-4 space-y-6">
          {STEPS.map((s, i) => (
            <li key={i}>
              <p className="font-medium">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-neutral-300">{s.body}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-14 text-2xl font-semibold">Batch 20 variants from one file</h2>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-sm text-neutral-300">
          <code>{`# hooks.csv: one ad hook per line
while IFS= read -r hook; do
  agent-media selfie \\
    --character char_a1b2c3d4e5 \\
    --script "$hook" \\
    --scene-action "holding the product to camera, casual bedroom light" \\
    --duration 10
done < hooks.csv`}</code>
        </pre>
        <p className="mt-3 text-neutral-300">
          Or do the same through the{' '}
          <Link href="/use-cases/ugc-video-api" className="underline">REST API</Link> from your own
          pipeline — webhook back when each render finishes.
        </p>

        <h2 className="mt-14 text-2xl font-semibold">Frequently asked questions</h2>
        <dl className="mt-4 space-y-6">
          {FAQS.map((f) => (
            <div key={f.q}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-neutral-300">{f.a}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-14 rounded-2xl border border-neutral-700 bg-neutral-900/60 p-8 text-center">
          <h2 className="text-2xl font-semibold">Test 20 angles before lunch</h2>
          <p className="mt-2 text-neutral-300">
            Generate, publish, and iterate UGC ads from one command — plans from $39/mo, no
            watermarks.
          </p>
          <Link href="/login" className="mt-6 inline-block rounded-full bg-white px-6 py-3 font-medium text-black">
            Get started free
          </Link>
        </section>

        <p className="mt-10 text-sm text-neutral-400">
          Related: <Link href="/best" className="underline">Best UGC tools compared</Link> ·{' '}
          <Link href="/how-to" className="underline">UGC video guides</Link> ·{' '}
          <Link href="/use-cases/tiktok-ugc-ads" className="underline">TikTok UGC ads</Link>
        </p>
      </article>
    </main>
  );
}
