#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Real-run verification of the (model, mode) cells the loose surface routes
// to. Submits ONE paid EvoLink job per cell through the exact body
// buildVideoBody() produces, waits, and prints the provider's usage block
// (what it billed) next to the URL. Run from the worker directory with the
// production env (EVOLINK_API_KEY): `railway run node scripts/verify-video-modes.mjs`.
//
//   CELLS=2.0:image,2.5:image   restrict (default: every cell listed below)
//   OUT=/tmp/verify.json        where the record is written
//
// Costs real money: each cell is a 4 s clip at 480p, the cheapest cell of
// the ladder, except the reference-with-clip cell which also bills the clip.

import { writeFileSync } from 'node:fs';
import { buildVideoBody, resolveVideoModel } from '../src/v2/generate-pipeline.js';
import { runGenerationDetailed } from '../src/evolink-client.js';

const IMG = process.env.VERIFY_IMAGE ?? 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/verify/portrait.png';
const IMG2 = process.env.VERIFY_IMAGE_END ?? IMG;
const CLIP = process.env.VERIFY_CLIP ?? '';

const CELLS = {
  '2.0:text': { model: 'seedance-2.0', prompt: 'A 28-year-old woman in a bright kitchen, phone framing, looks into the lens and says: "Okay, this actually works."', seconds: 4, quality: '480p', aspect: '16:9' },
  '2.0:image': { model: 'seedance-2.0', prompt: 'She lifts the bottle slightly, smiles, and says: "This one is the good one."', seconds: 4, quality: '480p', first_frame: IMG },
  '2.0:image-last': { model: 'seedance-2.0', prompt: 'Slow push-in, she turns her head toward the window.', seconds: 4, quality: '480p', first_frame: IMG, last_frame: IMG2 },
  '2.5:image': { model: 'seedance-2.5', prompt: 'She lifts the bottle slightly, smiles, and says: "This one is the good one."', seconds: 4, quality: '480p', first_frame: IMG },
  '2.0:reference': { model: 'seedance-2.0', prompt: '@image1 holds a small perfume bottle to the lens and says: "Smell this."', seconds: 4, quality: '480p', refs: [IMG] },
  ...(CLIP ? { '2.0:reference-clip': { model: 'seedance-2.0', prompt: 'Same framing and motion as @video1; @image1 is the person.', seconds: 4, quality: '480p', refs: [IMG], video_refs: [CLIP] } } : {}),
};

const wanted = (process.env.CELLS ? process.env.CELLS.split(',') : Object.keys(CELLS)).map((s) => s.trim()).filter(Boolean);
const out = process.env.OUT ?? '/tmp/verify-video-modes.json';
const results = {};

await Promise.all(
  wanted.map(async (cell) => {
    const spec = CELLS[cell];
    if (!spec) { results[cell] = { error: 'unknown cell' }; return; }
    const mode = spec.first_frame ? 'image' : spec.refs || spec.video_refs ? 'reference' : 'text';
    const providerModel = resolveVideoModel(spec.model, mode);
    const body = buildVideoBody({ ...spec, mode });
    const startedAt = Date.now();
    console.log(`[${cell}] → ${providerModel} ${JSON.stringify(body)}`);
    try {
      const { url, task } = await runGenerationDetailed(providerModel, body, { timeoutMs: 90 * 60_000, endpoint: 'videos', attempts: 1 });
      results[cell] = { providerModel, body, url, usage: task.usage ?? null, task_info: task.task_info ?? null, task_id: task.id, seconds: Math.round((Date.now() - startedAt) / 1000) };
      console.log(`[${cell}] ✓ ${url} usage=${JSON.stringify(task.usage)} in ${results[cell].seconds}s`);
    } catch (err) {
      results[cell] = { providerModel, body, error: err?.message ?? String(err), seconds: Math.round((Date.now() - startedAt) / 1000) };
      console.log(`[${cell}] ✗ ${results[cell].error}`);
    }
    writeFileSync(out, JSON.stringify(results, null, 2));
  }),
);
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`wrote ${out}`);
