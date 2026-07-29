// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * UGC Pipeline — Orchestrates the full UGC video production flow with persona support.
 *
 * Flow:
 *   1. Split script into scenes with type classification (GPT-4o-mini)
 *   2. Generate per-scene TTS audio (ElevenLabs cloned voice or OpenAI preset)
 *   3. Upload talking_head scene audio to Supabase Storage (fal.ai needs public URLs)
 *   4. Generate clips IN PARALLEL:
 *      a. Talking head clips — Kling Avatar v2 Pro (face + per-scene audio)
 *      b. Face-consistent B-roll — Kling V3 Elements (face reference in prompt)
 *   5. Assemble final video (FFmpeg: normalize → interleave → mix audio → burn subtitles)
 *   6. Upload to Supabase Storage
 *   7. Callback to webhook-provider
 */

import { createClient } from '@supabase/supabase-js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import OpenAI from 'openai';
import { splitScenes } from './scene-splitter.js';
import { generateTTS } from './tts.js';
import { generateBrollClips } from './video-gen.js';
import { generateTalkingHeadClips } from './talking-head.js';
import { assembleVideo, getMediaDuration } from './assembler.js';

let _openai;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// OpenAI TTS voice mapping by gender/age
const VOICE_MAP = {
  young_female: 'nova',
  female: 'nova',
  young_male: 'echo',
  male: 'onyx',
  neutral: 'alloy',
};

/**
 * Detect the best TTS voice for a face photo using GPT-4o vision.
 *
 * @param {string} imageUrl - Public URL of the face photo
 * @returns {Promise<string>} OpenAI TTS voice name
 */
async function detectVoiceFromFace(imageUrl) {
  try {
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
    const voice = VOICE_MAP[label] ?? 'alloy';
    console.log(`  Face analysis: ${label} → voice: ${voice}`);
    return voice;
  } catch (err) {
    console.warn(`  Face analysis failed (${err.message}), defaulting to alloy`);
    return 'alloy';
  }
}

/**
 * Process a UGC video job end-to-end.
 *
 * @param {Object} params
 * @param {string} params.job_id - Unique job identifier
 * @param {string} params.script - Full narration script
 * @param {string} params.voice - TTS voice (OpenAI preset name or ElevenLabs voice_id)
 * @param {string} params.model - fal.ai model for B-roll generation
 * @param {string} params.style - Subtitle style (default: 'hormozi')
 * @param {string} params.user_id - User ID for storage path
 * @param {string} params.callback_url - Webhook callback URL
 * @param {string|null} [params.face_photo_url] - Public URL of persona face photo
 * @param {number|null} [params.target_duration] - Target video duration in seconds
 * @param {string} [params.aspect_ratio='9:16'] - Video aspect ratio
 * @param {string|null} [params.music] - Background music genre
 * @param {string|null} [params.cta] - End screen CTA text
 * @returns {Promise<void>}
 */
export async function processUGC({ job_id, script, voice, model, style, user_id, callback_url, face_photo_url, target_duration, aspect_ratio = '9:16', music = null, cta = null }) {
  const workDir = await mkdtemp(join(tmpdir(), `ugc-${job_id}-`));
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log(`[${job_id}] Starting UGC pipeline`);
    console.log(`[${job_id}] Script: "${script.substring(0, 80)}..."`);
    console.log(`[${job_id}] Voice: ${voice || 'alloy'}, Face: ${face_photo_url ? 'yes' : 'no'}`);

    const hasPersona = !!face_photo_url;

    // ── Step 0: Re-host face photo if needed (fal.ai can't reach some CDNs) ──
    let effectiveFaceUrl = face_photo_url;
    if (hasPersona) {
      console.log(`[${job_id}] Re-hosting face photo for fal.ai access...`);
      effectiveFaceUrl = await rehostImage(db, face_photo_url, user_id, job_id);
      console.log(`[${job_id}] Face photo re-hosted`);
    }

    // ── Step 0b: Auto-detect voice from face photo if not explicitly set ──
    let effectiveVoice = voice || 'alloy';
    if (hasPersona && (!voice || voice === 'alloy') && effectiveFaceUrl) {
      console.log(`[${job_id}] Auto-detecting voice from face photo...`);
      effectiveVoice = await detectVoiceFromFace(effectiveFaceUrl);
      console.log(`[${job_id}] Auto-selected voice: ${effectiveVoice}`);
    }

    // ── Step 1: Split script into scenes ──────────────────────────────────
    console.log(`[${job_id}] Splitting script into scenes...`);
    const scenes = await splitScenes(script, target_duration);
    console.log(`[${job_id}] Split into ${scenes.length} scenes: ${scenes.map((s) => s.type).join(', ')}`);

    // ── Step 2: Generate per-scene TTS audio ──────────────────────────────
    console.log(`[${job_id}] Generating per-scene TTS (voice: ${effectiveVoice})...`);
    const sceneAudioPaths = [];

    for (let i = 0; i < scenes.length; i++) {
      const audioPath = join(workDir, `scene-audio-${i}.mp3`);
      const context = {
        previousText: i > 0 ? scenes[i - 1].text : undefined,
        nextText: i < scenes.length - 1 ? scenes[i + 1].text : undefined,
      };

      await generateTTS(scenes[i].text, effectiveVoice, audioPath, context);
      sceneAudioPaths.push(audioPath);
    }

    console.log(`[${job_id}] Generated ${sceneAudioPaths.length} scene audio files`);

    // ── Step 3: Get per-scene audio durations ─────────────────────────────
    const sceneAudioDurations = [];
    for (const audioPath of sceneAudioPaths) {
      const dur = await getMediaDuration(audioPath);
      sceneAudioDurations.push(dur);
    }

    console.log(`[${job_id}] Scene durations: ${sceneAudioDurations.map((d) => d.toFixed(1) + 's').join(', ')}`);

    // ── Step 4: Upload talking_head audio to storage (fal.ai needs URLs) ──
    const talkingHeadScenes = [];
    const brollScenes = [];

    for (let i = 0; i < scenes.length; i++) {
      if (hasPersona && scenes[i].type === 'talking_head') {
        // Upload this scene's audio to Supabase Storage for fal.ai to fetch
        const audioBuffer = await readFile(sceneAudioPaths[i]);
        const storagePath = `${user_id}/${job_id}/scene-audio-${i}.mp3`;

        const { error: uploadErr } = await db.storage
          .from('persona-assets')
          .upload(storagePath, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadErr) {
          throw new Error(`Failed to upload scene audio: ${uploadErr.message}`);
        }

        // Create a signed URL for fal.ai (1 hour expiry)
        const { data: signedData, error: signedErr } = await db.storage
          .from('persona-assets')
          .createSignedUrl(storagePath, 3600);

        if (signedErr || !signedData?.signedUrl) {
          throw new Error(`Failed to get signed URL for scene audio: ${signedErr?.message ?? 'no URL'}`);
        }

        talkingHeadScenes.push({
          index: i,
          audioUrl: signedData.signedUrl,
          audioDuration: sceneAudioDurations[i],
        });
      } else {
        brollScenes.push({
          index: i,
          visualPrompt: scenes[i].visualPrompt,
        });
      }
    }

    console.log(`[${job_id}] Talking head: ${talkingHeadScenes.length} scenes, B-roll: ${brollScenes.length} scenes`);

    // ── Step 5: Generate clips in parallel ─────────────────────────────────
    const clipMap = new Map();

    if (hasPersona && talkingHeadScenes.length > 0 && brollScenes.length > 0) {
      // Parallel: talking head + face-consistent B-roll
      console.log(`[${job_id}] Generating talking head + B-roll in parallel...`);

      const [talkingHeadResult, brollResult] = await Promise.allSettled([
        generateTalkingHeadClips(talkingHeadScenes, effectiveFaceUrl, workDir),
        generateBrollClips(brollScenes, model, workDir, effectiveFaceUrl, aspect_ratio),
      ]);

      // Merge talking head results
      if (talkingHeadResult.status === 'fulfilled') {
        for (const [idx, path] of talkingHeadResult.value) {
          clipMap.set(idx, path);
        }
      } else {
        console.error(`[${job_id}] Talking head generation failed: ${talkingHeadResult.reason?.message}`);
        // Degrade: treat failed talking head scenes as broll
        for (const scene of talkingHeadScenes) {
          brollScenes.push({ index: scene.index, visualPrompt: scenes[scene.index].visualPrompt });
        }
        // Re-generate the additional broll scenes
        const fallbackResult = await generateBrollClips(
          brollScenes.filter((s) => !clipMap.has(s.index)),
          model,
          workDir,
          effectiveFaceUrl,
          aspect_ratio,
        );
        for (const [idx, path] of fallbackResult) {
          clipMap.set(idx, path);
        }
      }

      // Merge B-roll results
      if (brollResult.status === 'fulfilled') {
        for (const [idx, path] of brollResult.value) {
          clipMap.set(idx, path);
        }
      } else {
        console.error(`[${job_id}] B-roll generation failed: ${brollResult.reason?.message}`);
        // Try B-roll without face reference as fallback
        const fallbackBroll = await generateBrollClips(
          brollScenes.filter((s) => !clipMap.has(s.index)),
          model,
          workDir,
          null,
          aspect_ratio,
        );
        for (const [idx, path] of fallbackBroll) {
          clipMap.set(idx, path);
        }
      }
    } else if (hasPersona && talkingHeadScenes.length > 0) {
      // Only talking head scenes
      const result = await generateTalkingHeadClips(talkingHeadScenes, effectiveFaceUrl, workDir);
      for (const [idx, path] of result) {
        clipMap.set(idx, path);
      }
    } else {
      // No persona or no talking head scenes — all B-roll (original behavior)
      console.log(`[${job_id}] Generating ${brollScenes.length} B-roll clips...`);
      const result = await generateBrollClips(brollScenes, model, workDir, effectiveFaceUrl, aspect_ratio);
      for (const [idx, path] of result) {
        clipMap.set(idx, path);
      }
    }

    console.log(`[${job_id}] Generated ${clipMap.size}/${scenes.length} clips`);

    if (clipMap.size === 0) {
      throw new Error('No clips were generated — all video generation failed');
    }

    // ── Step 6: Assemble final video ────────────────────────────────────
    console.log(`[${job_id}] Assembling final video...`);
    const finalPath = await assembleVideo(scenes, clipMap, sceneAudioPaths, workDir, style || 'hormozi', aspect_ratio, music, cta);

    const finalDuration = await getMediaDuration(finalPath);
    console.log(`[${job_id}] Final video: ${finalDuration.toFixed(1)}s`);

    // ── Step 7: Upload to Supabase Storage ──────────────────────────────
    console.log(`[${job_id}] Uploading final video...`);
    const outputBuffer = await readFile(finalPath);

    const outputStoragePath = `${user_id}/${job_id}/ugc-final.mp4`;
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

    // ── Step 8: Callback ────────────────────────────────────────────────
    await sendCallback(callback_url, {
      job_id,
      status: 'completed',
      output_url: outputUrl,
    });

    console.log(`[${job_id}] UGC pipeline completed successfully`);
  } catch (err) {
    console.error(`[${job_id}] Pipeline error: ${err.message}`);
    await sendCallback(callback_url, {
      job_id,
      status: 'failed',
      error: err.message,
    });
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch((e) =>
      console.warn(`[${job_id}] Cleanup warning: ${e.message}`),
    );
  }
}

/**
 * Download an image from any URL and re-host it on Supabase Storage
 * so that fal.ai can access it (some CDNs like Midjourney block external fetches).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} imageUrl - Original image URL
 * @param {string} userId - User ID for storage path
 * @param {string} jobId - Job ID for storage path
 * @returns {Promise<string>} Public or signed URL accessible by fal.ai
 */
async function rehostImage(db, imageUrl, userId, jobId) {
  // Skip re-hosting if already a signed URL or on fal.ai CDN
  if (imageUrl.includes('fal.media/') || imageUrl.includes('token=')) {
    return imageUrl;
  }

  let buffer;
  let contentType = 'image/png';

  // Handle Supabase storage URLs — download via SDK (private buckets)
  const supabaseMatch = imageUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (supabaseMatch && imageUrl.includes('supabase.co')) {
    const [, bucket, path] = supabaseMatch;
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) {
      throw new Error(`Failed to download face photo from storage: ${error?.message ?? 'no data'}`);
    }
    buffer = Buffer.from(await data.arrayBuffer());
    contentType = data.type || 'image/png';
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`Failed to download face photo (${res.status}): ${imageUrl}`);
    }
    contentType = res.headers.get('content-type') || 'image/png';
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';

  const storagePath = `${userId}/${jobId}/face-photo.${ext}`;
  const { error: uploadErr } = await db.storage
    .from('persona-assets')
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload face photo to storage: ${uploadErr.message}`);
  }

  // Create a 1-hour signed URL for fal.ai
  const { data: signedData, error: signedErr } = await db.storage
    .from('persona-assets')
    .createSignedUrl(storagePath, 3600);

  if (signedErr || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL for face photo: ${signedErr?.message ?? 'no URL'}`);
  }

  return signedData.signedUrl;
}

/**
 * Send a callback to the webhook-provider.
 *
 * @param {string} callbackUrl
 * @param {Object} payload
 */
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
