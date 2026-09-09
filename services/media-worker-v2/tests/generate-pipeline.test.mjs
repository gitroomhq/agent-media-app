// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Pure-function coverage for the loose surface's routing decisions. The
// provider calls themselves are exercised by the live run recorded in
// docs/models/*.md ("verified"), not mocked here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { resolveVideoModel, resolveVoice, deriveVideoMode, buildVideoBody, summarizeUsage, SEEDANCE_MODES } = await import('../src/v2/generate-pipeline.js').catch((err) => {
  // r2.js pulls the AWS SDK; when deps are absent locally, skip rather than lie.
  if (String(err?.code) === 'ERR_MODULE_NOT_FOUND') return {};
  throw err;
});

test('video model: one provider id per (model, mode), from the specs', { skip: !resolveVideoModel }, () => {
  assert.equal(resolveVideoModel(undefined, 'text'), 'seedance-2.0-text-to-video');
  assert.equal(resolveVideoModel(undefined, 'image'), 'seedance-2.0-image-to-video');
  assert.equal(resolveVideoModel(undefined, 'reference'), 'seedance-2.0-reference-to-video');
  assert.equal(resolveVideoModel('seedance-2.5', 'image'), 'seedance-2.5-image-to-video');
  assert.equal(resolveVideoModel('seedance-2.5', 'reference'), 'seedance-2.5-reference-to-video');
  assert.throws(() => resolveVideoModel('kling-o3', 'text'), /unknown model/);
});

test('video mode is derived like the schema does', { skip: !deriveVideoMode }, () => {
  assert.equal(deriveVideoMode({}), 'text');
  assert.equal(deriveVideoMode({ first_frame: 'https://x/a.png' }), 'image');
  assert.equal(deriveVideoMode({ refs: ['https://x/a.png'] }), 'reference');
  assert.equal(deriveVideoMode({ video_refs: ['https://x/a.mp4'] }), 'reference');
});

test('provider body: only fields the spec of that model id defines; empty ref lists omitted; never seed', { skip: !buildVideoBody }, () => {
  const text = buildVideoBody({ prompt: ' hi ', seconds: 6, quality: '480p', audio: false, seed: 4 });
  assert.deepEqual(text, { prompt: 'hi', duration: 6, aspect_ratio: '9:16', quality: '480p', generate_audio: false });
  const image = buildVideoBody({ prompt: 'p', first_frame: 'https://x/a.png', last_frame: 'https://x/b.png' });
  assert.deepEqual(image.image_urls, ['https://x/a.png', 'https://x/b.png']);
  assert.equal(image.aspect_ratio, 'adaptive');
  assert.equal('video_urls' in image, false);
  const ref = buildVideoBody({ prompt: '@image1 waves to @video1', refs: ['https://x/a.png'], video_refs: ['https://x/c.mp4'], audio_refs: [], aspect: '16:9' });
  assert.deepEqual(ref.image_urls, ['https://x/a.png']);
  assert.deepEqual(ref.video_urls, ['https://x/c.mp4']);
  assert.equal('audio_urls' in ref, false);
  assert.equal(ref.aspect_ratio, '16:9');
  for (const b of [text, image, ref]) {
    assert.equal('seed' in b, false);
    assert.equal('content_filter' in b, false);
    assert.equal('model_params' in b, false);
  }
});

test('provider usage: the billing block of a finished task, null when absent', { skip: !summarizeUsage }, () => {
  assert.equal(summarizeUsage({ id: 't1', status: 'completed' }), null);
  const u = summarizeUsage({ id: 't1', usage: { cost: { usd: 0.993 }, credits_used: 149, billing_rule: 'per_second' }, task_info: { video_duration: 5 } });
  assert.deepEqual(u, { task_id: 't1', cost_usd: 0.993, credits_used: 149, billing_rule: 'per_second', video_duration: 5 });
});

test('the worker mode table equals the catalog (source of truth: packages/schema/src/v2/models.ts)', { skip: !SEEDANCE_MODES }, async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../../../packages/schema/src/v2/models.ts', import.meta.url), 'utf8').catch(() => null);
  if (!src) return; // worker checked out alone
  const inCatalog = new Set([...src.matchAll(/providerModel: '(seedance-2\.[05]-(?:text|image|reference)-to-video)'/g)].map((m) => m[1]));
  const inWorker = new Set(Object.values(SEEDANCE_MODES).flatMap((m) => Object.values(m)));
  assert.deepEqual([...inWorker].sort(), [...inCatalog].sort());
});

const img = await import('../src/image-models.js').catch(() => ({}));

test('image models: catalog id maps to one provider id and the quality tier it is priced at', { skip: !img.resolveImageModel }, () => {
  assert.equal(img.DEFAULT_IMAGE_MODEL, 'gpt-image-2.5');
  assert.deepEqual(img.resolveImageModel(undefined), { providerModel: 'gpt-image-2.5-sunburst', quality: 'high' });
  assert.deepEqual(img.resolveImageModel('gpt-image-2.5-flare'), { providerModel: 'gpt-image-2.5-flare', quality: 'high' });
  assert.deepEqual(img.resolveImageModel('gpt-image-2'), { providerModel: 'gpt-image-2', quality: 'medium' });
  // An id the worker does not know still renders, on the default.
  assert.equal(img.resolveImageModel('nope').providerModel, 'gpt-image-2.5-sunburst');
});

test('the worker image table equals the catalog (source of truth: packages/schema/src/v2/models.ts)', { skip: !img.IMAGE_MODELS }, async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../../../packages/schema/src/v2/models.ts', import.meta.url), 'utf8').catch(() => null);
  if (!src) return;
  for (const [id, { providerModel, quality }] of Object.entries(img.IMAGE_MODELS)) {
    const rec = src.slice(src.indexOf(`  '${id}': {`), src.indexOf(`  '${id}': {`) + 900);
    assert.ok(rec.includes(`providerModel: '${providerModel}'`), `${id} provider id`);
    assert.ok(rec.includes(`image: { quality: '${quality}' }`), `${id} quality tier`);
  }
});

test('voice: friendly names map to ElevenLabs ids, raw ids pass through', { skip: !resolveVoice }, () => {
  assert.equal(resolveVoice('sarah'), 'EXAVITQu4vr4xnSDxMaL');
  assert.equal(resolveVoice('Liam'), 'TX3LPaxmHKxFdv7VOQHJ');
  assert.equal(resolveVoice(undefined), 'EXAVITQu4vr4xnSDxMaL');
  assert.equal(resolveVoice('abcdefghij1234567890'), 'abcdefghij1234567890');
});

const { laneFor } = await import('../src/v2/server-routes.js').catch((err) => {
  if (String(err?.code) === 'ERR_MODULE_NOT_FOUND') return {};
  throw err;
});

test('queue lanes: video pipelines share one per-user lane; image, audio, subtitle each get their own', { skip: !laneFor }, () => {
  assert.equal(laneFor('selfie'), 'video');
  assert.equal(laneFor('crazy-look'), 'video');
  assert.equal(laneFor('generate-video'), 'video');
  assert.equal(laneFor('generate-image'), 'image');
  assert.equal(laneFor('character-create'), 'image');
  assert.equal(laneFor('generate-audio'), 'audio');
  assert.equal(laneFor('subtitle'), 'subtitle');
  assert.equal(laneFor(undefined), 'video');
});

const judge = await import('../src/v2/quality-judge.js').catch((err) => {
  if (String(err?.code) === 'ERR_MODULE_NOT_FOUND') return {};
  throw err;
});

test('judge: only loose-surface pipelines are scored; the prompt carries the rubric and asks for JSON', { skip: !judge.kindForPipeline }, () => {
  assert.equal(judge.kindForPipeline('generate-video'), 'video');
  assert.equal(judge.kindForPipeline('generate-image'), 'image');
  assert.equal(judge.kindForPipeline('generate-audio'), 'audio');
  assert.equal(judge.kindForPipeline('selfie'), null);
  const p = judge.judgeInstructions({ kind: 'video', prompt: 'a woman says hi', hasRefs: true });
  assert.match(p, /skin shows pores/);
  assert.match(p, /"identity_match": 0\.\.1/);
  assert.match(p, /"overall"/);
  const q = judge.judgeInstructions({ kind: 'image', prompt: 'x', hasRefs: false });
  assert.match(q, /"identity_match": null/);
});
