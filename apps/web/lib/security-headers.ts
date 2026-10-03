// Copyright 2026 agent-media contributors. Apache-2.0 license.

// TikTok Ads pixel: SDK + beacons on analytics.tiktok.com (see lib/tiktok-pixel.ts).
/** Security headers applied to every response. */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://plausible.io https://www.dubcdn.com https://analytics.tiktok.com https://connect.facebook.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: *.supabase.co *.fal.media fal.media *.r2.dev *.postiz.com uploads.postiz.com platform.postiz.com *.licdn.com *.pbs.twimg.com *.cdninstagram.com *.fbcdn.net *.googleusercontent.com *.ytimg.com *.tiktokcdn.com *.tiktokcdn-us.com *.bsky.social https://analytics.tiktok.com https://www.facebook.com",
    "media-src 'self' blob: *.supabase.co *.fal.media fal.media *.r2.dev",
    "connect-src 'self' *.supabase.co *.supabase.in wss://*.supabase.co https://api.stripe.com https://plausible.io https://api.dub.co https://analytics.tiktok.com https://analytics-ipv6.tiktokw.us https://www.facebook.com https://connect.facebook.net",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-XSS-Protection': '1; mode=block',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
