// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import { PseoPage, pseoMetadata } from '@/seo/PseoPage';
import { LOCALE_SLUGS } from '@/seo/pseo-data';
import { publishedParams } from '@/seo/pseo-engine';

export const dynamicParams = false;

export function generateStaticParams() {
  const locales = LOCALE_SLUGS.filter((l) => l !== 'en');
  return locales.flatMap((locale) =>
    publishedParams('how-to').map(({ slug }) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return pseoMetadata('how-to', slug, locale);
}

export default async function LocalizedHowToPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  return <PseoPage family="how-to" slug={slug} locale={locale} />;
}
