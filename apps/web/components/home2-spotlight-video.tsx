// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - Single-video spotlight section.
 *
 * White full-bleed section that sits directly under the video showcase.
 * Reference: huly.io's "Work together. Like in the office." block -
 * centered bold headline, supporting copy, then one big rounded video
 * tile dropped centre stage.
 *
 * The video src is intentionally left blank for now. Drop the asset
 * URL into VIDEO_SRC when it arrives.
 */

const VIDEO_SRC: string | undefined =
  'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/brand-extracts/subtitle/120eaf6f-d2af-4f66-83e8-e62ec826de01/3f2c5f0a-61c6-45b0-a855-f2484b95d65d-subs/subtitled.mp4';
const POSTER: string | undefined = undefined;

export function Home2SpotlightVideo() {
  return (
    <section className="relative w-full overflow-hidden bg-white py-16 sm:py-32">
      <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
        <h2
          className="mx-auto max-w-4xl font-normal text-black"
          style={{
            fontSize: 'clamp(36px, 5vw, 72px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Built for every agent.
          <br />
          Shipped from any tool.
        </h2>
        <p
          className="mx-auto mt-6 max-w-xl text-base sm:text-lg"
          style={{ color: 'rgba(0,0,0,0.55)', lineHeight: 1.55 }}
        >
          One render pipeline - Claude Code, Cursor, n8n, MCP, REST, CLI.
          Your agent prompts, AgentMedia produces, the post goes live.
        </p>

        {/* White glowing frame - wraps the video well. Outer card is
            white with a thin border + thick blue-tinted glow ring; the
            video sits inside on a small padding so the white frame is
            visible. Matches huly.io's "Work together" tile aesthetic. */}
        <div
          className="relative mx-auto mt-12"
          style={{ maxWidth: '420px' }}
        >
          {/* Soft outer glow halo */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 -z-10 rounded-[44px] sm:-inset-12"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 50%, rgba(176,200,255,0.55) 0%, rgba(220,232,255,0.25) 45%, rgba(255,255,255,0) 80%)',
              filter: 'blur(24px)',
            }}
          />
          <div
            className="relative rounded-[28px] bg-white p-2 sm:p-3"
            style={{
              boxShadow:
                '0 0 0 1px rgba(255,255,255,1), 0 24px 60px -10px rgba(120,150,210,0.35), 0 0 80px 6px rgba(190,210,250,0.5)',
            }}
          >
            {/* Animated white pulse tracing the rounded frame perimeter.
             *  preserveAspectRatio="none" + an aspect-matched viewBox lets
             *  rx/ry render uniformly on both axes (container is locked
             *  to 16:9 via aspectRatio CSS). pathLength="100" normalises
             *  the perimeter so the keyframe is a clean 0 -> -100.
             *  vector-effect="non-scaling-stroke" keeps the line at 3 CSS
             *  pixels regardless of container size. */}
            <svg
              aria-hidden
              className="home2-spotlight-pulse-svg pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
              viewBox="0 0 540 960"
              preserveAspectRatio="none"
            >
              <rect
                x="0"
                y="0"
                width="540"
                height="960"
                rx="28"
                ry="28"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
                pathLength="100"
                strokeDasharray="6 94"
                strokeDashoffset="0"
                className="home2-spotlight-pulse"
                style={{
                  filter:
                    'drop-shadow(0 0 4px #FFFFFF) drop-shadow(0 0 14px rgba(255,255,255,0.7)) drop-shadow(0 0 32px rgba(255,255,255,0.35))',
                }}
              />
            </svg>
            <div
              className="relative overflow-hidden rounded-[22px] bg-[#0e0e0e]"
              style={{ aspectRatio: '9 / 16' }}
            >
              {VIDEO_SRC ? (
                <video
                  className="h-full w-full object-cover"
                  src={VIDEO_SRC}
                  poster={POSTER}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <div
                  aria-hidden
                  className="h-full w-full"
                  style={{
                    background:
                      'radial-gradient(60% 70% at 50% 40%, rgba(167,139,250,0.20) 0%, rgba(20,15,40,0) 70%), linear-gradient(180deg, #141027 0%, #0e0e0e 100%)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
