// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics as DubAnalytics } from '@dub/analytics/react';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://agent-media.ai'),
  title: 'AI UGC Video Generator — Create UGC Ads from Any Agent | AgentMedia',
  description:
    'Generate realistic AI UGC videos with talking heads, optional captions, and voiceover — then auto-publish to TikTok, Instagram, and YouTube. One command from your terminal, API, or AI agent.',
  keywords: [
    'AI UGC video generator',
    'AI UGC generator',
    'UGC video',
    'AI UGC ads',
    'UGC API',
    'AI video generation',
    'AI image generation',
    'UGC pipeline',
    'talking head video',
    'AI voiceover',
    'animated subtitles',
    'CLI tool',
    'Claude Code',
    'script to video',
    'text to video',
  ],
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'AI UGC Video Generator — AgentMedia',
    description:
      'Generate realistic AI UGC videos and auto-publish to TikTok, Instagram, and YouTube — one command from your terminal, API, or AI agent.',
    type: 'website',
    url: 'https://agent-media.ai',
    siteName: 'agent-media',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'agent-media — Create UGC videos for agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI UGC Video Generator — AgentMedia',
    description:
      'Generate realistic AI UGC videos and auto-publish to TikTok, Instagram, and YouTube — one command from your terminal, API, or AI agent.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/*
          Guard against the Google-Translate × React crash. Chrome's built-in
          auto-translate wraps text in <font> nodes and relocates them; React's
          reconciler then calls insertBefore/removeChild against nodes that are
          no longer children → DOMException code 8 (NotFoundError) that white-
          screens the page for translated (e.g. pt-BR) users. We make those two
          ops a no-op ONLY in that impossible case — correct DOM operations are
          untouched, and translation keeps working. Must run before hydration,
          hence a raw inline script.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){if(typeof Node!=='function'||!Node.prototype)return;var ib=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,r){if(r&&r.parentNode!==this)return n;return ib.apply(this,arguments)};var rc=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c&&c.parentNode!==this)return c;return rc.apply(this,arguments)}})();",
          }}
        />
        <Script
          src="https://plausible.io/js/pa-yNd_9w7heLTiglvpVdZIX.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
        </Script>
      </head>
      <body className="min-h-screen bg-background text-text antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'agent-media',
              url: 'https://agent-media.ai',
              logo: 'https://agent-media.ai/icon.svg',
              description:
                'Developer-first AI UGC video platform. REST API, CLI, TypeScript and Python SDKs, MCP server. Generate UGC ads from your terminal or code.',
              sameAs: [
                'https://www.npmjs.com/package/agent-media-cli',
                'https://www.npmjs.com/package/@agentmedia/sdk',
                'https://pypi.org/project/agent-media/',
                'https://github.com/gitroomhq/agent-media',
              ],
            }),
          }}
        />
        {children}
        <DubAnalytics
          domainsConfig={{ refer: 'go.agent-media.ai' }}
        />
      </body>
    </html>
  );
}
