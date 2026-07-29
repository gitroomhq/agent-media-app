// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import { PseoHub } from '@/seo/PseoHub';

export const metadata: Metadata = {
  title: 'How to Make UGC Videos with AI — Guides for Every Format & Platform',
  description:
    'Step-by-step guides to making UGC videos with AI: product demos, testimonials, unboxings, reaction videos, and more — for every platform and industry.',
  alternates: { canonical: 'https://agent-media.ai/how-to' },
};

export default function HowToHubPage() {
  return (
    <PseoHub
      family="how-to"
      title="How to make UGC videos with AI"
      intro="Practical guides for every video format — example scripts, scene directions, and the exact CLI commands to generate and auto-publish each one. New guides publish daily."
    />
  );
}
