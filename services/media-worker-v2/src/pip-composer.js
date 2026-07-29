// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * PIP Composer — FFmpeg pipeline for Picture-in-Picture video composition.
 *
 * Composites:
 *   1. Base layer: Full-frame talking head video (top ~60%)
 *   2. Middle layer: Animated subtitles (ASS overlay)
 *   3. Bottom layer: Rotating B-roll images with entrance/exit animations
 *
 * Animation types:
 *   - slide_up: Image slides up from bottom
 *   - slide_left: Image slides in from right
 *   - slide_right: Image slides in from left
 *   - fade: Fade in/out
 *   - scale: Scale up from center
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { getMediaDuration } from './assembler.js';
import { transcribeWithWhisper } from './whisper.js';
import { generateASS } from './ass-generator.js';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT = 600_000; // 10 minutes

// ── Layout Constants (9:16 = 1080x1920) ─────────────────────────────────────

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const PIP_MARGIN = 40;

// Size presets: fraction of canvas width
const SIZE_PRESETS = {
  small: 0.40,
  medium: 0.55,
  large: 0.70,
};

// Entrance animation duration
const ANIM_IN = 0.3;
const ANIM_OUT = 0.3;

/**
 * Calculate PIP layout from options.
 * @param {{ position?: string, size?: string }} opts
 */
function calcLayout(opts = {}) {
  const sizeFrac = SIZE_PRESETS[opts.size] ?? SIZE_PRESETS.medium;
  const w = Math.round(CANVAS_W * sizeFrac);
  const h = Math.round(w * (9 / 16));
  const y = CANVAS_H - h - PIP_MARGIN - 200;

  let x;
  switch (opts.position) {
    case 'bottom-left':
      x = PIP_MARGIN;
      break;
    case 'bottom-right':
      x = CANVAS_W - w - PIP_MARGIN;
      break;
    default: // bottom-center
      x = Math.round((CANVAS_W - w) / 2);
  }

  const subMarginV = y - 200;
  return { w, h, x, y, subMarginV };
}


/**
 * Build FFmpeg filter_complex for B-roll image overlays.
 *
 * @param {Array<{localPath: string, startTime: number, duration: number}>} images
 * @param {string} baseLabel - FFmpeg label for the base video stream
 * @param {{ w: number, h: number, x: number, y: number }} layout - PIP layout from calcLayout()
 * @param {string} animation - Animation type: slide-up, slide-left, slide-right, fade, scale
 * @param {string} pipStyle - Frame style: none, rounded, shadow
 * @returns {{ filterChain: string, inputArgs: string[], finalLabel: string }}
 */
function buildBrollFilterComplex(images, baseLabel = '[0:v]', layout = calcLayout(), animation = 'slide-up', pipStyle = 'none') {
  if (images.length === 0) {
    return { filterChain: '', inputArgs: [], finalLabel: baseLabel };
  }

  const { w, h, x, y } = layout;

  // Ensure images don't overlap
  const sorted = [...images].sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].startTime + sorted[i - 1].duration;
    if (sorted[i].startTime < prevEnd + ANIM_OUT) {
      sorted[i].startTime = prevEnd + ANIM_OUT + 0.1;
    }
  }

  const inputArgs = [];
  const filters = [];
  let currentLabel = baseLabel;

  for (let i = 0; i < sorted.length; i++) {
    const img = sorted[i];
    const inputIdx = i + 1;
    inputArgs.push('-i', img.localPath);

    const t0 = img.startTime;
    const t1 = img.startTime + img.duration;
    const scaledLabel = `[broll${i}]`;
    const overlayLabel = `[pip${i}]`;

    // Scale image to PIP size + optional frame style
    let scaleFilter = `[${inputIdx}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
    if (pipStyle === 'rounded') {
      // Add rounded corners via geq (approximate with boxblur alpha mask)
      scaleFilter += `,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(gt(abs(X-W/2),W/2-20)*gt(abs(Y-H/2),H/2-20),if(lte(hypot(abs(X-W/2)-(W/2-20),abs(Y-H/2)-(H/2-20)),20),255,0),255)'`;
    }
    if (pipStyle === 'shadow') {
      // Shadow effect via slight offset dark copy (simplified: just add border)
      scaleFilter += `,pad=${w + 8}:${h + 8}:4:4:color=black@0.5`;
    }
    filters.push(`${scaleFilter}${scaledLabel}`);

    // Build overlay expression based on animation type
    const fadeInEnd = t0 + ANIM_IN;
    const fadeOutStart = t1 - ANIM_OUT;
    let xExpr = `${x}`;
    let yExpr;

    switch (animation) {
      case 'slide-left': {
        const xIn = `${CANVAS_W}-(${CANVAS_W}-${x})*min(1\\,(t-${t0})/${ANIM_IN})`;
        const xOut = `${x}+(${CANVAS_W}-${x})*min(1\\,(t-${fadeOutStart})/${ANIM_OUT})`;
        xExpr = `if(lt(t\\,${fadeInEnd})\\,${xIn}\\,if(gt(t\\,${fadeOutStart})\\,${xOut}\\,${x}))`;
        yExpr = `${y}`;
        break;
      }
      case 'slide-right': {
        const xIn = `-${w}+${w + x}*min(1\\,(t-${t0})/${ANIM_IN})`;
        const xOut = `${x}-${w + x}*min(1\\,(t-${fadeOutStart})/${ANIM_OUT})`;
        xExpr = `if(lt(t\\,${fadeInEnd})\\,${xIn}\\,if(gt(t\\,${fadeOutStart})\\,${xOut}\\,${x}))`;
        yExpr = `${y}`;
        break;
      }
      case 'fade':
      case 'scale':
        // For fade/scale, use static position (alpha handled separately)
        yExpr = `${y}`;
        break;
      default: // slide-up
      {
        const yIn = `${y}+(${CANVAS_H}-${y})*(1-min(1\\,(t-${t0})/${ANIM_IN}))`;
        const yOut = `${y}+(${CANVAS_H}-${y})*min(1\\,(t-${fadeOutStart})/${ANIM_OUT})`;
        yExpr = `if(lt(t\\,${fadeInEnd})\\,${yIn}\\,if(gt(t\\,${fadeOutStart})\\,${yOut}\\,${y}))`;
        break;
      }
    }

    filters.push(
      `${currentLabel}${scaledLabel}overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${t0},${t1})'${overlayLabel}`,
    );

    currentLabel = overlayLabel;
  }

  return {
    filterChain: filters.join(';\n'),
    inputArgs,
    finalLabel: currentLabel,
  };
}

/**
 * Extract the last frame of a video clip as a JPEG image.
 * Used to provide visual continuity between clip #1 and clip #2.
 *
 * @param {string} videoPath - Path to the video clip
 * @param {string} outputPath - Path for the extracted frame
 * @returns {Promise<string>} Path to the extracted frame
 */
export async function extractLastFrame(videoPath, outputPath) {
  const duration = await getMediaDuration(videoPath);
  // Seek to 0.1s before end to avoid potential black frame
  const seekTime = Math.max(0, duration - 0.1);

  await execFileAsync('ffmpeg', [
    '-ss', String(seekTime),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '2',
    '-y',
    outputPath,
  ], { timeout: 30_000 });

  console.log(`  Extracted last frame at ${seekTime.toFixed(2)}s → ${outputPath}`);
  return outputPath;
}

/**
 * Compose a PIP video: talking head base + B-roll image overlays + subtitles.
 *
 * @param {string} baseVideoPath - Full-frame talking head video (already concatenated from clips)
 * @param {string} audioPath - Full voiceover audio (extracted from video for omni providers, TTS for Kling)
 * @param {Array<{localPath: string, startTime: number, duration: number}>} brollImages - B-roll video clips with timing
 * @param {string} workDir - Working directory
 * @param {string} [subtitleStyle='hormozi'] - Subtitle style
 * @param {boolean} [videoHasAudio=false] - If true, base video already has correct audio (omni providers)
 * @returns {Promise<string>} Path to the final composed video
 */
export async function composePipVideo(baseVideoPath, audioPath, brollImages, workDir, subtitleStyle = 'hormozi', videoHasAudio = false, pipOpts = {}) {
  const outputPath = join(workDir, 'pip-final.mp4');
  const layout = calcLayout(pipOpts);
  const animation = pipOpts.animation || 'slide-up';
  const pipStyle = pipOpts.pipStyle || 'none';

  // ── Step 1: Ensure video has audio ─────────────────────────────────
  let currentPath;
  if (videoHasAudio) {
    // Omni providers (EvoLink/Replicate): video already has native audio embedded
    currentPath = baseVideoPath;
    console.log('  PIP: Using native audio from talking head video');
  } else {
    // Kling: mix separate TTS audio onto the silent base video
    const mixedPath = join(workDir, 'pip-mixed.mp4');
    await execFileAsync('ffmpeg', [
      '-i', baseVideoPath,
      '-i', audioPath,
      '-map', '0:v',
      '-map', '1:a',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y',
      mixedPath,
    ], { timeout: FFMPEG_TIMEOUT });
    currentPath = mixedPath;
    console.log('  PIP: Audio mixed onto base video');
  }

  // ── Step 2: Overlay B-roll images with animations ──────────────────

  if (brollImages.length > 0) {
    const brollPath = join(workDir, 'pip-broll.mp4');
    const { filterChain, inputArgs, finalLabel } = buildBrollFilterComplex(brollImages, '[0:v]', layout, animation, pipStyle);

    if (filterChain) {
      await execFileAsync('ffmpeg', [
        '-i', currentPath,
        ...inputArgs,
        '-filter_complex', filterChain,
        '-map', finalLabel,
        '-map', '0:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-y',
        brollPath,
      ], { timeout: FFMPEG_TIMEOUT });

      currentPath = brollPath;
      console.log(`  PIP: ${brollImages.length} B-roll overlays composited`);
    }
  }

  // ── Step 3: Generate and burn subtitles ────────────────────────────
  console.log('  PIP: Transcribing for subtitles...');
  const whisperAudioPath = join(workDir, 'pip-whisper.mp3');
  await execFileAsync('ffmpeg', [
    '-i', currentPath,
    '-vn', '-c:a', 'libmp3lame', '-q:a', '4',
    '-y', whisperAudioPath,
  ], { timeout: FFMPEG_TIMEOUT });

  const words = await transcribeWithWhisper(whisperAudioPath);

  if (words.length > 0) {
    const assContent = generateASS(words, subtitleStyle, '9:16', { marginVOverride: layout.subMarginV });
    const assPath = join(workDir, 'pip-subs.ass');
    await writeFile(assPath, assContent);

    try {
      await execFileAsync('ffmpeg', [
        '-i', currentPath,
        '-vf', `ass=${assPath}`,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-y',
        outputPath,
      ], { timeout: FFMPEG_TIMEOUT });

      console.log('  PIP: Subtitles burned + audio normalized');
    } catch (assErr) {
      // libass missing is a worker-image config bug, not a runtime "oh well."
      // Subtitles are a documented PIP feature.
      throw new Error(`PIP: ASS subtitle burn failed — likely libass missing in worker image: ${assErr.message}`);
    }
  } else {
    // Zero words from whisper means TTS upstream produced silent audio.
    // Fail loudly instead of shipping a video missing subtitles entirely.
    throw new Error('PIP: subtitle transcription returned zero words — upstream TTS likely failed');
  }

  return outputPath;
}
