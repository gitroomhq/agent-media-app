// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { VariableContextComponent } from '@/components/variable-context';
import './globals.css';

/**
 * Rendered per-request, not at build time.
 *
 * This is what lets ONE Docker image serve any environment: `process.env` is
 * read below on each request and handed to VariableContextComponent as props,
 * instead of Next.js inlining `NEXT_PUBLIC_*` values into the bundle at build
 * time. Same approach as our sibling project Postiz.
 */
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'agent-media',
  description: 'Agent-native AI UGC video generation.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/*
          Guard against the Google-Translate x React crash. Chrome's built-in
          auto-translate wraps text in <font> nodes and relocates them; React's
          reconciler then calls insertBefore/removeChild against nodes that are
          no longer children -> DOMException code 8 (NotFoundError) that white-
          screens the page for translated users. We make those two ops a no-op
          ONLY in that impossible case - correct DOM operations are untouched,
          and translation keeps working. Must run before hydration, hence a raw
          inline script.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){if(typeof Node!=='function'||!Node.prototype)return;var ib=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,r){if(r&&r.parentNode!==this)return n;return ib.apply(this,arguments)};var rc=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c&&c.parentNode!==this)return c;return rc.apply(this,arguments)}})();",
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-text antialiased">
        <VariableContextComponent
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.API_V2_URL ?? ''}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
          supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}
          billingEnabled={Boolean(process.env.STRIPE_SECRET_KEY)}
          stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
          discordUrl={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? ''}
          mcpUrl={process.env.NEXT_PUBLIC_MCP_URL ?? ''}
          environment={process.env.NODE_ENV ?? 'production'}
          sentryDsn={process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''}
          posthogKey={process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''}
        >
          {children}
        </VariableContextComponent>
      </body>
    </html>
  );
}
