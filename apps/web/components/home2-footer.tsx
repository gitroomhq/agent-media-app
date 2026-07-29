// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - Footer.
 *
 * Mirrors the live landing footer (apps/web/app/(landing)/layout.tsx)
 * so the same link surface ships on /home2, just restyled with the
 * theme-cryptix tokens (dark purple + orange accent CTAs).
 *
 * Structure: a brand block on the left (tagline + CTAs) plus a 5-column
 * link grid on the right (Product / By industry / Developer / Compare /
 * Company + Legal). A hairline closes the page.
 */

import Link from 'next/link';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';

const GRID_LINE = 'rgba(255,255,255,0.08)';

type Linkable = { label: string; href: string; external?: boolean };

const PRODUCT_LINKS: Linkable[] = [
  { label: 'Features',       href: '/#features' },
  { label: 'AI UGC',         href: '/ai-ugc' },
  { label: 'Skill Center',   href: '/skills' },
  { label: 'Pricing',        href: '/#pricing' },
  { label: 'Use Cases',      href: '/use-cases' },
  { label: 'Best UGC Tools', href: '/best' },
  { label: 'UGC Guides',     href: '/how-to' },
  { label: 'Blog',           href: '/blog' },
];

const DEVELOPER_LINKS: Linkable[] = [
  // TypeScript SDK + Python SDK intentionally not surfaced; the CLI +
  // MCP + skill paths are the canonical developer surface now.
  { label: 'Install (Claude / Cursor)', href: '/skills' },
  { label: 'API Reference',             href: 'https://github.com/gitroomhq/agent-media/blob/main/docs/api-reference.md', external: true },
  { label: 'CLI on npm',                href: 'https://www.npmjs.com/package/agent-media-cli', external: true },
  { label: 'MCP Server',                href: 'https://www.npmjs.com/package/@agentmedia/mcp-server', external: true },
  { label: 'GitHub',                    href: 'https://github.com/gitroomhq/agent-media', external: true },
  { label: 'llms.txt',                  href: '/llms.txt', external: true },
];

const COMPARE_LINKS: Linkable[] = [
  { label: 'HeyGen',    href: '/compare/heygen-alternative' },
  { label: 'Synthesia', href: '/compare/synthesia-alternative' },
  { label: 'Arcads',    href: '/compare/arcads-alternative' },
  { label: 'Creatify',  href: '/compare/creatify-alternative' },
  { label: 'Arcads MCP',    href: '/compare/arcads-mcp' },
  { label: 'Synthesia MCP', href: '/compare/synthesia-mcp' },
  { label: 'HeyGen pricing', href: '/pricing/heygen' },
  { label: 'Cheapest AI UGC', href: '/cheapest-ai-ugc-video' },
];

const COMPANY_LINKS: Linkable[] = [
  { label: 'GitHub',  href: 'https://github.com/gitroomhq/agent-media', external: true },
  { label: 'Discord', href: 'https://discord.postiz.com/',              external: true },
  { label: 'Terms',   href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
];

function FooterColumn({ title, links }: { title: string; links: Linkable[] }) {
  return (
    <div>
      <h4
        className="mb-5 text-xs font-medium uppercase tracking-wider"
        style={{ color: 'var(--cryptix-text-muted)' }}
      >
        {title}
      </h4>
      <ul className="flex flex-col gap-3 text-sm">
        {links.map((link) => {
          const className = 'transition-opacity hover:opacity-70';
          const style = { color: 'var(--cryptix-text)' } as const;
          return (
            <li key={link.label}>
              {link.external ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                  style={style}
                >
                  {link.label}
                </a>
              ) : (
                <Link href={link.href} className={className} style={style}>
                  {link.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Home2Footer() {
  return (
    <footer
      className="relative"
      style={{ borderTop: `1px solid ${GRID_LINE}` }}
    >
      <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-10 sm:py-20 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand block */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2.5">
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
            </div>
            <h2
              className="mt-8 max-w-sm font-extrabold uppercase leading-[1.05] tracking-tight"
              style={{
                color: 'var(--cryptix-text)',
                fontSize: 'clamp(24px, 3vw, 40px)',
              }}
            >
              The developer-first AI UGC video platform.
            </h2>
            <p
              className="mt-6 max-w-sm"
              style={{
                color: 'var(--cryptix-text-muted)',
                fontSize: '16px',
                lineHeight: 1.55,
              }}
            >
              Generate UGC ads from a CLI, an MCP server, or a Claude Code
              skill. Made for agents.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
              <Home2CTAButton href="/login" variant="light" size="lg">Get started</Home2CTAButton>
              <Home2CTAButton href="/docs/api-reference" variant="dark" size="lg" showArrow={false}>
                Read the docs
              </Home2CTAButton>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-4 lg:col-span-8">
            <FooterColumn title="Product"   links={PRODUCT_LINKS} />
            <FooterColumn title="Developer" links={DEVELOPER_LINKS} />
            <FooterColumn title="Compare"   links={COMPARE_LINKS} />
            <FooterColumn title="Company"   links={COMPANY_LINKS} />
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-20 flex flex-col gap-4 pt-8 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: `1px solid ${GRID_LINE}` }}
        >
          <p
            className="text-sm"
            style={{ color: 'var(--cryptix-text-muted)' }}
          >
            &copy; {new Date().getFullYear()} agent-media. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/terms"
                className="text-sm transition-opacity hover:opacity-70"
                style={{ color: 'var(--cryptix-text-muted)' }}
              >
                Terms
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="text-sm transition-opacity hover:opacity-70"
                style={{ color: 'var(--cryptix-text-muted)' }}
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/refund"
                className="text-sm transition-opacity hover:opacity-70"
                style={{ color: 'var(--cryptix-text-muted)' }}
              >
                Refund Policy
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
