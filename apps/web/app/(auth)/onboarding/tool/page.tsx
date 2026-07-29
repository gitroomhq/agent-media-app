// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step - "What is your favorite agentic tool?".
 *
 * Multi-select pill grid. The answer is saved as an array of selected
 * tool labels in profiles.onboarding_data.tool, then we hand off to
 * /onboarding/preparing which kicks off the real brand extraction
 * and finally marks onboarding complete.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2, Check, MoreHorizontal } from 'lucide-react';
import { siVercel, siWindsurf, siGooglegemini } from 'simple-icons';
import type { SimpleIcon as SimpleIconType } from 'simple-icons';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

type ToolDef =
  | { label: string; kind: 'img'; src: string }
  | { label: string; kind: 'svg'; icon: SimpleIconType; tintInactive?: string }
  | { label: string; kind: 'placeholder' };

const TOOLS: ToolDef[] = [
  { label: 'Claude UI',   kind: 'img', src: '/agent-icons/claude.png' },
  { label: 'Claude Code', kind: 'img', src: '/agent-icons/claudecode.png' },
  { label: 'ChatGPT',     kind: 'img', src: '/agent-icons/openai.png' },
  { label: 'Codex',       kind: 'img', src: '/agent-icons/codex.png' },
  { label: 'Vercel',      kind: 'svg', icon: siVercel,         tintInactive: '#000000' },
  { label: 'Windsurf',    kind: 'svg', icon: siWindsurf,       tintInactive: '#000000' },
  { label: 'Gemini',      kind: 'svg', icon: siGooglegemini },
  { label: 'Other',       kind: 'placeholder' },
];

type Tool = (typeof TOOLS)[number]['label'];

export default function OnboardingToolPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Tool>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOnboardingEvent('tool');

  function toggle(t: Tool) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const answerRes = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'tool',
          answer: { tools: Array.from(selected) },
        }),
      });
      if (!answerRes.ok) {
        const body = await answerRes.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${answerRes.status})`);
      }
      logOnboardingEvent('tool', 'completed', {
        tools: Array.from(selected),
      });
      router.push('/onboarding/preparing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const canContinue = selected.size > 0;

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-black">
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/onboarding/goal"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>AgentMedia</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <h1
          className="font-normal text-black"
          style={{
            fontSize: 'clamp(20px, 2vw, 28px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          What is your favorite agentic tool?
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          Pick the ones you actually use - we&apos;ll tune the
          integration tips to match.
        </p>

        <div className="mt-8 flex w-full max-w-2xl flex-wrap items-center justify-center gap-3">
          {TOOLS.map((tool) => {
            const isActive = selected.has(tool.label);
            return (
              <button
                key={tool.label}
                type="button"
                onClick={() => toggle(tool.label)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
                style={{
                  color: isActive ? '#FFFFFF' : 'rgba(0,0,0,0.85)',
                  backgroundColor: isActive ? '#0E0E0E' : '#FFFFFF',
                  border: isActive ? '1px solid #0E0E0E' : '1px solid rgba(0,0,0,0.12)',
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: isActive ? '#FF6B35' : 'transparent',
                    border: isActive
                      ? '1px solid #FF6B35'
                      : '1px solid rgba(0,0,0,0.18)',
                  }}
                  aria-hidden
                >
                  {isActive ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                </span>
                <ToolIcon tool={tool} isActive={isActive} />
                {tool.label}
              </button>
            );
          })}
        </div>

        <div
          className="mt-10"
          onClickCapture={(e) => {
            e.preventDefault();
            if (canContinue && !submitting) handleContinue();
          }}
          aria-disabled={!canContinue || submitting}
          style={{
            opacity: !canContinue || submitting ? 0.5 : 1,
            pointerEvents: !canContinue || submitting ? 'none' : 'auto',
          }}
        >
          <Home2CTAButton href="#" variant="dark" size="lg" showArrow={false}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Continue
              </span>
            ) : (
              'Continue'
            )}
          </Home2CTAButton>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Brand mark rendered inside each pill. Three flavours:
 *   - img:   local PNG (used for Claude/ChatGPT/Codex variants)
 *   - svg:   simple-icons path with brand colour (Vercel/Windsurf/Gemini)
 *   - placeholder: a neutral "more" dot for "Other"
 *
 * When the pill is active (dark background) we override the SVG fill
 * to white so the icon stays legible. PNGs aren't recoloured.
 */
function ToolIcon({ tool, isActive }: { tool: ToolDef; isActive: boolean }) {
  if (tool.kind === 'img') {
    return (
      <img
        src={tool.src}
        alt=""
        aria-hidden
        className="h-4 w-4 object-contain"
      />
    );
  }
  if (tool.kind === 'svg') {
    const brandColour = `#${tool.icon.hex}`;
    const inactive = tool.tintInactive ?? brandColour;
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={isActive ? '#FFFFFF' : inactive}
        aria-hidden
      >
        <path d={tool.icon.path} />
      </svg>
    );
  }
  return (
    <MoreHorizontal
      className="h-4 w-4"
      style={{ color: isActive ? '#FFFFFF' : 'rgba(0,0,0,0.55)' }}
      aria-hidden
    />
  );
}
