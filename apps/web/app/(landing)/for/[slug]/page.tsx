// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FOR_VERTICALS, findVertical, type ForVertical } from '../_data';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return FOR_VERTICALS.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug } = await params;
  const v = findVertical(slug);
  if (!v) return { title: 'Not found — agent-media' };
  const url = `https://agent-media.ai/for/${v.slug}`;
  return {
    title: v.metaTitle,
    description: v.metaDescription,
    keywords: v.keywords,
    openGraph: {
      title: v.metaTitle,
      description: v.metaDescription,
      type: 'article',
      url,
    },
    alternates: { canonical: url },
  };
}

export default async function ForVerticalPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const v = findVertical(slug);
  if (!v) notFound();

  return <VerticalPage v={v} />;
}

function VerticalPage({ v }: { v: ForVertical }) {
  const url = `https://agent-media.ai/for/${v.slug}`;

  return (
    <div className="min-h-screen bg-white text-[#121212]">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0d0d0d] text-white py-20 sm:py-28">
        <div className="mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            For {v.personaLabel}
          </p>
          <h1 className="mt-6 text-5xl font-extrabold uppercase leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            {v.heroH1.split(v.heroH1Accent).map((part, i, arr) => (
              <span key={i}>
                {part}
                {i < arr.length - 1 && (
                  <span className="text-purple-400">{v.heroH1Accent}</span>
                )}
              </span>
            ))}
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/70">
            {v.heroSubhead}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-white text-[#0d0d0d] hover:bg-white/90">
                Get free API key
              </Button>
            </Link>
            <Link
              href="/docs/api-reference"
              className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:border-white"
            >
              View API Docs <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/gitroomhq/agent-media"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:border-white"
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── 3 use-case scenarios ──────────────────────────────────── */}
      <section className="border-b border-[#d4d4d4] bg-[#f7f7f8] py-20">
        <div className="mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b6b76]">
            How {v.personaLabel.toLowerCase()} use it
          </p>
          <h2 className="mt-3 text-3xl font-extrabold uppercase tracking-tight text-[#121212] sm:text-4xl">
            Three patterns shipping today.
          </h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {v.scenarios.map((s) => (
              <div key={s.title} className="rounded-2xl border border-[#d4d4d4] bg-white p-6">
                <h3 className="text-xl font-bold text-[#121212]">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#6b6b76]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Code example ──────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b6b76]">
            Code example
          </p>
          <h2 className="mt-3 text-3xl font-extrabold uppercase tracking-tight text-[#121212] sm:text-4xl">
            Drop-in for your stack.
          </h2>
          <div className="mt-10 overflow-hidden rounded-2xl border border-[#d4d4d4] bg-[#0d0d0d]">
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-2 font-mono text-xs text-white/50">
                {v.codeExample.title} · {v.codeExample.lang}
              </span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-sm leading-6 text-[#27c93f]">
              {v.codeExample.code}
            </pre>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] bg-[#f7f7f8] py-20">
        <div className="mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b6b76]">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-extrabold uppercase tracking-tight text-[#121212] sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-10 max-w-3xl space-y-8 text-[#6b6b76]">
            {v.faq.map((item) => (
              <div key={item.q}>
                <h3 className="font-semibold text-[#121212]">{item.q}</h3>
                <p className="mt-2 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="bg-[#0d0d0d] text-white py-20">
        <div className="mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-10 text-center">
          <h2 className="text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
            Start shipping in under a minute.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            Sign up, grab your API key, run one command. No card required for
            the free tier.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg" className="bg-white text-[#0d0d0d] hover:bg-white/90">
                Get free API key
              </Button>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:border-white"
            >
              See pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── JSON-LD: Article + FAQPage + SoftwareApplication ──────── */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: v.metaTitle,
                description: v.metaDescription,
                url,
                datePublished: v.datePublished,
                dateModified: v.dateModified,
                author: { '@type': 'Organization', name: 'agent-media' },
                publisher: { '@type': 'Organization', name: 'agent-media' },
                articleSection: 'For ' + v.personaLabel,
              },
              {
                '@type': 'FAQPage',
                mainEntity: v.faq.map((item) => ({
                  '@type': 'Question',
                  name: item.q,
                  acceptedAnswer: { '@type': 'Answer', text: item.a },
                })),
              },
              {
                '@type': 'SoftwareApplication',
                name: 'agent-media',
                applicationCategory: 'VideoApplication',
                applicationSubCategory: 'AI UGC Video Generator',
                operatingSystem: 'Web, CLI, API',
                offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
                description: v.metaDescription,
                url: 'https://agent-media.ai',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
