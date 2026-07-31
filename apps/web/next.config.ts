// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Hosts Next/Image is allowed to optimize.
 *
 * These MUST be known at build time (Next bakes them into the image optimizer),
 * which is the one place the otherwise-runtime config cannot reach. So they are
 * derived from build args with the hosted defaults as a fallback:
 *
 *   NEXT_PUBLIC_IMAGE_HOSTS=cdn.example.com,minio.example.com
 *
 * A self-hoster whose media lives on their own bucket must set this, or images
 * will 400 from the optimizer. Docker build arg: --build-arg NEXT_PUBLIC_IMAGE_HOSTS=...
 */
function imageHosts(): { protocol: 'http' | 'https'; hostname: string }[] {
  const raw = process.env.NEXT_PUBLIC_IMAGE_HOSTS?.trim();
  const hosts = raw
    ? raw
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : [];

  // Also allow whatever Supabase / object-storage origins are configured.
  for (const v of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.R2_PUBLIC_URL]) {
    if (!v?.trim()) continue;
    try {
      hosts.push(new URL(v).hostname);
    } catch {
      // Ignore malformed values — a bad URL here should not fail the build.
    }
  }

  const unique = [...new Set(hosts)];
  return unique.map((hostname) => ({
    // localhost/MinIO in a self-host setup is plain http.
    protocol: /^(localhost|127\.0\.0\.1|minio)(:|$)/.test(hostname) ? 'http' : 'https',
    hostname,
  }));
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agent-media/ui'],
  // Emit a self-contained server bundle so the Docker image does not need the
  // whole pnpm workspace at runtime. See apps/web/Dockerfile.
  output: 'standalone',
  images: {
    remotePatterns: imageHosts(),
    formats: ['image/avif', 'image/webp'],
  },
};

// NOTE: the hosted site's marketing redirects (/ai-ugc-video-generator, /blog/*,
// /compare/*, …) are deliberately absent. This distribution ships the DASHBOARD
// only — those targets do not exist here, so the rules would have redirected
// people to 404s.

// Wrap with Sentry. Source-map upload only runs when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are set; otherwise it's a safe no-op and the
// build proceeds normally.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
});
