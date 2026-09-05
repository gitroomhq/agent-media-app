// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The model catalog is what an agent reads to choose a model. Every claim
 * in it has to be true, priced, documented, and consistent with what the
 * debit actually charges. These are the drift gates.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V2_MODELS, V2_MODEL_IDS, liveModels, validateCatalog } from '../v2/models.js';
import { V2_GENERATORS, V2_VIDEO_ENGINES } from '../v2/index.js';
import { refreshPage } from '../v2/model-docs.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('model catalog', () => {
  it('every record validates and its key matches its id', () => {
    expect(() => validateCatalog()).not.toThrow();
  });

  it('every model has a docs file that exists in the repo', () => {
    for (const m of Object.values(V2_MODELS)) {
      expect(existsSync(join(REPO_ROOT, m.docs)), `${m.id}: ${m.docs} missing`).toBe(true);
    }
  });

  it('every docs page carries the current fact table (run gen:model-docs after editing the catalog)', () => {
    for (const m of Object.values(V2_MODELS)) {
      const md = readFileSync(join(REPO_ROOT, m.docs), 'utf8');
      expect(refreshPage(md, m), `${m.docs} is stale`).toBe(md);
    }
  });

  it('live models carry credits; candidates never do', () => {
    for (const m of Object.values(V2_MODELS)) {
      if (m.status === 'live') expect(m.credits, `${m.id} is live without credits`).toBeDefined();
      else expect(m.credits, `${m.id} is ${m.status} but has credits`).toBeUndefined();
    }
  });

  it('every engine the video generators accept is a live video model', () => {
    for (const engine of V2_VIDEO_ENGINES) {
      const m = V2_MODELS[engine];
      expect(m, `engine ${engine} has no catalog record`).toBeDefined();
      expect(m.status).toBe('live');
      expect(m.kind).toBe('video');
    }
  });

  it('catalog per-second credits equal the generator engine tiers (no price drift)', () => {
    // The debit reads V2_GENERATORS.pricing; the agent reads the catalog.
    // If these disagree the agent quotes one number and the user pays another.
    for (const gen of ['selfie', 'crazy_look'] as const) {
      const pricing = V2_GENERATORS[gen].pricing;
      if (!pricing || pricing.basis !== 'per_clip') continue;
      const defaultTier = V2_MODELS['seedance-2.0'].credits!;
      expect(defaultTier.perUnit, `${gen} default per-second`).toBe(pricing.perSecondCredits);
      for (const [engine, tier] of Object.entries(pricing.engines ?? {})) {
        expect(V2_MODELS[engine]?.credits?.perUnit, `${gen} ${engine} per-second`).toBe(tier.perSecondCredits);
      }
    }
  });

  it('candidates cite a FROM price and say it must be confirmed', () => {
    for (const m of Object.values(V2_MODELS).filter((x) => x.status === 'candidate')) {
      expect(m.cost.note, `${m.id} cost note`).toMatch(/FROM price/);
    }
  });

  it('liveModels() returns only live records, in catalog order', () => {
    const ids = liveModels().map((m) => m.id);
    expect(ids).toEqual(V2_MODEL_IDS.filter((id) => V2_MODELS[id].status === 'live'));
    expect(ids).toContain('seedance-2.0');
    expect(ids).not.toContain('seedance-2.0-mini');
  });

  it('live video models cost less than they charge (70% floor is documented, this is the sanity floor)', () => {
    for (const m of liveModels().filter((x) => x.kind === 'video')) {
      const usdPerSecondCharged = m.credits!.perUnit * 0.01;
      expect(usdPerSecondCharged, `${m.id} charges below cost`).toBeGreaterThan(m.cost.usd);
    }
  });
});
