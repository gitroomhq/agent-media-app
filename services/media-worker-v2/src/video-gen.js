// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Video Gen — Generates B-roll video clips via Replicate.
 *
 * Primary model:
 * - Kling Video v3 (kwaivgi/kling-video-v3): high quality text-to-video + image-to-video
 *
 * Fallback:
 * - Minimax Hailuo 2 (minimax/hailuo-2): fast, good quality
 */

import { join } from 'node:path';
import { runModel, downloadFile } from './replicate-client.js';
import { runGeneration, downloadFile as evolinkDownload, isTransientEvoLinkError } from './evolink-client.js';

/**
 * Named B-roll model registry for Replicate.
 * Slugs are used in the --broll-model CLI flag and ugc-pipeline.
 */
export const BROLL_MODELS = {
  kling3: { owner: 'kwaivgi', name: 'kling-v3-omni-video' },
  hailuo2: { owner: 'minimax', name: 'hailuo-2' },
  wan21: { owner: 'wan-ai', name: 'wan-2.1' },
};

/**
 * EvoLink model mapping — same Kling models at ~55% lower cost.
 */
const EVOLINK_MODELS = {
  kling3: { t2v: 'kling-v3-text-to-video', i2v: 'kling-v3-image-to-video' },
  klingo3: { t2v: 'kling-o3-text-to-video', i2v: 'kling-o3-image-to-video' },
};

const DEFAULT_MODEL = BROLL_MODELS.kling3;

/**
 * Generate B-roll clips for scenes in parallel via Replicate.
 *
 * Model selection per scene:
 * 1. If scene has a specific image URL → image-to-video (image_url + prompt)
 * 2. If facePhotoUrl provided → image-to-video (face-consistent B-roll)
 * 3. Default → text-to-video (prompt only)
 *
 * @param {Array<{index: number, visualPrompt: string}>} scenes
 * @param {string} model - Unused legacy param (kept for API compat)
 * @param {string} workDir - Temporary directory for output files
 * @param {string|null} facePhotoUrl - Optional face photo URL for face-consistent B-roll
 * @param {string} [aspectRatio='9:16'] - Video aspect ratio
 * @param {Map<number, string>|null} [sceneImages] - Optional per-scene image URLs
 * @param {string|null} [brollReferenceUrl] - Default reference image for all B-roll scenes
 * @param {string|null} [brollModelSlug] - Named model slug from BROLL_MODELS
 * @returns {Promise<Map<number, string>>} Map of scene index -> local clip path
 */
export async function generateBrollClips(scenes, model, workDir, facePhotoUrl = null, aspectRatio = '9:16', sceneImages = null, brollReferenceUrl = null, brollModelSlug = null) {
  // Check if EvoLink provider is configured
  const useEvoLink = process.env.BROLL_PROVIDER === 'evolink' && process.env.EVOLINK_API_KEY;

  if (!useEvoLink && !process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set (or set BROLL_PROVIDER=evolink with EVOLINK_API_KEY)');
  }

  // Resolve model from slug
  const selectedModel = brollModelSlug && BROLL_MODELS[brollModelSlug]
    ? BROLL_MODELS[brollModelSlug]
    : DEFAULT_MODEL;

  const modelLabel = brollModelSlug && BROLL_MODELS[brollModelSlug]
    ? brollModelSlug
    : 'kling3';

  const providerLabel = useEvoLink ? 'EvoLink' : 'Replicate';
  console.log(`Generating ${scenes.length} B-roll clips via ${providerLabel} (model: ${modelLabel})...`);

  const results = await Promise.allSettled(
    scenes.map(async (scene) => {
      const outputPath = join(workDir, `broll-${scene.index}.mp4`);

      // Per-scene image takes priority → product reference. Do NOT use face photo
      // as fallback — it causes Kling to generate a zoomed-out version of the actor
      // instead of actual cinematic cutaway footage.
      const sceneImageUrl = sceneImages?.get(scene.index) ?? null;
      const effectiveImageUrl = sceneImageUrl ?? brollReferenceUrl;

      const input = {
        prompt: scene.visualPrompt,
        aspect_ratio: aspectRatio,
        duration: 5,
        mode: 'pro',
      };

      // Add start_image for image-to-video if available
      if (effectiveImageUrl) {
        input.start_image = effectiveImageUrl;
      }

      const logLabel = sceneImageUrl
        ? `scene-image[${scene.index}]`
        : brollReferenceUrl
          ? `ref-image[${scene.index}]`
          : `txt2vid[${scene.index}]`;

      console.log(`  [broll-${scene.index}] Submitting ${logLabel} via ${providerLabel}: "${scene.visualPrompt.substring(0, 50)}..."`);

      try {
        let videoUrl;
        let downloadOutput = useEvoLink ? evolinkDownload : downloadFile;

        if (useEvoLink) {
          // EvoLink path — pick text-to-video or image-to-video model
          const evolinkSlug = EVOLINK_MODELS[modelLabel] ? modelLabel : 'kling3';
          const evolinkModel = effectiveImageUrl
            ? EVOLINK_MODELS[evolinkSlug].i2v
            : EVOLINK_MODELS[evolinkSlug].t2v;
          const evolinkParams = {
            prompt: scene.visualPrompt,
            aspect_ratio: aspectRatio,
            duration: 5,
          };
          if (effectiveImageUrl) {
            evolinkParams.image_start = effectiveImageUrl;
          }
          try {
            videoUrl = await runGeneration(evolinkModel, evolinkParams);
          } catch (err) {
            if (!process.env.REPLICATE_API_TOKEN || !isTransientEvoLinkError(err)) {
              throw err;
            }
            console.warn(
              `  [broll-${scene.index}] EvoLink transient failure after retries; falling back to Replicate: ${err.message}`,
            );
            const output = await runModel(selectedModel.owner, selectedModel.name, input);
            videoUrl = Array.isArray(output) ? output[0] : output;
            downloadOutput = downloadFile;
          }
        } else {
          // Replicate path
          const output = await runModel(selectedModel.owner, selectedModel.name, input);
          videoUrl = Array.isArray(output) ? output[0] : output;
        }

        if (!videoUrl) {
          throw new Error(`${providerLabel} returned no output for scene ${scene.index}`);
        }

        await downloadOutput(videoUrl, outputPath);
        console.log(`  [broll-${scene.index}] Done`);
        return { index: scene.index, path: outputPath };
      } catch (err) {
        throw err;
      }
    }),
  );

  const clipMap = new Map();
  const failures = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      clipMap.set(result.value.index, result.value.path);
    } else {
      failures.push(result.reason?.message ?? 'unknown error');
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} B-roll clip(s) failed:\n${failures.join('\n')}`);
  }

  return clipMap;
}
