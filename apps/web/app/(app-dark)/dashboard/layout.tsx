// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Dark dashboard shell -- /dashboard/* routes.
 *
 * Three-pane Huly-style layout: 240px sidebar on the left, full-bleed
 * dark content on the right. Sidebar shows ONLY three destinations
 * (Home, Brand Kit, Gallery) - no templates, no automations panel.
 *
 * Palette (pulled from the Huly reference the user shared):
 *   - bg              #0F1015   near-black navy
 *   - sidebar         #0B0C11   one step lighter
 *   - card            #14151F
 *   - card hover      #1B1C2A
 *   - border          rgba(255,255,255,0.06)
 *   - text            #E9E9F0
 *   - muted           rgba(255,255,255,0.55)
 *   - accent (warm)   #A78BFA   (used for highlights + glow)
 *   - purple (cool)   #A78BFA   (secondary highlights)
 *
 * Everything in this tree should pull from these tokens.
 */

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Palette, Images, LogOut, Loader2, LifeBuoy, BookOpen, Sparkles, ListChecks, KeyRound, Share2, ShieldCheck, Bot } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { createClient } from '@/lib/supabase/client';
import { goToMarketingSite } from '@/lib/marketing';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { SupportModal } from '@/components/support-modal';

// Clean hover tooltip for the collapsed agent rail — a dark pill to the RIGHT of
// the icon, instant (no native-title delay), styled to the dashboard tokens.
// Pure CSS via the parent's `group` + group-hover; no JS, no deps.
function RailTip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium opacity-0 transition-opacity duration-100 group-hover:opacity-100"
      style={{ background: '#1B1C2A', border: '1px solid rgba(255,255,255,0.12)', color: '#E9E9F0', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
    >
      {label}
    </span>
  );
}

const NAV = [
  { href: '/dashboard',           label: 'Home',         icon: Home },
  { href: '/dashboard/agent',     label: 'Agent',        icon: Bot },
  { href: '/dashboard/jobs',      label: 'Jobs',         icon: ListChecks },
  { href: '/dashboard/gallery',   label: 'Gallery',      icon: Images },
  { href: '/dashboard/social',    label: 'Social',       icon: Share2 },
  { href: '/dashboard/api-keys',  label: 'API Keys',     icon: KeyRound },
  { href: '/dashboard/brand-kit', label: 'Brand Kit',    icon: Palette },
] as const;

export default function DashboardDarkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
    })();
  }, []);

  // Credit balance — refreshed periodically so it reflects new runs / top-ups.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await invokeFn('credits-check', { method: 'GET' });
        const t = (data as { credits?: { total?: number } } | null)?.credits?.total;
        if (!cancelled && typeof t === 'number') setCredits(t);
      } catch { /* ignore */ }
    };
    void load();
    const iv = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // `/` on this host bounces a signed-out visitor straight back to /login.
    goToMarketingSite();
  }

  const navItems = isAdminEmail(email)
    ? [...NAV, { href: '/dashboard/admin', label: 'Admin', icon: ShieldCheck }]
    : [...NAV];
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  // Agent mode: collapse the global nav to a slim ICON rail so the agent's own
  // chat-history rail becomes the primary left panel (Cowork-style). Labels move
  // to hover tooltips; the full sidebar returns on every other dashboard route.
  const isAgent = pathname === '/dashboard/agent' || pathname.startsWith('/dashboard/agent/');
  if (isAgent) {
    return (
      <div className="flex min-h-screen" style={{ backgroundColor: '#0F1015', color: '#E9E9F0' }}>
        <aside
          className="sticky top-0 hidden h-screen w-[56px] shrink-0 flex-col items-center lg:flex"
          style={{ backgroundColor: '#0B0C11', borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Logo (→ Home) */}
          <Link href="/dashboard" aria-label="agent-media — Home" className="group relative flex h-16 shrink-0 items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 0 24px rgba(167,139,250,0.18)' }} aria-hidden>
              <AgentMediaLogo size={22} color="#0B0C11" />
            </span>
            <RailTip label="Home" />
          </Link>

          {/* Icon nav */}
          <nav className="mt-3 flex flex-1 flex-col items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className="group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
                  style={{ backgroundColor: active ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                >
                  {active ? (
                    <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r" style={{ background: 'linear-gradient(180deg,#A78BFA,#7C3AED)', boxShadow: '0 0 10px rgba(167,139,250,0.5)' }} />
                  ) : null}
                  <item.icon className="h-[18px] w-[18px] transition-colors group-hover:text-white" style={{ color: active ? '#A78BFA' : 'rgba(255,255,255,0.55)' }} />
                  <RailTip label={item.label} />
                </Link>
              );
            })}
          </nav>

          {/* Get more credits */}
          <Link
            href="/dashboard/billing"
            aria-label="Get more credits"
            className="group relative mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(90deg,#A78BFA,#7C3AED)' }}
          >
            <Sparkles className="h-4 w-4" style={{ color: '#0F1015' }} />
            <RailTip label={`Credits: ${credits === null ? '…' : credits.toLocaleString()} — Get more`} />
          </Link>

          {/* User + logout */}
          <div className="mb-4 flex flex-col items-center gap-2">
            {email ? (
              <span className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase" style={{ background: 'linear-gradient(135deg,#B59BFC,#7C3AED)', color: '#FFFFFF' }}>
                {email.slice(0, 2)}
                <RailTip label={email} />
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label="Log out"
              className="group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:opacity-60"
              style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              <RailTip label="Log out" />
            </button>
          </div>
        </aside>

        <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#0F1015', color: '#E9E9F0' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col lg:flex"
        style={{ backgroundColor: '#0B0C11', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div
          className="flex h-16 shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{
              backgroundColor: '#FFFFFF',
              boxShadow: '0 0 24px rgba(167,139,250,0.18)',
            }}
            aria-hidden
          >
            <AgentMediaLogo size={22} color="#0B0C11" />
          </span>
          <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>
            agent-media
          </span>
        </div>

        {/* Nav */}
        <nav className="mt-4 flex-1 px-3">
          <p
            className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'rgba(255,255,255,0.32)' }}
          >
            Workspace
          </p>
          <ul className="flex flex-col gap-1">
            {(isAdminEmail(email) ? [...NAV, { href: '/dashboard/admin', label: 'Admin', icon: ShieldCheck }] : NAV).map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
                    style={{
                      color: active ? '#E9E9F0' : 'rgba(255,255,255,0.65)',
                      backgroundColor: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                    }}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r"
                        style={{
                          background: 'linear-gradient(180deg,#A78BFA,#7C3AED)',
                          boxShadow: '0 0 10px rgba(167,139,250,0.5)',
                        }}
                      />
                    ) : null}
                    <item.icon
                      className="h-4 w-4 transition-colors group-hover:text-white"
                      style={{
                        color: active ? '#A78BFA' : 'rgba(255,255,255,0.55)',
                      }}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Credit balance + Get more */}
        <div className="px-4 pt-3">
          <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: '#14151F', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Credits</span>
              <span className="font-mono text-sm font-semibold" style={{ color: '#E9E9F0' }}>
                {credits === null ? '…' : credits.toLocaleString()}
              </span>
            </div>
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(90deg,#A78BFA,#7C3AED)', color: '#0F1015' }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Get more
            </Link>
          </div>
        </div>

        {/* Support + Docs row — above the user block */}
        <div
          className="px-4 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors"
              style={{
                color: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <LifeBuoy className="h-3 w-3" />
              Support
            </button>
            <Link
              href="/dashboard/docs"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors"
              style={{
                color: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <BookOpen className="h-3 w-3" />
              Docs
            </Link>
          </div>
        </div>

        {/* User block */}
        <div className="flex flex-col gap-3 px-4 py-4">
          {email ? (
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase"
                style={{
                  background: 'linear-gradient(135deg,#B59BFC,#7C3AED)',
                  color: '#FFFFFF',
                }}
                aria-hidden
              >
                {email.slice(0, 2)}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium" style={{ color: '#E9E9F0' }}>
                  {email.split('@')[0]}
                </span>
                <span className="truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {email}
                </span>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60"
            style={{
              color: 'rgba(255,255,255,0.65)',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {signingOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Log out
          </button>
        </div>
      </aside>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
