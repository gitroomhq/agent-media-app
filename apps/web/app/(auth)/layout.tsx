// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // /subscribe renders the site's own dark pricing cards, so it brings its own
  // width and its own background. It used to be `fullWidth` inside the light
  // frame below, which put black-on-dark cards on a #ededed page.
  const darkFrame = pathname?.startsWith('/subscribe') === true;
  // Routes that ship their own full-bleed layout. The shared light
  // frame below would fight those designs, so skip it for these and
  // render children directly.
  const ownLayout =
    pathname === '/login' ||
    pathname === '/onboarding' ||
    pathname?.startsWith('/onboarding/') === true;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (ownLayout) {
    return <>{children}</>;
  }

  return (
    <div
      className={`relative flex min-h-screen justify-center px-4 py-4 sm:py-6 ${
        darkFrame ? 'theme-cryptix bg-black' : 'bg-[#ededed]'
      }`}
    >
      <div className={`relative z-10 w-full ${darkFrame ? '' : 'max-w-5xl'}`}>
        <div className="mx-auto mb-4 flex w-full max-w-[1120px] items-center justify-between px-5">
          <Link
            href="/"
            className={`text-lg font-bold tracking-tight ${darkFrame ? 'text-white' : 'text-[#121212]'}`}
          >
            agent-media
          </Link>
          <button
            onClick={handleSignOut}
            className={`flex items-center gap-2 text-xs transition-colors ${
              darkFrame
                ? 'text-white/60 hover:text-white'
                : 'text-[#6b6b76] hover:text-[#121212]'
            }`}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
