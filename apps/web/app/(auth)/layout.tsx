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
  // /subscribe needs to go edge-to-edge for the ReddGrow 2-col + video
  // marquee layout. Everything else (login, signup, etc.) keeps the
  // narrow centered card look.
  const fullWidth = pathname?.startsWith('/subscribe');
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
    <div className={`relative flex min-h-screen justify-center bg-[#ededed] ${fullWidth ? 'px-0 py-0' : 'px-4 py-4 sm:py-6'}`}>
      <div className={`relative z-10 w-full ${fullWidth ? 'px-6 py-6' : 'max-w-5xl'}`}>
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-[#121212]">
            agent-media
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-xs text-[#6b6b76] transition-colors hover:text-[#121212]"
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
