// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useId } from 'react';

/**
 * agent-media brand mark.
 *
 * Replaces the previous jellyfish vector with the mark used on agent-media.ai:
 * a rounded square carrying the chevron, in the brand purples (#9162FF →
 * #4500E7 over a #6112FF radial).
 *
 * Gradient ids are per-instance via useId. SVG defs live in a global id space,
 * so two of these on one page with hardcoded ids would make the second silently
 * adopt the first's gradients.
 *
 * `color` is kept for call-site compatibility and applies to the wordmark only;
 * the mark is gradient-filled by design and ignores it.
 */
interface AgentMediaLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

export function AgentMediaLogo({
  size = 32,
  className,
}: AgentMediaLogoProps) {
  const uid = useId().replace(/:/g, '');
  const a = `am-${uid}-a`;
  const b = `am-${uid}-b`;
  const c = `am-${uid}-c`;
  const d = `am-${uid}-d`;
  const e = `am-${uid}-e`;
  const f = `am-${uid}-f`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 27.19 27.19"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="agent-media"
      className={className}
    >
      <title>agent-media</title>
      <g clipPath={`url(#${a})`}>
        <rect width="27.19" height="27.19" fill={`url(#${b})`} rx="6.43" />
        <path
          fill={`url(#${c})`}
          fillRule="evenodd"
          d="M0 29.23V-2.06L22.12 9.99v7.46z"
          clipRule="evenodd"
        />
        <mask
          id={d}
          width="23"
          height="36"
          x="0"
          y="-4"
          maskUnits="userSpaceOnUse"
          style={{ maskType: 'alpha' }}
        >
          <path fill="#d9d9d9" d="M0-3.84h22.12v34.87H0z" />
        </mask>
        <g mask={`url(#${d})`}>
          <path fill={`url(#${e})`} d="m42.33-1.9-64.3 37.13 3.48 6.04L45.8 4.14z" />
          <path fill={`url(#${f})`} d="M-18.57-13.72 45.74 23.4l-3.48 6.03-64.31-37.13z" />
        </g>
      </g>
      <defs>
        <linearGradient
          id={c}
          x1="22.12"
          x2="0"
          y1="13.6"
          y2="13.6"
          gradientUnits="userSpaceOnUse"
        >
          <stop />
          <stop offset="1" stopColor="#2a008d" />
        </linearGradient>
        <linearGradient
          id={e}
          x1="44.5"
          x2="-20.41"
          y1=".37"
          y2="37.84"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".32" stopColor="#9162ff" />
          <stop offset=".69" stopColor="#4500e7" />
        </linearGradient>
        <linearGradient
          id={f}
          x1="-20.74"
          x2="44.18"
          y1="-11.46"
          y2="26.02"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".32" stopColor="#9162ff" />
          <stop offset=".69" stopColor="#4500e7" />
        </linearGradient>
        <radialGradient
          id={b}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(38.3537 13.5971) rotate(-180) scale(38.3537 29.9787)"
          gradientUnits="userSpaceOnUse"
        >
          <stop />
          <stop offset="1" stopColor="#6112ff" />
        </radialGradient>
        <clipPath id={a}>
          <rect width="27.19" height="27.19" fill="#fff" rx="6.43" />
        </clipPath>
      </defs>
    </svg>
  );
}
