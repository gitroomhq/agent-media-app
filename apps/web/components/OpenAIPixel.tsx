'use client';

// ChatGPT Ads measurement pixel (OpenAI oaiq SDK).
// The official loader runs before hydration (beforeInteractive, root layout
// only) so window.oaiq exists by the time any effect fires; page_viewed is
// sent on every route change. Reference:
// https://developers.openai.com/ads/measurement-pixel

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export const OAIQ_PIXEL_ID = 'CaDwdANsaLGPKRosP4gmJ2';

declare global {
  interface Window {
    oaiq?: (...args: unknown[]) => void;
  }
}

/** No-op on the server or if the loader was blocked. */
export function oaiq(...args: unknown[]): void {
  if (typeof window === 'undefined' || typeof window.oaiq !== 'function') return;
  window.oaiq(...args);
}

const LOADER =
  '!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;' +
  'var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}' +
  '(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");' +
  `oaiq("init",{pixelId:"${OAIQ_PIXEL_ID}"});`;

export default function OpenAIPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    oaiq('measure', 'page_viewed', {
      type: 'contents',
      contents: [{ id: pathname, name: document.title, content_type: 'page' }],
    });
  }, [pathname]);

  return <Script id="oaiq-loader" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: LOADER }} />;
}
