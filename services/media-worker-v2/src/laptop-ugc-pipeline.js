// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Laptop UGC Pipeline (simplified — show-your-app shape × multi-image refs)
 *
 * Mirrors show-your-app's pattern almost exactly: ONE seedance-2.0 call
 * with native audio, single output. The only structural difference is the
 * image inputs:
 *   - image_urls[0] is the actor holding the laptop with the user's saas
 *     screenshot already composited onto the laptop screen (chroma-key
 *     on a magenta-painted region pre-rendered by gpt-image-2)
 *   - image_urls[1] is the saas screenshot itself, as a style/identity
 *     anchor for the laptop screen content during animation
 *
 * Steps:
 *   1. Resolve / generate the show-and-tell pose still (cached)
 *   2. Pre-composite the saas image onto the magenta laptop screen
 *   3. Upload composited still to R2 so seedance can fetch it
 *   4. ONE seedance-2.0-image-to-video call (15s, generate_audio, full script)
 *   5. Whisper word-timed Hormozi subtitles
 *   6. Upload final to R2
 *
 * Inputs:
 *   - app_screen_recording_url (public mp4, 9:16 or wider) OR app_screen_image_url
 *   - script (full script — appears in seedance prompt as "They say: '...'")
 *   - actor_slug
 *   - duration (15 or 20s, default 15)
 */

import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { r2Upload } from './r2.js';
import { runGeneration } from './evolink-client.js';
import { transcribeWithWhisper } from './whisper.js';

const execFileAsync = promisify(execFile);

const EVOLINK_API_KEY = process.env.EVOLINK_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IMAGE_TIMEOUT_MS = parsePositiveInteger(process.env.LAPTOP_UGC_IMAGE_TIMEOUT_MS, 240_000);
const VIDEO_TIMEOUT_MS = parsePositiveInteger(process.env.LAPTOP_UGC_VIDEO_TIMEOUT_MS, 720_000);
const VIDEO_ATTEMPTS = parsePositiveInteger(process.env.LAPTOP_UGC_VIDEO_ATTEMPTS, 2);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROMA_STILL_SCRIPT = join(__dirname, '..', 'scripts', 'chroma-laptop-still.py');

let _supabase;
function getSupabase() {
  if (!_supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ── Pose generation (cached) ────────────────────────────────────────────────

const DEFAULT_WARDROBE = 'wearing a cozy cream cable-knit sweater';

const SHOW_AND_TELL_PROMPT = (wardrobe) =>
  `Casual lifestyle content creator photo, TikTok-style social media post. The person from the reference image, ${wardrobe}, holds an open silver laptop in front of their chest with both hands. The laptop screen FACES THE CAMERA — the front of the screen is visible head-on. Their right index finger points at the laptop screen. They look toward the camera with a warm friendly expression. The entire laptop is fully visible in frame with all four screen edges. The laptop screen is filled with a solid bright magenta color (#ff00ff) — flat magenta only, no UI, no icons, no logo. Soft natural daylight. Plain indoor home background in soft focus. Vertical 9:16 frame.`;

/**
 * Get the show-and-tell pose URL for an actor — from cache, or generate
 * fresh via gpt-image-2 + cache for next time.
 */
async function resolveShowAndTellPose(actor) {
  const supabase = getSupabase();
  const { data: cached } = await supabase
    .from('actor_laptop_ugc_poses')
    .select('image_url')
    .eq('actor_id', actor.id)
    .eq('kind', 'show_and_tell')
    .maybeSingle();
  if (cached?.image_url) {
    console.log(`  [laptop-ugc] Using cached show_and_tell pose for ${actor.slug}`);
    return cached.image_url;
  }
  console.log(`  [laptop-ugc] Generating show_and_tell pose for ${actor.slug}...`);
  const portraitUrl = actor.reference_image_url || actor.portrait_url;
  const url = await runGeneration('gpt-image-2', {
    prompt: SHOW_AND_TELL_PROMPT(DEFAULT_WARDROBE),
    image_urls: [portraitUrl],
    size: '9:16',
    resolution: '2K',
    quality: 'medium',
    n: 1,
  }, { timeoutMs: IMAGE_TIMEOUT_MS });
  await supabase.from('actor_laptop_ugc_poses').insert({
    actor_id: actor.id, kind: 'show_and_tell', image_url: url,
  });
  return url;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

/**
 * Pre-composite the saas screenshot onto the magenta region of the pose still.
 * Output is a static PNG that can be passed to seedance directly without
 * any magenta-bleed-through artifacts in the first generated frames.
 */
async function compositeStill(poseStillPath, saasPath, outPath) {
  await execFileAsync('python3', [CHROMA_STILL_SCRIPT, poseStillPath, saasPath, outPath]);
}

/**
 * Build a Hormozi-style ASS subtitle file from whisper word-level timings.
 */
async function buildAssFromWords(words, totalSec, outPath) {
  const fontSize = 80;
  const fontName = 'Impact';
  const VW = 1080, VH = 1920;
  const toAss = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const cs = Math.floor((sec - Math.floor(sec)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(sec)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const events = words.map((w) => {
    const txt = String(w.word || '').replace(/[\\,]/g, '').toUpperCase();
    return `Dialogue: 0,${toAss(w.start)},${toAss(Math.min(w.end + 0.05, totalSec))},Default,,0,0,0,,{\\fad(80,40)\\fscx110\\fscy110}${txt}`;
  }).join('\n');
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${VW}
PlayResY: ${VH}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,2,2,40,40,${Math.floor(VH * 0.6)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
  await writeFile(outPath, ass, 'utf8');
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function processLaptopUgc(params) {
  if (!EVOLINK_API_KEY) throw new Error('EVOLINK_API_KEY not configured');

  const {
    job_id,
    user_id,
    actor,
    app_screen_recording_url,
    app_screen_image_url,
    script,
    duration: totalDuration = 15,
  } = params;

  if (!app_screen_recording_url && !app_screen_image_url) {
    throw new Error('Either app_screen_recording_url or app_screen_image_url is required');
  }

  const workDir = await mkdtemp(join(tmpdir(), 'laptop-ugc-'));
  try {
    console.log(`[laptop-ugc] Job ${job_id} starting...`);
    console.log(`  Actor: ${actor.slug}`);
    console.log(`  Script: "${script.substring(0, 60)}..."`);

    // 1. Resolve show-and-tell pose (cached or freshly generated)
    const poseUrl = await resolveShowAndTellPose(actor);

    // 2. Download pose still + saas asset
    const poseStillPath = join(workDir, 'pose-still.png');
    const saasPath = join(workDir, 'saas.png');
    await downloadToFile(poseUrl, poseStillPath);

    if (app_screen_image_url) {
      await downloadToFile(app_screen_image_url, saasPath);
    } else {
      // Recording input — extract first frame as the still saas reference
      const recPath = join(workDir, 'recording.mp4');
      await downloadToFile(app_screen_recording_url, recPath);
      await execFileAsync('ffmpeg', ['-y', '-i', recPath, '-frames:v', '1', '-q:v', '2', saasPath]);
    }

    // 3. Pre-composite saas onto the magenta laptop screen → static PNG
    console.log('  [laptop-ugc] Compositing saas onto laptop screen...');
    const compositedPath = join(workDir, 'composited.png');
    await compositeStill(poseStillPath, saasPath, compositedPath);

    // 4. Upload composited still + saas to R2 so seedance can fetch via URL
    console.log('  [laptop-ugc] Uploading composited still to R2...');
    const [compositedBuf, saasBuf] = await Promise.all([
      readFile(compositedPath),
      readFile(saasPath),
    ]);
    const [compositedR2Url, saasR2Url] = await Promise.all([
      r2Upload('generation-outputs', `${user_id}/${job_id}/laptop-composited.png`, compositedBuf, 'image/png'),
      r2Upload('generation-outputs', `${user_id}/${job_id}/saas-ref.png`, saasBuf, 'image/png'),
    ]);

    // 5. ONE seedance-2.0 call — show-your-app shape, multi-image refs
    const prompt = `A person holds an open silver laptop facing the camera. The laptop screen shows the website homepage exactly as in the second reference image — a clean SaaS landing page. They talk warmly to the camera with high energy and say: "${script}". Natural facial movement, slight head movement, finger pointing at the laptop screen. The laptop screen content stays static like a frozen photograph throughout the video. Locked-down camera, fixed framing. UGC TikTok aesthetic, soft warm light.`;
    console.log(`  [laptop-ugc] Seedance 2.0 animating (${totalDuration}s, native audio)...`);
    const seedanceUrl = await runGeneration('seedance-2.0-image-to-video', {
      prompt,
      image_urls: [compositedR2Url, saasR2Url],
      duration: totalDuration,
      aspect_ratio: '9:16',
      generate_audio: true,
    }, { timeoutMs: VIDEO_TIMEOUT_MS, attempts: VIDEO_ATTEMPTS });

    // 6. Download seedance output
    const seedancePath = join(workDir, 'seedance.mp4');
    await downloadToFile(seedanceUrl, seedancePath);

    // 7. Whisper word timings → ASS → burn Hormozi subs
    console.log('  [laptop-ugc] Whisper subtitles...');
    const wavPath = join(workDir, 'audio.wav');
    await execFileAsync('ffmpeg', ['-y', '-i', seedancePath,
      '-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1', wavPath]);
    const words = await transcribeWithWhisper(wavPath);
    const assPath = join(workDir, 'subs.ass');
    await buildAssFromWords(words, totalDuration, assPath);

    const safeAss = assPath.replace(/:/g, '\\:');
    const finalPath = join(workDir, 'final.mp4');
    await execFileAsync('ffmpeg', ['-y', '-i', seedancePath,
      '-vf', `subtitles='${safeAss}'`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', finalPath]);

    // 8. Upload final to R2
    console.log('  [laptop-ugc] Uploading final to R2...');
    const finalBuffer = await readFile(finalPath);
    const r2Key = `${user_id}/${job_id}/laptop-ugc-final.mp4`;
    const finalUrl = await r2Upload('generation-outputs', r2Key, finalBuffer, 'video/mp4');

    console.log(`[laptop-ugc] Job ${job_id} complete: ${finalUrl}`);
    return { video_url: finalUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
