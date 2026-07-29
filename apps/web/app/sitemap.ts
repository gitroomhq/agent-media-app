// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { MetadataRoute } from 'next';
import { pseoSitemapEntries } from '@/seo/pseo-engine';
import { INTEGRATION_SLUGS } from '@/seo/integration-data';
import { PRICING_SLUGS } from '@/seo/pricing-data';
import { VERSUS_SLUGS } from '@/seo/versus-data';

const compareSlugs = [
  'fastest-ai-video',
  'cheapest-ai-video',
  'makeugc-alternative',
  'arcads-alternative',
  'creatify-alternative',
  'heygen-alternative',
  'synthesia-alternative',
  'topview-alternative',
  'creatify-api',
  'arcads-api',
];

const developerLandingSlugs = [
  'ugc-video-api',
  'sdk/typescript',
  'sdk/python',
  'mcp',
  'cli',
];

const forVerticalSlugs = [
  'saas',
  'dropshipping',
  'coaches',
  'b2b',
  'd2c-brands',
  'developers',
];

const blogSlugs = [
  'generate-ai-video-terminal-60-seconds',
  'automate-youtube-shorts-pipeline',
  'ai-ugc-pricing-comparison-2026',
  'best-ai-ugc-generator-for-developers',
  'mcp-server-ai-video-generation',
  'automate-ugc-video-ads-api',
  'ai-video-github-action',
  'ai-ugc-video-api-comparison',
  'batch-generate-product-videos-python',
];

const useCaseSlugs = [
  'tiktok-reels-content',
  'product-demo-videos',
  'talking-head-ugc',
  'cinematic-b-roll',
  'marketing-graphics',
  'youtube-shorts-pipeline',
  'tiktok-ugc-ads',
  'facebook-ugc-ads',
  'shopify-product-videos',
  'saas-review-videos',
  'ugc-video-api',
  'ai-video-cli',
  'ecommerce',
  'real-estate',
  'education',
  'fitness',
  'agencies',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: 'https://agent-media.ai/',
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: 'https://agent-media.ai/developers',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://agent-media.ai/integrations',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://agent-media.ai/docs',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://agent-media.ai/docs/api-reference',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://agent-media.ai/docs/api-changelog',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://agent-media.ai/ai-ugc-video-generator',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: 'https://agent-media.ai/ai-ugc-ads',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: 'https://agent-media.ai/best',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: 'https://agent-media.ai/how-to',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: 'https://agent-media.ai/use-cases',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...useCaseSlugs.map((slug) => ({
      url: `https://agent-media.ai/use-cases/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...compareSlugs.map((slug) => ({
      url: `https://agent-media.ai/compare/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    // Programmatic competitor × integration pages (/compare/{competitor}-{mcp|api|cli|claude-code}).
    ...INTEGRATION_SLUGS.map((slug) => ({
      url: `https://agent-media.ai/compare/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
    // Programmatic head-to-head pages (/compare/{a}-vs-{b}).
    ...VERSUS_SLUGS.map((slug) => ({
      url: `https://agent-media.ai/compare/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    // Programmatic competitor pricing pages (/pricing/{competitor}).
    ...PRICING_SLUGS.map((slug) => ({
      url: `https://agent-media.ai/pricing/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: 'https://agent-media.ai/ai-ugc',
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: 'https://agent-media.ai/cheapest-ai-ugc-video',
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    ...developerLandingSlugs.map((slug) => ({
      url: `https://agent-media.ai/${slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
    ...forVerticalSlugs.map((slug) => ({
      url: `https://agent-media.ai/for/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
    {
      url: 'https://agent-media.ai/tools/ugc-cost-calculator',
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: 'https://agent-media.ai/tools/ugc-script-generator',
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: 'https://agent-media.ai/blog',
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    ...blogSlugs.map((slug) => ({
      url: `https://agent-media.ai/blog/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    {
      url: 'https://agent-media.ai/status',
      lastModified,
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: 'https://agent-media.ai/terms',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://agent-media.ai/privacy',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://agent-media.ai/llms.txt',
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    // pSEO pages (/best + localized), grows daily per the publish schedule
    ...pseoSitemapEntries().map((e) => ({
      url: e.url,
      lastModified: e.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
