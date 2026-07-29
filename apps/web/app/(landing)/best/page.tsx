// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import { PseoHub } from '@/seo/PseoHub';

export const metadata: Metadata = {
  title: 'Best AI UGC Video Tools by Industry, Platform & Team — AgentMedia',
  description:
    'Hand-built comparisons of AI UGC video generators for every industry, platform, and team — video quality, pricing, API access, and auto-publishing.',
  alternates: { canonical: 'https://agent-media.ai/best' },
};

export default function BestHubPage() {
  return (
    <PseoHub
      family="best"
      title="Best AI UGC video tools, compared"
      intro="Tool comparisons for every industry, platform, and team — covering video quality, pricing, developer surface (API, CLI, MCP), and auto-publishing. New comparisons publish daily."
    />
  );
}
