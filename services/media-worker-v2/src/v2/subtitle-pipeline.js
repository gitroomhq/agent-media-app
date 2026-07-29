// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Subtitle pipeline.
 *
 *   Stage 1: download source video from a public URL
 *   Stage 2: extract audio with ffmpeg
 *   Stage 3: transcribe with Whisper (or skip if caller supplied transcript)
 *   Stage 4: generate ASS subtitle file in the chosen style
 *   Stage 5: burn ASS into a new mp4 with ffmpeg
 *   Stage 6: re-host the result on R2 + return the URL
 *
 * This is a fresh v2 pipeline. It shares only the primitive helpers
 * with v1 (whisper.js, ass-generator.js, r2.js) — the orchestration
 * is its own and doesn't go through the legacy /subtitle worker route.
 */

import { writeFile, mkdtemp, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { transcribeWithWhisper } from '../whisper.js';
import { generateASS } from '../ass-generator.js';
import { r2Upload } from '../r2.js';
import { fetchToBuffer } from './http.js';

const execFileAsync = promisify(execFile);

const R2_BUCKET = 'brand-extracts';

/**
 * Naïve word-timing distribution for caller-supplied transcripts. We
 * don't have word-level timestamps without Whisper, so we spread the
 * words evenly across the clip duration. This is intentionally crude
 * — the better path is to let Whisper transcribe and use real
 * timestamps. The transcript override is for "I already have the
 * exact script, skip the Whisper cost" callers.
 */
function distributeWordsEvenly(transcript, durationSeconds) {
  const tokens = transcript
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const perWord = durationSeconds / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: i * perWord,
    end: (i + 1) * perWord,
  }));
}

async function probeVideoDuration(path) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ]);
  const d = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) {
    throw new Error(`ffprobe: invalid duration "${stdout.trim()}"`);
  }
  return d;
}

async function probeAspectRatio(path) {
  // Returns "9:16" | "16:9" | "1:1" — best-effort, falls back to 9:16.
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x',
      path,
    ]);
    const [w, h] = stdout.trim().split('x').map((n) => Number.parseInt(n, 10));
    if (!w || !h) return '9:16';
    const ratio = w / h;
    if (Math.abs(ratio - 1) < 0.05) return '1:1';
    if (ratio > 1) return '16:9';
    return '9:16';
  } catch {
    return '9:16';
  }
}

/**
 * Process a v2 subtitle job end-to-end.
 *
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} [params.user_id]
 * @param {string} params.video_url
 * @param {string} [params.style='hormozi']
 * @param {string} [params.transcript]
 * @param {string} [params.language]
 * @param {(stage: string, meta?: object) => void} [params.onProgress]
 * @returns {Promise<{ videoUrl: string }>}
 */
export async function processSubtitle(params) {
  const {
    job_id,
    user_id,
    video_url,
    style = 'hormozi',
    transcript,
    language,
    onProgress = () => {},
  } = params;

  if (!job_id) throw new Error('processSubtitle: job_id required');
  if (!video_url) throw new Error('processSubtitle: video_url required');

  const workDir = await mkdtemp(join(tmpdir(), `v2-subtitle-${job_id}-`));
  const r2Prefix = `subtitle/${user_id ?? 'anon'}/${job_id}`;

  // ── Stage 1 · download source video ─────────────────────────────────
  onProgress('download', { stage: 'download' });
  console.log(`[v2-subtitle:${job_id}] [1] downloading ${video_url}…`);
  const buf = await fetchToBuffer(video_url);
  const inputPath = join(workDir, 'input.mp4');
  await writeFile(inputPath, buf);
  const duration = await probeVideoDuration(inputPath);
  const aspect = await probeAspectRatio(inputPath);
  console.log(`[v2-subtitle:${job_id}] [1] ✓ ${duration.toFixed(1)}s · ${aspect}`);

  // ── Stage 2 · word-timed transcript ─────────────────────────────────
  // Either: extract audio + Whisper (the real path)
  // Or: caller passed transcript → distribute evenly
  let words;
  if (transcript) {
    onProgress('transcribe', { stage: 'transcribe', source: 'override' });
    console.log(`[v2-subtitle:${job_id}] [2] using caller transcript (${transcript.length} chars), distributing across ${duration.toFixed(1)}s`);
    words = distributeWordsEvenly(transcript, duration);
  } else {
    onProgress('transcribe', { stage: 'transcribe', source: 'whisper' });
    const audioPath = join(workDir, 'audio.wav');
    console.log(`[v2-subtitle:${job_id}] [2a] extracting audio…`);
    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
      audioPath,
    ]);
    console.log(`[v2-subtitle:${job_id}] [2b] whisper transcribe${language ? ' (lang=' + language + ')' : ''}…`);
    // Note: whisper.js uses positional path arg; language hint isn't
    // forwarded today. Keeping the field in the API for future use.
    words = await transcribeWithWhisper(audioPath);
  }
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('subtitle: no words to render (empty transcript / whisper returned nothing)');
  }
  console.log(`[v2-subtitle:${job_id}] [2] ✓ ${words.length} words`);

  // ── Stage 3 · generate ASS ──────────────────────────────────────────
  onProgress('compose', { stage: 'compose' });
  const ass = generateASS(words, style, aspect);
  const assPath = join(workDir, 'subs.ass');
  await writeFile(assPath, ass, 'utf8');
  console.log(`[v2-subtitle:${job_id}] [3] ✓ ASS written (${ass.length} chars, style=${style})`);

  // ── Stage 4 · ffmpeg burn-in ────────────────────────────────────────
  onProgress('burn', { stage: 'burn' });
  const outputPath = join(workDir, 'output.mp4');
  // ffmpeg subtitles filter needs paths escaped — colon and apostrophe
  // are filter syntax.
  const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  console.log(`[v2-subtitle:${job_id}] [4] burning…`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', `subtitles='${safeAssPath}'`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    outputPath,
  ]);
  console.log(`[v2-subtitle:${job_id}] [4] ✓ burned`);

  // ── Stage 5 · upload + return ───────────────────────────────────────
  onProgress('upload', { stage: 'upload' });
  const outBuf = await readFile(outputPath);
  const videoUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/subtitled.mp4`, outBuf, 'video/mp4');
  console.log(`[v2-subtitle:${job_id}] [5] ✓ ${videoUrl}`);

  return { videoUrl };
}
