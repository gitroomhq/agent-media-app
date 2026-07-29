// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - Client-only wrapper around the Three.js LaserFlow shader.
 *
 * Lives in a client boundary because Next.js doesn't allow
 * `dynamic(..., { ssr: false })` inside Server Components. The shader
 * uses WebGL + animation frames so SSR would crash anyway.
 *
 * Rendered behind the hero section, pointer-events disabled.
 */

import dynamic from 'next/dynamic';

const LaserFlow = dynamic(() => import('@/components/LaserFlow'), {
  ssr: false,
});

const LiquidEther = dynamic(() => import('@/components/LiquidEther'), {
  ssr: false,
});

export function Home2LaserHero() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-20 z-0 h-[1300px] overflow-hidden"
    >
      {/* Dark blue atmospheric layer BEHIND the laser - provides the
       * Huly-style "bluish-dark purple cloud" around the white beam.
       * Two radials: one wide+tall behind the beam shaft, plus broader
       * ambient drift to either side. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(28% 55% at 50% 70%, rgba(60, 80, 180, 0.28) 0%, rgba(40, 50, 130, 0.16) 35%, rgba(20, 25, 80, 0.0) 75%),
            radial-gradient(55% 38% at 50% 92%, rgba(80, 100, 200, 0.24) 0%, rgba(40, 55, 140, 0.10) 50%, transparent 80%)
          `,
        }}
      />
      {/* LiquidEther - vendored react-bits WebGL fluid sim. Rendered as
       * fog wisps that drift continuously behind the laser beam. Colors
       * picked to match Huly's grey-on-lavender ether. opacity dialed
       * down so it reads as atmosphere, not as the main visual. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen"
      >
        <LiquidEther
          colors={['#dfdcec', '#414141', '#000000']}
          autoDemo
          autoSpeed={0.35}
          autoIntensity={1.8}
          mouseForce={0}
          cursorSize={140}
          resolution={0.5}
          autoMargin={0.72}
          noInteract
        />
      </div>
      <LaserFlow
        color="#6B4FE5"
        horizontalBeamOffset={0.13}
        verticalBeamOffset={-0.04}
        horizontalSizing={0.42}
        verticalSizing={2.6}
        wispDensity={1}
        wispSpeed={14}
        wispIntensity={7}
        flowSpeed={0.4}
        flowStrength={0.3}
        fogIntensity={0.4}
        fogScale={0.3}
        fogFallSpeed={0.6}
        decay={1.1}
        falloffStart={1.2}
      />
    </div>
  );
}
