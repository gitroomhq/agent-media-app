// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · server routes.
 *
 * Registered alongside the legacy worker routes by server.js. Owns its
 * own per-user FIFO queue so v2 jobs never have to share the old
 * dispatcher's `_pipeline` switch — that switch lives in v1 code and
 * must stay untouched.
 *
 * Routes:
 *   POST /v2/selfie       — enqueue + run a Selfie generation
 *   POST /v2/crazy-look   — enqueue + run a Crazy Look generation
 *
 * Each route returns 202 immediately with { accepted, job_id } and
 * fires a callback to the caller-supplied callback_url on completion
 * or failure. Same callback contract as the legacy routes so api-v2
 * / dashboard webhook plumbing doesn't need a v2 variant.
 */

import { processSelfie } from './selfie-adapter.js';
import { processCharacterCreate } from './character-create-pipeline.js';
import { processSubtitle } from './subtitle-pipeline.js';
import { processCrazyLook } from './crazy-look-pipeline.js';
import { scheduleOrphanReclaim } from './orphan-reclaimer.js';
import { classifyError } from '../error-classifier.js';

// ── Per-user FIFO queue, isolated from v1 ─────────────────────────────────
// Same shape as v1's userQueues so the mental model carries over, but a
// separate Map — v2 jobs never get re-dispatched by the v1 .finally()
// chain and vice-versa.
const v2UserQueues = new Map();

function getQueue(userId) {
  const key = userId || 'anonymous';
  if (!v2UserQueues.has(key)) {
    v2UserQueues.set(key, { running: false, queue: [] });
  }
  return { key, q: v2UserQueues.get(key) };
}

async function sendCallback(callbackUrl, payload) {
  if (!callbackUrl) return;
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[v2 callback] ${callbackUrl} failed:`, err?.message ?? err);
  }
}

// Dispatcher — runs the head of the user's v2 queue, recurses on
// completion. Mirrors v1's per-route runner shape but scoped to a single
// `pipeline` switch within v2 to keep this file the one place new v2
// pipelines wire in.
/**
 * Enqueue a v2 job envelope on its user's FIFO queue, starting the
 * runner if idle. Shared by the HTTP routes and the boot-time orphan
 * reclaimer (which re-hydrates the in-memory queue after a deploy swap
 * killed it — see ./orphan-reclaimer.js).
 */
export function enqueueV2Job(envelope) {
  const { key, q } = getQueue(envelope?.params?.user_id);
  if (q.running) {
    q.queue.push(envelope);
    return { queued: true, position: q.queue.length };
  }
  q.running = true;
  runJob(key, envelope);
  return { queued: false };
}

function runNext(key) {
  const q = v2UserQueues.get(key);
  if (!q) return;
  const next = q.queue.shift();
  if (!next) {
    q.running = false;
    v2UserQueues.delete(key);
    return;
  }
  q.running = true;
  runJob(key, next);
}

function runJob(key, jobEnvelope) {
  const { pipeline, params } = jobEnvelope;
  const { job_id, callback_url } = params;

  console.log(`[v2:${pipeline}:${job_id}] starting (queue=${key})`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: `v2 ${pipeline} job started`,
  }).catch(() => {});

  let runner;
  if (pipeline === 'selfie') runner = processSelfie;
  else if (pipeline === 'character-create') runner = processCharacterCreate;
  else if (pipeline === 'subtitle') runner = processSubtitle;
  else if (pipeline === 'crazy-look') runner = processCrazyLook;
  else runner = null;
  if (!runner) {
    console.error(`[v2:${pipeline}:${job_id}] unknown pipeline`);
    sendCallback(callback_url, {
      job_id,
      status: 'failed',
      error: `unknown v2 pipeline "${pipeline}"`,
      error_code: 'V2_UNKNOWN_PIPELINE',
    }).catch(() => {});
    runNext(key);
    return;
  }

  runner({
    ...params,
    onProgress: (stage, meta) =>
      sendCallback(callback_url, {
        job_id,
        status: 'processing',
        stage,
        ...(meta ?? {}),
      }).catch(() => {}),
  })
    .then((result) => {
      // Per-pipeline success payload.
      const base = { job_id, status: 'completed' };
      let payload;
      if (pipeline === 'character-create') {
        payload = {
          ...base,
          character_id: result.character_id,
          internal_id: result.internal_id,
          portrait_url: result.portrait_url,
          sheet_url: result.sheet_url,
          seedance_seed: result.seedance_seed,
        };
      } else if (pipeline === 'subtitle') {
        // Subtitle returns just the rehosted mp4 url.
        payload = { ...base, output_url: result.videoUrl };
      } else {
        // Selfie (and future video pipelines): video + debug assets.
        payload = {
          ...base,
          output_url: result.videoUrl,
          portrait_url: result.portraitUrl,
          sheet_url: result.sheetUrl,
          wireframe_url: result.wireframeUrl,
          seed: result.seed,
        };
      }
      return sendCallback(callback_url, payload);
    })
    .catch((err) => {
      // Classify the cause so an actionable code (e.g. CONTENT_POLICY_BLOCKED)
      // flows through to the job row + CLI instead of an opaque V2_PIPELINE_FAILED.
      // PROVIDER_FAILURE (the classifier's catch-all) preserves the legacy code.
      const { code, message } = classifyError(err);
      const errorCode = code === 'PROVIDER_FAILURE' ? 'V2_PIPELINE_FAILED' : code;
      console.error(`[v2:${pipeline}:${job_id}] fatal (${errorCode}):`, message);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: errorCode,
      }).catch(() => {});
    })
    .finally(() => runNext(key));
}

/**
 * Register v2 routes on the given Express app. Called once from
 * server.js (the single place the v2 surface touches v1 code).
 *
 * @param {import('express').Express} app
 * @param {(req, res, next) => void} verifySecret  — existing middleware
 */
export function registerV2Routes(app, verifySecret) {
  // ── POST /v2/selfie ───────────────────────────────────────────────
  app.post('/v2/selfie', verifySecret, async (req, res) => {
    const body = req.body ?? {};
    const {
      job_id,
      user_id,
      character_id,
      photo_url,
      description,
      script,
      shot_preset,
      vibe,
      camera_locked,
      phone_in_frame,
      polish,
      duration,
      subtitles,
      scene_action,
      background_music,
      seed,
      callback_url,
    } = body;

    if (!job_id) {
      return res.status(400).json({ error: 'missing required field: job_id' });
    }
    if ((!script || !script.trim()) && !scene_action) {
      return res.status(400).json({ error: 'provide either script or scene_action' });
    }
    const hasCharacter = !!character_id;
    const hasDescription = !!description;
    // Valid input shapes:
    //   1. character_id alone
    //   2. description alone (text-to-image portrait)
    //   3. description + photo_url (image-to-image reference)
    if (!hasCharacter && !hasDescription) {
      return res.status(400).json({
        error:
          'provide either character_id, OR description (with optional photo_url)',
      });
    }
    if (hasCharacter && (photo_url || description)) {
      return res.status(400).json({
        error: 'use character_id OR description (+ optional photo_url), not both',
      });
    }
    if (photo_url && !description) {
      return res.status(400).json({
        error: 'photo_url requires description',
      });
    }

    const { key, q } = getQueue(user_id);
    const envelope = {
      pipeline: 'selfie',
      params: {
        job_id,
        user_id,
        character_id,
        photo_url,
        description,
        script,
        shot_preset,
        vibe,
        camera_locked,
        phone_in_frame,
        polish,
        duration,
        subtitles,
        scene_action,
        background_music,
        seed,
        callback_url,
      },
    };

    if (q.running) {
      q.queue.push(envelope);
      return res
        .status(202)
        .json({ accepted: true, job_id, queued: true, position: q.queue.length });
    }

    res.status(202).json({ accepted: true, job_id });
    q.running = true;
    runJob(key, envelope);
  });

  // ── POST /v2/crazy-look ───────────────────────────────────────────
  app.post('/v2/crazy-look', verifySecret, async (req, res) => {
    const body = req.body ?? {};
    const {
      job_id,
      user_id,
      character_id,
      photo_url,
      description,
      caption,
      look,
      framing,
      duration,
      chaos,
      polish,
      seed,
      callback_url,
    } = body;

    if (!job_id) {
      return res.status(400).json({ error: 'missing required field: job_id' });
    }
    if (!caption || !String(caption).trim()) {
      return res.status(400).json({ error: 'missing required field: caption' });
    }
    const hasCharacter = !!character_id;
    const hasDescription = !!description;
    // Same valid input shapes as /v2/selfie:
    //   1. character_id alone
    //   2. description alone (text-to-image portrait)
    //   3. description + photo_url (image-to-image reference)
    if (!hasCharacter && !hasDescription) {
      return res.status(400).json({
        error:
          'provide either character_id, OR description (with optional photo_url)',
      });
    }
    if (hasCharacter && (photo_url || description)) {
      return res.status(400).json({
        error: 'use character_id OR description (+ optional photo_url), not both',
      });
    }
    if (photo_url && !description) {
      return res.status(400).json({
        error: 'photo_url requires description',
      });
    }

    const { key, q } = getQueue(user_id);
    const envelope = {
      pipeline: 'crazy-look',
      params: {
        job_id,
        user_id,
        character_id,
        photo_url,
        description,
        caption,
        look,
        framing,
        duration,
        chaos,
        polish,
        seed,
        callback_url,
      },
    };

    if (q.running) {
      q.queue.push(envelope);
      return res
        .status(202)
        .json({ accepted: true, job_id, queued: true, position: q.queue.length });
    }

    res.status(202).json({ accepted: true, job_id });
    q.running = true;
    runJob(key, envelope);
  });

  // ── POST /v2/characters ───────────────────────────────────────────
  app.post('/v2/characters', verifySecret, async (req, res) => {
    const body = req.body ?? {};
    const {
      job_id,
      user_id,
      photo_url,
      display_name,
      description,
      voice_brief,
      preset_default,
      callback_url,
    } = body;

    // photo_url is now optional — character pipeline branches on its
    // presence (image-to-image vs text-to-image portrait).
    if (!job_id || !user_id || !display_name || !description) {
      return res.status(400).json({
        error:
          'missing required fields (job_id, user_id, display_name, description)',
      });
    }

    const { key, q } = getQueue(user_id);
    const envelope = {
      pipeline: 'character-create',
      params: {
        job_id,
        user_id,
        photo_url,
        display_name,
        description,
        voice_brief,
        preset_default,
        callback_url,
      },
    };

    if (q.running) {
      q.queue.push(envelope);
      return res
        .status(202)
        .json({ accepted: true, job_id, queued: true, position: q.queue.length });
    }

    res.status(202).json({ accepted: true, job_id });
    q.running = true;
    runJob(key, envelope);
  });

  // ── POST /v2/subtitle ─────────────────────────────────────────────
  app.post('/v2/subtitle', verifySecret, async (req, res) => {
    const body = req.body ?? {};
    const {
      job_id,
      user_id,
      video_url,
      style,
      transcript,
      language,
      callback_url,
    } = body;

    if (!job_id || !video_url) {
      return res
        .status(400)
        .json({ error: 'missing required fields (job_id, video_url)' });
    }

    const { key, q } = getQueue(user_id);
    const envelope = {
      pipeline: 'subtitle',
      params: {
        job_id,
        user_id,
        video_url,
        style,
        transcript,
        language,
        callback_url,
      },
    };

    if (q.running) {
      q.queue.push(envelope);
      return res
        .status(202)
        .json({ accepted: true, job_id, queued: true, position: q.queue.length });
    }

    res.status(202).json({ accepted: true, job_id });
    q.running = true;
    runJob(key, envelope);
  });

  console.log('[v2 routes] registered: POST /v2/selfie, POST /v2/crazy-look, POST /v2/characters, POST /v2/subtitle');

  // Re-hydrate the in-memory queue with jobs a deploy swap orphaned.
  scheduleOrphanReclaim(enqueueV2Job);
}
