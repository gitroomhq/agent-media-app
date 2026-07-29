// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agent-media/ui'],
  async redirects() {
    // The old /skill install page was replaced by the Skills & CLI hub.
    return [
      { source: '/skill', destination: '/skills', permanent: true },
      // June 2026 content cleanup: stale v1-era pages → current money pages.
      { source: '/old-home', destination: '/', permanent: true },
      { source: '/ai-actors', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/ai-actors/:slug', destination: '/ai-ugc-video-generator', permanent: true },
      // /models/* was removed earlier but sitemap/IndexNow still advertised it.
      { source: '/models/:slug', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/models', destination: '/ai-ugc-video-generator', permanent: true },
      // Model-vs-model compare pages contradicted the model-abstraction
      // policy (engineering spec §6) and earned ~no traffic.
      { source: '/compare/kling-vs-sora', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/compare/kling-vs-seedance', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/compare/veo-vs-sora', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/compare/flux-pro-vs-grok', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/compare/sora-alternative', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/compare/midjourney-alternative', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/compare/runway-alternative', destination: '/ai-ugc-video-generator', permanent: true },
      { source: '/showcase', destination: '/ai-ugc-video-generator', permanent: true },
      // Blog posts describing the retired v1 pipeline.
      { source: '/blog/image-to-video-guide', destination: '/how-to', permanent: true },
      { source: '/blog/ai-video-model-comparison', destination: '/ai-ugc-video-generator', permanent: true },
    ];
  },
  images: {
    // Whitelist external hosts so Next.js can optimize (resize +
    // re-encode to WebP/AVIF) instead of serving the raw 5 MB PNGs.
    remotePatterns: [
      { protocol: 'https', hostname: 'pub-16e2ed8f6be84691845e91436920ce0a.r2.dev' },
      { protocol: 'https', hostname: 'ppwvarkmpffljlqxkjux.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

// Wrap with Sentry. Source-map upload only runs when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are set (CI/Vercel); otherwise it's a safe no-op
// and the build proceeds normally. Slugs are env-driven so we never hardcode
// the wrong project.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
});
