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

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WORKER_SECRET = process.env.WORKER_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Health check ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'media-worker' });
});

// ── Auth middleware ──────────────────────────────────────────────────────────

function verifySecret(req, res, next) {
  const secret = req.headers['x-worker-secret'];
  if (!WORKER_SECRET || secret !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

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
      sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: err.message,
      }).catch(() => {});
    },
  );
});

// ── UGC endpoint ────────────────────────────────────────────────────────────

app.post('/ugc', verifySecret, async (req, res) => {
  const { job_id, script, voice, model, style, user_id, callback_url, face_photo_url, target_duration, aspect_ratio, music, cta } = req.body;

  if (!job_id || !script) {
    return res.status(400).json({ error: 'missing job_id or script' });
  }

  // Acknowledge immediately — processing happens async
  res.status(202).json({ accepted: true, job_id });

  // Process in background
  processUGC({ job_id, script, voice, model, style, user_id, callback_url, face_photo_url, target_duration, aspect_ratio, music, cta }).catch(
    (err) => {
      console.error(`[${job_id}] Fatal error:`, err.message);
      sendCallback(callback_url, {
        job_id,
        status: 'failed',
        error: err.message,
      }).catch(() => {});
    },
  );
});

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

app.listen(PORT, () => {
  console.log(`Media worker listening on port ${PORT}`);
});
