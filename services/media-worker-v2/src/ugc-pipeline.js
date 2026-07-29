// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * UGC Pipeline — Orchestrates the full UGC video production flow.
 *
 * Two modes:
 *
 * Standard Flow:
 *   1. Split script into scenes with type classification (GPT-4o-mini)
 *   2. Generate TTS audio for ALL scenes (Hume Octave 2 / ElevenLabs / OpenAI)
 *   3. Upload TTS audio to R2 for public/signed URLs
 *   4. Generate clips IN PARALLEL:
 *      a. Talking head clips — Kling API (image2video + lip-sync) or Replicate (kling-v3-video one-shot)
 *      b. B-roll clips — Kling v3 via Replicate (image-to-video or text-to-video)
 *   5. Assemble final video (FFmpeg: audio mix + subtitles)
 *   6. Upload to Cloudflare R2
 *   7. Callback to webhook-provider
 *
 * PIP Flow (composition_mode: 'pip'):
 *   1. Generate TTS for full script
 *   2. Extract B-roll image prompts via Haiku (5-8 keywords with timestamps)
 *   3. Generate 2x 15s lip-sync clips (clip #2 uses last frame of clip #1 as start_image)
 *   4. Generate B-roll images via Flux Schnell in parallel
 *   5. FFmpeg composite: talking head + subtitles + rotating B-roll overlays with animations
 *   6. Upload to R2 + callback
 */

import { createClient } from '@supabase/supabase-js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);
import { splitScenes } from './scene-splitter.js';
import { generateTTS } from './tts.js';
import { generateBrollClips } from './video-gen.js';
import { generateTalkingHeadClips } from './talking-head.js';
import { classifyError } from './error-classifier.js';
import { r2Upload, r2SignedUrl } from './r2.js';
import { assembleVideo, getMediaDuration } from './assembler.js';
import { dubVideo } from './dubbing.js';
// broll-image-gen.js removed — PIP uses generateBrollClips (video-gen.js) via EvoLink
import { extractLastFrame, composePipVideo } from './pip-composer.js';

let _openai;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVOLINK_IMAGE_TIMEOUT_MS = parsePositiveInteger(process.env.EVOLINK_IMAGE_TIMEOUT_MS, 600_000);

// Talking head provider: 'kling' (official API, needs TTS), 'replicate' (one-shot, native audio), or 'evolink' (EvoLink API, ~55% cheaper)
const TALKING_HEAD_PROVIDER = process.env.TALKING_HEAD_PROVIDER || 'kling';

// ElevenLabs pre-made voice mapping by gender/age
const VOICE_MAP = {
  young_female: 'cgSgspJ2msm6clMCkdW9', // Jessica
  female: 'EXAVITQu4vr4xnSDxMaL',       // Sarah
  young_male: 'TX3LPaxmHKxFdv7VOQHJ',    // Liam
  male: 'iP95p4xoKVk53GoZ742B',          // Chris
  neutral: 'EXAVITQu4vr4xnSDxMaL',       // Sarah (fallback)
};

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Detect the best TTS voice for a face photo using GPT-4o vision.
 *
 * @param {string} imageUrl - Public URL of the face photo
 * @returns {Promise<string>} OpenAI TTS voice name
 */
async function detectVoiceFromFace(imageUrl) {
  // No catch-and-default. If face analysis fails, the job fails — the
  // caller can pass an explicit voice if they don't want auto-detection.
  // Silently defaulting to 'alloy' ships every persona with the same
  // generic voice and looks "successful" to the user.
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You analyze face photos. Return ONLY one of these exact labels: young_female, female, young_male, male. No other text.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is the apparent gender and age group of this person?' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 10,
  });

  const label = response.choices[0]?.message?.content?.trim().toLowerCase();
  if (!label || !(label in VOICE_MAP)) {
    throw new Error(`Face analysis returned unmapped label: "${label}". Pass an explicit voice to skip auto-detection.`);
  }
  const voice = VOICE_MAP[label];
  console.log(`  Face analysis: ${label} → voice: ${voice}`);
  return voice;
}

/**
 * Process a UGC video job end-to-end.
 *
 * @param {Object} params
 * @param {string} params.job_id - Unique job identifier
 * @param {string} params.script - Full narration script
 * @param {string} params.voice - TTS voice (OpenAI preset name or ElevenLabs voice_id)
 * @param {string} params.model - Legacy param (B-roll model now set via broll_model slug)
 * @param {string} params.style - Subtitle style (default: 'hormozi')
 * @param {string} params.user_id - User ID for storage path
 * @param {string} params.callback_url - Webhook callback URL
 * @param {string|null} [params.face_photo_url] - Public URL of persona face photo
 * @param {number|null} [params.target_duration] - Target video duration in seconds (max 15)
 * @param {string} [params.aspect_ratio='9:16'] - Video aspect ratio
 * @param {string|null} [params.music] - Background music genre
 * @param {string|null} [params.cta] - End screen CTA text
 * @param {string|null} [params.tone] - Voice tone: energetic, calm, confident, dramatic
 * @param {boolean} [params.allow_broll=false] - When true, scene-splitter may assign broll cutaway scenes
 * @param {string[]|null} [params.broll_images] - Optional image URLs for B-roll scenes (mapped by scene order)
 * @param {string|null} [params.dub_language] - BCP-47 language code to dub the final video (e.g. 'es', 'fr')
 * @param {Array<{type:string,text:string,visual_prompt?:string,image?:string}>|null} [params.scenes_input] - User-provided scenes (bypasses GPT-4o scene splitting)
 * @param {string|null} [params.product_image_url] - Product image URL used as B-roll reference
 * @param {string|null} [params.template] - Script structure template: curiosity, comparison, product-review, product-explainer, recommendations, testimonial
 * @param {string|null} [params.broll_model] - Named B-roll model slug (e.g. 'pixverse', 'seedance')
 * @param {number|null} [params.voice_speed] - TTS speed multiplier (0.7–1.5)
 * @param {string|null} [params.composition_mode] - 'pip' for PIP overlay mode (talking head + B-roll images), null for standard concat
 * @returns {Promise<void>}
 */
export async function processUGC({ job_id, script, voice, model, style, user_id, callback_url, face_photo_url, target_duration, aspect_ratio = '9:16', music = null, cta = null, tts_provider = null, tone = null, allow_broll = false, broll_images = null, dub_language = null, scenes_input = null, product_image_url = null, template = null, broll_model = null, voice_speed = null, composition_mode = null, pip_position = null, pip_size = null, pip_animation = null, pip_style = null, overlay_text = null, overlay_image = null, webhook_url = null }) {
  const workDir = await mkdtemp(join(tmpdir(), `ugc-${job_id}-`));
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Hard cap: max 15s for standard mode, 30s for PIP (2×15s clips)
    const maxDuration = composition_mode === 'pip' ? 30 : 15;
    if (target_duration != null && target_duration > maxDuration) {
      console.warn(`[${job_id}] target_duration ${target_duration}s exceeds ${maxDuration}s cap, clamping`);
      target_duration = maxDuration;
    }

    console.log(`[${job_id}] Starting UGC pipeline`);
    console.log(`[${job_id}] Script: "${script.substring(0, 80)}..."`);
    console.log(`[${job_id}] Voice: ${voice || 'alloy'}, Tone: ${tone || 'default'}, Speed: ${voice_speed || 'default'}, Face: ${face_photo_url ? 'yes' : 'no'}, BrollImages: ${broll_images?.length ?? 0}, DubLang: ${dub_language || 'none'}, ScenesInput: ${scenes_input?.length ?? 0}, ProductImage: ${product_image_url ? 'yes' : 'no'}, Template: ${template || 'none'}, BrollModel: ${broll_model || 'default'}, OverlayText: ${overlay_text || 'none'}`);
    if (overlay_text) console.log(`[${job_id}] OVERLAY_TEXT = "${overlay_text}"`);

    const hasPersona = !!face_photo_url;

    // ── Step 0: Re-host face photo if needed (some CDNs block external fetches) ──
    let effectiveFaceUrl = face_photo_url;
    if (hasPersona) {
      console.log(`[${job_id}] Re-hosting face photo for external access...`);
      effectiveFaceUrl = await rehostImage(db, face_photo_url, user_id, job_id);
      console.log(`[${job_id}] Face photo re-hosted`);
    }

    // ── Step 0a2: Re-host product image if provided ───────────────────────
    let effectiveProductImageUrl = null;
    if (product_image_url) {
      console.log(`[${job_id}] Re-hosting product image for external access...`);
      effectiveProductImageUrl = await rehostImage(db, product_image_url, user_id, `${job_id}-product`);
      console.log(`[${job_id}] Product image re-hosted`);
    }

    // ── Step 0b: Auto-detect voice from face photo if not explicitly set ──
    let effectiveVoice = voice || 'alloy';
    if (hasPersona && (!voice || voice === 'alloy') && effectiveFaceUrl) {
      console.log(`[${job_id}] Auto-detecting voice from face photo...`);
      effectiveVoice = await detectVoiceFromFace(effectiveFaceUrl);
      console.log(`[${job_id}] Auto-selected voice: ${effectiveVoice}`);
    }

    // ── Simple single-scene mode ──────────────────────────────────────────
    // No broll = one scene, no cuts. Period.
    // Only go multi-scene when user explicitly provides custom scenes OR broll content.
    const hasBroll = allow_broll || (broll_images?.length > 0);
    const isSimpleMode = (
      hasPersona &&
      !scenes_input &&
      !hasBroll &&
      composition_mode !== 'pip'
    );

    if (isSimpleMode) {
      console.log(`[${job_id}] Simple mode: short script (${script.length} chars), provider: ${TALKING_HEAD_PROVIDER}`);
      sendProgress(callback_url, job_id, 'simple_mode', 10, 'Simple mode — single talking head scene');

      const scene = { text: script, type: 'talking_head', visualPrompt: '', index: 0 };
      const talkingHeadScenes = [{ index: 0, text: script }];
      const sceneAudioPaths = [null];
      const sceneAudioDurations = [0];
      let sceneAudioUrls = [null];

      const useNativeAudio = TALKING_HEAD_PROVIDER === 'replicate' || TALKING_HEAD_PROVIDER === 'evolink';

      if (!useNativeAudio) {
        // Kling API: generate TTS, upload for lip-sync
        console.log(`[${job_id}] Generating TTS for talking head (voice: ${effectiveVoice})...`);
        const audioPath = join(workDir, 'scene-audio-0.wav');
        await generateTTS(script, effectiveVoice, audioPath, {}, tts_provider, tone, voice_speed);
        sceneAudioPaths[0] = audioPath;
        sceneAudioDurations[0] = await getMediaDuration(audioPath);
        const audioUrl = await uploadAudioForKling(db, audioPath, user_id, job_id, 0);
        sceneAudioUrls = [audioUrl];
      }

      sendProgress(callback_url, job_id, 'tts_complete', 25, `Generating talking head (${TALKING_HEAD_PROVIDER})...`);

      const clipMap = await generateTalkingHeadClips(talkingHeadScenes, effectiveFaceUrl, sceneAudioUrls, workDir, TALKING_HEAD_PROVIDER);

      sendProgress(callback_url, job_id, 'clips_generated', 65, 'Talking head clip ready');

      // For omni providers (replicate/evolink), extract audio from the generated clip
      // instead of using separate TTS — the clip has native lip-synced audio
      if (useNativeAudio && clipMap.has(0)) {
        const clipPath = clipMap.get(0);
        const extractedAudioPath = join(workDir, 'scene-audio-0.wav');
        await execFileAsync('ffmpeg', [
          '-i', clipPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1', '-y', extractedAudioPath,
        ], { timeout: 30_000 });
        sceneAudioPaths[0] = extractedAudioPath;
        sceneAudioDurations[0] = await getMediaDuration(extractedAudioPath);
        console.log(`[${job_id}] Extracted native audio from clip (${sceneAudioDurations[0].toFixed(1)}s)`);
      }

      // Assemble (subtitles + loudnorm). No music-fallback retry: if the
      // user asked for music and assembly can't produce it, fail the job.
      // Silently dropping a paid-for feature is a worse outcome than a
      // visible failure they can retry.
      const scenes = [scene];
      const finalPath = await assembleVideo(scenes, clipMap, sceneAudioPaths, workDir, style || 'hormozi', aspect_ratio, music, cta, overlay_text, overlay_image);
      const finalDuration = await getMediaDuration(finalPath);
      console.log(`[${job_id}] Final video: ${finalDuration.toFixed(1)}s`);
      sendProgress(callback_url, job_id, 'assembled', 80, `Assembled ${finalDuration.toFixed(1)}s video`);

      // Dub (optional)
      let outputPath = finalPath;
      if (dub_language) {
        console.log(`[${job_id}] Dubbing video to: ${dub_language}`);
        try {
          outputPath = await dubVideo(finalPath, dub_language, workDir, job_id);
        } catch (dubErr) {
          console.error(`[${job_id}] Dubbing failed (using original): ${dubErr.message}`);
          outputPath = finalPath;
        }
      }

      // Upload to R2
      const outputBuffer = await readFile(outputPath);
      const outputStoragePath = `${user_id}/${job_id}/ugc-final.mp4`;
      const outputUrl = await r2Upload('generation-outputs', outputStoragePath, outputBuffer, 'video/mp4');
      console.log(`[${job_id}] Uploaded to ${outputStoragePath}`);

      // sendCallback() reaches the webhook-provider edge function, which
      // updates job state AND fires the user's webhook_url with HMAC
      // signature + retry. Don't fire the user webhook inline here —
      // that would double-deliver.
      await sendCallback(callback_url, { job_id, status: 'completed', output_url: outputUrl });
      console.log(`[${job_id}] Simple mode pipeline completed`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // PIP Mode — Talking head + rotating B-roll image overlays
    // ══════════════════════════════════════════════════════════════════════
    if (composition_mode === 'pip' && hasPersona) {
      console.log(`[${job_id}] PIP mode: generating talking head with B-roll overlays (provider: ${TALKING_HEAD_PROVIDER})`);
      sendProgress(callback_url, job_id, 'pip_start', 5, 'PIP mode — starting');

      const isOmniProvider = TALKING_HEAD_PROVIDER === 'replicate' || TALKING_HEAD_PROVIDER === 'evolink';

      // PIP splits into max-10s clips with last-frame continuity.
      // EvoLink kling-o3 lip sync degrades after ~10s, same as standard pipeline (5-10s per scene).
      const MAX_CLIP = 10;
      const rawDuration = target_duration || 15;
      const pipDuration = Math.min(rawDuration, 15); // max 15s total, split into ≤10s clips
      const needsTwoClips = pipDuration > MAX_CLIP;
      const clipDuration1 = needsTwoClips ? Math.ceil(pipDuration / 2) : pipDuration;
      const clipDuration2 = needsTwoClips ? pipDuration - clipDuration1 : 0;

      // Split script at midpoint for 2-clip mode
      const scriptMidpoint = needsTwoClips ? Math.floor(script.length / 2) : script.length;
      // Find nearest sentence boundary near midpoint
      const sentenceBreak = needsTwoClips
        ? (() => {
            const nearMid = script.substring(scriptMidpoint - 30, scriptMidpoint + 30);
            const match = nearMid.match(/[.!?]\s/);
            return match ? scriptMidpoint - 30 + match.index + 2 : scriptMidpoint;
          })()
        : script.length;
      const scriptPart1 = needsTwoClips ? script.substring(0, sentenceBreak).trim() : script;
      const scriptPart2 = needsTwoClips ? script.substring(sentenceBreak).trim() : '';

      console.log(`[${job_id}] PIP: ${needsTwoClips ? '2 clips' : '1 clip'}, est ${pipDuration}s total`);

      // ── PIP Step 1: Extract B-roll prompts via GPT-4o-mini ─────────────
      console.log(`[${job_id}] PIP: Extracting B-roll prompts...`);
      sendProgress(callback_url, job_id, 'pip_broll_prompts', 10, 'Extracting B-roll prompts...');
      let brollScenes = [];
      try {
        const brollResponse = await getOpenAI().chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'You extract visual B-roll concepts from video scripts. Return valid JSON only.' },
            {
              role: 'user',
              content: `Extract 3-5 visual B-roll video concepts from this narration script. These 5-second clips play as overlays in the bottom ~35% of a vertical talking-head video.

Script (${pipDuration}s total):
"${script}"

For each concept return:
- "visualPrompt": cinematic video generation prompt (describe a real scene with camera movement, lighting, style)
- "startTime": when to show this clip (seconds from video start)

Rules:
- Match each concept to what the narrator is saying at that moment
- Space clips out — no overlaps, leave 2-5s gaps between them
- First clip within first 3 seconds
- Last clip ends at least 2s before video ends (${pipDuration}s)

Return: { "clips": [...] }`,
            },
          ],
        });

        const parsed = JSON.parse(brollResponse.choices[0]?.message?.content);
        if (Array.isArray(parsed.clips) && parsed.clips.length > 0) {
          brollScenes = parsed.clips.map((c, i) => ({
            index: i,
            visualPrompt: c.visualPrompt,
            startTime: Math.max(0, Number(c.startTime) || 0),
            duration: 5,
          }));
          console.log(`[${job_id}] PIP: ${brollScenes.length} B-roll prompts extracted`);
        }
      } catch (brollErr) {
        // PIP videos without B-roll overlays are not the product the user
        // asked for — they're regular talking-head clips at PIP pricing.
        // Fail the job so they can retry, not silently ship a degraded result.
        throw new Error(`PIP B-roll prompt extraction failed: ${brollErr.message}`);
      }

      // ── PIP Step 2: Generate clip #1 + B-roll images in parallel ─────
      console.log(`[${job_id}] PIP: Generating clip #1 (${clipDuration1}s) + ${brollScenes.length} B-roll images in parallel...`);
      sendProgress(callback_url, job_id, 'pip_gen', 15, 'Generating clip #1 + B-roll images...');

      // For Kling official API, we need TTS + audio upload first
      let sceneAudioUrls = null;
      if (!isOmniProvider) {
        const audioPath = join(workDir, 'pip-audio-0.wav');
        await generateTTS(scriptPart1, effectiveVoice, audioPath, {}, tts_provider, tone, voice_speed);
        const audioUrl = await uploadAudioForKling(db, audioPath, user_id, job_id, 0);
        sceneAudioUrls = [audioUrl];
      }

      // Generate B-roll images via EvoLink nano-banana (1.6 credits/image)
      async function generateBrollImages(scenes, dir) {
        const { submitGeneration: submitImg, pollTask, downloadFile: dlFile } = await import('./evolink-client.js');
        // Promise.all (not allSettled): if ANY B-roll image fails, fail the
        // whole batch. A PIP that ships with some overlays missing is a
        // visibly broken product, not a "partial success."
        const results = await Promise.all(
          scenes.map(async (s) => {
            const imgPath = join(dir, `broll-img-${s.index}.png`);
            const submission = await submitImg('gemini-2.5-flash-image', {
              prompt: s.visualPrompt,
              size: '16:9',
            });
            const taskId = submission.id;
            if (!taskId) throw new Error(`No task ID for broll-img ${s.index}`);
            console.log(`  [broll-img-${s.index}] EvoLink task: ${taskId}`);
            const completed = await pollTask(taskId, EVOLINK_IMAGE_TIMEOUT_MS);
            const imgUrl = completed.results?.[0] ?? completed.image_url ?? completed.result?.image_url;
            if (!imgUrl) throw new Error(`No image URL for broll-img ${s.index}`);
            await dlFile(imgUrl, imgPath);
            console.log(`  [broll-img-${s.index}] Generated`);
            return { index: s.index, path: imgPath };
          }),
        );
        const map = new Map();
        for (const r of results) map.set(r.index, r.path);
        return map;
      }

      const [clip1Result, brollImageMap] = await Promise.all([
        generateTalkingHeadClips(
          [{ index: 0, text: scriptPart1, duration: clipDuration1 }],
          effectiveFaceUrl,
          sceneAudioUrls,
          workDir,
          TALKING_HEAD_PROVIDER,
        ),
        // No .catch — if B-roll images fail, fail the whole PIP job.
        // Shipping a PIP without overlays defeats the entire point.
        brollScenes.length > 0
          ? generateBrollImages(brollScenes, workDir)
          : Promise.resolve(new Map()),
      ]);

      // Merge B-roll image paths with timing data
      const brollClips = brollScenes
        .filter((s) => brollImageMap.has(s.index))
        .map((s) => ({ localPath: brollImageMap.get(s.index), startTime: s.startTime, duration: s.duration }));

      const clip1Path = clip1Result.get(0);
      if (!clip1Path) throw new Error('PIP: Clip #1 generation failed');
      console.log(`[${job_id}] PIP: Clip #1 ready + ${brollClips.length} B-roll clips`);
      sendProgress(callback_url, job_id, 'pip_clip1', 45, 'Clip #1 ready');

      // ── PIP Step 3: Generate clip #2 if needed ────────────────────────
      const allClipPaths = [clip1Path];

      if (needsTwoClips) {
        console.log(`[${job_id}] PIP: Extracting last frame of clip #1 for continuity...`);
        const lastFramePath = join(workDir, 'pip-lastframe.jpg');
        await extractLastFrame(clip1Path, lastFramePath);

        // Upload last frame to R2 as start_image for clip #2
        const lastFrameBuffer = await readFile(lastFramePath);
        const lfStoragePath = `${user_id}/${job_id}-lastframe/face-photo.jpg`;
        await r2Upload('persona-assets', lfStoragePath, lastFrameBuffer, 'image/jpeg');
        const lastFrameUrl = await r2SignedUrl('persona-assets', lfStoragePath, 3600);

        // For Kling official API, generate TTS + upload audio
        let clip2AudioUrls = null;
        if (!isOmniProvider) {
          const audioPath = join(workDir, 'pip-audio-1.wav');
          await generateTTS(scriptPart2, effectiveVoice, audioPath, {}, tts_provider, tone, voice_speed);
          const audioUrl = await uploadAudioForKling(db, audioPath, user_id, job_id, 1);
          clip2AudioUrls = [null, audioUrl];
        }

        console.log(`[${job_id}] PIP: Generating clip #2 (${clipDuration2}s, from last frame)...`);
        sendProgress(callback_url, job_id, 'pip_clip2', 55, 'Generating clip #2 from last frame...');

        const clip2Result = await generateTalkingHeadClips(
          [{ index: 1, text: scriptPart2, duration: clipDuration2 }],
          lastFrameUrl,
          clip2AudioUrls,
          workDir,
          TALKING_HEAD_PROVIDER,
        );

        const clip2Path = clip2Result.get(1);
        if (!clip2Path) throw new Error('PIP: Clip #2 generation failed');
        allClipPaths.push(clip2Path);
        console.log(`[${job_id}] PIP: Clip #2 ready`);
      }

      // ── PIP Step 4: Extract audio BEFORE normalize (like standard pipeline) ──
      // Standard pipeline strips audio from clips and overlays it separately.
      // This avoids A/V drift from -r 30 re-encode. PIP must do the same.
      const clipDurations = [clipDuration1, clipDuration2];
      const clipAudioPaths = [];
      if (isOmniProvider) {
        for (let ci = 0; ci < allClipPaths.length; ci++) {
          const audioOut = join(workDir, `pip-clip-audio-${ci}.wav`);
          await execFileAsync('ffmpeg', [
            '-i', allClipPaths[ci],
            '-t', String(clipDurations[ci]),
            '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1',
            '-y', audioOut,
          ], { timeout: 30_000 });
          clipAudioPaths.push(audioOut);
          console.log(`[${job_id}] PIP: Extracted audio from raw clip #${ci}`);
        }
      }

      // ── PIP Step 4b: Normalize + concatenate clips (strip audio) ──────
      const r = { w: 1080, h: 1920 };
      const normPaths = [];
      for (let ci = 0; ci < allClipPaths.length; ci++) {
        const normPath = join(workDir, `pip-norm-${ci}.mp4`);
        await execFileAsync('ffmpeg', [
          '-i', allClipPaths[ci],
          '-t', String(clipDurations[ci]),
          '-vf', `scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease,pad=${r.w}:${r.h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
          '-r', '30',
          '-an',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-y', normPath,
        ], { timeout: 120_000 });
        normPaths.push(normPath);
      }

      let finalTalkingHeadPath;
      if (normPaths.length === 1) {
        finalTalkingHeadPath = normPaths[0];
      } else {
        const concatPath = join(workDir, 'pip-concat.mp4');
        const concatListPath = join(workDir, 'pip-concat.txt');
        await writeFile(concatListPath, normPaths.map(p => `file '${p}'`).join('\n'));
        await execFileAsync('ffmpeg', [
          '-f', 'concat', '-safe', '0', '-i', concatListPath,
          '-c', 'copy', '-y', concatPath,
        ], { timeout: 120_000 });
        finalTalkingHeadPath = concatPath;
        console.log(`[${job_id}] PIP: 2 clips concatenated`);
      }

      // ── PIP Step 5: Build full audio track ────────────────────────────
      let fullAudioPath;
      if (isOmniProvider) {
        // Concat audio extracted from raw clips (before any re-encode)
        if (clipAudioPaths.length === 1) {
          fullAudioPath = clipAudioPaths[0];
        } else {
          fullAudioPath = join(workDir, 'pip-extracted-audio.wav');
          const audioListPath = join(workDir, 'pip-audio-concat.txt');
          await writeFile(audioListPath, clipAudioPaths.map(p => `file '${p}'`).join('\n'));
          await execFileAsync('ffmpeg', [
            '-f', 'concat', '-safe', '0', '-i', audioListPath,
            '-c', 'copy', '-y', fullAudioPath,
          ], { timeout: 30_000 });
        }
        console.log(`[${job_id}] PIP: Using audio extracted from raw clips`);
      } else {
        // Kling: concatenate the per-clip TTS audio
        fullAudioPath = join(workDir, 'pip-full-audio.wav');
        if (!needsTwoClips) {
          fullAudioPath = join(workDir, 'pip-audio-0.wav');
        } else {
          const audioListPath = join(workDir, 'pip-audio-concat.txt');
          await writeFile(audioListPath, `file '${join(workDir, 'pip-audio-0.wav')}'\nfile '${join(workDir, 'pip-audio-1.wav')}'`);
          await execFileAsync('ffmpeg', [
            '-f', 'concat', '-safe', '0', '-i', audioListPath,
            '-c', 'copy', '-y', fullAudioPath,
          ], { timeout: 30_000 });
        }
      }

      const audioDuration = await getMediaDuration(fullAudioPath);
      console.log(`[${job_id}] PIP: Audio ready (${audioDuration.toFixed(1)}s)`);
      sendProgress(callback_url, job_id, 'pip_compose', 75, 'Compositing PIP video...');

      // ── PIP Step 6: Compose final PIP video ───────────────────────────
      // Video is now silent (audio stripped in normalize step, like standard pipeline).
      // composePipVideo will mix the extracted audio back in.
      const pipFinalPath = await composePipVideo(
        finalTalkingHeadPath,
        fullAudioPath,
        brollClips,
        workDir,
        style || 'hormozi',
        false,
        { position: pip_position, size: pip_size, animation: pip_animation, pipStyle: pip_style },
      );

      const pipDurationFinal = await getMediaDuration(pipFinalPath);
      console.log(`[${job_id}] PIP: Final video: ${pipDurationFinal.toFixed(1)}s`);
      sendProgress(callback_url, job_id, 'pip_done', 85, `PIP video: ${pipDurationFinal.toFixed(1)}s`);

      // ── PIP Step 8: Upload to R2 ──────────────────────────────────────
      const outputBuffer = await readFile(pipFinalPath);
      const outputStoragePath = `${user_id}/${job_id}/ugc-final.mp4`;
      const outputUrl = await r2Upload('generation-outputs', outputStoragePath, outputBuffer, 'video/mp4');
      console.log(`[${job_id}] PIP: Uploaded to ${outputStoragePath}`);

      // sendCallback → edge function fires user webhook (see simple-mode comment above).
      await sendCallback(callback_url, { job_id, status: 'completed', output_url: outputUrl });
      console.log(`[${job_id}] PIP pipeline completed`);
      return;
    }

    // ── Step 1: Split script into scenes (or use provided scenes) ─────────
    let scenes;
    if (scenes_input && scenes_input.length > 0) {
      console.log(`[${job_id}] Using ${scenes_input.length} user-provided scenes (skipping GPT-4o splitting)`);
      scenes = await mapUserScenes(scenes_input, job_id);
    } else {
      console.log(`[${job_id}] Splitting script into scenes (broll: ${allow_broll ? 'enabled' : 'disabled'}, broll images: ${broll_images?.length ?? 0})...`);
      scenes = await splitScenes(script, target_duration, template, allow_broll, broll_images);
    }
    // Ensure every scene has a stable numeric index (scene-splitter doesn't set one)
    // If no persona, force all scenes to broll (assembler uses type to decide audio routing)
    scenes = scenes.map((s, i) => ({ ...s, index: i, ...(hasPersona ? {} : { type: 'broll' }) }));
    console.log(`[${job_id}] ${scenes.length} scenes: ${scenes.map((s) => s.type).join(', ')}`);
    sendProgress(callback_url, job_id, 'scenes_split', 10, `${scenes.length} scenes ready`);

    // ── Step 2: Generate TTS + categorize scenes ───────────────────────────
    const sceneAudioPaths = new Array(scenes.length).fill(null);
    const sceneAudioDurations = new Array(scenes.length).fill(0);
    const sceneAudioUrls = new Array(scenes.length).fill(null);
    const talkingHeadScenes = [];
    const brollScenesList = [];

    for (let i = 0; i < scenes.length; i++) {
      if (hasPersona && scenes[i].type === 'talking_head') {
        talkingHeadScenes.push({ index: i, text: scenes[i].text });
      } else {
        brollScenesList.push({ index: i, visualPrompt: scenes[i].visualPrompt });
      }
    }

    // For omni providers (replicate/evolink), skip TTS entirely —
    // ALL audio comes from O3 native voice (talking head clips + voice-only clips for broll).
    // For kling API, generate TTS for all scenes (used for lip-sync input + broll voiceover).
    const isOmniProvider = TALKING_HEAD_PROVIDER === 'replicate' || TALKING_HEAD_PROVIDER === 'evolink';

    /** @type {Array<{index: number, error: string}>} */
    const ttsFailures = [];
    if (!isOmniProvider) {
      const scenesNeedingTTS = scenes.map((_, i) => i);
      console.log(`[${job_id}] Generating TTS for ${scenesNeedingTTS.length} scenes (voice: ${effectiveVoice}, provider: ${TALKING_HEAD_PROVIDER})...`);
      for (const i of scenesNeedingTTS) {
        const audioPath = join(workDir, `scene-audio-${i}.wav`);
        const context = {
          previousText: i > 0 ? scenes[i - 1].text : undefined,
          nextText: i < scenes.length - 1 ? scenes[i + 1].text : undefined,
        };
        try {
          await generateTTS(scenes[i].text, effectiveVoice, audioPath, context, tts_provider, tone, voice_speed);
          sceneAudioPaths[i] = audioPath;
          sceneAudioDurations[i] = await getMediaDuration(audioPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[${job_id}] TTS failed for scene ${i}: ${msg}`);
          ttsFailures.push({ index: i, error: msg });
          // Leave sceneAudioPaths[i] = null. Pre-flight check below decides
          // whether to fail the job or proceed with partial audio.
        }
      }
      // Pre-flight: if EVERY TTS call failed, surface the underlying TTS
      // error instead of letting the assembler later throw the generic
      // "No audio files for voiceover concatenation" message.
      if (ttsFailures.length === scenesNeedingTTS.length && scenesNeedingTTS.length > 0) {
        const firstErr = ttsFailures[0].error;
        const summary = ttsFailures.length === 1
          ? `TTS failed: ${firstErr}`
          : `TTS failed for all ${ttsFailures.length} scenes — first error: ${firstErr}`;
        const e = new Error(summary);
        e.code = 'TTS_FAILED';
        throw e;
      }
      if (ttsFailures.length > 0) {
        console.warn(`[${job_id}] TTS partial failure: ${ttsFailures.length}/${scenesNeedingTTS.length} scenes failed; continuing with partial audio`);
      }
    } else {
      console.log(`[${job_id}] Omni provider — skipping TTS, all audio from O3 native voice`);
    }

    // Upload talking head TTS audio to Supabase for Kling API (needs public URLs)
    if (TALKING_HEAD_PROVIDER === 'kling' && talkingHeadScenes.length > 0) {
      console.log(`[${job_id}] Uploading ${talkingHeadScenes.length} TTS audio file(s) for Kling API...`);
      for (const th of talkingHeadScenes) {
        sceneAudioUrls[th.index] = await uploadAudioForKling(db, sceneAudioPaths[th.index], user_id, job_id, th.index);
      }
    }

    sendProgress(callback_url, job_id, 'tts_complete', 25, `Audio: ${isOmniProvider ? 'O3 native' : 'TTS'} (${TALKING_HEAD_PROVIDER}), ${talkingHeadScenes.length} talking head, ${brollScenesList.length} broll`);
    console.log(`[${job_id}] Talking head: ${talkingHeadScenes.length} scenes (${TALKING_HEAD_PROVIDER}), B-roll: ${brollScenesList.length} scenes`);

    // ── Step 5: Build image map for B-roll scenes ─────────────────────────
    const sceneImageMap = new Map();

    // Collect inline images from scenes_input
    if (scenes_input) {
      for (let i = 0; i < scenes_input.length; i++) {
        if (scenes_input[i].image) {
          const hostedUrl = await rehostImage(db, scenes_input[i].image, user_id, `${job_id}-sceneinput-${i}`);
          sceneImageMap.set(i, hostedUrl);
        }
      }
    }

    // broll_images mapped to broll scenes using semantic imageIndex from scene splitter
    if (broll_images?.length > 0) {
      // First: use scene splitter's imageIndex assignments (semantic matching)
      let assignedCount = 0;
      for (const scene of scenes) {
        if (scene.type !== 'broll') continue;
        if (sceneImageMap.has(scene.index)) continue;
        if (scene.imageIndex != null && scene.imageIndex >= 0 && scene.imageIndex < broll_images.length) {
          const rawUrl = broll_images[scene.imageIndex];
          console.log(`[${job_id}] Re-hosting B-roll image ${scene.imageIndex} for scene ${scene.index} (semantic match)...`);
          const hostedUrl = await rehostImage(db, rawUrl, user_id, `${job_id}-broll-${scene.index}`);
          sceneImageMap.set(scene.index, hostedUrl);
          assignedCount++;
        }
      }

      // Fallback: if scene splitter didn't assign any images (e.g. old format),
      // assign remaining images sequentially to unmatched broll scenes
      if (assignedCount === 0) {
        const sortedBroll = [...brollScenesList].sort((a, b) => a.index - b.index);
        let brollImageIdx = 0;
        for (const scene of sortedBroll) {
          if (sceneImageMap.has(scene.index)) continue;
          if (brollImageIdx < broll_images.length) {
            const rawUrl = broll_images[brollImageIdx++];
            console.log(`[${job_id}] Re-hosting B-roll image ${brollImageIdx} for scene ${scene.index} (sequential fallback)...`);
            const hostedUrl = await rehostImage(db, rawUrl, user_id, `${job_id}-broll-${scene.index}`);
            sceneImageMap.set(scene.index, hostedUrl);
          }
        }
      }
    }

    // ── Step 6: Generate clips in parallel ─────────────────────────────────
    const clipMap = new Map();
    let unifiedVoiceoverPath = null;

    // V2 UNIFIED VOICE: For omni providers with broll, generate ONE full-script
    // talking head clip. Use its VIDEO for talking head scenes (cut by timestamps)
    // and its AUDIO as the continuous voiceover for the entire video.
    // This gives us: lip sync (same generation) + consistent voice (single O3 call).

    const needsUnifiedVoice = isOmniProvider && hasPersona && brollScenesList.length > 0;

    if (needsUnifiedVoice && talkingHeadScenes.length > 0) {
      console.log(`[${job_id}] [unified_voice] Generating 1 full-script talking head + ${brollScenesList.length} B-roll in parallel...`);
      sendProgress(callback_url, job_id, 'clips_start', 35, `Unified voice: 1 full talking head + ${brollScenesList.length} B-roll`);

      // Generate ONE full-script talking head clip + B-roll clips in parallel
      const [fullTHResult, brollResult] = await Promise.allSettled([
        generateTalkingHeadClips([{ index: -1, text: script }], effectiveFaceUrl, null, workDir, TALKING_HEAD_PROVIDER),
        generateBrollClips(
          brollScenesList,
          model,
          workDir,
          null,
          aspect_ratio,
          sceneImageMap.size > 0 ? sceneImageMap : null,
          effectiveProductImageUrl,
          broll_model,
        ),
      ]);

      if (fullTHResult.status === 'rejected') {
        throw new Error(`Full talking head generation failed: ${fullTHResult.reason?.message}`);
      }
      if (brollResult.status === 'rejected') {
        throw new Error(`B-roll generation failed: ${brollResult.reason?.message}`);
      }

      const fullClipPath = fullTHResult.value.get(-1);
      if (!fullClipPath) throw new Error('Full talking head clip not found');

      // Extract unified voiceover from the full clip (audio stays whole)
      unifiedVoiceoverPath = join(workDir, 'unified-voice-full.wav');
      await execFileAsync('ffmpeg', [
        '-i', fullClipPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1', '-y', unifiedVoiceoverPath,
      ], { timeout: 30_000 });
      const fullDur = await getMediaDuration(unifiedVoiceoverPath);
      console.log(`[${job_id}] [unified_voice] Full voiceover: ${fullDur.toFixed(1)}s`);

      // Cut the full talking head VIDEO into segments for each talking_head scene.
      // Word-count proportional timestamps — only for VIDEO cuts, audio stays whole.
      const totalWords = scenes.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0);
      let currentTime = 0;

      for (let i = 0; i < scenes.length; i++) {
        const sceneWords = scenes[i].text.split(/\s+/).filter(Boolean).length;
        const sceneDuration = Math.max(1, (sceneWords / totalWords) * fullDur);  // min 1s

        if (scenes[i].type === 'talking_head') {
          const segmentPath = join(workDir, `th-segment-${i}.mp4`);
          // Re-encode (not copy) so we can cut at exact timestamps, not just keyframes
          await execFileAsync('ffmpeg', [
            '-ss', String(currentTime),
            '-i', fullClipPath,
            '-t', String(sceneDuration),
            '-an',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-y', segmentPath,
          ], { timeout: 60_000 });
          clipMap.set(i, segmentPath);
          console.log(`[${job_id}] [unified_voice] TH scene ${i}: ${currentTime.toFixed(1)}s-${(currentTime + sceneDuration).toFixed(1)}s`);
        }

        currentTime += sceneDuration;
      }

      // Merge B-roll clips
      for (const [idx, path] of brollResult.value) {
        clipMap.set(idx, path);
      }

      console.log(`[${job_id}] [unified_voice] ${clipMap.size} clips ready (${talkingHeadScenes.length} TH segments + ${brollScenesList.length} B-roll)`);

    } else if (hasPersona && talkingHeadScenes.length > 0 && brollScenesList.length > 0) {
      // Non-omni provider with broll — original v1 behavior (per-scene clips)
      console.log(`[${job_id}] Generating ${talkingHeadScenes.length} talking head + ${brollScenesList.length} B-roll in parallel...`);
      sendProgress(callback_url, job_id, 'clips_start', 35, `Generating ${talkingHeadScenes.length} talking head + ${brollScenesList.length} B-roll clips`);
      const [thResult, brResult] = await Promise.allSettled([
        generateTalkingHeadClips(talkingHeadScenes, effectiveFaceUrl, sceneAudioUrls, workDir, TALKING_HEAD_PROVIDER),
        generateBrollClips(brollScenesList, model, workDir, null, aspect_ratio, sceneImageMap.size > 0 ? sceneImageMap : null, effectiveProductImageUrl, broll_model),
      ]);
      if (thResult.status === 'rejected') throw new Error(`Talking head failed: ${thResult.reason?.message}`);
      if (brResult.status === 'rejected') throw new Error(`B-roll failed: ${brResult.reason?.message}`);
      for (const [idx, path] of thResult.value) clipMap.set(idx, path);
      for (const [idx, path] of brResult.value) clipMap.set(idx, path);
    } else if (hasPersona && talkingHeadScenes.length > 0) {
      // Only talking head scenes (e.g., monologue template)
      console.log(`[${job_id}] Generating ${talkingHeadScenes.length} talking head clips (${TALKING_HEAD_PROVIDER})...`);
      sendProgress(callback_url, job_id, 'clips_start', 35, `Generating ${talkingHeadScenes.length} talking head clips`);
      const result = await generateTalkingHeadClips(talkingHeadScenes, effectiveFaceUrl, sceneAudioUrls, workDir, TALKING_HEAD_PROVIDER);
      for (const [idx, path] of result) {
        clipMap.set(idx, path);
      }
    } else {
      // No persona or no talking head scenes — all B-roll (original behavior)
      console.log(`[${job_id}] Generating ${brollScenesList.length} B-roll clips...`);
      sendProgress(callback_url, job_id, 'broll_start', 35, `Generating ${brollScenesList.length} broll clips`);
      const brollClips = await generateBrollClips(
        brollScenesList,
        model,
        workDir,
        effectiveFaceUrl,
        aspect_ratio,
        sceneImageMap.size > 0 ? sceneImageMap : null,
        effectiveProductImageUrl,
        broll_model,
      );
      for (const [idx, path] of brollClips) {
        clipMap.set(idx, path);
      }
    }

    console.log(`[${job_id}] Generated ${clipMap.size}/${scenes.length} clips`);
    sendProgress(callback_url, job_id, 'clips_generated', 65, `Generated ${clipMap.size}/${scenes.length} video clips`);

    if (clipMap.size === 0) {
      throw new Error('No clips were generated — all video generation failed');
    }

    // ── Step 6a: For omni providers, extract native audio from talking head clips ──
    // Omni models (replicate/evolink) generate lip-synced audio natively.
    // Replace TTS with extracted audio for talking head scenes so lips match voice.
    if (isOmniProvider) {
      for (const th of talkingHeadScenes) {
        if (!clipMap.has(th.index)) {
          // Missing clip is an upstream generation failure. Splicing in
          // 3 seconds of silence ships an obviously-broken video; fail
          // the job so the user can retry instead.
          throw new Error(`No clip generated for scene ${th.index} — upstream video generation failed`);
        }
        const clipPath = clipMap.get(th.index);
        const extractedPath = join(workDir, `scene-audio-${th.index}-native.wav`);
        // No try/catch around extraction. If ffmpeg can't pull audio out
        // of the clip we just generated, that's a real bug — surface it.
        await execFileAsync('ffmpeg', [
          '-i', clipPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1', '-y', extractedPath,
        ], { timeout: 30_000 });
        sceneAudioPaths[th.index] = extractedPath;
        sceneAudioDurations[th.index] = await getMediaDuration(extractedPath);
        console.log(`[${job_id}] Extracted native audio for scene ${th.index} (${sceneAudioDurations[th.index].toFixed(1)}s)`);
      }
    }

    // ── Step 6b: Assemble final video ────────────────────────────────────
    // Pre-flight: assembler will throw 'No audio files for voiceover
    // concatenation' if every sceneAudioPath is null. That message tells
    // the user nothing useful — replace it with a clearer error pointing
    // at whichever upstream actually failed (TTS, native-audio extraction,
    // or all clips missing).
    if (!unifiedVoiceoverPath) {
      const validAudioCount = sceneAudioPaths.filter((p) => p != null).length;
      if (validAudioCount === 0) {
        const failureSource = isOmniProvider
          ? 'omni audio extraction returned no audio for any scene (all talking-head clips failed or had no audio track)'
          : `all TTS attempts failed (${ttsFailures.length} scene(s); first error: ${ttsFailures[0]?.error ?? 'unknown'})`;
        const e = new Error(`Cannot assemble video — ${failureSource}`);
        e.code = 'NO_AUDIO_AVAILABLE';
        throw e;
      }
    }
    console.log(`[${job_id}] Assembling final video...`);
    const assemblyOpts = unifiedVoiceoverPath ? { prebuiltVoiceover: unifiedVoiceoverPath } : {};
    // No music-drop retry. If music was requested and can't be applied,
    // fail loudly — the user paid for music; shipping silent video is
    // shipping the wrong product.
    const finalPath = await assembleVideo(scenes, clipMap, sceneAudioPaths, workDir, style || 'hormozi', aspect_ratio, music, cta, overlay_text, overlay_image, assemblyOpts);

    const finalDuration = await getMediaDuration(finalPath);
    console.log(`[${job_id}] Final video: ${finalDuration.toFixed(1)}s`);
    sendProgress(callback_url, job_id, 'assembled', 80, `Assembled ${finalDuration.toFixed(1)}s video`);

    // ── Step 6b: Dub video (optional) ───────────────────────────────────
    let outputPath = finalPath;
    if (dub_language) {
      console.log(`[${job_id}] Dubbing video to: ${dub_language}`);
      sendProgress(callback_url, job_id, 'dubbing', 83, `Dubbing to ${dub_language}...`);
      try {
        outputPath = await dubVideo(finalPath, dub_language, workDir, job_id);
        console.log(`[${job_id}] Dubbing complete`);
        sendProgress(callback_url, job_id, 'dubbed', 87, 'Dubbing complete');
      } catch (dubErr) {
        console.error(`[${job_id}] Dubbing failed (using original): ${dubErr.message}`);
        // Non-fatal: continue with original video
        outputPath = finalPath;
      }
    }

    // ── Step 7: Upload to R2 ─────────────────────────────────────────────
    console.log(`[${job_id}] Uploading final video to R2...`);
    const outputBuffer = await readFile(outputPath);

    const outputStoragePath = `${user_id}/${job_id}/ugc-final.mp4`;
    const outputUrl = await r2Upload('generation-outputs', outputStoragePath, outputBuffer, 'video/mp4');
    console.log(`[${job_id}] Uploaded to ${outputStoragePath}`);
    sendProgress(callback_url, job_id, 'uploaded', 90, 'Video uploaded, finalizing...');

    // ── Step 8: Callback ────────────────────────────────────────────────
    // sendCallback → webhook-provider edge function. The edge function
    // fires the user's webhook_url (with HMAC sig + retry) — do NOT
    // call sendWebhook here, that would double-deliver.
    await sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: outputUrl,
    });

    console.log(`[${job_id}] UGC pipeline completed successfully`);
  } catch (err) {
    console.error(`[${job_id}] Pipeline error: ${err.message}`);
    const { code, message } = classifyError(err);
    // Edge function will fire job.failed webhook for us.
    await sendCallback(callback_url, {
      job_id,
      status: 'failed',
      error: message,
      error_code: code,
    });

    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch((e) =>
      console.warn(`[${job_id}] Cleanup warning: ${e.message}`),
    );
  }
}

/**
 * Upload a local TTS audio file to Supabase Storage and return a signed URL.
 * Kling API requires a publicly accessible audio URL for lip-sync.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} audioPath - Local path to the .wav file
 * @param {string} userId
 * @param {string} jobId
 * @param {number} sceneIndex
 * @returns {Promise<string>} Signed URL for the uploaded audio
 */
async function uploadAudioForKling(db, audioPath, userId, jobId, sceneIndex) {
  const buffer = await readFile(audioPath);
  const storagePath = `${userId}/${jobId}/scene-audio-${sceneIndex}.wav`;

  // Upload to R2
  await r2Upload('persona-assets', storagePath, buffer, 'audio/wav');

  // Return a presigned URL for Kling API to access
  return r2SignedUrl('persona-assets', storagePath, 3600);
}

/**
 * Map user-provided scenes to the internal scene format.
 *
 * User scene format:
 *   { type: string, text: string, visual_prompt?: string, image?: string }
 *
 * Internal scene format:
 *   { text: string, type: string, visualPrompt: string, index: number }
 *
 * For scenes without a visual_prompt, one is generated via GPT-4o-mini.
 *
 * @param {Array<{type:string, text:string, visual_prompt?:string, image?:string}>} userScenes
 * @param {string} jobId
 * @returns {Promise<Array<{text:string, type:string, visualPrompt:string, index:number}>>}
 */
async function mapUserScenes(userScenes, jobId) {
  const scenes = [];
  const brollNeedingPrompts = [];

  for (let i = 0; i < userScenes.length; i++) {
    const s = userScenes[i];
    const visualPrompt = s.visual_prompt?.trim() || null;
    const sceneType = s.type === 'talking_head' ? 'talking_head' : 'broll';

    scenes.push({ text: s.text, type: sceneType, visualPrompt, index: i });

    if (!visualPrompt) {
      brollNeedingPrompts.push(i);
    }
  }

  // Generate visual prompts for broll scenes that didn't provide one
  if (brollNeedingPrompts.length > 0) {
    console.log(`[${jobId}] Generating visual prompts for ${brollNeedingPrompts.length} broll scene(s) via GPT-4o-mini...`);

    await Promise.all(brollNeedingPrompts.map(async (idx) => {
      try {
        const scene = scenes[idx];
        const response = await getOpenAI().chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You write concise visual descriptions for AI video generation. Given a spoken text, describe what should appear on screen as a cinematic B-roll shot. Be specific about the subject, action, and mood. Keep it under 50 words.',
            },
            {
              role: 'user',
              content: `Write a visual prompt for this spoken text: "${scene.text}"`,
            },
          ],
          max_tokens: 80,
        });
        scene.visualPrompt = response.choices[0]?.message?.content?.trim() ?? scene.text;
      } catch (err) {
        console.warn(`[${jobId}] Failed to generate visual prompt for scene ${idx}: ${err.message} — using text as fallback`);
        scenes[idx].visualPrompt = scenes[idx].text;
      }
    }));
  }

  return scenes;
}

/**
 * Download an image from any URL and re-host it on Supabase Storage
 * so that external providers can access it (some CDNs block external fetches).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} imageUrl - Original image URL
 * @param {string} userId - User ID for storage path
 * @param {string} jobId - Job ID for storage path
 * @returns {Promise<string>} Public or signed URL accessible by external providers
 */
async function rehostImage(db, imageUrl, userId, jobId) {
  // Skip re-hosting if already a signed URL or on fal.ai CDN
  if (imageUrl.includes('fal.media/') || imageUrl.includes('token=')) {
    return imageUrl;
  }


  let buffer;
  let contentType = 'image/png';

  // Handle Supabase storage URLs — use SDK for private paths, direct fetch for public URLs
  const supabasePrivateMatch = imageUrl.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
  if (supabasePrivateMatch && imageUrl.includes('supabase.co')) {
    // Signed/private URL — download via SDK
    const [, bucket, path] = supabasePrivateMatch;
    const cleanPath = path.split('?')[0]; // strip query params from signed URLs
    const { data, error } = await db.storage.from(bucket).download(cleanPath);
    if (error || !data) {
      throw new Error(`Failed to download image from storage: ${error?.message ?? 'no data'}`);
    }
    buffer = Buffer.from(await data.arrayBuffer());
    contentType = data.type || 'image/png';
  } else {
    // Public URLs (including public Supabase storage) — direct HTTP fetch
    const res = await fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`Failed to download image (${res.status}): ${imageUrl}`);
    }
    contentType = res.headers.get('content-type') || 'image/png';
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';

  const storagePath = `${userId}/${jobId}/face-photo.${ext}`;

  // Upload to R2
  await r2Upload('persona-assets', storagePath, buffer, contentType);

  // Return a presigned URL for external providers
  return r2SignedUrl('persona-assets', storagePath, 3600);
}

/**
 * Send a callback to the webhook-provider.
 *
 * @param {string} callbackUrl
 * @param {Object} payload
 */
/**
 * Fire-and-forget progress update to the webhook-provider.
 * Does not throw on failure — progress is best-effort.
 */
async function sendProgress(callbackUrl, jobId, stage, progressPct, message = '') {
  if (!callbackUrl) return;
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        status: 'progress',
        stage,
        progress_pct: progressPct,
        message,
      }),
    });
  } catch {
    // Progress updates are best-effort — silently ignore failures
  }
}

// User-facing webhooks are now fired centrally by the webhook-provider
// edge function (see supabase/functions/webhook-provider/index.ts). The
// worker's only job is to send the internal callback (sendCallback);
// the edge function handles HMAC signing, retries, and writing
// webhook_deliveries audit rows.

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
