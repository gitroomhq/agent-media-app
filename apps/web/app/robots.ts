// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { MetadataRoute } from 'next';

/**
 * This distribution is the DASHBOARD only — there is no public marketing site.
 * Every route is behind auth or is an app surface, so nothing here should be
 * crawled or indexed. A self-hosted instance turning up in search results would
 * be a privacy problem, not a win.
 *
 * The hosted marketing site (agent-media.ai) keeps its own robots/sitemap; it is
 * deliberately not part of this repo.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
