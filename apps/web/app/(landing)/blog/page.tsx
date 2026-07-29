// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog — AI UGC Video Guides & Tutorials | agent-media',
  description:
    'Guides, tutorials, and deep dives on AI UGC video creation. Learn about talking heads, subtitle styles, the UGC pipeline, and how to create converting content with agent-media.',
  keywords: [
    'AI UGC blog',
    'AI talking head tutorial',
    'UGC video guide',
    'AI video subtitles',
    'agent-media tutorials',
    'UGC pipeline guide',
  ],
  openGraph: {
    title: 'Blog — AI UGC Video Guides & Tutorials | agent-media',
    description:
      'Guides and tutorials on AI UGC video creation with agent-media.',
    type: 'website',
    url: 'https://agent-media.ai/blog',
  },
  alternates: { canonical: 'https://agent-media.ai/blog' },
};

const posts = [
  {
    slug: 'batch-generate-product-videos-python',
    title:
      'How to Batch Generate 100 Product Videos with Python',
    description:
      'A step-by-step Python tutorial for batch generating product videos from a CSV. asyncio concurrency, retry logic, webhooks, and a TypeScript equivalent.',
    date: '2026-04-14',
    tag: 'Tutorial',
  },
  {
    slug: 'mcp-server-ai-video-generation',
    title:
      'MCP Server for AI Video Generation: Use agent-media in Claude Code and Cursor',
    description:
      'Install the agent-media MCP server to generate AI UGC videos directly from Claude Code, Cursor, and Windsurf. Three tools, one npm package, zero boilerplate.',
    date: '2026-04-14',
    tag: 'Integration',
  },
  {
    slug: 'ai-ugc-pricing-comparison-2026',
    title:
      'AI UGC Pricing Comparison 2026: What Each Platform Actually Costs',
    description:
      'We checked public pricing pages for agent-media, MakeUGC, Arcads, Creatify, and HeyGen. Here is the real cost per video at each tier, with sources.',
    date: '2026-04-02',
    tag: 'Benchmark',
  },
  {
    slug: 'best-ai-ugc-generator-for-developers',
    title:
      'Best AI UGC Generator for Developers (2026)',
    description:
      'API access, CLI tools, batch generation, and CI/CD integration compared across agent-media, MakeUGC, Arcads, and HeyGen.',
    date: '2026-04-02',
    tag: 'Benchmark',
  },
  {
    slug: 'generate-ai-video-terminal-60-seconds',
    title: 'How to Create UGC Videos with AI in 60 Seconds',
    description:
      'Describe the actor, paste the script, set the scene — one command returns a realistic 9:16 UGC video (add captions on request) and publishes it for you.',
    date: '2026-06-10',
    tag: 'Getting Started',
  },
  {
    slug: 'automate-youtube-shorts-pipeline',
    title: '5 UGC Video Styles That Convert (And How to Generate Them)',
    description:
      'Hormozi, bold, karaoke, TikTok, minimal — each subtitle style is designed for a different audience. Learn which one converts best for your content.',
    date: '2026-03-06',
    tag: 'Guide',
  },
];

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-bold text-[#121212] sm:text-4xl">
        Blog
      </h1>
      <p className="mt-4 text-lg text-[#6b6b76]">
        Guides, tutorials, and deep dives on AI UGC video creation.
      </p>

      <div className="mt-12 space-y-6">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-lg border border-[#d4d4d4] bg-white p-6 transition-all hover:border-[#a0a0a0] hover:shadow-sm"
          >
            <div className="flex items-center gap-3 text-xs text-[#6b6b76]">
              <span className="rounded bg-[#121212]/10 px-2 py-0.5 font-semibold uppercase text-[#121212]">
                {post.tag}
              </span>
              <time dateTime={post.date}>{post.date}</time>
            </div>
            <h2 className="mt-3 text-lg font-bold text-[#121212] group-hover:text-[#6b6b76]">
              {post.title}
            </h2>
            <p className="mt-2 text-sm text-[#6b6b76]">{post.description}</p>
            <p className="mt-4 inline-flex items-center gap-1 text-sm text-[#121212]">
              Read article <ArrowRight className="h-4 w-4" />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
