// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:
    'UGC Video Cost Calculator: Compare AI Video Pricing | agent-media',
  description:
    'Calculate the cost of AI UGC videos. Compare agent-media pricing against MakeUGC and Arcads. Interactive calculator with real numbers. No sign-up required.',
  keywords: [
    'ugc video cost calculator',
    'ai ugc pricing',
    'ugc video pricing comparison',
    'ai video cost',
    'makeugc pricing',
    'arcads pricing',
    'agent-media pricing',
    'ugc video budget',
    'ai video calculator',
    'ugc ad cost',
  ],
  openGraph: {
    title: 'UGC Video Cost Calculator: Compare AI Video Pricing',
    description:
      'Calculate the cost of AI UGC videos. Compare agent-media vs MakeUGC vs Arcads. Interactive calculator.',
    type: 'website',
    url: 'https://agent-media.ai/tools/ugc-cost-calculator',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UGC Video Cost Calculator',
    description:
      'Compare AI UGC video pricing. agent-media vs MakeUGC vs Arcads. Free calculator.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/tools/ugc-cost-calculator',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
