// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - "Ready" closing CTA.
 *
 * Centered call-to-action that sits between the FAQ and the footer.
 * Big headline, supporting copy, a primary CTA, and a row of social
 * icons (mirrors huly.io's "Join the Movement" block).
 */

import { Home2CTAButton } from '@/components/home2-cta-button';
import { siGithub, siX, siYoutube, siDiscord } from 'simple-icons';

// LinkedIn was removed from simple-icons in mid-2024 (brand-protection
// request). Inline the official path so we don't depend on it.
const LINKEDIN_PATH =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

const SOCIALS: { path: string; href: string; label: string }[] = [
  { path: siX.path,        href: 'https://x.com/agentmedia',                     label: 'X (Twitter)' },
  { path: LINKEDIN_PATH,   href: 'https://www.linkedin.com/company/agent-media', label: 'LinkedIn' },
  { path: siGithub.path,   href: 'https://github.com/gitroomhq/agent-media',     label: 'GitHub' },
  { path: siYoutube.path,  href: 'https://www.youtube.com/@agentmedia',          label: 'YouTube' },
  { path: siDiscord.path,  href: 'https://discord.postiz.com/',                  label: 'Discord' },
];

export function Home2Ready() {
  return (
    <section className="relative px-6 py-24 text-center sm:py-32">
      <h2
        className="mx-auto max-w-2xl font-normal"
        style={{
          color: 'var(--cryptix-text)',
          fontSize: 'clamp(32px, 4vw, 56px)',
          letterSpacing: '-0.025em',
          lineHeight: 1.1,
        }}
      >
        Ready to put your agent
        <br />
        on the social grind?
      </h2>
      <p
        className="mx-auto mt-6 max-w-lg"
        style={{
          color: 'var(--cryptix-text-muted)',
          fontSize: '16px',
          lineHeight: 1.6,
        }}
      >
        Join the developers and creators using AgentMedia to ship UGC and ads
        from every agent - script, render, and auto-publish in one
        command - with optional captions.
      </p>

      <div className="mt-10 flex justify-center">
        <Home2CTAButton href="/login" variant="light" size="lg">Get started</Home2CTAButton>
      </div>

      <ul className="mt-12 flex flex-wrap items-center justify-center gap-6">
        {SOCIALS.map((s) => (
          <li key={s.label}>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{
                color: 'var(--cryptix-text-muted)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                role="img"
                aria-hidden
              >
                <path d={s.path} />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
