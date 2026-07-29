// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Sentry init for the browser. This file (NOT instrumentation-client.ts) is the
 * correct client-init entrypoint for Next.js < 15.3 — `instrumentation-client`
 * is only picked up from 15.3 onward, and this app is on 15.1.x, so the SDK's
 * withSentryConfig injects THIS file into the client bundle. No-op until
 * NEXT_PUBLIC_SENTRY_DSN is set. Replay is captured only on errors; text is
 * masked + media blocked so we never leak customer content.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/sentry-scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Browser-extension & third-party noise we never want in the feed. These come
 * from the user's environment (extensions, in-app webviews), not our code, so
 * they aren't actionable — capturing them just spams the team + burns the error
 * budget. Matched against the error message/value.
 */
const IGNORE_ERRORS: (string | RegExp)[] = [
  // WebExtension messaging from injected content scripts (the iPhone Safari
  // "Invalid call to runtime.sendMessage(). Tab not found." report).
  /runtime\.sendMessage/i,
  /Tab not found/i,
  /Extension context invalidated/i,
  /chrome\.runtime/i,
  /message channel closed before a response/i,
  // Injected crypto-wallet extensions (MetaMask/Brave/Coinbase) writing to
  // window.ethereum on our pages — not our code.
  /window\.ethereum/i,
  /selectedAddress/i,
  // Browser-internal globals leaking into error reports (Safari reader,
  // Firefox reader/devtools) — environment noise, never actionable.
  /EmptyRanges/i,
  /__firefox__/i,
  // Benign browser quirks that aren't real bugs.
  /ResizeObserver loop/i,
  // Aborted fetches/media loads on navigation (user left the page mid-request).
  /AbortError/i,
  /signal is aborted/i,
  /operation was aborted/i,
  /aborted a request/i,
  /fetching process for the media resource/i,
  // Client network blips / navigation-cancelled fetches. Real server failures
  // surface from api-v2's own Sentry, not here.
  /Failed to fetch/i,
  /Load failed/i,
  // WebGL unavailable on bots / very old or headless devices — the landing
  // hero now degrades gracefully (see LaserFlow guard), this is belt-and-braces
  // for any already-cached bundle.
  /creating WebGL context/i,
  /WebGL2RenderingContext/i,
  // Generic non-error rejections (often extensions / aborted requests).
  'Non-Error promise rejection captured',
  // Injected/extension scripts touching globals that don't exist on our pages
  // — classic third-party noise: `.addListener` on an undefined global, or
  // `.renderer` on null. No actionable in-app stack; environment, not our code.
  /reading 'addListener'/i,
  /setting 'renderer'/i,
];

/** Errors originating in extension scripts — drop regardless of message. */
const DENY_URLS: RegExp[] = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-web-extension:\/\//i,
  /^safari-extension:\/\//i,
  /extensions\//i,
];

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'production',
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    sendDefaultPii: false,
    ignoreErrors: IGNORE_ERRORS,
    denyUrls: DENY_URLS,
    beforeSend: scrubEvent,
  });
}
