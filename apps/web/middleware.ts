// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Next.js middleware for auth route protection, subscription wall,
 * and security headers.
 *
 * - Public routes: /, /login, /device (accessible to all)
 * - Auth routes: /login (redirect to /gallery if logged in)
 * - Auth-required (no sub): /subscribe (needs login, not subscription)
 * - Subscription-required: /gallery, /billing, /settings (redirect to /subscribe)
 *
 * Also refreshes the Supabase session on every request via updateSession
 * and applies CSP + security headers to ALL responses.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  updateSession,
  checkSubscription,
  checkOnboarded,
} from '@/lib/supabase/middleware';

/** Routes that require NO authentication. */
const PUBLIC_ROUTES = new Set(['/', '/login', '/device', '/terms', '/privacy', '/docs', '/status', '/showcase']);

/**
 * Hostname routing: the marketing site lives on the apex (agent-media.ai)
 * and the product surface lives on app.agent-media.ai. Both domains are
 * served by the same Vercel project for now; middleware enforces which
 * paths render on which host.
 *
 * APP_PREFIXES is the set of routes that ONLY make sense on the app
 * subdomain. A request for one of these on the apex is permanently
 * redirected to the same path on app.agent-media.ai.
 *
 * The check is skipped on localhost / preview deployments so dev keeps
 * working without DNS.
 */
const APP_HOST = 'app.agent-media.ai';
const MARKETING_HOSTS = new Set(['agent-media.ai', 'www.agent-media.ai']);
const APP_PREFIXES = [
  '/login',
  '/onboarding',
  '/subscribe',
  '/create',
  '/gallery',
  '/billing',
  '/settings',
  '/admin',
  '/dashboard',
  '/invite',
  '/jobs',
  '/actors',
  '/content-machine',
  '/integrations',
  '/auth/',
  '/api/auth/',
  '/api/admin/',
  '/api/onboarding/',
  '/api/dashboard/',
];
function isAppOnlyPath(pathname: string): boolean {
  return APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`),
  );
}

/** Routes that should redirect authenticated users to the dashboard. */
const AUTH_ROUTES = new Set(['/login']);

/** Routes that require authentication but NOT a subscription. */
const AUTH_NO_SUB_ROUTES = new Set(['/onboarding', '/subscribe', '/invite']);

/**
 * Routes that require an active subscription. Logged-in, onboarded
 * users without a subscription get pushed to /onboarding/plan (the
 * new in-flow plan picker) instead of the old marketing /subscribe
 * page. /onboarding/plan is itself exempt because it's the
 * destination.
 */
const SUBSCRIPTION_PREFIXES = ['/dashboard', '/create', '/gallery', '/billing', '/settings', '/admin'];
const ENFORCE_SUBSCRIPTION_WALL = true;
const SUBSCRIPTION_REDIRECT = '/onboarding/plan';

/** Security headers applied to every response. */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://plausible.io https://www.dubcdn.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: *.supabase.co *.fal.media fal.media *.r2.dev *.postiz.com uploads.postiz.com platform.postiz.com *.licdn.com *.pbs.twimg.com *.cdninstagram.com *.fbcdn.net *.googleusercontent.com *.ytimg.com *.tiktokcdn.com *.tiktokcdn-us.com *.bsky.social",
    "media-src 'self' blob: *.supabase.co *.fal.media fal.media *.r2.dev",
    "connect-src 'self' *.supabase.co *.supabase.in wss://*.supabase.co https://api.stripe.com https://plausible.io https://api.dub.co",
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

/**
 * Apply security headers to a NextResponse.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get('host') || '').toLowerCase();

  // Hostname split: marketing on the apex, product on app.*. Apply
  // this BEFORE auth so the redirect is fast and identical for every
  // user. Skip on localhost / preview URLs so dev still works.
  if (MARKETING_HOSTS.has(host) && isAppOnlyPath(pathname)) {
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.host = APP_HOST;
    return applySecurityHeaders(
      NextResponse.redirect(target, 308),
    );
  }

  // Legacy /create surface is retired in favour of the v2 /dashboard.
  // The page files still exist for backwards-compat / direct calls from
  // legacy CLI users, but anyone who hits /create or /create/* in a
  // browser is bounced to the new dark dashboard. Done BEFORE auth so
  // unauthed visitors land on /login?redirect=/dashboard (not /create).
  if (pathname === '/create' || pathname.startsWith('/create/')) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url));
    return applySecurityHeaders(redirectResponse);
  }

  // Legacy doc/landing surfaces now live under the Skills & CLI hub (/skills).
  // Permanent (308) redirect so search engines transfer link equity.
  // NOTE: /mcp and /cli are NOT redirected — they are real pages (the Skills
  // & CLI hub with that tab preselected). Marketing pages (/blog, /use-cases,
  // /compare, /tools, /showcase, /actors) are NOT redirected.
  if (
    pathname === '/docs' || pathname.startsWith('/docs/') ||
    pathname === '/developers' ||
    pathname === '/sdk' || pathname.startsWith('/sdk/') ||
    pathname === '/ugc-video-api'
  ) {
    const redirectResponse = NextResponse.redirect(new URL('/skills', request.url), 308);
    return applySecurityHeaders(redirectResponse);
  }

  // /pricing standalone page was removed in favour of the homepage
  // #pricing section. Redirect old links so they land on the section.
  if (pathname === '/pricing') {
    const redirectResponse = NextResponse.redirect(new URL('/#pricing', request.url), 308);
    return applySecurityHeaders(redirectResponse);
  }

  // /home2 was the preview route while we built the new homepage. It's
  // now the canonical / so any leftover link to /home2 should bounce
  // to the root.
  if (pathname === '/home2') {
    const redirectResponse = NextResponse.redirect(new URL('/', request.url), 308);
    return applySecurityHeaders(redirectResponse);
  }

  // Skip Supabase session auth for public API routes (they use API key auth)
  if (pathname.startsWith('/api/v1/')) {
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  const { user, supabase, supabaseResponse } = await updateSession(request);

  // Check if this is a subscription-required route
  const requiresSubscription = SUBSCRIPTION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Check if this is an auth-only route (no sub needed)
  const isAuthNoSub = AUTH_NO_SUB_ROUTES.has(pathname);

  // Redirect unauthenticated users trying to access protected routes
  if ((requiresSubscription || isAuthNoSub) && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    return applySecurityHeaders(redirectResponse);
  }

  // Redirect authenticated users from homepage to dashboard
  if (pathname === '/' && user) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url));
    return applySecurityHeaders(redirectResponse);
  }

  // On the app subdomain `/` is meaningless for logged-out users -
  // there's no marketing here. Send them to /login.
  if (pathname === '/' && !user && host === APP_HOST) {
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
    return applySecurityHeaders(redirectResponse);
  }

  // Redirect authenticated users away from login to dashboard
  if (AUTH_ROUTES.has(pathname) && user) {
    const rawRedirect = request.nextUrl.searchParams.get('redirect') || '/dashboard';
    // Sanitise redirect: must be a relative path starting with /
    const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard';
    const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url));
    return applySecurityHeaders(redirectResponse);
  }

  // Onboarding gate: a logged-in user that hasn't finished onboarding
  // is forced to /onboarding before they can see pricing, the app, or
  // anything else. The entire /onboarding/* tree is exempt (the flow
  // has multiple steps); public routes are also exempt.
  const isOnboardingRoute = pathname === '/onboarding' || pathname.startsWith('/onboarding/');
  if (user && supabase && !isOnboardingRoute) {
    const gateRequired = requiresSubscription || (isAuthNoSub && pathname !== '/invite');
    if (gateRequired) {
      const isOnboarded = await checkOnboarded(supabase, user.id);
      if (!isOnboarded) {
        const onboardingUrl = new URL('/onboarding', request.url);
        const redirectResponse = NextResponse.redirect(onboardingUrl);
        return applySecurityHeaders(redirectResponse);
      }
    }
  }

  // Subscription wall. Logged-in, onboarded user without an active
  // sub trying to use a paid surface gets sent to /onboarding/plan
  // (the in-flow plan picker), which is exempt from this gate.
  if (ENFORCE_SUBSCRIPTION_WALL && requiresSubscription && user && supabase) {
    const hasSubscription = await checkSubscription(supabase, user.id);
    if (!hasSubscription) {
      const planUrl = new URL(SUBSCRIPTION_REDIRECT, request.url);
      const redirectResponse = NextResponse.redirect(planUrl);
      return applySecurityHeaders(redirectResponse);
    }
  }

  // If user is already subscribed and lands on either the in-flow
  // plan picker or the old standalone /subscribe page, send them on
  // to the app. /onboarding is intentionally NOT in this branch -
  // users can revisit other onboarding steps if they want.
  if (
    ENFORCE_SUBSCRIPTION_WALL &&
    (pathname === '/onboarding/plan' || pathname === '/subscribe') &&
    user &&
    supabase
  ) {
    const hasSubscription = await checkSubscription(supabase, user.id);
    if (hasSubscription) {
      const dashboardUrl = new URL('/dashboard', request.url);
      const redirectResponse = NextResponse.redirect(dashboardUrl);
      return applySecurityHeaders(redirectResponse);
    }
  }

  return applySecurityHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - Public assets in /public
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
