// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Shared renderer for pSEO pages (/best, /how-to, and their locale variants).
// Server component — composed content comes from the engine at build time.

import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildPage, isPublished, type Family, type PageContent } from './pseo-engine';

export function pseoMetadata(family: Family, slug: string, locale: string): Metadata {
  const page = buildPage(family, slug, locale);
  if (!page) return {};
  const languages: Record<string, string> = {};
  for (const alt of page.alternates) {
    languages[alt.hreflang] = `https://agent-media.ai${alt.path}`;
  }
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      type: 'article',
      url: `https://agent-media.ai${page.path}`,
    },
    alternates: {
      canonical: `https://agent-media.ai${page.path}`,
      languages,
    },
  };
}

function jsonLd(page: PageContent): string {
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
      operatingSystem: 'Web, CLI',
      offers: { '@type': 'Offer', price: '39', priceCurrency: 'USD' },
      url: 'https://agent-media.ai',
    },
  ];
  if (page.tableRows && page.compareTitle) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: page.compareTitle,
      itemListElement: page.tableRows.map((row, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: row.name,
      })),
    });
  }
  if (page.spec.family === 'how-to') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: page.h1,
      step: page.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.title,
        text: s.command,
      })),
    });
  }
  return JSON.stringify(blocks);
}

export function PseoPage({ family, slug, locale }: { family: Family; slug: string; locale: string }) {
  const page = buildPage(family, slug, locale);
  if (!page || !isPublished(page.spec)) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(page) }}
      />
      <article>
        <h1 className="text-4xl font-bold tracking-tight">{page.h1}</h1>
        {page.intro.map((p, i) => (
          <p key={i} className="mt-5 text-lg leading-relaxed text-neutral-300">
            {p}
          </p>
        ))}

        <h2 className="mt-12 text-2xl font-semibold">{page.whyTitle}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-neutral-300">
          {page.whyBullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>

        {page.compareTitle && page.tableHeaders && page.tableRows && (
          <>
            <h2 className="mt-12 text-2xl font-semibold">{page.compareTitle}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-700 text-left">
                    {page.tableHeaders.map((h, i) => (
                      <th key={i} className="py-2 pr-4 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.tableRows.map((row, i) => (
                    <tr key={i} className={`border-b border-neutral-800 ${i === 0 ? 'bg-neutral-900/60 font-medium' : ''}`}>
                      <td className="py-2 pr-4">{row.name}</td>
                      <td className="py-2 pr-4">{row.api}</td>
                      <td className="py-2 pr-4">{row.cli}</td>
                      <td className="py-2 pr-4">{row.mcp}</td>
                      <td className="py-2 pr-4">{row.autoPublish}</td>
                      <td className="py-2 pr-4">{row.pricingModel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {page.exampleTitle && page.exampleScript && (
          <>
            <h2 className="mt-12 text-2xl font-semibold">{page.exampleTitle}</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-neutral-900 p-4 text-sm leading-relaxed text-neutral-300">
              {page.exampleScript}
            </pre>
          </>
        )}

        <h2 className="mt-12 text-2xl font-semibold">{page.howTitle}</h2>
        <ol className="mt-4 space-y-6">
          {page.steps.map((s, i) => (
            <li key={i}>
              <p className="font-medium">
                {i + 1}. {s.title}
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-sm text-neutral-300">
                <code>{s.command}</code>
              </pre>
            </li>
          ))}
        </ol>

        <h2 className="mt-12 text-2xl font-semibold">{page.faqTitle}</h2>
        <dl className="mt-4 space-y-6">
          {page.faqs.map((f, i) => (
            <div key={i}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-neutral-300">{f.a}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-14 rounded-2xl border border-neutral-700 bg-neutral-900/60 p-8 text-center">
          <h2 className="text-2xl font-semibold">{page.ctaTitle}</h2>
          <p className="mt-2 text-neutral-300">{page.ctaBody}</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-white px-6 py-3 font-medium text-black"
          >
            {page.ctaButton}
          </Link>
        </section>

        <h2 className="mt-12 text-xl font-semibold">{page.relatedTitle}</h2>
        <ul className="mt-3 space-y-2">
          {page.related.map((r, i) => (
            <li key={i}>
              <Link href={r.path} className="text-neutral-300 underline underline-offset-4 hover:text-white">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
