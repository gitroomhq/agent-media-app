// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - "Every agent, one tool" section.
 *
 * Right column is a vertical stack of three horizontally-scrolling
 * marquees, each containing a unique slice of real agent brand SVGs
 * (simple-icons). The row content is rendered twice and translated by
 * -50% so the loop is seamless and unbounded. Different durations and
 * one reverse direction give the cloud a drifting, alive feel.
 */

import {
  siAnthropic,
  siClaude,
  siCrewai,
  siCursor,
  siGithubcopilot,
  siGooglegemini,
  siHuggingface,
  siLangchain,
  siMake,
  siMeta,
  siMistralai,
  siN8n,
  siPerplexity,
  siReplit,
  siV0,
  siVercel,
  siWindsurf,
  siX,
  siZapier,
} from 'simple-icons';
import type { SimpleIcon as SimpleIconType } from 'simple-icons';
import { Home2CTAButton } from '@/components/home2-cta-button';

interface AgentPill {
  title: string;
  icon: SimpleIconType;
  color?: string;
}

// One pool, three rows. Every entry is unique - no agent repeats across
// rows. Black/near-black brand marks get a white override so they read
// on the cryptix surface.
const ROW_A: AgentPill[] = [
  { title: 'Claude',     icon: siClaude },
  { title: 'Cursor',     icon: siCursor,         color: '#FFFFFF' },
  { title: 'Gemini',     icon: siGooglegemini },
  { title: 'Grok',       icon: siX,              color: '#FFFFFF' },
  { title: 'Perplexity', icon: siPerplexity },
  { title: 'Mistral',    icon: siMistralai },
];

const ROW_B: AgentPill[] = [
  { title: 'n8n',           icon: siN8n },
  { title: 'Windsurf',      icon: siWindsurf,    color: '#FFFFFF' },
  { title: 'GitHub Copilot', icon: siGithubcopilot, color: '#FFFFFF' },
  { title: 'Replit',        icon: siReplit },
  { title: 'Vercel',        icon: siVercel,      color: '#FFFFFF' },
  { title: 'Meta AI',       icon: siMeta },
];

const ROW_C: AgentPill[] = [
  { title: 'Claude Code',   icon: siAnthropic,   color: '#FFFFFF' },
  { title: 'LangChain',     icon: siLangchain },
  { title: 'CrewAI',        icon: siCrewai,      color: '#FFFFFF' },
  { title: 'Hugging Face',  icon: siHuggingface },
  { title: 'Zapier',        icon: siZapier },
  { title: 'Make',          icon: siMake },
  { title: 'v0',            icon: siV0,          color: '#FFFFFF' },
];

function BrandIcon({
  icon,
  size = 22,
  colorOverride,
}: {
  icon: SimpleIconType;
  size?: number;
  colorOverride?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={icon.title}
    >
      <title>{icon.title}</title>
      <path d={icon.path} fill={colorOverride ?? `#${icon.hex}`} />
    </svg>
  );
}

function Pill({ pill }: { pill: AgentPill }) {
  return (
    <div
      className="inline-flex flex-shrink-0 items-center gap-3.5 rounded-full px-6 py-4"
      style={{
        backgroundColor: 'var(--cryptix-surface-2)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      <BrandIcon icon={pill.icon} colorOverride={pill.color} size={32} />
      <span
        className="whitespace-nowrap text-lg font-medium"
        style={{ color: 'var(--cryptix-text)' }}
      >
        {pill.title}
      </span>
    </div>
  );
}

function MarqueeRow({
  pills,
  duration,
  reverse,
}: {
  pills: AgentPill[];
  duration: number;
  reverse?: boolean;
}) {
  // Render the pill list twice so a -50% translate produces a seamless
  // visual loop (the second half slides into the position the first
  // half just vacated).
  return (
    <div className="overflow-hidden">
      <div
        className="flex w-max gap-3"
        style={{
          animation: `${reverse ? 'home2MarqueeReverse' : 'home2Marquee'} ${duration}s linear infinite`,
        }}
      >
        {[...pills, ...pills].map((pill, i) => (
          <Pill key={i} pill={pill} />
        ))}
      </div>
    </div>
  );
}

export function Home2AgentsGrid() {
  return (
    <section className="relative px-6 pb-24 pt-32">
      <div
        className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Left - copy + CTA */}
        <div className="pt-16">
          <h2
            className="font-normal"
            style={{
              color: 'var(--cryptix-text)',
              fontSize: 'clamp(28px, 3.6vw, 48px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
            }}
          >
            Every agent.
            <br />
            One tool.
          </h2>
          <p
            className="mt-5 max-w-md"
            style={{
              color: 'var(--cryptix-text-muted)',
              fontSize: '16px',
              lineHeight: 1.6,
            }}
          >
            Drop AgentMedia into Claude, Cursor, Gemini, n8n, Windsurf,
            Replit - or anything that speaks MCP, HTTP, or shell. Same
            video pipeline, every surface.
          </p>
          <div className="mt-10">
            <Home2CTAButton href="/login" variant="light">Boost your social</Home2CTAButton>
          </div>
        </div>

        {/* Right - three infinite-scroll marquee rows */}
        <div className="flex flex-col gap-4 pt-16">
          <MarqueeRow pills={ROW_A} duration={42} />
          <MarqueeRow pills={ROW_B} duration={36} reverse />
          <MarqueeRow pills={ROW_C} duration={48} />
        </div>
      </div>
    </section>
  );
}
