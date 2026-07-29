// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - Primary CTA button (Huly-style).
 *
 * Reusable wrapper around the layered-glow button. Two variants:
 *   - light: white-grey pill (#d1d1d1) with dark-orange-brown text
 *   - dark:  black pill (#0e0e0e) with cream text
 *
 * Both variants share the same outer halo (`.border-button-light-blur`
 * + `.border-button-light`) and the inner clipped glow layers anchored
 * to the right via translateX(114.199px). The orange comet reads
 * against either background.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

interface Home2CTAButtonProps {
  href: string;
  children: ReactNode;
  variant?: 'light' | 'dark';
  size?: 'md' | 'lg';
  showArrow?: boolean;
  className?: string;
}

export function Home2CTAButton({
  href,
  children,
  variant = 'light',
  size = 'md',
  showArrow = true,
  className = '',
}: Home2CTAButtonProps) {
  const isLight = variant === 'light';
  const isLg = size === 'lg';
  const textColor = isLight ? '#5A250A' : '#F4D2BF';

  return (
    <div className={`relative z-10 inline-flex items-center ${className}`}>
      <div
        className="border-button-light-blur pointer-events-none absolute left-1/2 top-1/2 h-[calc(100%+9px)] w-[calc(100%+9px)] -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform"
        style={{ opacity: 1 }}
      >
        <div
          className={`${
            isLight ? 'border-button-light' : 'border-button-dark'
          } relative h-full w-full rounded-full`}
        />
      </div>
      <Link
        href={href}
        className={`relative z-10 flex ${
          isLg ? 'h-14 px-12 sm:pl-[72px] sm:pr-[64px]' : 'h-10 px-8 sm:pl-[59px] sm:pr-[52px]'
        } items-center justify-center space-x-1 overflow-hidden rounded-full border font-bold uppercase tracking-[-0.015em] transition-colors duration-200`}
        style={{
          fontSize: isLg ? '14px' : '12px',
          backgroundColor: isLight ? '#d1d1d1' : '#0e0e0e',
          borderColor: isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.22)',
        }}
      >
        <div
          aria-hidden
          className="absolute -z-10 flex w-[204px] items-center justify-center"
          style={{ transform: 'translateX(114.199px) translateZ(0)' }}
        >
          <div
            className="absolute top-1/2 h-[121px] w-[121px] -translate-y-1/2"
            style={{
              background: isLight
                ? 'radial-gradient(50% 50% at 50% 50%, #FFFFF5 3.5%, #FFAA81 26.5%, #FFDA9F 37.5%, rgba(255,170,129,0.50) 49%, rgba(210,106,58,0.00) 92.5%)'
                : 'radial-gradient(50% 50% at 50% 50%, #5a4490 3.5%, #3a2c66 26.5%, #271c4a 37.5%, rgba(26,18,48,0.50) 49%, rgba(0,0,0,0.00) 92.5%)',
            }}
          />
          <div
            className="absolute top-1/2 h-[103px] w-[204px] -translate-y-1/2 blur-[5px]"
            style={{
              background: isLight
                ? 'radial-gradient(43.3% 44.23% at 50% 49.51%, #FFFFF7 29%, #FFFACD 48.5%, #F4D2BF 60.71%, rgba(214,211,210,0.00) 100%)'
                : 'radial-gradient(43.3% 44.23% at 50% 49.51%, #4a3a7d 29%, #2e2155 48.5%, #1f1740 60.71%, rgba(15,10,30,0.00) 100%)',
            }}
          />
        </div>
        <span style={{ color: textColor }}>{children}</span>
        {showArrow ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 17 9"
            className="h-[9px] w-[17px]"
            style={{ color: textColor }}
            aria-hidden
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
              d="m12.495 0 4.495 4.495-4.495 4.495-.99-.99 2.805-2.805H0v-1.4h14.31L11.505.99z"
            />
          </svg>
        ) : null}
      </Link>
    </div>
  );
}
