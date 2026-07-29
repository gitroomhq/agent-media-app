// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Character Video Pipeline (Step 3 of the 3-step character_video flow)
 *
 * Inputs (resolved by api-v2 before dispatch):
 *   - character_sheet_url: public HTTPS URL of the multi-angle character ref
 *   - storyboard_url: public HTTPS URL of the numbered storyboard panels
 *   - action_prompt: short text tying character + storyboard together
 *
 * Pipeline:
 *   1. Seedance 2.0 multimodal i2v:
 *        image_urls=[character_sheet, storyboard]
 *        text=action_prompt
 *        duration / ratio / generate_audio per request
 *   2. Re-host final MP4 on R2 and return the public URL.
 *
 * Steps 1+2 (sheet generation, storyboard panel generation) live in the
 * api-v2 routes — they're synchronous gpt-image-2 calls that return
 * immediately. This worker only handles the long-running Seedance call.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { r2Upload } from './r2.js';
import { generateVideo, getVideoProvider } from './providers/index.js';
import { generateStoryboardSheet, generateCharacterSheet } from './character-sheets.js';
import { transcribeWithWhisper } from './whisper.js';
import { generateASS } from './ass-generator.js';
import { polishVideo, isPolishActive, DEFAULT_POLISH_INTENSITY } from './v2/polish-pass.js';

const execFileAsync = promisify(execFile);

/**
 * Burn whisper-aligned subtitles onto the Seedance video. Extract audio,
 * transcribe, generate an ASS file, ffmpeg overlay. Throws on any step
 * failure — character_video advertises subtitles, shipping without
 * them silently is the kind of degraded output we explicitly refuse.
 */
async function burnSubtitlesOnVideo(inputPath, outputPath, workDir, style, aspectRatio) {
  const audioPath = join(workDir, 'subs-audio.mp3');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libmp3lame',
    '-q:a', '4',
    audioPath,
  ], { timeout: 60_000 });

  const words = await transcribeWithWhisper(audioPath);
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('Whisper returned zero words — upstream Seedance audio likely empty');
  }
  console.log(`  [character-video] subtitles: ${words.length} words from whisper`);

  const assPath = join(workDir, 'subs.ass');
  await writeFile(assPath, generateASS(words, style, aspectRatio));

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', `ass=${assPath}`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ], { timeout: 180_000 });
}

let _db = null;
function getDb() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing on worker');
  _db = createClient(url, key);
  return _db;
}

/**
 * Resolve the multi-angle character sheet for an actor schedule.
 * Looks up actors.character_sheet_url; if NULL, generates one from
 * the actor's portrait via gpt-image-2, caches it on the row, and
 * returns the URL. Pay once per actor across all schedules using them.
 */
async function resolveActorCharacterSheet({ actorSlug, jobId, userId }) {
  const db = getDb();
  const { data: actor, error } = await db
    .from('actors')
    .select('id, slug, portrait_url, character_sheet_url, name, gender, age_range, nationality, bio_occupation, bio_story')
    .eq('slug', actorSlug)
    .maybeSingle();
  if (error) throw new Error(`actor lookup for ${actorSlug} failed: ${error.message}`);
  if (!actor) throw new Error(`actor "${actorSlug}" not found`);
  if (actor.character_sheet_url) {
    console.log(`  [character-video] cached sheet for actor ${actorSlug}: ${actor.character_sheet_url}`);
    return actor.character_sheet_url;
  }
  if (!actor.portrait_url) {
    throw new Error(`actor "${actorSlug}" has no portrait_url — cannot generate sheet`);
  }
  console.log(`  [character-video] painting sheet for actor ${actorSlug} (first use)…`);

  // Per product spec: prompt is just "Create a Character sheet for {name}"
  // with the actor portrait as the reference image. gpt-image-2 produces
  // the multi-angle grid from the portrait alone — no need to feed it
  // bio paragraphs that risk drifting from the actual likeness.
  const description = actor.name ?? null;
  console.log(`  [character-video] sheet description: "${description ?? '(no name)'}"`);
  const sheetUrl = await generateCharacterSheet({
    description,
    jobId,
    userId,
    referenceImageUrl: actor.portrait_url,
  });
  // Cache so the next scheduled run (and every run for this actor) reuses it.
  const { error: updErr } = await db
    .from('actors')
    .update({ character_sheet_url: sheetUrl })
    .eq('id', actor.id);
  if (updErr) {
    // Sheet was generated successfully — don't fail the run over a cache write,
    // but make the failure loud so it's not silently re-paid for next time.
    console.error(`[character-video] failed to cache sheet on actor ${actorSlug}: ${updErr.message}`);
  } else {
    console.log(`  [character-video] cached sheet on actor ${actorSlug}: ${sheetUrl}`);
  }
  return sheetUrl;
}

/**
 * Merge a patch into generation_jobs.input_params for the given job.
 * Used to surface intermediate artifacts (storyboard_url, run_topic)
 * to the UI which only reads from generation_jobs rows.
 */
async function patchJobInputParams(jobId, patch) {
  const db = getDb();
  const { data: row, error: readErr } = await db
    .from('generation_jobs')
    .select('input_params')
    .eq('id', jobId)
    .maybeSingle();
  if (readErr) throw new Error(`read input_params for ${jobId}: ${readErr.message}`);
  const merged = { ...(row?.input_params ?? {}), ...patch };
  const { error: updErr } = await db
    .from('generation_jobs')
    .update({ input_params: merged })
    .eq('id', jobId);
  if (updErr) throw new Error(`update input_params for ${jobId}: ${updErr.message}`);
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SCRIPT_MODEL = process.env.SCRIPT_MODEL ?? 'claude-opus-4-7';
// Provider credentials are validated by the registry (src/providers/). This is
// kept only for log lines — the pipeline never branches on it.
const VIDEO_PROVIDER = (process.env.VIDEO_PROVIDER || 'evolink').toLowerCase();

const VIDEO_TIMEOUT_MS = parsePositiveInteger(
  process.env.CHARACTER_VIDEO_VIDEO_TIMEOUT_MS,
  600_000,
);

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchWithRetries(url, retryOptions = {}) {
  const attempts = retryOptions.attempts ?? 5;
  const delayMs = retryOptions.delayMs ?? 2000;
  const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!retryStatuses.has(response.status) || attempt === attempts) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < attempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

// Mirror of services/api-v2/src/routes/schedule-preview.ts addenda so
// per-run script generation matches the wizard preview's behavior.
const ASSET_ADDENDA = {
  product:
    'ASSET AVAILABLE — PRODUCT PHOTO\nA real product photo is attached as a Seedance reference. Character CAN hold the product, angle it to camera, mime using it. At least 1-2 beats must physically involve the product.',
  saas_capture:
    'ASSET AVAILABLE — SAAS UI STILL\nA still frame of a SaaS UI is attached. Character CAN gesture toward the UI shown on a real screen in the scene (monitor/laptop). 1-2 beats should involve interacting with the displayed UI. No fullscreen cuts.',
  app_screenshot:
    'ASSET AVAILABLE — APP SCREENSHOT\nAn app screenshot is attached. Character CAN hold a phone showing it, angle to camera, point or tap. 1-2 beats should physically involve the phone with the screenshot visible.',
};

function buildScriptSystemPrompt(duration) {
  const maxWords = Math.max(8, duration * 4);
  return `You write short scripts for AI-generated UGC video posts.

WHAT THE PIPELINE PRODUCES
One continuous shot of ONE character to camera in a real-world setting.
No cuts, no overlays, no separate B-roll. The character can move, gesture,
speak (lip-synced), and reference things verbally.

Clip duration: ${duration} seconds.

Given a series brief, produce ONE fresh script for today's run.

Output — strict JSON, no prose, no code fence:
  {
    "topic":    "<short label, max 50 chars>",
    "dialogue": "<the EXACT words the character says on camera>",
    "beats":    ["beat 1", "beat 2", ...]
  }

HARD RULES
- dialogue MUST be at most ${maxWords} words (= 4 words per second × ${duration}s).
  Count every word. No filler ('um', 'uh'). No stage directions inside the quotes.
- beats: 4-6 entries describing what the character DOES on camera
  (visual / staging actions, not the words). 4-15 words each.
- Match topic to dialogue: dialogue should clearly relate to the topic and
  the brief; it's what gets lip-synced in the rendered clip.

Refuse unsafe briefs by returning
  {"topic":"BLOCKED","dialogue":"","beats":["reason"]}.`;
}

/**
 * Call Opus 4.7 to generate today's script (topic + beats) for a
 * scheduled run. Throws on any failure — no fallbacks. A scheduled run
 * without a fresh script + storyboard is NOT what the user is paying
 * for; failing loudly here surfaces config gaps instead of silently
 * shipping near-identical videos every cadence tick.
 */
async function generateRunScript({ brief, recentTopics = [], assetType = null, duration = 10 }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing on worker — per-run script generation requires it. Set it on the media-worker-v2 Railway service.');
  }
  const addendum = assetType && ASSET_ADDENDA[assetType] ? `\n\n${ASSET_ADDENDA[assetType]}` : '';
  const system = buildScriptSystemPrompt(duration) + addendum;
  const userMsg = (recentTopics.length > 0
    ? `${assetType ? `Reference asset attached: ${assetType}\n\n` : ''}Series brief:\n${brief}\n\nRecently posted topics (do not repeat):\n${recentTopics.map((t) => `- ${t}`).join('\n')}\n\nWrite today's script.`
    : `${assetType ? `Reference asset attached: ${assetType}\n\n` : ''}Series brief:\n${brief}\n\nThis is the first run. Write today's script.`);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SCRIPT_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data?.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Anthropic returned empty content');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (parsed?.topic === 'BLOCKED' || (typeof parsed?.topic === 'string' && parsed.topic.toUpperCase() === 'BLOCKED')) {
    throw new Error(`Brief was refused by the moderation model: ${parsed?.beats?.[0] ?? 'no reason given'}`);
  }
  if (typeof parsed?.topic !== 'string' || !Array.isArray(parsed?.beats)) {
    throw new Error('Claude returned malformed JSON (missing topic or beats)');
  }
  const beats = parsed.beats
    .filter((b) => typeof b === 'string' && b.trim().length >= 3)
    .map((b) => b.trim());
  if (beats.length < 3) throw new Error(`Claude returned only ${beats.length} valid beats; need at least 3`);

  // Enforce the 4-words-per-second cap server-side, defense-in-depth in
  // case the model overshoots. Truncate to the word budget rather than
  // throwing — a slightly short clip is shippable; an over-budget clip
  // would either get cut off mid-sentence by Seedance's audio bounds or
  // throw the lip-sync off.
  const maxWords = Math.max(8, duration * 4);
  let dialogue = typeof parsed?.dialogue === 'string' ? parsed.dialogue.trim() : '';
  if (dialogue) {
    const words = dialogue.replace(/\s+/g, ' ').split(' ').filter(Boolean);
    if (words.length > maxWords) {
      console.warn(`  [character-video] dialogue overshot (${words.length} > ${maxWords}); truncating`);
      dialogue = words.slice(0, maxWords).join(' ');
    }
  }
  return { topic: parsed.topic.trim(), beats, dialogue };
}

/**
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} params.character_sheet_url
 * @param {string} [params.storyboard_url]
 * @param {string} [params.asset_image_url] Optional reference asset
 *   (product / SaaS UI still / app screenshot) that the character holds
 *   or displays in the shot. Passed to Seedance as a 3rd image_url.
 * @param {'product'|'saas_capture'|'app_screenshot'} [params.asset_type]
 *   Tells the model what role asset_image_url plays.
 * @param {string} params.action_prompt
 * @param {number} [params.duration=10]
 * @param {string} [params.aspect_ratio='9:16']
 * @param {boolean} [params.generate_audio=true]
 */
export async function processCharacterVideo(params) {
  // Fail fast with a provider-specific message if credentials are missing.
  getVideoProvider();

  const {
    job_id,
    user_id,
    asset_image_url,
    asset_type,
    duration = 10,
    aspect_ratio = '9:16',
    generate_audio = true,
    // Either-or inputs:
    //   - storyboard_url + action_prompt: pre-generated path (manual /create)
    //   - brief + recent_topics: per-run path (scheduled). Worker calls
    //     Opus + gpt-image-2 here to produce the storyboard inline.
    brief,
    recent_topics: recentTopics = [],
    // When set (scheduled runs), worker resolves a real multi-angle
    // sheet per actor and caches it on actors.character_sheet_url.
    character_source,
    // Polish intensity for the post-Seedance ffmpeg pass that flips
    // model output from "AI-clean" to "iPhone-real". See v2/polish-pass.js.
    // Accepts 'off' | 'default' | 'heavy'. Defaults to 'default'.
    polish = DEFAULT_POLISH_INTENSITY,
  } = params;
  let { storyboard_url, action_prompt, character_sheet_url } = params;

  // Clamp duration early — used both by per-run script generation
  // (Opus word budget = duration × 4) and the Seedance call below.
  // Hard cap 15s; min 5s. Coerces any stale pgmq messages with weird
  // values (e.g. 20) into the supported range.
  const clampedDuration = Math.min(Math.max(Number(duration) || 10, 5), 15);

  // If this is an actor-mode scheduled run, replace the stored portrait
  // (passed via character_sheet_url) with a real multi-angle sheet.
  // Generated once per actor; cached on actors.character_sheet_url.
  if (character_source && typeof character_source === 'object' && character_source.mode === 'actor' && typeof character_source.actor_slug === 'string') {
    character_sheet_url = await resolveActorCharacterSheet({
      actorSlug: character_source.actor_slug,
      jobId: job_id,
      userId: user_id,
    });
  }

  if (!character_sheet_url) throw new Error('character-video: character_sheet_url is required');
  // storyboard_url is optional now — scheduled runs may not have one,
  // in which case Seedance gets the character + asset (if any) and the
  // action_prompt drives composition.
  // action_prompt is no longer required — Seedance gets a fixed instruction.

  const workDir = await mkdtemp(join(tmpdir(), 'character-video-'));
  try {
    console.log(`[character-video] Job ${job_id} starting`);
    console.log(`  character: ${character_sheet_url}`);
    if (storyboard_url) console.log(`  storyboard: ${storyboard_url}`);
    if (asset_image_url) console.log(`  asset (${asset_type ?? 'unknown'}): ${asset_image_url}`);
    if (brief && !storyboard_url) {
      console.log(`  brief (scheduled run): "${brief.substring(0, 80)}${brief.length > 80 ? '…' : ''}"`);
    }
    if (action_prompt) {
      console.log(`  action: "${action_prompt.substring(0, 60)}${action_prompt.length > 60 ? '…' : ''}"`);
    }
    console.log(`  duration=${duration}s ratio=${aspect_ratio} audio=${generate_audio}`);

    // ── Per-run script + storyboard (scheduled-run path) ──────────────
    // If a brief is supplied and no storyboard was pre-generated, run
    // the full inline pipeline so Seedance gets all three references:
    //   1. Opus 4.7 turns the brief into today's script (topic + beats)
    //   2. gpt-image-2 paints the storyboard panel grid from those beats
    //   3. action_prompt is rewritten from the script so Seedance sees
    //      the actual scene description, not the raw recurring brief.
    if (!storyboard_url && typeof brief === 'string' && brief.trim().length > 0) {
      const script = await generateRunScript({
        brief: brief.trim(),
        recentTopics: Array.isArray(recentTopics) ? recentTopics.slice(0, 10) : [],
        assetType: asset_type ?? null,
        duration: clampedDuration,
      });
      console.log(`  [character-video] per-run script: "${script.topic}" (${script.beats.length} beats, ${script.dialogue ? script.dialogue.split(/\s+/).filter(Boolean).length : 0} dialogue words)`);
      // No try/catch — if storyboard generation fails we fail the whole
      // job. Shipping a video without a storyboard (using the static brief
      // as Seedance's only text prompt) defeats the entire point of the
      // per-run pipeline; better to surface the failure.
      storyboard_url = await generateStoryboardSheet({
        characterSheetUrl: character_sheet_url,
        beats: script.beats,
        jobId: job_id,
        userId: user_id,
        ratio: aspect_ratio,
      });
      console.log(`  [character-video] per-run storyboard: ${storyboard_url}`);
      // Build the Seedance prompt with explicit dialogue so lip-sync
      // matches the user's brief instead of Seedance freelancing. The
      // model treats words in quotes as the spoken line.
      const dialogueClause = script.dialogue ? ` She says: "${script.dialogue}"` : '';
      action_prompt = `${script.topic}. ${script.beats.join(' ')}.${dialogueClause}`;

      // Surface the artifacts to the /jobs UI by writing them back to
      // input_params. Without this, the storyboard URL is only in the
      // worker's process memory and lost after the run completes.
      // run_topic also seeds future runs' recent_topics list so they
      // don't repeat themselves. character_sheet_url is overwritten
      // with the resolved multi-angle sheet (not the original portrait).
      await patchJobInputParams(job_id, {
        storyboard_url,
        run_topic: script.topic,
        run_beats: script.beats,
        run_dialogue: script.dialogue,
        action_prompt,
        character_sheet_url,
      });
    }

    // Seedance gets the user's action/scene description as the PRIMARY
    // driver, plus the two reference images for character + style.
    // (clampedDuration is hoisted to the top of the function so the
    //  per-run script generator can use it for its word budget too.)
    // CORRECT MODEL: seedance-2.0-reference-to-video
    //
    // Per EvoLink docs (https://docs.evolink.ai/en/api-manual/video-series/
    // seedance2.0/seedance-2.0-overview):
    //   - image-to-video with 2 images = FIRST FRAME + LAST FRAME. That's why
    //     early runs rendered the storyboard grid as-is — Seedance was
    //     treating it as the LITERAL last frame of the video.
    //   - reference-to-video accepts 0-9 image_urls as REFERENCES (style,
    //     character appearance, product, etc.) and the PROMPT drives the
    //     actual scene. Without a real prompt, the model picks the location
    //     arbitrarily — that was the "wrong location" bug.
    //
    // Order matters: the user's action_prompt leads, then the role hint
    // for each image, then the hard constraints (real-world bg, no panel
    // grids, etc.). Reference-to-video supports natural-language pointers
    // to each material, hence the "image 1 / image 2" callout.
    const userScene = (typeof action_prompt === 'string' && action_prompt.trim().length > 0)
      ? action_prompt.trim()
      : 'character performs an on-camera moment that fits their persona.';

    // Assemble image_urls + per-image role notes for the prompt. Order
    // matters: Seedance treats the first image as the primary likeness
    // reference. Asset (if any) is appended last.
    const imageUrls = [character_sheet_url];
    const roleHints = ['image 1 = character likeness reference (face, body, outfit)'];
    if (storyboard_url) {
      imageUrls.push(storyboard_url);
      roleHints.push(`image ${imageUrls.length} = photographic storyboard/wireframe board reference only. Use its action beats, staging, expressions, gestures, framing, and blocking, but never render the board itself, its panel grid, captions, labels, UI, or source-image layout`);
    }
    if (asset_image_url) {
      imageUrls.push(asset_image_url);
      const assetRoleByType = {
        product:        'real product the character holds and shows to camera',
        saas_capture:   'still frame of the SaaS UI shown on a real screen in the scene (monitor / laptop) — character points at it, gestures, reacts',
        app_screenshot: 'app screenshot rendered on a real phone the character holds up and angles to camera',
      };
      const roleText = assetRoleByType[asset_type] ?? 'real-world asset the character displays in the shot';
      roleHints.push(`image ${imageUrls.length} = ${roleText}`);
    }

    const fullPrompt = [
      `Scene: ${userScene}`,
      `${roleHints.join('. ')}.`,
      asset_image_url
        ? 'Pose the character physically interacting with the asset — hold it, show it, point at it, react to it — within the same continuous shot.'
        : '',
      `render this as a photorealistic ${clampedDuration} second cinematic shot in a REAL-WORLD environment that matches the scene description above: natural lighting, depth of field, ambient detail, location-appropriate background (kitchen / cafe / street / room / beach / etc. as the scene dictates).`,
      'NEVER show a plain studio backdrop, parchment, beige/cream wall, paper, sketchbook page, or flat color background.',
      'NEVER show panel grids, numbered panels, captions, on-screen text, or the source images themselves.',
      storyboard_url
        ? 'The staging/storyboard board is only a planning guide. The final video must be one continuous photorealistic live-action shot, not a board, grid, collage, storyboard, animatic, or illustrated background.'
        : '',
      'one continuous shot, natural human motion. If the scene prompt says the camera is locked off, keep the camera fully locked off.',
    ].filter(Boolean).join(' ');
    await patchJobInputParams(job_id, { seedance_full_prompt: fullPrompt }).catch((err) => {
      console.warn(`[character-video] failed to persist Seedance prompt: ${err?.message ?? err}`);
    });
    // Two video providers, switched via VIDEO_PROVIDER env:
    //   - 'evolink'  (default): EvoLink's standard seedance-2.0-reference-to-video,
    //     720p locked. Pricing in api-v2 assumes $0.199/sec (72% margin on
    //     350/700 credits for 5s/10s).
    //   - 'byteplus': direct BytePlus ModelArk, dreamina-seedance-2-0-fast-260128
    //     (the fast variant). Cheaper + faster but pricing not yet
    //     reconciled with our credit charges — keep credits at the
    //     EvoLink-720p basis until we have BytePlus's per-call cost.
    // Provider-neutral: the registry resolves VIDEO_PROVIDER and the adapter
    // translates into that vendor's dialect. Adding a backend touches
    // src/providers/, never this pipeline.
    console.log(
      `  [character-video] ${VIDEO_PROVIDER} video (duration=${clampedDuration}s)...`,
    );
    const seedanceVideoUrl = await generateVideo(
      {
        prompt: fullPrompt,
        imageUrls,
        duration: clampedDuration,
        aspectRatio: aspect_ratio,
        generateAudio: generate_audio,
        quality: '720p',
      },
      { timeoutMs: VIDEO_TIMEOUT_MS },
    );
    console.log(`    Seedance returned: ${seedanceVideoUrl}`);

    // ── Download Seedance output to a temp file ───────────────────────
    console.log('  [character-video] Downloading Seedance output…');
    const videoResp = await fetchWithRetries(seedanceVideoUrl);
    if (!videoResp.ok) {
      throw new Error(`Failed to download seedance output: HTTP ${videoResp.status}`);
    }
    const seedanceBuffer = Buffer.from(await videoResp.arrayBuffer());
    const seedancePath = join(workDir, 'seedance.mp4');
    await writeFile(seedancePath, seedanceBuffer);

    // ── Polish pass (subtle film grain + warm grade + vignette) ───────
    // Runs BEFORE subtitles so captions stay clean (no grain on text).
    // Skipped entirely when intensity='off'. See v2/polish-pass.js.
    let postSeedancePath = seedancePath;
    if (isPolishActive(polish)) {
      const polishedPath = join(workDir, 'seedance-polished.mp4');
      console.log(`  [character-video] Polishing (intensity=${polish})…`);
      await polishVideo(seedancePath, polishedPath, { intensity: polish });
      postSeedancePath = polishedPath;
    } else {
      console.log(`  [character-video] Polish disabled (intensity=${polish}).`);
    }

    // ── Burn whisper-aligned subtitles (skip when subtitle_style='none') ──
    // ass-generator owns visual styling. 'none' bypasses the burn step
    // entirely — callers that don't want subs (silent dance clips, b-roll)
    // pass subtitle_style:'none' and the seedance output is rehosted as-is.
    const wantSubs = !(typeof params.subtitle_style === 'string' && params.subtitle_style === 'none');
    const subtitleStyle = typeof params.subtitle_style === 'string' && params.subtitle_style !== 'none'
      ? params.subtitle_style
      : 'hormozi';
    const subtitledPath = join(workDir, 'character-video-final.mp4');
    if (wantSubs) {
      console.log(`  [character-video] Burning subtitles (style=${subtitleStyle})…`);
      await burnSubtitlesOnVideo(postSeedancePath, subtitledPath, workDir, subtitleStyle, aspect_ratio);
    } else {
      console.log('  [character-video] Subtitles disabled — copying through.');
      await copyFile(postSeedancePath, subtitledPath);
    }

    // ── Re-host final subtitled video on R2 ───────────────────────────
    console.log('  [character-video] Uploading final video to R2…');
    const finalBuffer = await readFile(subtitledPath);
    const finalKey = `${user_id}/${job_id}/character-video-final.mp4`;
    const finalUrl = await r2Upload(
      'generation-outputs',
      finalKey,
      finalBuffer,
      'video/mp4',
    );

    console.log(`[character-video] Job ${job_id} complete: ${finalUrl}`);
    return { video_url: finalUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
