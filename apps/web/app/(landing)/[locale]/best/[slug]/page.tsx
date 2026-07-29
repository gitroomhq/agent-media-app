// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Localized pSEO pages: /es/best/..., /pt-br/best/..., /de/best/..., etc.
// dynamicParams=false means only locales in LOCALE_SLUGS ever match —
// /anything-else/best/x 404s and no other routes are affected.

import type { Metadata } from 'next';
import { PseoPage, pseoMetadata } from '@/seo/PseoPage';
import { LOCALE_SLUGS } from '@/seo/pseo-data';
import { publishedParams } from '@/seo/pseo-engine';

export const dynamicParams = false;

export function generateStaticParams() {
  const locales = LOCALE_SLUGS.filter((l) => l !== 'en');
  return locales.flatMap((locale) =>
    publishedParams('best').map(({ slug }) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return pseoMetadata('best', slug, locale);
}

export default async function LocalizedBestPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return <PseoPage family="best" slug={slug} locale={locale} />;
}
