// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:
    'UGC Script Generator: Write Video Scripts with Word Count Limits | agent-media',
  description:
    'Generate UGC video scripts that fit 5, 10, or 15-second durations. Word count validation, hook-body-CTA format, 5 template variations. Free tool, no sign-up.',
  keywords: [
    'ugc script generator',
    'ai ugc script writer',
    'ugc video script',
    'short form video script',
    'tiktok script generator',
    'ugc ad script',
    'video script word count',
    'agent-media script',
    'ugc script template',
    'ai video script',
  ],
  openGraph: {
    title: 'UGC Script Generator: Write Video Scripts with Word Count Limits',
    description:
      'Generate UGC video scripts that fit 5, 10, or 15-second durations. Free tool with word count validation.',
    type: 'website',
    url: 'https://agent-media.ai/tools/ugc-script-generator',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UGC Script Generator',
    description:
      'Write UGC scripts with the right word count for 5/10/15-second videos. Free tool.',
  },
  alternates: {
    canonical: 'https://agent-media.ai/tools/ugc-script-generator',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
