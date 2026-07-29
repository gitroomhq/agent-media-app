// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, GitBranch, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Generate AI Videos in Your CI/CD Pipeline with GitHub Actions',
  description:
    'Automate AI video generation in your CI/CD pipeline. Use our GitHub Action to generate UGC videos on every deploy, product launch, or changelog update.',
  keywords: [
    'ai video generation github action',
    'video generation ci cd',
    'automate video generation github',
    'ai video pipeline',
    'github actions video',
    'ugc automation ci cd',
    'agent-media github action',
  ],
  openGraph: {
    title: 'Generate AI Videos in Your CI/CD Pipeline with GitHub Actions',
    description:
      'Automate AI video generation in your CI/CD pipeline with a single GitHub Action.',
    type: 'article',
    url: 'https://agent-media.ai/blog/ai-video-github-action',
    publishedTime: '2026-04-14T00:00:00Z',
  },
  alternates: {
    canonical: 'https://agent-media.ai/blog/ai-video-github-action',
  },
};

/* -- JSON-LD --------------------------------------------------------- */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Generate AI Videos in Your CI/CD Pipeline with GitHub Actions',
  description:
    'Automate AI video generation in your CI/CD pipeline using a reusable GitHub Action with the agent-media API.',
  datePublished: '2026-04-14T00:00:00Z',
  author: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  publisher: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  proficiencyLevel: 'Intermediate',
  dependencies: 'GitHub Actions, agent-media API key',
};

/* -- Code blocks ----------------------------------------------------- */

const basicWorkflow = `name: Generate Product Video

on:
  release:
    types: [published]

jobs:
  video:
    uses: agent-media/videoagent/.github/workflows/generate-video.yml@main
    with:
      script: "We just shipped \${{ github.event.release.name }}. Here is what changed and why you should update today."
      actor_slug: random
      duration: 10
      style: hormozi
      sync: true
    secrets:
      AGENT_MEDIA_API_KEY: \${{ secrets.AGENT_MEDIA_API_KEY }}`;

const changelogWorkflow = `name: Changelog Video

on:
  push:
    branches: [main]
    paths:
      - 'CHANGELOG.md'

jobs:
  read-changelog:
    runs-on: ubuntu-latest
    outputs:
      entry: \${{ steps.parse.outputs.entry }}
    steps:
      - uses: actions/checkout@v4
      - name: Extract latest changelog entry
        id: parse
        run: |
          ENTRY=$(sed -n '/^## /,/^## /{ /^## /!p; }' CHANGELOG.md | head -20)
          echo "entry=\${ENTRY}" >> "$GITHUB_OUTPUT"

  generate:
    needs: read-changelog
    uses: agent-media/videoagent/.github/workflows/generate-video.yml@main
    with:
      script: \${{ needs.read-changelog.outputs.entry }}
      style: bold
      duration: 15
      sync: true
    secrets:
      AGENT_MEDIA_API_KEY: \${{ secrets.AGENT_MEDIA_API_KEY }}`;

const matrixWorkflow = `name: Generate Video Variants

on:
  workflow_dispatch:
    inputs:
      script:
        description: "Video script"
        required: true

jobs:
  variants:
    strategy:
      matrix:
        actor: [emma-casual, alex-studio, jordan-outdoor]
        style: [hormozi, tiktok]
    uses: agent-media/videoagent/.github/workflows/generate-video.yml@main
    with:
      script: \${{ inputs.script }}
      actor_slug: \${{ matrix.actor }}
      style: \${{ matrix.style }}
      sync: true
    secrets:
      AGENT_MEDIA_API_KEY: \${{ secrets.AGENT_MEDIA_API_KEY }}`;

const curlExample = `curl -X POST https://api.agent-media.ai/v1/generate/ugc_video \\
  -H "Authorization: Bearer $AGENT_MEDIA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "script": "Your video script here",
    "actor_slug": "random",
    "duration": 10,
    "subtitle_style": "hormozi"
  }'`;

/* -- Components ------------------------------------------------------ */

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-[#d4d4d4]">
      <div className="flex items-center justify-between border-b border-[#d4d4d4] bg-[#0d0d0d] px-4 py-2.5">
        <span className="font-mono text-xs text-[#a0a0a0]">{title}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
        </div>
      </div>
      <pre className="overflow-x-auto bg-[#0d0d0d] p-5 font-mono text-sm leading-relaxed text-[#e0e0e0]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* -- Page ------------------------------------------------------------ */

export default function AiVideoGithubActionPage() {
  return (
    <article className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* -- Header -------------------------------------------------- */}
      <header>
        <div className="flex items-center gap-3 text-sm text-[#6b6b76]">
          <Link href="/blog" className="hover:text-[#121212]">
            Blog
          </Link>
          <span>/</span>
          <time dateTime="2026-04-14">April 14, 2026</time>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          Generate AI Videos in Your CI/CD Pipeline with GitHub Actions
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          Every product launch needs a video. Every changelog deserves a
          walkthrough. Every marketing campaign runs on short-form content. But
          manually producing videos for every release is a bottleneck. What if
          your CI/CD pipeline could generate the video for you — automatically,
          on every deploy?
        </p>
      </header>

      {/* -- Why automate? ------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Why automate video generation in CI/CD?
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Teams already automate tests, deployments, and notifications. Video is
          the missing piece. Here are three use cases where automated video
          generation pays for itself immediately:
        </p>
        <div className="mt-6 space-y-4">
          {[
            {
              title: 'Product launches',
              desc: 'Trigger a video on every GitHub release. The script can reference the release name and changelog. By the time your release notes hit Twitter, the video is already rendered and ready to attach.',
            },
            {
              title: 'Changelog videos',
              desc: 'Push to CHANGELOG.md and a video is generated automatically. Ship weekly update videos to your users without anyone opening a video editor.',
            },
            {
              title: 'Marketing at scale',
              desc: 'Use matrix strategies to generate multiple variants — different actors, different subtitle styles, different scripts — in a single workflow run. A/B test video ads without a production team.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <p className="font-semibold text-[#121212]">{item.title}</p>
              <p className="mt-2 text-sm text-[#6b6b76] leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* -- What the Action does ------------------------------------ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          The GitHub Action
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The agent-media GitHub Action is a reusable workflow that calls the
          agent-media API to generate a UGC video. It accepts a script, an
          optional actor, duration, and subtitle style. When{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            sync: true
          </code>{' '}
          is set, it polls until the video is ready and outputs the URL.
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Input
                </th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Default
                </th>
                <th className="px-4 py-3 font-semibold text-[#121212]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  input: 'script',
                  def: '(required)',
                  desc: 'The video script text',
                },
                {
                  input: 'actor_slug',
                  def: 'random',
                  desc: 'Actor to use for the talking head',
                },
                {
                  input: 'duration',
                  def: '10',
                  desc: 'Video duration in seconds',
                },
                {
                  input: 'style',
                  def: 'hormozi',
                  desc: 'Subtitle style (hormozi, karaoke, bold, tiktok, minimal)',
                },
                {
                  input: 'sync',
                  def: 'true',
                  desc: 'Wait for generation to complete',
                },
              ].map((row) => (
                <tr
                  key={row.input}
                  className="border-b border-[#d4d4d4] last:border-b-0"
                >
                  <td className="px-4 py-3 font-mono text-[#121212]">
                    {row.input}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#6b6b76]">
                    {row.def}
                  </td>
                  <td className="px-4 py-3 text-[#6b6b76]">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The action outputs{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            video_url
          </code>{' '}
          and{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            job_id
          </code>{' '}
          so downstream steps can use the generated video — post it to Slack,
          attach it to a GitHub release, or upload it to your CDN.
        </p>
      </section>

      {/* -- Setup --------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Setup: 2 minutes
        </h2>
        <ol className="mt-6 space-y-3">
          {[
            {
              step: 'Get an API key',
              desc: (
                <>
                  Sign up at{' '}
                  <Link
                    href="/login"
                    className="font-medium text-[#121212] underline hover:no-underline"
                  >
                    agent-media.ai
                  </Link>{' '}
                  and copy your API key from the dashboard.
                </>
              ),
            },
            {
              step: 'Add the secret',
              desc: (
                <>
                  Go to your repo&apos;s{' '}
                  <strong className="text-[#121212]">
                    Settings &gt; Secrets and variables &gt; Actions
                  </strong>{' '}
                  and add{' '}
                  <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
                    AGENT_MEDIA_API_KEY
                  </code>{' '}
                  as a repository secret.
                </>
              ),
            },
            {
              step: 'Add the workflow',
              desc: 'Create a workflow YAML file that references the reusable action. See the examples below.',
            },
          ].map((item, i) => (
            <li key={item.step} className="flex items-start gap-3 text-[#6b6b76]">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#121212] text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <strong className="text-[#121212]">{item.step}.</strong>{' '}
                {item.desc}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* -- Basic usage --------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Basic usage: video on every release
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          This workflow triggers on every GitHub release and generates a
          10-second UGC video with the release name embedded in the script. The
          video URL is available in the workflow summary.
        </p>
        <CodeBlock
          title=".github/workflows/release-video.yml"
          code={basicWorkflow}
        />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          That is the entire workflow. Push this file to your repo and every
          release automatically gets a video. The action handles API
          authentication, job submission, polling, and output extraction.
        </p>
      </section>

      {/* -- Changelog example --------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Changelog-driven videos
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Want a video every time you update your changelog? This workflow
          watches for changes to{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            CHANGELOG.md
          </code>{' '}
          on the main branch, extracts the latest entry, and generates a video
          from it.
        </p>
        <CodeBlock
          title=".github/workflows/changelog-video.yml"
          code={changelogWorkflow}
        />
      </section>

      {/* -- Matrix strategy ----------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Advanced: matrix strategy for multiple variants
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Need multiple versions of the same video for A/B testing? Use a GitHub
          Actions matrix strategy to generate variants in parallel — different
          actors, different subtitle styles, all from the same script.
        </p>
        <CodeBlock
          title=".github/workflows/video-variants.yml"
          code={matrixWorkflow}
        />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          This generates 6 video variants (3 actors x 2 styles) in parallel.
          Each variant runs as its own job, so they all execute concurrently.
          With a 10-second video taking roughly 60 seconds to render, you get
          all 6 variants in about a minute.
        </p>
      </section>

      {/* -- Under the hood ------------------------------------------ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Under the hood: the API call
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The GitHub Action wraps a single REST API call. If you want to
          integrate video generation into other CI/CD systems (GitLab CI,
          CircleCI, Jenkins), here is the raw API call:
        </p>
        <CodeBlock title="curl" code={curlExample} />
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The API returns a job ID immediately. Poll{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            GET /v1/jobs/:job_id
          </code>{' '}
          until the status is{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            completed
          </code>{' '}
          to get the video URL. The GitHub Action handles this polling loop
          automatically.
        </p>
      </section>

      {/* -- Use cases ------------------------------------------------ */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          What teams are building with this
        </h2>
        <ul className="mt-4 space-y-2">
          {[
            'Release announcement videos generated on every GitHub release',
            'Weekly changelog recap videos triggered by CHANGELOG.md updates',
            'Onboarding videos regenerated when docs change',
            'Marketing variant testing with matrix strategies across actors and styles',
            'Automated social media content pipelines: generate, upload, post',
            'Customer success videos personalized per account using workflow inputs',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[#6b6b76]">
              <span className="mt-1 text-[#121212]">*</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* -- CTA ----------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Add video generation to your pipeline
        </h2>
        <p className="mt-3 text-[#6b6b76]">
          One secret, one workflow file, automated videos on every deploy.
        </p>
        <CodeBlock
          title=".github/workflows/video.yml"
          code={`uses: agent-media/videoagent/.github/workflows/generate-video.yml@main
with:
  script: "Your script here"
secrets:
  AGENT_MEDIA_API_KEY: \${{ secrets.AGENT_MEDIA_API_KEY }}`}
        />
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/login">
            <Button size="lg">
              <GitBranch className="mr-2 h-4 w-4" />
              Get API Key
            </Button>
          </Link>
          <Link href="/blog/generate-ai-video-terminal-60-seconds">
            <Button variant="secondary" size="lg">
              CLI Guide <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </article>
  );
}
