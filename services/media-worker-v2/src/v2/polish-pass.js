// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Post-Seedance polish pass.
 *
 * The pixel-level layer that flips raw model output from "AI-clean" to
 * "iPhone-real". Seedance outputs have characteristic AI tells:
 *   - too-clean motion (no jitter, perfect color, no grain)
 *   - model-default color grade (cool/neutral, not iPhone-warm)
 *   - no vignette
 *   - too-sharp edges
 *
 * This is the layer Stijn Feijen / ViralOps call "the seal" — without it
 * even great Seedance output looks too clean. With it, the output reads
 * as iPhone-captured.
 *
 * Handheld camera shake is NOT added here. Shake is upstream in the
 * Seedance prompt (the references encode handheld intent). Trying to
 * fake shake post-hoc with crop/translate looks worse than the natural
 * motion Seedance produces.
 */

import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

/**
 * Polish intensity presets. Filter chains tuned to deliver the iPhone
 * footage feel without overdoing it (heavy grain reads as "vintage
 * filter", not as "iPhone").
 */
const INTENSITY_PRESETS = {
  off: null,
  default: {
    grain: 6,    // noise=alls=6 — visible but not aggressive
    saturation: 1.05,
    gamma: 0.97, // very slight warm shift
    contrast: 1.03,
    vignetteAngle: 'PI/6', // subtle corner darkening (~30°)
  },
  heavy: {
    grain: 12,
    saturation: 1.10,
    gamma: 0.93,
    contrast: 1.08,
    vignetteAngle: 'PI/5', // more pronounced (~36°)
  },
};

/**
 * Build the ffmpeg -vf filter chain for a given intensity preset.
 */
function buildFilterChain(preset) {
  const { grain, saturation, gamma, contrast, vignetteAngle } = preset;
  return [
    // Warm iPhone color grade — slight saturation lift + warm gamma.
    `eq=saturation=${saturation}:gamma=${gamma}:contrast=${contrast}`,
    // Vignette — corner darkening that mimics iPhone wide-angle falloff.
    `vignette=${vignetteAngle}`,
    // Film grain LAST — applied on top so it survives downstream
    // re-compression. allf=t = apply to every frame.
    `noise=alls=${grain}:allf=t`,
  ].join(',');
}

/**
 * Apply the polish filter chain to an input video file. Writes to
 * outputPath. Returns nothing — throw on failure.
 *
 * @param {string} inputPath   absolute path to Seedance output mp4
 * @param {string} outputPath  absolute path for polished mp4
 * @param {object} [opts]
 * @param {'off'|'default'|'heavy'} [opts.intensity='default']
 * @returns {Promise<void>}
 */
export async function polishVideo(inputPath, outputPath, opts = {}) {
  const intensity = opts.intensity ?? 'default';
  const preset = INTENSITY_PRESETS[intensity];
  if (preset === undefined) {
    throw new Error(`polishVideo: unknown intensity "${intensity}". Valid: ${Object.keys(INTENSITY_PRESETS).join(', ')}`);
  }
  if (preset === null) {
    // 'off' — no filters, just copy the file. Caller can avoid calling
    // us when intensity='off' to skip the read/write entirely.
    throw new Error("polishVideo: intensity='off' should be handled by caller (skip the polish pass)");
  }

  const filterChain = buildFilterChain(preset);
  console.log(`  [polish] intensity=${intensity} filters=${filterChain}`);

  await execFileAsync('ffmpeg', [
    '-y',                   // overwrite output
    '-i', inputPath,
    '-vf', filterChain,
    // Re-encode video; preserve audio as-is to avoid quality loss on
    // the Seedance-generated audio track. Use libx264 + decent quality
    // — output will be re-uploaded once to R2.
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',           // visually transparent
    '-c:a', 'copy',
    '-movflags', '+faststart', // web-friendly mp4
    outputPath,
  ]);
}

/**
 * Helper: check whether the requested intensity is a real polish pass
 * (i.e. would call ffmpeg) or a no-op ('off'). Callers can branch on
 * this to skip the disk I/O entirely.
 */
export function isPolishActive(intensity) {
  return intensity !== 'off' && INTENSITY_PRESETS[intensity] !== undefined && INTENSITY_PRESETS[intensity] !== null;
}

/**
 * Default intensity when the caller did not specify one.
 */
export const DEFAULT_POLISH_INTENSITY = 'default';
