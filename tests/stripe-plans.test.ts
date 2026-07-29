// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Stripe billing plan definition tests.
 *
 * These tests validate the PLANS and PAYG_PACKS data structures that drive
 * Stripe billing. A typo here means wrong billing in production.
 *
 * The plan data is copied from supabase/functions/webhook-stripe/plans.ts
 * because that file uses Deno APIs (Deno.env) which cannot be imported in
 * Node.js. If plans.ts changes, this snapshot MUST be updated to match.
 *
 * Run with: node --test tests/stripe-plans.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Plan data snapshot (must match supabase/functions/webhook-stripe/plans.ts) ──

interface PlanDefinition {
  readonly slug: string;
  readonly monthlyCredits: number;
  readonly maxResolution: string;
  readonly hasWatermark: boolean;
  readonly hasPriority: boolean;
  readonly hasApiAccess: boolean;
  readonly maxConcurrentJobs: number;
}

interface PaygPackDefinition {
  readonly packId: string;
  readonly credits: number;
  readonly priceUsd: number;
}

const PLANS: Record<string, PlanDefinition> = {
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

const PAYG_PACKS: Record<string, PaygPackDefinition> = {
  pack_3900: {
    packId: "pack_3900",
    credits: 3900,
    priceUsd: 39,
  },
};

// ─── Required plan fields ─────────────────────────────────────────────────────

const REQUIRED_PLAN_FIELDS: ReadonlyArray<keyof PlanDefinition> = [
  'slug',
  'monthlyCredits',
  'maxResolution',
  'hasWatermark',
  'hasPriority',
  'hasApiAccess',
  'maxConcurrentJobs',
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Stripe plan definitions', () => {
  const planEntries = Object.entries(PLANS);

  it('has at least one plan defined', () => {
    assert.ok(planEntries.length > 0, 'PLANS should not be empty');
  });

  for (const [key, plan] of planEntries) {
    describe(`plan: ${key}`, () => {
      it('has all required fields', () => {
        for (const field of REQUIRED_PLAN_FIELDS) {
          assert.ok(
            field in plan,
            `plan "${key}" is missing required field "${field}"`,
          );
          assert.notEqual(
            plan[field],
            undefined,
            `plan "${key}".${field} should not be undefined`,
          );
        }
      });

      it('slug matches the object key', () => {
        assert.equal(plan.slug, key, `plan slug "${plan.slug}" should match key "${key}"`);
      });

      it('monthlyCredits is a non-negative integer', () => {
        assert.ok(
          Number.isInteger(plan.monthlyCredits),
          `plan "${key}".monthlyCredits (${plan.monthlyCredits}) should be an integer`,
        );
        assert.ok(
          plan.monthlyCredits >= 0,
          `plan "${key}".monthlyCredits (${plan.monthlyCredits}) should be non-negative`,
        );
      });

      it('maxConcurrentJobs is a positive integer', () => {
        assert.ok(
          Number.isInteger(plan.maxConcurrentJobs),
          `plan "${key}".maxConcurrentJobs should be an integer`,
        );
        assert.ok(
          plan.maxConcurrentJobs > 0,
          `plan "${key}".maxConcurrentJobs (${plan.maxConcurrentJobs}) must not be 0`,
        );
      });

      it('maxResolution is a recognized value', () => {
        const validResolutions = ['720p', '1080p', '2k', '4k'];
        assert.ok(
          validResolutions.includes(plan.maxResolution),
          `plan "${key}".maxResolution "${plan.maxResolution}" is not a recognized resolution`,
        );
      });
    });
  }
});

describe('free plan specifics', () => {
  it('free plan exists', () => {
    assert.ok(PLANS.free, 'free plan must exist');
  });

  it('free plan has watermark', () => {
    assert.equal(PLANS.free.hasWatermark, true, 'free plan must have watermark');
  });

  it('free plan has no API access', () => {
    assert.equal(PLANS.free.hasApiAccess, false, 'free plan must not have API access');
  });

  it('free plan has no priority', () => {
    assert.equal(PLANS.free.hasPriority, false, 'free plan must not have priority');
  });

  it('free plan allows only 1 concurrent job', () => {
    assert.equal(PLANS.free.maxConcurrentJobs, 1);
  });
});

describe('pro tier plan specifics', () => {
  it('pro_plus plan has API access', () => {
    assert.ok(PLANS.pro_plus, 'pro_plus plan must exist');
    assert.equal(PLANS.pro_plus.hasApiAccess, true, 'pro_plus must have API access');
  });

  it('creator plan has priority queue', () => {
    assert.ok(PLANS.creator, 'creator plan must exist');
    assert.equal(PLANS.creator.hasPriority, true, 'creator must have priority');
  });

  it('pro_plus plan has priority queue', () => {
    assert.equal(PLANS.pro_plus.hasPriority, true, 'pro_plus must have priority');
  });
});

describe('paid plans do not have watermark', () => {
  const paidPlans = Object.entries(PLANS).filter(([key]) => key !== 'free');

  for (const [key, plan] of paidPlans) {
    it(`plan "${key}" has no watermark`, () => {
      assert.equal(plan.hasWatermark, false, `paid plan "${key}" should not have watermark`);
    });
  }
});

describe('credit amounts increase with tier', () => {
  it('newby < starter < creator < pro_plus', () => {
    assert.ok(PLANS.newby.monthlyCredits < PLANS.starter.monthlyCredits);
    assert.ok(PLANS.starter.monthlyCredits < PLANS.creator.monthlyCredits);
    assert.ok(PLANS.creator.monthlyCredits < PLANS.pro_plus.monthlyCredits);
  });
});

describe('PAYG pack definitions', () => {
  const packEntries = Object.entries(PAYG_PACKS);

  it('has at least one pack defined', () => {
    assert.ok(packEntries.length > 0, 'PAYG_PACKS should not be empty');
  });

  for (const [key, pack] of packEntries) {
    describe(`pack: ${key}`, () => {
      it('packId matches the object key', () => {
        assert.equal(pack.packId, key, `pack packId "${pack.packId}" should match key "${key}"`);
      });

      it('credits is a positive integer', () => {
        assert.ok(Number.isInteger(pack.credits), `pack "${key}".credits should be an integer`);
        assert.ok(pack.credits > 0, `pack "${key}".credits (${pack.credits}) must be positive`);
      });

      it('priceUsd is a positive number', () => {
        assert.ok(
          typeof pack.priceUsd === 'number' && pack.priceUsd > 0,
          `pack "${key}".priceUsd (${pack.priceUsd}) must be a positive number`,
        );
      });

      it('price-per-credit is reasonable (< $0.10/credit)', () => {
        const pricePerCredit = pack.priceUsd / pack.credits;
        assert.ok(
          pricePerCredit < 0.10,
          `pack "${key}" price per credit ($${pricePerCredit.toFixed(4)}) seems too high`,
        );
      });
    });
  }
});
