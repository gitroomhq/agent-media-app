// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Coins, Cpu, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCaseData, allUseCaseSlugs } from '../use-case-data';

export function generateStaticParams() {
  return allUseCaseSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const uc = useCaseData[slug];
  if (!uc) return {};

  return {
    title: uc.metaTitle,
    description: uc.metaDescription,
    keywords: uc.keywords,
    openGraph: {
      title: uc.metaTitle,
      description: uc.metaDescription,
      type: 'article',
      url: `https://agent-media.ai/use-cases/${uc.slug}`,
    },
    twitter: {
      card: 'summary',
      title: uc.metaTitle,
      description: uc.metaDescription,
    },
    alternates: {
      canonical: `https://agent-media.ai/use-cases/${uc.slug}`,
    },
  };
}

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const uc = useCaseData[slug];
  if (!uc) notFound();

  const relatedUseCases = uc.relatedUseCases
    .map((s) => useCaseData[s])
    .filter(Boolean);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'agent-media CLI',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'macOS, Linux, Windows',
    url: `https://agent-media.ai/use-cases/${uc.slug}`,
    description: uc.metaDescription,
    author: {
      '@type': 'Organization',
      name: 'agent-media',
      url: 'https://agent-media.ai',
    },
  };

  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to generate ${uc.title.toLowerCase()} with agent-media CLI`,
    description: uc.intro,
    step: uc.steps.map((s) => ({
      '@type': 'HowToStep',
      position: s.step,
      name: s.title,
      text: s.description,
    })),
    tool: {
      '@type': 'SoftwareApplication',
      name: 'agent-media CLI',
      url: 'https://www.npmjs.com/package/agent-media-cli',
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />

      {/* ── Breadcrumb ────────────────────────────────────────── */}
      <section className="border-b border-[#d4d4d4] py-6">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <Link
            href="/use-cases"
            className="inline-flex items-center gap-2 text-sm text-[#6b6b76] transition-colors hover:text-[#6b6b76]"
          >
            <ArrowLeft className="h-4 w-4" />
            Use Cases
          </Link>
        </div>
      </section>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-widest text-[#121212]">
              Use Case
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
              Generate {uc.title} with AI — From Your Terminal
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
              {uc.intro}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/login">
                <Button size="lg">{'>'} Get Started</Button>
              </Link>
              <Link href="/models">
                <Button variant="secondary" size="lg">
                  Compare Models
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Best Models ───────────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Cpu className="h-6 w-6 text-[#121212]" />
            Best Models for This
          </h2>
          <p className="mt-3 text-[#6b6b76]">
            These models are recommended for generating {uc.title.toLowerCase()}.
            Each one brings different strengths to this workflow.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Model
                  </th>
                  <th className="px-5 py-4 font-mono font-semibold text-[#121212]">
                    Why
                  </th>
                  <th className="hidden px-5 py-4 font-mono font-semibold text-[#121212] sm:table-cell">
                    Credits
                  </th>
                  <th className="hidden px-5 py-4 font-mono font-semibold text-[#121212] lg:table-cell">
                    CLI Command
                  </th>
                </tr>
              </thead>
              <tbody>
                {uc.recommendedModels.map((m) => (
                  <tr
                    key={m.slug}
                    className="border-b border-[#d4d4d4] last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <span className="font-medium text-[#121212]">{m.model}</span>
                    </td>
                    <td className="px-5 py-4 text-[#6b6b76]">{m.why}</td>
                    <td className="hidden px-5 py-4 font-mono text-xs text-[#6b6b76] sm:table-cell">
                      {m.credits}
                    </td>
                    <td className="hidden px-5 py-4 lg:table-cell">
                      <code className="font-mono text-xs text-[#121212]/80">
                        {m.cliCommand}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Step-by-Step Workflow ──────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Workflow className="h-6 w-6 text-[#121212]" />
            Step-by-Step Workflow
          </h2>
          <p className="mt-3 text-[#6b6b76]">
            Follow these steps to start generating {uc.title.toLowerCase()} with
            agent-media CLI.
          </p>

          <div className="mt-10 space-y-8">
            {uc.steps.map((s) => (
              <div key={s.step} className="flex gap-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#121212]/30 bg-[#121212]/10 font-mono text-sm font-bold text-[#121212]">
                  {s.step}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#121212]">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#6b6b76]">
                    {s.description}
                  </p>
                  <div className="mt-4 rounded-lg border border-[#d4d4d4] bg-white">
                    <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
                      <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                      <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                      <span className="ml-3 font-mono text-xs text-[#6b6b76]">
                        terminal
                      </span>
                    </div>
                    <div className="p-5">
                      <pre className="overflow-x-auto font-mono text-sm text-[#6b6b76]">
                        <span className="text-[#121212]">$</span>{' '}
                        <span className="text-[#121212]">{s.command}</span>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cost Breakdown ────────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-[#121212]">
            <Coins className="h-6 w-6 text-[#121212]" />
            How Much Does It Cost
          </h2>
          <p className="mt-4 text-[#6b6b76] leading-relaxed">
            {uc.costBreakdown}
          </p>
          <div className="mt-6">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-sm text-[#121212] hover:underline"
            >
              View full pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Related Use Cases ─────────────────────────────────── */}
      {relatedUseCases.length > 0 && (
        <section className="border-t border-[#d4d4d4] py-16">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[#121212]">Related Use Cases</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedUseCases.map((related) => (
                <Link
                  key={related.slug}
                  href={`/use-cases/${related.slug}`}
                  className="group rounded-lg border border-[#d4d4d4] bg-white p-6 transition-all hover:border-[#121212]/40 hover:shadow-md"
                >
                  <h3 className="font-semibold text-[#121212] group-hover:text-[#6b6b76]">
                    {related.title}
                  </h3>
                  <p className="mt-2 text-sm text-[#6b6b76] line-clamp-2">
                    {related.intro}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-sm text-[#121212] opacity-0 transition-opacity group-hover:opacity-100">
                    Read more <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="border-t border-[#d4d4d4] py-20">
        <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-[#121212]">
            Start generating {uc.title.toLowerCase()}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[#6b6b76]">
            Install agent-media CLI and create your first{' '}
            {uc.recommendedModels[0].model.includes('Flux') ||
            uc.recommendedModels[0].model.includes('Grok')
              ? 'image'
              : 'video'}{' '}
            in under 60 seconds.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/login">
              <Button size="lg">{'>'} Get Started</Button>
            </Link>
            <Link href="/use-cases">
              <Button variant="secondary" size="lg">
                View All Use Cases
              </Button>
            </Link>
          </div>
          <p className="mt-6 font-mono text-xs text-[#6b6b76]">
            npm install -g agent-media-cli
          </p>
        </div>
      </section>
    </div>
  );
}
