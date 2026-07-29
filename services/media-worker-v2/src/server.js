// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Media Worker — Express server that processes subtitle and UGC video jobs.
 *
 * POST /subtitle — Subtitle burning pipeline
 * POST /ugc — UGC video production pipeline (script → scenes → TTS → B-roll → assembly)
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { processUGC } from './ugc-pipeline.js';
import { transcribeWithWhisper } from './whisper.js';
import { generateASS } from './ass-generator.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { processProductActing } from './product-acting-pipeline.js';
import { startQueueConsumer } from './queue-consumer.js';
import { allLimiterStatus } from './provider-limiter.js';
import { classifyError } from './error-classifier.js';
import { registerV2Routes } from './v2/server-routes.js';

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WORKER_SECRET = process.env.WORKER_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Per-user job queue (in-memory) ─────────────────────────────────────────
// Each user gets at most one running job. Additional jobs wait in a FIFO queue.
// Map<user_id, { running: boolean, queue: Array<Function> }>
const userQueues = new Map();

// ── Abandoned job recovery ────────────────────────────────────────────────
// On startup AND on a 60s interval, recover jobs the worker can't possibly
// finish:
//   • submitted/pending  > 60 min stale (queue dispatch failed or worker
//     died before pickup)
//   • processing         > 30 min stale (worker died mid-call — Seedance
//     and gpt-image-2 worst case is ~10 min, so 30 min is comfortably
//     past every legitimate run)
// Mark them failed and refund credits via the recovery sweep so the user
// is never silently charged for a stuck row.

const RECOVERY_INTERVAL_MS = 60 * 1000; // re-run every minute
const SUBMITTED_STALE_MS = 60 * 60 * 1000; // 60 min
const PROCESSING_STALE_MS = 30 * 60 * 1000; // 30 min

async function recoverStaleSet(db, statusList, staleMs, label) {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  // For submitted/pending compare against created_at (job age); for
  // processing compare against updated_at (last worker write — phase
  // checkpoint, mark-processing, etc.) so that a long-running job with
  // recent heartbeat isn't reaped.
  const timeCol = statusList.includes('processing') ? 'updated_at' : 'created_at';
  const { data: stale } = await db
    .from('generation_jobs')
    .select('id, status')
    .in('status', statusList)
    .lt(timeCol, cutoff)
    .eq('provider_slug', 'railway')
    .limit(50);
  if (!stale?.length) return 0;
  for (const job of stale) {
    await db.from('generation_jobs').update({
      status: 'failed',
      error_message: `Job abandoned (${label})`,
      error_code: 'WORKER_RESTART',
      webhook_checkpoint: 'failed',
    }).eq('id', job.id);
    await db.rpc('refund_credits', { p_job_id: job.id }).then(() => {}, () => {});
    console.log(`[recovery] ${job.id} (${job.status}): failed + refunded — ${label}`);
  }
  return stale.length;
}

async function recoverAbandonedJobs() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const submitted = await recoverStaleSet(db, ['submitted', 'pending'], SUBMITTED_STALE_MS, 'submitted >60m');
    const processing = await recoverStaleSet(db, ['processing'], PROCESSING_STALE_MS, 'processing >30m no heartbeat');
    if (!submitted && !processing) {
      console.log('[recovery] No abandoned jobs found');
    }
  } catch (err) {
    console.error('[recovery] Error:', err.message);
  }
}

recoverAbandonedJobs();
setInterval(recoverAbandonedJobs, RECOVERY_INTERVAL_MS);

// ── Health check ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  let activeJobs = 0;
  let queuedJobs = 0;
  for (const [, { running, queue }] of userQueues) {
    if (running) activeJobs++;
    queuedJobs += queue.length;
  }
  res.json({
    status: 'ok',
    service: 'media-worker-v2',
    active_jobs: activeJobs,
    queued_jobs: queuedJobs,
    providers: allLimiterStatus(),
  });
});

// ── Queue observability (authenticated) ──────────────────────────────────

app.get('/queue', verifySecret, (_req, res) => {
  const status = {};
  for (const [userId, { running, queue }] of userQueues) {
    status[userId] = { running, queued: queue.length };
  }
  res.json({ queues: status });
});

// ── Auth middleware ──────────────────────────────────────────────────────────

function verifySecret(req, res, next) {
  const secret = req.headers['x-worker-secret'];
  if (!WORKER_SECRET || secret !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ── v2 routes (Selfie, etc.) — isolated dispatcher; old routes untouched ──
registerV2Routes(app, verifySecret);

// ── Subtitle endpoint ───────────────────────────────────────────────────────

app.post('/subtitle', verifySecret, async (req, res) => {
  const { job_id, storage_path, style, callback_url } = req.body;

  if (!job_id || !storage_path) {
    return res.status(400).json({ error: 'missing job_id or storage_path' });
  }

  // Acknowledge immediately — processing happens async
  res.status(202).json({ accepted: true, job_id });

  // Process in background
  processSubtitle({ job_id, storage_path, style, callback_url }).catch(
    (err) => {
      console.error(`[${job_id}] Fatal error:`, err.message);
      const { code, message } = classifyError(err);
      sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    },
  );
});

// ── UGC endpoint ────────────────────────────────────────────────────────────

app.post('/ugc', verifySecret, async (req, res) => {
  const { job_id, script, voice, model, style, user_id, callback_url, face_photo_url, target_duration, aspect_ratio, music, cta, tts_provider, tone, allow_broll, broll_images, dub_language, scenes_input, product_image_url, template, broll_model, voice_speed, composition_mode, pip_position, pip_size, pip_animation, pip_style, overlay_text, overlay_image, unified_voice, webhook_url } = req.body;

  if (!job_id || !script) {
    return res.status(400).json({ error: 'missing job_id or script' });
  }

  const queueKey = user_id || 'anonymous';
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);

  const jobParams = { job_id, script, voice, model, style, user_id, callback_url, face_photo_url, target_duration, aspect_ratio, music, cta, tts_provider, tone, allow_broll, broll_images, dub_language, scenes_input, product_image_url, template, broll_model, voice_speed, composition_mode, pip_position, pip_size, pip_animation, pip_style, overlay_text, overlay_image, unified_voice: true, webhook_url };

  if (userQ.running) {
    // Another job is already running for this user — enqueue
    userQ.queue.push(jobParams);
    const position = userQ.queue.length;
    console.log(`[${job_id}] Queued for user ${queueKey} (position ${position})`);
    return res.status(202).json({ accepted: true, job_id, queued: true, position });
  }

  // No job running — start immediately
  res.status(202).json({ accepted: true, job_id });
  runUGCJob(queueKey, jobParams);
});

function runUGCJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, callback_url } = params;

  console.log(`[${job_id}] Starting UGC job for user ${queueKey} (${userQ.queue.length} queued)`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: 'UGC job started',
  }).catch(() => {});

  processUGC(params)
    .catch((err) => {
      console.error(`[${job_id}] Fatal error:`, err.message);
      const { code, message } = classifyError(err);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    })
    .finally(() => {
      // Process next job in queue or mark idle
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        console.log(`[${next.job_id}] Dequeuing for user ${queueKey} (${userQ.queue.length} remaining)`);
        if (next._pipeline === 'show-your-app') {
          runShowYourAppJob(queueKey, next);
        } else if (next._pipeline === 'product-acting') {
          runProductActingJob(queueKey, next);
        } else if (next._pipeline === 'laptop-ugc') {
          runLaptopUgcJob(queueKey, next);
        } else if (next._pipeline === 'character-video') {
          runCharacterVideoJob(queueKey, next);
        } else if (next._pipeline === 'character-sheet') {
          runCharacterSheetJob(queueKey, next);
        } else if (next._pipeline === 'character-storyboard') {
          runCharacterStoryboardJob(queueKey, next);
        } else if (next._pipeline === 'text-to-video') {
          runTextToVideoJob(queueKey, next);
        } else {
          runUGCJob(queueKey, next);
        }
      } else {
        userQ.running = false;
        userQueues.delete(queueKey); // clean up idle entries
      }
    });
}

// ── Show Your App endpoint ─────────────────────────────────────────────────

import { processShowYourApp } from './show-your-app-pipeline.js';
import { processLaptopUgc } from './laptop-ugc-pipeline.js';
import { processCharacterVideo } from './character-video-pipeline.js';
import { processTextToVideo } from './text-to-video-pipeline.js';
import {
  generateCharacterSheet,
  generateStoryboardSheet,
} from './character-sheets.js';

app.post('/show-your-app', verifySecret, async (req, res) => {
  const { job_id, user_id, green_screen_url, app_screenshot_url, script, duration, subtitle_style, callback_url, webhook_url } = req.body;

  if (!job_id || !green_screen_url || !app_screenshot_url || !script) {
    return res.status(400).json({ error: 'missing required fields (job_id, green_screen_url, app_screenshot_url, script)' });
  }

  const queueKey = user_id || 'anonymous';
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = { job_id, user_id, green_screen_url, app_screenshot_url, script, duration: duration || 5, subtitle_style: subtitle_style || 'hormozi', callback_url, webhook_url };

  if (userQ.running) {
    userQ.queue.push({ ...jobParams, _pipeline: 'show-your-app' });
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }

  res.status(202).json({ accepted: true, job_id });
  runShowYourAppJob(queueKey, jobParams);
});

function runShowYourAppJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, callback_url } = params;

  console.log(`[${job_id}] Starting Show Your App job for user ${queueKey}`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: 'Show Your App job started',
  }).catch(() => {});

  processShowYourApp(params)
    .then((result) => sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: result.video_url,
    }))
    .catch((err) => {
      console.error(`[${job_id}] Show Your App fatal error:`, err.message);
      const { code, message } = classifyError(err);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        if (next._pipeline === 'show-your-app') {
          runShowYourAppJob(queueKey, next);
        } else if (next._pipeline === 'product-acting') {
          runProductActingJob(queueKey, next);
        } else if (next._pipeline === 'laptop-ugc') {
          runLaptopUgcJob(queueKey, next);
        } else if (next._pipeline === 'character-video') {
          runCharacterVideoJob(queueKey, next);
        } else if (next._pipeline === 'character-sheet') {
          runCharacterSheetJob(queueKey, next);
        } else if (next._pipeline === 'character-storyboard') {
          runCharacterStoryboardJob(queueKey, next);
        } else if (next._pipeline === 'text-to-video') {
          runTextToVideoJob(queueKey, next);
        } else {
          runUGCJob(queueKey, next);
        }
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

// ── Product Acting UGC endpoint ─────────────────────────────────────────────

app.post('/product-acting', verifySecret, async (req, res) => {
  const {
    job_id,
    user_id,
    actor_image_url,
    product_image_url,
    script,
    template,
    acting_style,
    visual_style,
    product_name,
    product_description,
    duration,
    subtitles,
    subtitle_style,
    callback_url,
    webhook_url,
  } = req.body;

  if (!job_id || !user_id || !actor_image_url || !product_image_url || !script) {
    return res.status(400).json({ error: 'missing required fields (job_id, user_id, actor_image_url, product_image_url, script)' });
  }

  const queueKey = user_id || 'anonymous';
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = {
    job_id,
    user_id,
    actor_image_url,
    product_image_url,
    script,
    template: template || 'product-in-hand',
    acting_style: acting_style || 'raw-selfie',
    visual_style,
    product_name,
    product_description,
    duration: duration || 5,
    subtitles: subtitles !== false,
    subtitle_style: subtitle_style || 'hormozi',
    callback_url,
    webhook_url,
    _pipeline: 'product-acting',
  };

  if (userQ.running) {
    userQ.queue.push(jobParams);
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }

  res.status(202).json({ accepted: true, job_id });
  runProductActingJob(queueKey, jobParams);
});

function runProductActingJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, callback_url } = params;

  console.log(`[${job_id}] Starting Product Acting job for user ${queueKey}`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: 'Product Acting job started',
  }).catch(() => {});

  processProductActing(params)
    .then((result) => sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: result.video_url,
    }))
    .catch((err) => {
      console.error(`[${job_id}] Product Acting fatal error:`, err.message);
      const { code, message } = classifyError(err);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        if (next._pipeline === 'show-your-app') {
          runShowYourAppJob(queueKey, next);
        } else if (next._pipeline === 'product-acting') {
          runProductActingJob(queueKey, next);
        } else if (next._pipeline === 'laptop-ugc') {
          runLaptopUgcJob(queueKey, next);
        } else if (next._pipeline === 'character-video') {
          runCharacterVideoJob(queueKey, next);
        } else if (next._pipeline === 'character-sheet') {
          runCharacterSheetJob(queueKey, next);
        } else if (next._pipeline === 'character-storyboard') {
          runCharacterStoryboardJob(queueKey, next);
        } else if (next._pipeline === 'text-to-video') {
          runTextToVideoJob(queueKey, next);
        } else {
          runUGCJob(queueKey, next);
        }
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

// ── Laptop UGC endpoint ─────────────────────────────────────────────────────

app.post('/laptop-ugc', verifySecret, async (req, res) => {
  const {
    job_id,
    user_id,
    actor,
    app_screen_recording_url,
    app_screen_image_url,
    script,
    duration,
    subtitle_style,
    callback_url,
    webhook_url,
  } = req.body;

  if (!job_id || !user_id || !actor || !script) {
    return res.status(400).json({ error: 'missing required fields (job_id, user_id, actor, script)' });
  }
  if (!app_screen_recording_url && !app_screen_image_url) {
    return res.status(400).json({ error: 'either app_screen_recording_url or app_screen_image_url is required' });
  }
  if (app_screen_recording_url && app_screen_image_url) {
    return res.status(400).json({ error: 'provide app_screen_recording_url OR app_screen_image_url, not both' });
  }

  const queueKey = user_id || 'anonymous';
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = {
    job_id,
    user_id,
    actor,
    app_screen_recording_url,
    app_screen_image_url,
    script,
    duration: duration || 20,
    subtitle_style: subtitle_style || 'hormozi',
    callback_url,
    webhook_url,
    _pipeline: 'laptop-ugc',
  };

  if (userQ.running) {
    userQ.queue.push(jobParams);
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }

  res.status(202).json({ accepted: true, job_id });
  runLaptopUgcJob(queueKey, jobParams);
});

function runLaptopUgcJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, callback_url } = params;

  console.log(`[${job_id}] Starting Laptop UGC job for user ${queueKey}`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: 'Laptop UGC job started',
  }).catch(() => {});

  processLaptopUgc(params)
    .then((result) => sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: result.video_url,
    }))
    .catch((err) => {
      console.error(`[${job_id}] Laptop UGC fatal error:`, err.message);
      const { code, message } = classifyError(err);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        if (next._pipeline === 'show-your-app') {
          runShowYourAppJob(queueKey, next);
        } else if (next._pipeline === 'product-acting') {
          runProductActingJob(queueKey, next);
        } else if (next._pipeline === 'laptop-ugc') {
          runLaptopUgcJob(queueKey, next);
        } else if (next._pipeline === 'character-video') {
          runCharacterVideoJob(queueKey, next);
        } else if (next._pipeline === 'character-sheet') {
          runCharacterSheetJob(queueKey, next);
        } else if (next._pipeline === 'character-storyboard') {
          runCharacterStoryboardJob(queueKey, next);
        } else if (next._pipeline === 'text-to-video') {
          runTextToVideoJob(queueKey, next);
        } else {
          runUGCJob(queueKey, next);
        }
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

// ── Character Sheet generate (sync) ──────────────────────────────────
// gpt-image-2 multi-angle character sheet, 5–15s, returns the
// uploaded R2 URL synchronously. Used by api-v2 sync routes.
app.post('/character-sheet-generate', verifySecret, async (req, res) => {
  const { job_id, user_id, description, reference_image_url } = req.body ?? {};
  if (!job_id || !user_id) {
    return res.status(400).json({ error: 'missing required fields (job_id, user_id)' });
  }
  // Either a reference image OR a description (≥3 chars) must be provided.
  // Description-only is the "Describe a character" wizard path — worker
  // generates a portrait via gpt-image-2 text-to-image first.
  const hasRef = typeof reference_image_url === 'string' && reference_image_url.length > 0;
  const hasDesc = typeof description === 'string' && description.trim().length >= 3;
  if (!hasRef && !hasDesc) {
    return res.status(400).json({ error: 'provide reference_image_url or description (≥3 chars)' });
  }
  if (hasRef && !/^https:\/\//i.test(reference_image_url)) {
    return res.status(400).json({ error: 'reference_image_url must be an https URL' });
  }
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > 400) {
      return res.status(400).json({ error: 'description, when provided, must be a string up to 400 chars' });
    }
  }

  // Ack-fast: kick off the async runner and return 202 immediately. The
  // generation takes 2–5 minutes per gpt-image-2 call — far longer than
  // any reasonable HTTP timeout (or the queue consumer's 20s dispatch
  // timeout). The runner writes the result to generation_jobs on done.
  const queueKey = user_id;
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = {
    job_id,
    user_id,
    description: typeof description === 'string' ? description.trim() : '',
    reference_image_url,
    _pipeline: 'character-sheet',
  };
  if (userQ.running) {
    userQ.queue.push(jobParams);
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }
  res.status(202).json({ accepted: true, job_id });
  runCharacterSheetJob(queueKey, jobParams);
});

// ── Storyboard Sheet generate (sync) ─────────────────────────────────
// gpt-image-2 numbered-panel storyboard with character sheet
// as a reference image. 5–15s.
app.post('/character-storyboard-generate', verifySecret, async (req, res) => {
  const { job_id, user_id, character_sheet_url, beats, script, ratio } = req.body ?? {};
  if (!job_id || !user_id || !character_sheet_url) {
    return res.status(400).json({ error: 'missing required fields (job_id, user_id, character_sheet_url)' });
  }
  const hasBeats = Array.isArray(beats) && beats.length >= 3 && beats.length <= 10;
  const hasScript = typeof script === 'string' && script.trim().length >= 10;
  if (!hasBeats && !hasScript) {
    return res.status(400).json({ error: 'provide beats[] (3-10 items) or script (≥10 chars)' });
  }

  // Ack-fast: same reasoning as /character-sheet-generate above.
  const queueKey = user_id;
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = {
    job_id,
    user_id,
    character_sheet_url,
    ...(hasScript ? { script: script.trim() } : { beats }),
    ratio: ratio ?? '9:16',
    _pipeline: 'character-storyboard',
  };
  if (userQ.running) {
    userQ.queue.push(jobParams);
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }
  res.status(202).json({ accepted: true, job_id });
  runCharacterStoryboardJob(queueKey, jobParams);
});

// ── Character Video endpoint ────────────────────────────────────────────────

app.post('/character-video', verifySecret, async (req, res) => {
  const {
    job_id,
    user_id,
    character_sheet_url,
    storyboard_url,
    asset_image_url,
    asset_type,
    action_prompt,
    brief,
    recent_topics,
    // Forwarded so the pipeline can resolve a real multi-angle character
    // sheet for actor mode (caches on actors.character_sheet_url).
    // Without this destructure the resolver never fires and the run
    // ends up sending the bare portrait as Seedance's likeness ref.
    character_source,
    duration,
    aspect_ratio,
    generate_audio,
    callback_url,
    webhook_url,
  } = req.body;

  // storyboard_url is OPTIONAL now: scheduled runs arrive with `brief`
  // and the pipeline generates the per-run storyboard inline (Opus 4.7
  // for the script, gpt-image-2 for the panel grid). Manual /create
  // runs still pre-generate a storyboard_url.
  if (!job_id || !user_id || !character_sheet_url) {
    return res.status(400).json({
      error: 'missing required fields (job_id, user_id, character_sheet_url)',
    });
  }
  if (!storyboard_url && !brief) {
    return res.status(400).json({
      error: 'either storyboard_url (pre-generated) or brief (for per-run generation) is required',
    });
  }
  // action_prompt is optional — worker uses brief→script or a fixed
  // Seedance instruction plus the reference images.

  const queueKey = user_id || 'anonymous';
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = {
    job_id,
    user_id,
    character_sheet_url,
    storyboard_url,
    asset_image_url,
    asset_type,
    action_prompt,
    brief,
    recent_topics,
    character_source,
    duration: duration ?? 10,
    aspect_ratio: aspect_ratio ?? '9:16',
    generate_audio: generate_audio ?? true,
    callback_url,
    webhook_url,
    _pipeline: 'character-video',
  };

  if (userQ.running) {
    userQ.queue.push(jobParams);
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }

  res.status(202).json({ accepted: true, job_id });
  runCharacterVideoJob(queueKey, jobParams);
});

function runCharacterVideoJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, callback_url } = params;

  console.log(`[${job_id}] Starting Character Video job for user ${queueKey}`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: 'Character Video job started',
  }).catch(() => {});

  processCharacterVideo(params)
    .then((result) => sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: result.video_url,
    }))
    .catch((err) => {
      console.error(`[${job_id}] Character Video fatal error:`, err.message);
      const { code, message } = classifyError(err);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        if (next._pipeline === 'show-your-app') {
          runShowYourAppJob(queueKey, next);
        } else if (next._pipeline === 'product-acting') {
          runProductActingJob(queueKey, next);
        } else if (next._pipeline === 'laptop-ugc') {
          runLaptopUgcJob(queueKey, next);
        } else if (next._pipeline === 'character-video') {
          runCharacterVideoJob(queueKey, next);
        } else if (next._pipeline === 'character-sheet') {
          runCharacterSheetJob(queueKey, next);
        } else if (next._pipeline === 'character-storyboard') {
          runCharacterStoryboardJob(queueKey, next);
        } else if (next._pipeline === 'text-to-video') {
          runTextToVideoJob(queueKey, next);
        } else {
          runUGCJob(queueKey, next);
        }
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

// ── Text-to-Video route + runner ──────────────────────────────────────────
//
// Pure prompt mode for batch-row schedules. Same auth + per-user queue
// pattern as /character-video — just a much simpler pipeline (no sheet,
// no storyboard, no subtitles).

app.post('/text-to-video', verifySecret, async (req, res) => {
  const {
    job_id,
    user_id,
    prompt,
    duration,
    aspect_ratio,
    generate_audio,
    callback_url,
    webhook_url,
  } = req.body;

  if (!job_id || !user_id || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({
      error: 'missing required fields (job_id, user_id, prompt)',
    });
  }

  const queueKey = user_id || 'anonymous';
  if (!userQueues.has(queueKey)) {
    userQueues.set(queueKey, { running: false, queue: [] });
  }
  const userQ = userQueues.get(queueKey);
  const jobParams = {
    job_id,
    user_id,
    prompt,
    duration: duration ?? 10,
    aspect_ratio: aspect_ratio ?? '9:16',
    generate_audio: generate_audio ?? true,
    callback_url,
    webhook_url,
    _pipeline: 'text-to-video',
  };

  if (userQ.running) {
    userQ.queue.push(jobParams);
    return res.status(202).json({ accepted: true, job_id, queued: true, position: userQ.queue.length });
  }

  res.status(202).json({ accepted: true, job_id });
  runTextToVideoJob(queueKey, jobParams);
});

function runTextToVideoJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, callback_url } = params;

  console.log(`[${job_id}] Starting Text-to-Video job for user ${queueKey}`);
  sendCallback(callback_url, {
    job_id,
    status: 'processing',
    stage: 'started',
    message: 'Text-to-Video job started',
  }).catch(() => {});

  processTextToVideo(params)
    .then((result) => sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: result.video_url,
    }))
    .catch((err) => {
      console.error(`[${job_id}] Text-to-Video fatal error:`, err.message);
      const { code, message } = classifyError(err);
      return sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: message,
        error_code: code,
      }).catch(() => {});
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        if (next._pipeline === 'show-your-app') {
          runShowYourAppJob(queueKey, next);
        } else if (next._pipeline === 'product-acting') {
          runProductActingJob(queueKey, next);
        } else if (next._pipeline === 'laptop-ugc') {
          runLaptopUgcJob(queueKey, next);
        } else if (next._pipeline === 'character-video') {
          runCharacterVideoJob(queueKey, next);
        } else if (next._pipeline === 'character-sheet') {
          runCharacterSheetJob(queueKey, next);
        } else if (next._pipeline === 'character-storyboard') {
          runCharacterStoryboardJob(queueKey, next);
        } else if (next._pipeline === 'text-to-video') {
          runTextToVideoJob(queueKey, next);
        } else {
          runUGCJob(queueKey, next);
        }
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

// ── Character Sheet runner (async, writes generation_jobs directly) ────────
// These two runners differ from runCharacterVideoJob in that they update
// generation_jobs themselves (no api-v2 callback dance) and they refund
// credits on failure. The work itself is delegated to the existing
// generateCharacterSheet / generateStoryboardSheet helpers.

function buildJobsClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function runCharacterSheetJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, user_id, description, reference_image_url } = params;
  console.log(`[${job_id}] Starting Character Sheet job for user ${queueKey}`);

  const db = buildJobsClient();

  // Phase checkpoints — written to generation_jobs.progress_detail.phase
  // on each step boundary. The dashboard wizard subscribes to the row
  // via Supabase Realtime and renders honest progress copy from this.
  const writePhase = (phase) => {
    if (!db) return Promise.resolve();
    return db
      .from('generation_jobs')
      .update({ progress_detail: { phase, at: new Date().toISOString() } })
      .eq('id', job_id)
      .then(() => {}, () => {});
  };

  const markProcessing = db
    ? db
        .from('generation_jobs')
        .update({ status: 'processing', progress_detail: { phase: reference_image_url ? 'building_sheet' : 'painting_portrait', at: new Date().toISOString() } })
        .eq('id', job_id)
        .then(() => {}, () => {})
    : Promise.resolve();

  markProcessing
    .then(() => generateCharacterSheet({
      description,
      jobId: job_id,
      userId: user_id,
      referenceImageUrl: reference_image_url,
      onPhase: writePhase,
    }))
    .then(async (url) => {
      console.log(`[${job_id}] Character Sheet completed: ${url}`);
      if (!db) return;

      // Read the just-stored input_params to capture provenance for the
      // user_characters insert. Worker doesn't get actor_slug on its
      // wire input — it only gets resolved reference_image_url — so we
      // pull from the row itself.
      const { data: jobRow } = await db
        .from('generation_jobs')
        .select('input_params')
        .eq('id', job_id)
        .maybeSingle();
      const ip = (jobRow?.input_params ?? {});
      const actorSlug = typeof ip.actor_slug === 'string' ? ip.actor_slug : null;
      const refUrl = typeof ip.reference_image_url === 'string' ? ip.reference_image_url : null;
      const desc = typeof ip.description === 'string' ? ip.description.trim() : null;
      const sourceKind = actorSlug ? 'actor' : refUrl ? 'upload' : 'description';
      // For describe-mode the worker painted a portrait at a deterministic
      // R2 key earlier. Best-effort URL — used for the small thumbnail
      // and provenance display, not for any credentialed action.
      const r2Pub = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
      const portraitUrl = sourceKind === 'description' && r2Pub
        ? `${r2Pub}/generation-outputs/${user_id}/${job_id}/character-portrait.png`
        : refUrl;
      const name = (desc || (actorSlug ? `Character (${actorSlug})` : 'Untitled')).slice(0, 80);

      // Idempotent: UNIQUE (sheet_job_id) means at-least-once worker
      // delivery cannot create two characters for the same sheet.
      let characterId = null;
      const { data: inserted, error: insertErr } = await db
        .from('user_characters')
        .insert({
          user_id,
          name,
          source_kind: sourceKind,
          actor_slug: actorSlug,
          source_image_url: portraitUrl,
          description: desc,
          character_sheet_url: url,
          sheet_job_id: job_id,
          thumbnail_url: url,
        })
        .select('id')
        .maybeSingle();
      if (inserted?.id) {
        characterId = inserted.id;
      } else if (insertErr) {
        // Conflict path — look up the row that already won.
        const { data: existing } = await db
          .from('user_characters')
          .select('id')
          .eq('sheet_job_id', job_id)
          .maybeSingle();
        characterId = existing?.id ?? null;
        if (!existing) console.warn(`[${job_id}] user_characters insert failed: ${insertErr.message}`);
      }

      await db.from('generation_jobs').update({
        status: 'completed',
        output_media_url: url,
        character_id: characterId,
        completed_at: new Date().toISOString(),
      }).eq('id', job_id);
      console.log(`[${job_id}] character row id=${characterId ?? '?'}`);
    })
    .catch(async (err) => {
      console.error(`[${job_id}] Character Sheet failed:`, err.message);
      const { code, message } = classifyError(err);
      if (db) {
        await db.from('generation_jobs').update({
          status: 'failed',
          error_message: message,
          error_code: code,
        }).eq('id', job_id).then(() => {}, () => {});
        await db.rpc('refund_credits', { p_job_id: job_id }).then(() => {}, () => {});
      }
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        dispatchNext(queueKey, next);
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

function runCharacterStoryboardJob(queueKey, params) {
  const userQ = userQueues.get(queueKey);
  userQ.running = true;
  const { job_id, user_id, character_sheet_url, beats, script, ratio } = params;
  console.log(`[${job_id}] Starting Character Storyboard job for user ${queueKey}`);

  const db = buildJobsClient();
  const writePhase = (phase) => {
    if (!db) return Promise.resolve();
    return db
      .from('generation_jobs')
      .update({ progress_detail: { phase, at: new Date().toISOString() } })
      .eq('id', job_id)
      .then(() => {}, () => {});
  };
  const markProcessing = db
    ? db
        .from('generation_jobs')
        .update({ status: 'processing', progress_detail: { phase: 'composing_panels', at: new Date().toISOString() } })
        .eq('id', job_id)
        .then(() => {}, () => {})
    : Promise.resolve();

  markProcessing
    .then(() => generateStoryboardSheet({
      characterSheetUrl: character_sheet_url,
      beats,
      script,
      jobId: job_id,
      userId: user_id,
      ratio,
      onPhase: writePhase,
    }))
    .then(async (url) => {
      console.log(`[${job_id}] Character Storyboard completed: ${url}`);
      if (db) {
        await db.from('generation_jobs').update({
          status: 'completed',
          output_media_url: url,
          completed_at: new Date().toISOString(),
        }).eq('id', job_id);
      }
    })
    .catch(async (err) => {
      console.error(`[${job_id}] Character Storyboard failed:`, err.message);
      const { code, message } = classifyError(err);
      if (db) {
        await db.from('generation_jobs').update({
          status: 'failed',
          error_message: message,
          error_code: code,
        }).eq('id', job_id).then(() => {}, () => {});
        await db.rpc('refund_credits', { p_job_id: job_id }).then(() => {}, () => {});
      }
    })
    .finally(() => {
      if (userQ.queue.length > 0) {
        const next = userQ.queue.shift();
        dispatchNext(queueKey, next);
      } else {
        userQ.running = false;
        userQueues.delete(queueKey);
      }
    });
}

function dispatchNext(queueKey, next) {
  if (next._pipeline === 'show-your-app') {
    runShowYourAppJob(queueKey, next);
  } else if (next._pipeline === 'product-acting') {
    runProductActingJob(queueKey, next);
  } else if (next._pipeline === 'laptop-ugc') {
    runLaptopUgcJob(queueKey, next);
  } else if (next._pipeline === 'character-video') {
    runCharacterVideoJob(queueKey, next);
  } else if (next._pipeline === 'character-sheet') {
    runCharacterSheetJob(queueKey, next);
  } else if (next._pipeline === 'character-storyboard') {
    runCharacterStoryboardJob(queueKey, next);
  } else if (next._pipeline === 'text-to-video') {
    runTextToVideoJob(queueKey, next);
  } else {
    runUGCJob(queueKey, next);
  }
}

// ── Core processing pipeline ────────────────────────────────────────────────

async function processSubtitle({ job_id, storage_path, style, callback_url }) {
  const workDir = await mkdtemp(join(tmpdir(), `subtitle-${job_id}-`));
  const inputPath = join(workDir, 'input.mp4');
  const assPath = join(workDir, 'subs.ass');
  const outputPath = join(workDir, 'output.mp4');

  try {
    console.log(`[${job_id}] Starting subtitle processing`);

    // ── Step 1: Download video from Supabase Storage ──────────────────────
    console.log(`[${job_id}] Downloading video from storage...`);
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: signedData, error: signedError } = await db.storage
      .from('generation-outputs')
      .createSignedUrl(storage_path, 3600);

    if (signedError || !signedData?.signedUrl) {
      throw new Error(
        `Failed to get signed URL: ${signedError?.message ?? 'no URL returned'}`,
      );
    }

    const videoResponse = await fetch(signedData.signedUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: HTTP ${videoResponse.status}`);
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    await writeFile(inputPath, videoBuffer);
    console.log(
      `[${job_id}] Downloaded video (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`,
    );

    // ── Step 2: Get video duration for validation ─────────────────────────
    const duration = await getVideoDuration(inputPath);
    if (duration > 300) {
      throw new Error(
        `Video too long: ${Math.round(duration)}s (max 300s / 5 min)`,
      );
    }
    console.log(`[${job_id}] Video duration: ${duration.toFixed(1)}s`);

    // ── Step 3: Transcribe with Whisper ───────────────────────────────────
    console.log(`[${job_id}] Transcribing with Whisper...`);
    const words = await transcribeWithWhisper(inputPath);
    console.log(`[${job_id}] Transcribed ${words.length} words`);

    if (words.length === 0) {
      throw new Error('No speech detected in video');
    }

    // ── Step 4: Generate ASS subtitle file ────────────────────────────────
    console.log(`[${job_id}] Generating ASS subtitle file (${style || 'hormozi'} style)...`);
    const assContent = generateASS(words, style || 'hormozi');
    await writeFile(assPath, assContent);

    // ── Step 5: Burn subtitles with FFmpeg ────────────────────────────────
    console.log(`[${job_id}] Burning subtitles with FFmpeg...`);
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-vf', `ass=${assPath}`,
      '-c:a', 'copy',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-y',
      outputPath,
    ], { timeout: 300_000 }); // 5 min timeout

    console.log(`[${job_id}] FFmpeg encoding complete`);

    // ── Step 6: Upload result to Supabase Storage ─────────────────────────
    console.log(`[${job_id}] Uploading subtitled video...`);
    const outputBuffer = await readFile(outputPath);

    // Extract user_id from storage_path (format: {user_id}/{job_id}/output.mp4)
    const pathParts = storage_path.split('/');
    const userId = pathParts[0];

    const outputStoragePath = `${userId}/${job_id}/subtitled.mp4`;
    const { error: uploadError } = await db.storage
      .from('generation-outputs')
      .upload(outputStoragePath, outputBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const outputUrl = `${SUPABASE_URL}/storage/v1/object/public/generation-outputs/${outputStoragePath}`;
    console.log(`[${job_id}] Uploaded to ${outputStoragePath}`);

    // ── Step 7: Callback to webhook-provider ──────────────────────────────
    await sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: outputUrl,
    });

    console.log(`[${job_id}] Subtitle job completed successfully`);
  } finally {
    // Cleanup temp files
    await Promise.allSettled([
      unlink(inputPath),
      unlink(assPath),
      unlink(outputPath),
    ]);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getVideoDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ]);
  const duration = parseFloat(stdout.trim());
  if (isNaN(duration)) throw new Error('Could not determine video duration');
  return duration;
}

async function sendCallback(callbackUrl, payload) {
  if (!callbackUrl) {
    console.warn('No callback URL provided, skipping callback');
    return;
  }

  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`Callback sent: ${res.status}`);
  } catch (err) {
    console.error('Callback failed:', err.message);
  }
}

// ── Start server ────────────────────────────────────────────────────────────

const httpServer = app.listen(PORT, () => {
  console.log(`Media worker listening on port ${PORT}`);
});

const consumer = startQueueConsumer({ port: Number(PORT) });

// Graceful shutdown — stop pulling new queue messages, then close the HTTP
// server (lets in-flight HTTP requests finish naturally).
async function shutdown(signal) {
  console.log(`[shutdown] ${signal} received — stopping queue consumer...`);
  await consumer.stop();
  httpServer.close(() => {
    console.log('[shutdown] HTTP server closed. Bye.');
    process.exit(0);
  });
  // Hard exit if HTTP shutdown takes too long.
  setTimeout(() => process.exit(0), 30_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
