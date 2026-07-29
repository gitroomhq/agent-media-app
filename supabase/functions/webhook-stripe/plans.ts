// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Plan and PAYG pack definitions for Stripe billing integration.
 *
 * Stripe price IDs are read from environment variables so that the same
 * code works across dev/staging/production without changes.  The env
 * vars are set in the Supabase project dashboard under Edge Function
 * secrets.
 *
 * Pricing reference (architecture doc Section 2.2):
 *   Free       $0/mo   — 50 one-time credits, 720p, watermark, no PAYG
 *   Creator   $39/mo   — 3,900 credits/mo, 1080p, no watermark (~13 10s videos)
 *   Pro       $69/mo   — 6,900 credits/mo, 2K, priority queue (~23 10s videos)
 *   Pro Plus $129/mo   — 12,900 credits/mo, 2K, API access (~43 10s videos)
 *   Enterprise  custom  — unlimited, dedicated support
 *
 *   Newby ($19) is deprecated — kept in code to honour legacy subscribers,
 *   but no longer shown on the pricing page or offered to new users.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlanDefinition {
  /** Slug stored in subscriptions.plan_slug */
  readonly slug: string;
  /** Monthly credit allowance (0 for free — one-time allocation handled separately) */
  readonly monthlyCredits: number;
  /** Maximum video resolution tier */
  readonly maxResolution: string;
  /** Whether generated media has a watermark */
  readonly hasWatermark: boolean;
  /** Whether the user gets priority queue placement */
  readonly hasPriority: boolean;
  /** Whether API key access is enabled (Pro+) */
  readonly hasApiAccess: boolean;
  /** Maximum concurrent generation jobs */
  readonly maxConcurrentJobs: number;
}

export interface PaygPackDefinition {
  /** Unique pack identifier stored in payment intent metadata */
  readonly packId: string;
  /** Number of credits included in the pack */
  readonly credits: number;
  /** Price in USD (used for display / reconciliation) */
  readonly priceUsd: number;
}

// ─── Plan Definitions ───────────────────────────────────────────────────────

/**
 * Map of plan slug -> plan definition.
 *
 * To resolve a Stripe price ID to a plan, use `planByPriceId()`.
 */
export const PLANS: Record<string, PlanDefinition> = {
  free: {
    slug: "free",
    monthlyCredits: 0,
    maxResolution: "720p",
    hasWatermark: true,
    hasPriority: false,
    hasApiAccess: false,
    maxConcurrentJobs: 1,
  },
  newby: {
    slug: "newby",
    monthlyCredits: 1300,
    maxResolution: "1080p",
    hasWatermark: false,
    hasPriority: false,
    hasApiAccess: false,
    maxConcurrentJobs: 2,
  },
  starter: {
    slug: "starter",
    monthlyCredits: 3900,
    maxResolution: "1080p",
    hasWatermark: false,
    hasPriority: false,
    hasApiAccess: false,
    maxConcurrentJobs: 3,
  },
  creator: {
    slug: "creator",
    monthlyCredits: 6900,
    maxResolution: "2k",
    hasWatermark: false,
    hasPriority: true,
    hasApiAccess: false,
    maxConcurrentJobs: 5,
  },
  pro_plus: {
    slug: "pro_plus",
    monthlyCredits: 12900,
    maxResolution: "2k",
    hasWatermark: false,
    hasPriority: true,
    hasApiAccess: true,
    maxConcurrentJobs: 10,
  },
};

// ─── PAYG Credit Packs ──────────────────────────────────────────────────────

/**
 * Available pay-as-you-go credit packs.
 *
 * pack_id is placed in the Stripe PaymentIntent metadata so the webhook
 * can resolve the correct credit amount without trusting the client.
 */
export const PAYG_PACKS: Record<string, PaygPackDefinition> = {
  pack_3900: {
    packId: "pack_3900",
    credits: 3900,
    priceUsd: 39,
  },
};

// ─── Stripe Price ID -> Plan Resolver ───────────────────────────────────────

/**
 * Internal cache built lazily from environment variables.
 *
 * Env var naming convention:
 *   STRIPE_PRICE_STARTER   = price_xxx
 *   STRIPE_PRICE_CREATOR   = price_xxx
 *   STRIPE_PRICE_PRO_PLUS  = price_xxx
 *
 * Free has no Stripe price — it is the absence of a subscription.
 */
let _priceIdMap: Map<string, PlanDefinition> | null = null;

function buildPriceIdMap(): Map<string, PlanDefinition> {
  const map = new Map<string, PlanDefinition>();

  const mappings: Array<{ envVar: string; slug: string }> = [
    { envVar: "STRIPE_PRICE_NEWBY", slug: "newby" },
    { envVar: "STRIPE_PRICE_STARTER", slug: "starter" },
    { envVar: "STRIPE_PRICE_CREATOR", slug: "creator" },
    { envVar: "STRIPE_PRICE_PRO_PLUS", slug: "pro_plus" },
  ];

  for (const { envVar, slug } of mappings) {
    const priceId = Deno.env.get(envVar);
    if (priceId) {
      const plan = PLANS[slug];
      if (plan) {
        map.set(priceId, plan);
      }
    }
  }

  return map;
}

/**
 * Resolve a Stripe price ID to a plan definition.
 *
 * Returns `undefined` if the price ID does not match any known plan
 * (e.g., a metered price, an old price, or an env var not set).
 */
export function planByPriceId(priceId: string): PlanDefinition | undefined {
  if (!_priceIdMap) {
    _priceIdMap = buildPriceIdMap();
  }
  return _priceIdMap.get(priceId);
}

/**
 * Reset the cached price-id map.  Useful in tests.
 */
export function _resetPriceIdCache(): void {
  _priceIdMap = null;
}
