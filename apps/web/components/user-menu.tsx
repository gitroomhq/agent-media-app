'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { goToMarketingSite } from '@/lib/marketing';

export function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [initials, setInitials] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? '');
        const name =
          user.user_metadata?.display_name ??
          user.user_metadata?.full_name ??
          user.email ??
          '';
        const parts = name.split(/[\s@]+/);
        setInitials(
          parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : name.slice(0, 2).toUpperCase(),
        );
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Leaves for the marketing site, not /login, and clears the parent-domain
    // session hint on the way out. See lib/marketing.ts.
    goToMarketingSite();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card-hover text-xs text-text-muted transition-colors hover:border-[#121212]/50 hover:text-[#121212]"
      >
        {initials || <User className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-card shadow-lg">
          {email && (
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-xs text-text">{email}</p>
            </div>
          )}
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-text-muted transition-colors hover:bg-card-hover hover:text-text"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text-muted transition-colors hover:bg-card-hover hover:text-danger disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
