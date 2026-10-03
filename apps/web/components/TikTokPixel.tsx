'use client';

// TikTok Ads pixel. Base code runs before hydration (beforeInteractive, root
// layout only) and fires the first page view; later client-side route changes
// fire ttq.page(). Conversion helpers live in lib/tiktok-pixel.ts.

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { TIKTOK_PIXEL_ID } from '@/lib/tiktok-pixel';

const LOADER =
  '!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};' +
  `ttq.load('${TIKTOK_PIXEL_ID}');ttq.page();}(window, document, 'ttq');`;

export default function TikTokPixel() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    if (first.current) {
      first.current = false;
      return;
    }
    window.ttq?.page();
  }, [pathname]);

  return <Script id="tiktok-pixel-loader" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: LOADER }} />;
}
