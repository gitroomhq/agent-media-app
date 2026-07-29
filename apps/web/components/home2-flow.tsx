// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - Pipeline flow visualization.
 *
 *   [agent]  →  [AgentMedia]  →  [VIDEO]  ⇗  TikTok
 *                                          → Instagram
 *                                          ⇘  YouTube
 *
 * Lifecycle:
 *   1. Initial reveal - `revealStep` advances 0→STEP_COUNT and each
 *      slot pops in once, on a stagger. Nothing ever hides again.
 *   2. Permanent cycle - once everything is on screen, the orchestrator
 *      alternates between swapping the agent icon and the video, ~3.5 s
 *      apart. The element being swapped wobbles (rotate + scale) and
 *      its content flips mid-wobble, so the change reads as "this one
 *      morphed into the next" without ever clearing the scene.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import {
  siInstagram,
  siTiktok,
  siYoutube,
} from 'simple-icons';
import type { SimpleIcon as SimpleIconType } from 'simple-icons';

// ─────────────────────────────────────────────────────────────────
// Static content
// ─────────────────────────────────────────────────────────────────

const R2_BASE =
  'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01';

const HERO_VIDEOS = [
  'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/7252a5f8-48a5-439b-9e79-33333333cccc/simple-selfie.mp4',
  `${R2_BASE}/c3354440-1d8d-4832-ab4d-01bbd07bb9eb/character-video-final.mp4`,
  `${R2_BASE}/d095fee4-2935-456f-83de-4c00681ac051/character-video-final.mp4`,
  `${R2_BASE}/ac468576-3cc2-4d05-ad21-d69a34141132/character-video-final.mp4`,
  'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/brand-extracts/subtitle/120eaf6f-d2af-4f66-83e8-e62ec826de01/3f2c5f0a-61c6-45b0-a855-f2484b95d65d-subs/subtitled.mp4',
];

type Agent = {
  title: string;
  /** SVG brand icon from simple-icons. Ignored when iconUrl is set. */
  icon?: SimpleIconType;
  /** Optional override color for the simple-icons SVG. */
  color?: string;
  /** Remote PNG to render via <img> instead of the simple-icons SVG. */
  iconUrl?: string;
};

const AGENTS: Agent[] = [
  { title: 'Claude',      iconUrl: '/agent-icons/claude.png' },
  { title: 'Claude Code', iconUrl: '/agent-icons/claudecode.png' },
  { title: 'Codex',       iconUrl: '/agent-icons/codex.png' },
  { title: 'GPT',         iconUrl: '/agent-icons/openai-light.png' },
];

// Cycle tuning. STEP_COUNT must equal the number of <Step> slots.
const STEP_COUNT = 9;
const STAGGER_MS = 70;
const FIRST_STEP_MS = 60;
const HOLD_MS = 3500;

// ─────────────────────────────────────────────────────────────────
// Brand icon
// ─────────────────────────────────────────────────────────────────

function BrandIcon({
  icon,
  size = 40,
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

// ─────────────────────────────────────────────────────────────────
// Step - visibility-driven wrapper. Pop-in on visible, instant snap to
// hidden when visible flips false. No CSS transition on hide.
// ─────────────────────────────────────────────────────────────────

function Step({
  visible,
  children,
  flex1,
}: {
  visible: boolean;
  children: ReactNode;
  flex1?: boolean;
}) {
  return (
    <div
      className={`${flex1 ? 'flex-1' : ''} ${
        visible ? 'home2-flow-step-visible' : 'home2-flow-step-hidden'
      }`}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Node primitives
// ─────────────────────────────────────────────────────────────────

function NodeCard({
  children,
  size = 84,
  hero,
}: {
  children: ReactNode;
  size?: number;
  hero?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--cryptix-surface-2)',
        boxShadow: hero
          ? '0 0 48px var(--cryptix-mint-glow), inset 0 0 0 1px rgba(167,139,250,0.4)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </div>
  );
}

// Labels are absolute-positioned below the card so the parent flex row
// can align by card center, not by node-plus-label center. This is what
// makes the arrows line up with the card centers across all three linear
// chain nodes.
function YourAgentNode({ agent }: { agent: Agent }) {
  return (
    <div className="relative">
      <NodeCard>
        {agent.iconUrl ? (
          <img
            src={agent.iconUrl}
            alt={agent.title}
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
        ) : agent.icon ? (
          <BrandIcon icon={agent.icon} colorOverride={agent.color} size={44} />
        ) : null}
      </NodeCard>
      <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--cryptix-text)' }}>
          {agent.title}
        </p>
      </div>
    </div>
  );
}

function VideoStage({ videoUrl, cycle }: { videoUrl: string; cycle: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-[28px]"
      style={{
        width: 198,
        height: 352,
        backgroundColor: '#000',
        boxShadow:
          '0 0 60px rgba(167,139,250,0.18), inset 0 0 0 2px rgba(167,139,250,0.45), inset 0 0 0 6px rgba(255,255,255,0.04)',
      }}
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-2 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full"
        style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
      />
      <video
        key={cycle}
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Arrows
// ─────────────────────────────────────────────────────────────────

function LinearArrow() {
  return (
    <div className="relative flex h-6 w-full items-center">
      <svg
        className="h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 24"
      >
        <line
          x1="0"
          y1="12"
          x2="100"
          y2="12"
          stroke="var(--cryptix-mint)"
          strokeWidth="1.6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="var(--cryptix-mint)" />
      </svg>
    </div>
  );
}

function FanOutArrows() {
  return (
    <svg
      width="120"
      height="188"
      viewBox="0 0 120 188"
      className="pointer-events-none"
    >
      <defs>
        <marker
          id="fan-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="var(--cryptix-mint)" />
        </marker>
      </defs>
      <path
        d="M 4,94 C 55,94 55,26 112,26"
        fill="none"
        stroke="var(--cryptix-mint)"
        strokeWidth="1.6"
        strokeLinecap="round"
        markerEnd="url(#fan-arrow)"
      />
      <path
        d="M 4,94 L 112,94"
        fill="none"
        stroke="var(--cryptix-mint)"
        strokeWidth="1.6"
        strokeLinecap="round"
        markerEnd="url(#fan-arrow)"
      />
      <path
        d="M 4,94 C 55,94 55,162 112,162"
        fill="none"
        stroke="var(--cryptix-mint)"
        strokeWidth="1.6"
        strokeLinecap="round"
        markerEnd="url(#fan-arrow)"
      />
    </svg>
  );
}

function SocialCard({
  icon,
  label,
  colorOverride,
}: {
  icon: SimpleIconType;
  label: string;
  colorOverride?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        backgroundColor: 'var(--cryptix-surface-2)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      <BrandIcon icon={icon} size={28} colorOverride={colorOverride} />
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--cryptix-text)' }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Orchestrator - single source of truth for cycle + step
// ─────────────────────────────────────────────────────────────────

export function Home2Flow() {
  const [cycle, setCycle] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < STEP_COUNT; i++) {
      timeouts.push(
        setTimeout(() => setStep(i + 1), FIRST_STEP_MS + i * STAGGER_MS),
      );
    }

    const cycleEnd =
      FIRST_STEP_MS + STEP_COUNT * STAGGER_MS + HOLD_MS;
    timeouts.push(
      setTimeout(() => {
        // Both updates batch into a single React commit → all elements
        // flip to hidden in the same frame the new cycle's agent/video
        // is selected. No leak of new content into the old visible scene.
        setStep(0);
        setCycle((c) => c + 1);
      }, cycleEnd),
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [cycle]);

  const agent = AGENTS[cycle % AGENTS.length];
  const videoUrl = HERO_VIDEOS[cycle % HERO_VIDEOS.length];

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 md:mt-[50px]">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-48 z-0 h-48"
          style={{
            background:
              'radial-gradient(ellipse 55% 100% at 50% 100%, rgba(107, 79, 229, 0.32), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 z-20 h-px w-[92%] -translate-x-1/2"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.4) 15%, #A78BFA 50%, rgba(167,139,250,0.4) 85%, transparent 100%)',
            boxShadow:
              '0 0 6px #A78BFA, 0 0 18px rgba(167,139,250,0.85), 0 0 40px rgba(167,139,250,0.5)',
          }}
        />
        {/* White pulse racing along the mint laser, left → right, looping. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 z-30 h-px w-[92%] -translate-x-1/2 overflow-hidden"
        >
          <div
            className="home2-flow-pulse absolute top-0 h-px"
            style={{
              width: '18%',
              background:
                'linear-gradient(90deg, transparent 0%, #FFFFFF 50%, transparent 100%)',
              boxShadow:
                '0 0 10px #FFFFFF, 0 0 24px rgba(255,255,255,0.65), 0 0 48px rgba(255,255,255,0.3)',
            }}
          />
        </div>

        <div
          className="relative rounded-2xl px-4 py-10 sm:px-10 sm:py-14"
          style={{
            backgroundColor: 'var(--cryptix-surface)',
            boxShadow:
              'inset 0 1px 0 rgba(167,139,250,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* On mobile (<640px) the linear chain is wider than the card
           *  itself, so we scale the whole thing down to fit. The inner
           *  flex still lays out at its natural size; transform scales
           *  the rendered visual, and the wrapper width is bumped to
           *  1/scale so the scaled box still fills the parent. The
           *  parent uses overflow-hidden + a fixed mobile height to
           *  collapse the empty vertical space that scale leaves behind. */}
          <div className="home2-flow-scale-wrap">
            <div className="home2-flow-scale">
              <div className="flex items-center gap-2">
            <Step visible={step >= 1}>
              <YourAgentNode agent={agent} />
            </Step>

            <Step visible={step >= 2} flex1>
              <LinearArrow />
            </Step>

            <Step visible={step >= 3}>
              <div className="relative">
                <NodeCard hero size={96}>
                  <AgentMediaLogo size={60} />
                </NodeCard>
                <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-center">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--cryptix-text)' }}
                  >
                    AgentMedia
                  </p>
                </div>
              </div>
            </Step>

            <Step visible={step >= 4} flex1>
              <LinearArrow />
            </Step>

            <Step visible={step >= 5}>
              <VideoStage videoUrl={videoUrl} cycle={cycle} />
            </Step>

            <Step visible={step >= 6}>
              <FanOutArrows />
            </Step>

            <div className="flex flex-col gap-4">
              <Step visible={step >= 7}>
                <SocialCard icon={siTiktok} label="TikTok" colorOverride="#FFFFFF" />
              </Step>
              <Step visible={step >= 8}>
                <SocialCard icon={siInstagram} label="Instagram" />
              </Step>
              <Step visible={step >= 9}>
                <SocialCard icon={siYoutube} label="YouTube" />
              </Step>
            </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
