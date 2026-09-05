// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Pure-function coverage for the loose surface's routing decisions. The
// provider calls themselves are exercised by the live run recorded in
// docs/models/*.md ("verified"), not mocked here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { resolveVideoModel, resolveVoice } = await import('../src/v2/generate-pipeline.js').catch((err) => {
  // r2.js pulls the AWS SDK; when deps are absent locally, skip rather than lie.
  if (String(err?.code) === 'ERR_MODULE_NOT_FOUND') return {};
  throw err;
});

test('video model: refs → reference-to-video, no refs → text-to-video, default 2.0', { skip: !resolveVideoModel }, () => {
  assert.equal(resolveVideoModel(undefined, true), 'seedance-2.0-reference-to-video');
  assert.equal(resolveVideoModel(undefined, false), 'seedance-2.0-text-to-video');
  assert.equal(resolveVideoModel('seedance-2.5', true), 'seedance-2.5-reference-to-video');
  assert.equal(resolveVideoModel('seedance-2.5', false), 'seedance-2.5-text-to-video');
  assert.throws(() => resolveVideoModel('kling-o3', true), /unknown model/);
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
