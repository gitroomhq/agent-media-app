// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Marketing layout — wraps every page in the (landing) route group.
 *
 * Uses the same Home2 chrome (dark Cryptix theme + Home2Header + Home2Footer)
 * as the root marketing homepage at app/page.tsx, so /skill, /pricing,
 * /blog, /showcase, /actors etc. visually match the homepage. Previously
 * this layout used LandingHeader + a hand-rolled footer; that mismatch
 * with the homepage made the site look like two different products.
 */

import { Home2Header } from '@/components/home2-header';
import { Home2Footer } from '@/components/home2-footer';
import { LoginProvider } from '@/components/login-context';

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LoginProvider>
      <div className="theme-cryptix relative min-h-screen overflow-x-hidden">
        <Home2Header />
        <main className="relative">{children}</main>
        <Home2Footer />
      </div>
    </LoginProvider>
  );
}
