// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Dynamic competitor pricing pages: /pricing/{competitor}.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AS_OF,
  PRICING_SLUGS,
  buildPricingPage,
  type PricingPage,
} from '@/seo/pricing-data';

export const dynamicParams = false;

export function generateStaticParams() {
  return PRICING_SLUGS.map((competitor) => ({ competitor }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor } = await params;
  const page = buildPricingPage(competitor);
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

function jsonLd(page: PricingPage): string {
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
      '@type': 'Product',
      name: 'AgentMedia',
      description: 'AI UGC video generation via API, CLI, and MCP server.',
      offers: page.agentmediaPlans.map((p) => ({
        '@type': 'Offer',
        name: p.name,
        price: p.price.replace(/[^0-9]/g, ''),
        priceCurrency: 'USD',
        url: 'https://agent-media.ai/#pricing',
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pricing', item: 'https://agent-media.ai/#pricing' },
        { '@type': 'ListItem', position: 2, name: `${page.name} pricing`, item: `https://agent-media.ai${page.path}` },
      ],
    },
  ];
  return JSON.stringify(blocks);
}

export default async function PricingComparePage({
  params,
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor } = await params;
  const page = buildPricingPage(competitor);
  if (!page) notFound();
  const c = page.competitor;

  return (
    <div className="min-h-screen bg-white text-[#121212]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(page) }} />

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-widest text-[#6b6b76]">{page.name} · Pricing</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">{page.h1}</h1>
          <p className="mt-6 max-w-2xl text-lg text-[#6b6b76]">{page.intro}</p>
          <div className="mt-8 flex gap-4">
            <Link href="/login" className="rounded-full bg-[#121212] px-6 py-3 font-medium text-white hover:opacity-90">Start from $39/mo</Link>
            <Link href="/cheapest-ai-ugc-video" className="rounded-full border border-[#d4d4d4] px-6 py-3 font-medium text-[#121212] hover:bg-neutral-50">Cheapest tools ranked</Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">{page.name} vs AgentMedia: pricing at a glance</h2>
          <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#d4d4d4] bg-neutral-50 text-left">
                  <th className="px-4 py-3 font-semibold">Tool</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">Entry price</th>
                  <th className="px-4 py-3 font-semibold">Developer surface</th>
                  <th className="px-4 py-3 font-semibold">Auto-publish</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#eee] bg-purple-50 font-medium">
                  <td className="px-4 py-3">AgentMedia</td>
                  <td className="px-4 py-3">Credits</td>
                  <td className="px-4 py-3">$39/mo (~$3/video)</td>
                  <td className="px-4 py-3">REST + SDKs + CLI + MCP</td>
                  <td className="px-4 py-3">TikTok / IG / YouTube / X</td>
                </tr>
                <tr className="border-b border-[#eee]">
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3">{c.model}</td>
                  <td className="px-4 py-3">{c.entryPrice}</td>
                  <td className="px-4 py-3">{c.hasDeveloperSurface}</td>
                  <td className="px-4 py-3">Not native</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#9a9aa2]">{c.name} prices are approximate and publicly reported as of {AS_OF}. Verify on {c.name}&apos;s site. AgentMedia prices are exact.</p>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">AgentMedia plans &amp; true cost per video</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {page.agentmediaPlans.map((p) => (
              <div key={p.name} className="rounded-xl border border-[#d4d4d4] p-6">
                <p className="text-sm uppercase tracking-wide text-[#6b6b76]">{p.name}</p>
                <p className="mt-2 text-3xl font-extrabold text-[#121212]">{p.price}</p>
                <p className="mt-2 text-sm text-[#6b6b76]">{p.detail}</p>
                <p className="mt-3 text-sm font-medium text-purple-600">{p.perVideo} per 10s video</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#d4d4d4] py-16">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#121212]">Frequently asked questions</h2>
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
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-[#121212]">Related</h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {page.related.map((r, i) => (
              <li key={i}>
                <Link href={r.path} className="text-[#6b6b76] underline underline-offset-4 hover:text-[#121212]">{r.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
