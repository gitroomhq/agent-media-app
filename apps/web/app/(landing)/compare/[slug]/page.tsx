// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Dynamic programmatic /compare pages:
//   - competitor integration: /compare/{competitor}-{mcp|api|cli|claude-code}
//   - head-to-head: /compare/{a}-vs-{b}
// Static compare folders (arcads-api, heygen-alternative, …) take route priority;
// this catches the programmatic slugs from seo/integration-data.ts + seo/versus-data.ts.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AS_OF,
  INTEGRATION_SLUGS,
  buildIntegrationPage,
  type IntegrationPage,
} from '@/seo/integration-data';
import { VERSUS_SLUGS, buildVersusPage } from '@/seo/versus-data';

export const dynamicParams = false;

function buildComparePage(slug: string): IntegrationPage | null {
  return buildIntegrationPage(slug) ?? buildVersusPage(slug);
}

export function generateStaticParams() {
  return [...INTEGRATION_SLUGS, ...VERSUS_SLUGS].map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = buildComparePage(slug);
  if (!page) return {};
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    keywords: page.keywords,
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      type: 'article',
      url: `https://agent-media.ai${page.path}`,
    },
    alternates: { canonical: `https://agent-media.ai${page.path}` },
  };
}

function jsonLd(page: IntegrationPage): string {
  const blocks: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'AgentMedia',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web, CLI, API, MCP',
      offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
      url: 'https://agent-media.ai',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Compare', item: 'https://agent-media.ai/compare' },
        { '@type': 'ListItem', position: 2, name: `${page.competitorName} ${page.integrationLabel}`, item: `https://agent-media.ai${page.path}` },
      ],
    },
  ];
  return JSON.stringify(blocks);
}

export default async function CompareIntegrationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = buildComparePage(slug);
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(page) }} />

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#6b6b76]">{page.eyebrow}</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            {page.h1Lead} <span className="text-purple-600">{page.h1Highlight}</span>?
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">{page.intro}</p>
          <div className="mt-8 flex gap-4">
            <Link href="/login" className="rounded-full bg-[#121212] px-6 py-3 font-medium text-white hover:opacity-90">
              Get started free
            </Link>
            <Link href="/skills" className="rounded-full border border-[#d4d4d4] px-6 py-3 font-medium text-[#121212] hover:bg-neutral-50">
              Browse skills
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">{page.statusTitle}</h2>
          <p className="mt-4 max-w-2xl text-[#6b6b76]">{page.statusBody}</p>

          <h3 className="mt-10 text-xl font-semibold text-[#121212]">{page.tableTitle}</h3>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-neutral-50 text-left">
                  <th className="px-4 py-3 font-semibold">Tool</th>
                  <th className="px-4 py-3 font-semibold">API</th>
                  <th className="px-4 py-3 font-semibold">CLI</th>
                  <th className="px-4 py-3 font-semibold">MCP</th>
                  <th className="px-4 py-3 font-semibold">Auto-publish</th>
                  <th className="px-4 py-3 font-semibold">Pricing</th>
                </tr>
              </thead>
              <tbody>
                {page.tableRows.map((row, i) => (
                  <tr key={i} className={`border-b border-[#eee] ${i === 0 ? 'bg-purple-50 font-medium' : ''}`}>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.api}</td>
                    <td className="px-4 py-3">{row.cli}</td>
                    <td className="px-4 py-3">{row.mcp}</td>
                    <td className="px-4 py-3">{row.autoPublish}</td>
                    <td className="px-4 py-3">{row.pricing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#9a9aa2]">Integration status is factual as of {AS_OF}. Verify current details on each vendor&apos;s site.</p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">{page.agentTitle}</h2>
          <ol className="mt-8 space-y-6">
            {page.agentSteps.map((s, i) => (
              <li key={i}>
                <p className="font-medium text-[#121212]">
                  {i + 1}. {s.title}
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-[#121212] p-4 text-sm text-neutral-100">
                  <code>{s.command}</code>
                </pre>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">{page.faqTitle}</h2>
          <dl className="mt-8 space-y-6">
            {page.faqs.map((f, i) => (
              <div key={i}>
                <dt className="font-semibold text-[#121212]">{f.q}</dt>
                <dd className="mt-1 max-w-2xl text-[#6b6b76]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold text-[#121212]">{page.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[#6b6b76]">{page.ctaBody}</p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-full bg-[#121212] px-8 py-3 font-medium text-white hover:opacity-90"
          >
            Get started free
          </Link>
        </div>
      </section>

      {page.related.length > 0 && (
        <section className="border-t border-[#d4d4d4] py-16">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-semibold text-[#121212]">Related comparisons</h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {page.related.map((r, i) => (
                <li key={i}>
                  <Link href={r.path} className="text-[#6b6b76] underline underline-offset-4 hover:text-[#121212]">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
