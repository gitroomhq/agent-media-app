// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Orphan reclaimer — the pure mapping layer. The Supabase query and
 * boot scheduling are exercised in staging; what must never drift is
 * the operation → pipeline map (a schema op the reclaimer doesn't know
 * silently never gets resurrected) and the envelope shape (must match
 * exactly what the HTTP routes enqueue, or the pipelines get params
 * they can't run).
 *
 * Run: node --test tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapJobRowToEnvelope, OPERATION_TO_PIPELINE } from '../src/v2/orphan-reclaimer.js';

const SUPABASE_URL = 'https://example.supabase.co';

test('operation map covers every v2 pipeline the routes register', () => {
  assert.deepEqual(
    Object.entries(OPERATION_TO_PIPELINE).sort(),
    [
      ['character_create', 'character-create'],
      ['crazy_look', 'crazy-look'],
      ['selfie', 'selfie'],
      ['subtitle', 'subtitle'],
    ],
  );
});

test('maps a crazy_look row to the exact envelope the route would enqueue', () => {
  const row = {
    id: 'job-123',
    user_id: 'user-9',
    operation: 'crazy_look',
    input_params: {
      character_id: 'char_ABCDEFGH12',
      caption: 'wait for the end - this is crazy',
      look: 'bug-eyed-shock',
      duration: 5,
      chaos: 0.7,
      framing: 'full-face',
    },
  };
  const env = mapJobRowToEnvelope(row, SUPABASE_URL);
  assert.equal(env.pipeline, 'crazy-look');
  assert.equal(env.params.job_id, 'job-123');
  assert.equal(env.params.user_id, 'user-9');
  assert.equal(env.params.caption, 'wait for the end - this is crazy');
  assert.equal(env.params.chaos, 0.7);
  assert.equal(
    env.params.callback_url,
    `${SUPABASE_URL}/functions/v1/webhook-provider?provider=railway&job_id=job-123`,
  );
});

test('job_id and user_id from the ROW win over stale input_params copies', () => {
  const env = mapJobRowToEnvelope(
    {
      id: 'row-id',
      user_id: 'row-user',
      operation: 'character_create',
      input_params: { job_id: 'stale-id', user_id: 'stale-user', display_name: 'x', description: 'a person somewhere' },
    },
    SUPABASE_URL,
  );
  assert.equal(env.pipeline, 'character-create');
  assert.equal(env.params.job_id, 'row-id');
  assert.equal(env.params.user_id, 'row-user');
});

test('unknown operations and malformed rows return null, never a bad envelope', () => {
  assert.equal(mapJobRowToEnvelope({ id: 'x', operation: 'ugc_video', input_params: {} }, SUPABASE_URL), null);
  assert.equal(mapJobRowToEnvelope({ operation: 'selfie', input_params: {} }, SUPABASE_URL), null);
  assert.equal(mapJobRowToEnvelope(null, SUPABASE_URL), null);
});

test('missing input_params degrades to base params instead of throwing', () => {
  const env = mapJobRowToEnvelope(
    { id: 'j1', user_id: 'u1', operation: 'subtitle', input_params: null },
    SUPABASE_URL,
  );
  assert.equal(env.pipeline, 'subtitle');
  assert.equal(env.params.job_id, 'j1');
});
