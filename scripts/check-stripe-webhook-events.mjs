#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Verify that the live Stripe webhook endpoint is subscribed to every event
 * type the webhook-stripe function actually handles.
 *
 * Why this exists: on 2026-08-02 we found that one-time credit purchases had
 * been charging customers without ever granting credits. The code was fine —
 * the endpoint simply was not subscribed to `payment_intent.succeeded`, which
 * was the only event that granted PAYG credits at the time. Nothing failed,
 * nothing errored, no alert fired. The money just went missing.
 *
 * A handler with no matching subscription is silent dead code, so compare the
 * two lists directly.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/check-stripe-webhook-events.mjs
 *
 * Exits 0 when every handled event is subscribed (or when no key is
 * available, so it can sit in a pipeline without a secret), 1 on a gap.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  join(root, 'supabase/functions/webhook-stripe/index.ts'),
  'utf8',
);

/** Event types the router has a `case` for. */
function handledEvents(src) {
  const router = src.slice(src.indexOf('async function routeEvent'));
  return new Set(
    [...router.matchAll(/case\s+"([a-z_]+\.[a-z_.]+)":/g)].map((m) => m[1]),
  );
}

const handled = handledEvents(source);
if (handled.size === 0) {
  console.error('✖ could not find any event cases in routeEvent — check the parser');
  process.exit(1);
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.log(
    `• STRIPE_SECRET_KEY not set — skipping live check.\n` +
      `  Handlers found: ${[...handled].sort().join(', ')}`,
  );
  process.exit(0);
}

const res = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
  headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
});
if (!res.ok) {
  console.error(`✖ Stripe API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const endpoints = (await res.json()).data.filter(
  (e) => e.status === 'enabled' && e.url.includes('webhook-stripe'),
);

if (endpoints.length === 0) {
  console.error('✖ no enabled webhook endpoint pointing at webhook-stripe');
  process.exit(1);
}

let failed = false;
for (const endpoint of endpoints) {
  const subscribed = new Set(endpoint.enabled_events);
  const wildcard = subscribed.has('*');
  const missing = [...handled].filter((e) => !wildcard && !subscribed.has(e));
  const unhandled = [...subscribed].filter(
    (e) => e !== '*' && !handled.has(e),
  );

  console.log(`\n${endpoint.url}`);
  if (missing.length > 0) {
    failed = true;
    console.error(
      `  ✖ handled but NOT subscribed (these handlers never run): ${missing.join(', ')}`,
    );
  }
  if (unhandled.length > 0) {
    console.log(`  • subscribed but not handled (ignored, harmless): ${unhandled.join(', ')}`);
  }
  if (missing.length === 0) {
    console.log(`  ✔ all ${handled.size} handled event types are subscribed`);
  }
}

process.exit(failed ? 1 : 0);
