// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Images, CreditCard, Settings, BookOpen, Users, PlusCircle, ShieldCheck, Sparkles, Activity, MessageCircle } from 'lucide-react';

// Set NEXT_PUBLIC_DISCORD_INVITE_URL in Vercel for the Support link to
// appear. We don't ship a hardcoded URL because invites rotate.
const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? '';
import { UserMenu } from '@/components/user-menu';
import { CreditPill } from '@/components/credit-pill';
import { PostizLogo } from '@/components/postiz-logo';
import { createClient } from '@/lib/supabase/client';

const ADMIN_EMAILS = new Set(['yuvalsuede@gmail.com', 'nevo@postiz.com']);

// Two-tier sidebar: workflow items at top, account / utility / admin
// pinned to the bottom of the rail so they don't compete with the
// daily-driver routes for visual weight.
const primaryNavItems = [
  { href: '/create', label: 'Create with Template', icon: PlusCircle },
  { href: '/content-machine', label: 'Content Machine', icon: Sparkles },
  { href: '/jobs', label: 'Auto posting', icon: Activity },
  { href: '/integrations/postiz', label: 'Postiz auto content', icon: PostizLogo, isLogo: true },
  { href: '/gallery', label: 'Gallery', icon: Images },
  { href: '/actors', label: 'Actors', icon: Users },
];

const secondaryNavItems = [
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/docs', label: 'Docs', icon: BookOpen },
];

// Used by the mobile top-bar (no room for two-tier there).
const navItems = [...primaryNavItems, ...secondaryNavItems];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email && ADMIN_EMAILS.has(user.email)) {
        setIsAdmin(true);
      }
    }
    checkAdmin();
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-hidden border-r border-border bg-white lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-[#121212]">
            agent-media
          </Link>
        </div>

        {/* Primary nav — daily-driver routes */}
        <nav className="mt-4 flex-1 space-y-1 px-3">
          {primaryNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const isContentMachine = item.href === '/content-machine';
            const baseClasses = 'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all';
            // Content Machine = strong purple neon (the hero CTA in the
            // sidebar). Everything else = neutral.
            const stateClasses = isContentMachine
              ? isActive
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_0_24px_rgba(168,85,247,0.65)] ring-1 ring-fuchsia-300/50'
                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)] hover:shadow-[0_0_28px_rgba(168,85,247,0.7)] hover:scale-[1.02]'
              : isActive
                ? 'bg-[#121212]/10 text-[#121212]'
                : 'text-text-muted hover:bg-card-hover hover:text-text';
            const isLogo = 'isLogo' in item && item.isLogo === true;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${baseClasses} ${stateClasses}`}
                aria-label={item.label}
              >
                {isLogo ? (
                  <item.icon className="h-5 w-auto" />
                ) : (
                  <>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Secondary nav — account / utility / admin pinned to bottom */}
        <nav className="mb-4 space-y-1 border-t border-border px-3 pt-4">
          {DISCORD_URL && (
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-card-hover hover:text-text"
            >
              <MessageCircle className="h-4 w-4" />
              Support · Discord
            </a>
          )}
          {secondaryNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#121212]/10 text-[#121212]'
                    : 'text-text-muted hover:bg-card-hover hover:text-text'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/dashboard/admin"
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname.startsWith("/dashboard/admin")
                  ? 'bg-[#121212]/10 text-[#121212]'
                  : 'text-text-muted hover:bg-card-hover hover:text-text'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}
        </nav>
      </aside>

      {/* ── Main area ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-[#121212] lg:hidden">
            agent-media
          </Link>
          <div className="flex items-center gap-4">
            {/* Mobile nav */}
            <nav className="flex items-center gap-4 lg:hidden">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const isLogo = 'isLogo' in item && item.isLogo === true;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`transition-colors ${
                      isActive ? 'text-accent' : 'text-text-muted hover:text-text'
                    }`}
                    aria-label={item.label}
                  >
                    <item.icon className={isLogo ? 'h-5 w-auto' : 'h-5 w-5'} />
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/dashboard/admin"
                  className={`transition-colors ${
                    pathname.startsWith("/dashboard/admin") ? 'text-accent' : 'text-text-muted hover:text-text'
                  }`}
                >
                  <ShieldCheck className="h-5 w-5" />
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <CreditPill />
            <UserMenu />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
