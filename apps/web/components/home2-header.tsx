// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - Cryptix-style sticky header.
 *
 * Layout reference: cryptix.framer.website. Two non-obvious specs lifted
 * from the live page that we replicate exactly:
 *
 *   1. Alignment - logo + nav cluster LEFT, CTA pushes RIGHT. NOT a
 *      three-pane justify-between (which scatters them evenly). The nav
 *      items sit immediately next to the wordmark.
 *
 *   2. Scrolled CTA promotion - the right-side pill starts as a faint
 *      outline (#FFFFFF18 inner-shadow border, transparent fill) at the
 *      top of the page, then transitions to the primary mint state
 *      (#A78BFA fill + 32px mint glow at 24%) once the user scrolls past
 *      a threshold. Same color as the hero CTA mid-page so the most
 *      important action gets visually louder as you go down.
 *
 * Mounted from app/home2/layout.tsx so it inherits .theme-cryptix tokens.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';

const NAV_ITEMS = [
  { label: 'How it works',  href: '/#how-it-works' },
  { label: 'Skills & CLI',  href: '/skills' },
  // Pricing → the on-page <Home2Pricing> section. The standalone
  // /pricing page exists for back-compat but the menu deliberately
  // routes to the homepage section so users don't get bounced to a
  // separate page.
  { label: 'Pricing',       href: '/#pricing' },
  // Docs → the Skills & CLI hub. The old /skill install page is gone;
  // this MUST point at /skills (not /skill, which 404s).
  { label: 'Docs',          href: '/skills' },
];

// Threshold past which the CTA promotes to its mint-filled state. Cryptix
// uses ~80px; matching that so the transition feels familiar.
const SCROLL_PROMOTE_PX = 80;

export function Home2Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_PROMOTE_PX);
    }
    onScroll(); // capture initial state in case of refresh mid-page
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="relative z-40 w-full">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* ── Left cluster: logo + nav adjacent ──────────────── */}
        <div className="flex items-center gap-10">
          <Link href="/home2" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <AgentMediaLogo size={34} />
            <span
              className="text-xl font-semibold"
              style={{
                color: 'var(--cryptix-text)',
                letterSpacing: '-0.01em',
              }}
            >
              AgentMedia
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="transition-colors hover:text-white"
                style={{
                  color: 'var(--cryptix-text-muted)',
                  fontSize: '16px',
                  fontWeight: 400,
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* ── Right cluster: CTA + mobile burger ─────────────── */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <Home2CTAButton
              href="/login"
              variant={scrolled ? 'light' : 'dark'}
              showArrow={false}
            >
              Open app
            </Home2CTAButton>
          </div>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full md:hidden"
            style={{
              color: 'var(--cryptix-text)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
            }}
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu sheet */}
      {open ? (
        <div
          className="md:hidden"
          style={{
            position: 'fixed',
            inset: '64px 0 0 0',
            zIndex: 50,
            backgroundColor: 'var(--cryptix-bg)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex flex-col gap-1 px-6 pt-8">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-2xl px-4 py-4 text-lg transition-colors hover:bg-white/5"
                style={{ color: 'var(--cryptix-text)' }}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-6 flex justify-center">
              <Home2CTAButton
                href="/login"
                variant="light"
                size="lg"
                showArrow={false}
              >
                Open app
              </Home2CTAButton>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
