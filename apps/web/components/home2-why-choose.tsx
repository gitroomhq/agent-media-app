// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - "Why AgentMedia" feature grid.
 *
 * Cryptix-style 4-column feature row: hairline-circle icon, 1-line title,
 * 2-line body, divided by thin vertical column rules + subtle horizontal
 * grid lines above/below the row.
 */

import { Code2, Zap, Send, Sparkles } from 'lucide-react';

const FEATURES = [
  {
    icon: Code2,
    title: 'Agent-Native',
    body: 'Built ground-up for AI agents. CLI, MCP, and SDK - every surface speaks the same protocol.',
  },
  {
    icon: Zap,
    title: 'One Command',
    body: 'Script, render, and post - captions on request - in a single call from any agentic tool.',
  },
  {
    icon: Send,
    title: 'Auto-Publish',
    body: 'Pushes finished video straight to TikTok, Instagram, YouTube, and X out of the box.',
  },
  {
    icon: Sparkles,
    title: 'Production-Grade',
    body: 'Studio-quality 9:16 at 1080p with optional word-synced captions - no watermark, no manual cleanup.',
  },
];

const GRID_LINE = 'rgba(255,255,255,0.08)';

export function Home2WhyChoose() {
  return (
    <section id="features" className="relative pb-24">
      {/* Full-width horizontal rule at the very top of the section. */}
      <div
        className="w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      <div className="mx-auto max-w-6xl px-6 pt-16">
        <h2
          className="text-center font-normal"
          style={{
            color: 'var(--cryptix-text)',
            fontSize: 'clamp(28px, 3.6vw, 48px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
          }}
        >
          Why AgentMedia?
        </h2>
        <p
          className="mx-auto mt-4 max-w-xl text-center"
          style={{
            color: 'var(--cryptix-text-muted)',
            fontSize: '16px',
            lineHeight: 1.55,
          }}
        >
          Designed so any agent - yours, ours, or someone else&apos;s - can
          produce and publish high-quality video without leaving its
          terminal.
        </p>
      </div>

      {/* Full-width horizontal rule above the feature row. */}
      <div
        className="mt-16 w-screen"
        style={{
          borderTop: `1px solid ${GRID_LINE}`,
          marginLeft: 'calc(50% - 50vw)',
        }}
      />

      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="px-8 py-10"
              style={{
                borderLeft: i > 0 ? `1px solid ${GRID_LINE}` : 'none',
              }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ boxShadow: `inset 0 0 0 1px ${GRID_LINE}` }}
              >
                <f.icon size={20} color="var(--cryptix-text)" strokeWidth={1.5} />
              </div>
              <h3
                className="mt-7 text-base font-medium"
                style={{ color: 'var(--cryptix-text)' }}
              >
                {f.title}
              </h3>
              <p
                className="mt-3 text-sm"
                style={{ color: 'var(--cryptix-text-muted)', lineHeight: 1.55 }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Full-width horizontal rule below the feature row. */}
      <div
        className="w-full"
        style={{ borderTop: `1px solid ${GRID_LINE}` }}
      />
    </section>
  );
}
