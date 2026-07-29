// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - FAQ section.
 *
 * Cryptix layout: header row (title left, mint CTA right), then a
 * 2-column grid of accordion rows. Each row is a button - click to
 * expand the answer below. Real FAQ copy lifted from the public landing
 * page so the answers match what we already publish for SEO.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

const GRID_LINE = 'rgba(255,255,255,0.08)';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is AgentMedia?',
    a: 'AgentMedia is an agent-first AI UGC video platform. Its script-to-video pipeline produces complete UGC ads with talking heads, and optional animated captions. Drive it from a CLI, an MCP server, or a Claude Code skill. Install the CLI with `npm install -g agent-media-cli`.',
  },
  {
    q: 'How much does AgentMedia cost?',
    a: 'See the full pricing breakdown at [agent-media.ai/pricing](https://agent-media.ai/#pricing). Plans include monthly subscriptions and pay-as-you-go credit packs that never expire.',
  },
  {
    q: 'Which AI models does AgentMedia support?',
    a: 'AgentMedia supports 7+ AI models for video and image generation - 4 video models and 3 image models - all accessible through one CLI, REST API, or SDK. No separate API keys needed.',
  },
  {
    q: 'Can I use AgentMedia inside Claude Code?',
    a: 'Yes. AgentMedia ships an MCP server that exposes one tool, make_ugc, which turns a script (plus an optional person, image, or saved character) into a finished vertical video — available to Claude Code, Cursor, Windsurf, and any MCP-capable tool. Captions are opt-in: the agent asks whether you want them before adding them.',
  },
  {
    q: 'Do I need separate API keys for each model?',
    a: 'No. AgentMedia handles all provider routing and authentication. You only need your AgentMedia API key to access every supported model.',
  },
  {
    q: 'Does AgentMedia auto-publish to social networks?',
    a: 'Yes. With one flag, AgentMedia auto-publishes the rendered video to TikTok, Instagram, YouTube Shorts, and X. You can also schedule posts ahead of time via the CLI or API.',
  },
];

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex w-full flex-col gap-3 px-6 py-6 text-left transition-colors"
      style={{
        borderTop: `1px solid ${GRID_LINE}`,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className="text-base font-medium"
          style={{ color: 'var(--cryptix-text)' }}
        >
          {q}
        </span>
        <Plus
          size={18}
          strokeWidth={1.6}
          color="var(--cryptix-text-muted)"
          className="mt-0.5 flex-shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
        />
      </div>
      {open && (
        <p
          className="text-sm"
          style={{ color: 'var(--cryptix-text-muted)', lineHeight: 1.6 }}
        >
          {a}
        </p>
      )}
    </button>
  );
}

export function Home2Faq() {
  return (
    <section id="faq" className="relative pb-24 pt-20">
      {/* Full-width horizontal rule at top of section */}
      <div
        className="w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      <div className="mx-auto max-w-6xl px-6 pt-16">
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-2">
          <h2
            className="font-normal"
            style={{
              color: 'var(--cryptix-text)',
              fontSize: 'clamp(28px, 3.6vw, 48px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
            }}
          >
            Your questions,
            <br />
            answered.
          </h2>
          <div className="flex flex-col gap-5 lg:items-end">
            <p
              className="max-w-md"
              style={{
                color: 'var(--cryptix-text-muted)',
                fontSize: '16px',
                lineHeight: 1.55,
              }}
            >
              Everything you need to know about AgentMedia - from integrations
              to pricing to the SDKs.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-base font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--cryptix-mint)' }}
            >
              Create account now
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {FAQS.map((faq, i) => (
            <div
              key={faq.q}
              style={{
                borderLeft: i % 2 === 1 ? `1px solid ${GRID_LINE}` : 'none',
              }}
            >
              <FaqRow q={faq.q} a={faq.a} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom rule to close the FAQ grid */}
      <div
        className="w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />
    </section>
  );
}
