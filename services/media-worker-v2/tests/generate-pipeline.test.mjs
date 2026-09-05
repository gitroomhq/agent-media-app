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
