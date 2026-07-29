// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import { PseoPage, pseoMetadata } from '@/seo/PseoPage';
import { publishedParams } from '@/seo/pseo-engine';

export const dynamicParams = false;

export function generateStaticParams() {
  return publishedParams('how-to');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return pseoMetadata('how-to', slug, 'en');
}

export default async function HowToPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PseoPage family="how-to" slug={slug} locale="en" />;
}
