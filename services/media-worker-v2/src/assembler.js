// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Assembler — FFmpeg pipeline to combine B-roll clips, TTS audio,
 * and subtitles into a final UGC video.
 *
 * Pipeline:
 *   1. Build full voiceover from per-scene TTS audio
 *   2. Calculate per-scene durations from audio
 *   3. Normalize each clip (strip source audio, all clips are silent B-roll)
 *   4. Concat all clips (exact timing, no duration shift)
 *   5. Overlay TTS voiceover on the concatenated video
 *   5b. (Optional) Mix background music under voiceover at -18dB
 *   6. Burn subtitles (Whisper transcription → ASS → FFmpeg) + loudnorm
 *   7. (Optional) Append end screen / CTA card
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transcribeWithWhisper } from './whisper.js';
import { generateASS } from './ass-generator.js';
import { downloadMusicTrack } from './music.js';

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT = 600_000; // 10 minutes

const FADE_DURATION = 0.15; // seconds — per-clip fade in/out (no timing shift)

// ── Resolution Map ────────────────────────────────────────────────────────────

const RESOLUTION_MAP = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1':  { w: 1080, h: 1080 },
};

/**
 * Get audio/video duration using ffprobe.
 *
 * @param {string} filePath - Path to audio/video file
 * @returns {Promise<number>} Duration in seconds
 */
export async function getMediaDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ]);
  const duration = parseFloat(stdout.trim());
  if (isNaN(duration)) throw new Error(`Could not determine duration of ${filePath}`);
  return duration;
}

/**
 * Normalize, trim/loop, and optionally fade a clip — single FFmpeg pass.
 *
 * @param {string} inputPath - Input clip path
 * @param {string} outputPath - Output processed clip path
 * @param {number} targetDuration - Target duration in seconds
 * @param {string} [aspectRatio='9:16'] - Target aspect ratio
 * @param {boolean} [fadeIn=false] - Add fade-in
 * @param {boolean} [fadeOut=false] - Add fade-out
 * @returns {Promise<void>}
 */
async function normalizeAndTrim(inputPath, outputPath, targetDuration, aspectRatio = '9:16', fadeIn = false, fadeOut = false, keepAudio = false) {
  const r = RESOLUTION_MAP[aspectRatio] ?? RESOLUTION_MAP['9:16'];
  const clipDuration = await getMediaDuration(inputPath);

  const inputArgs = [];
  if (clipDuration < targetDuration) {
    const loops = Math.ceil(targetDuration / clipDuration);
    inputArgs.push('-stream_loop', String(loops - 1));
  }
  inputArgs.push('-i', inputPath);

  // Build filter chain: scale + pad + optional fades
  const filters = [
    `scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease`,
    `pad=${r.w}:${r.h}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
  ];
  if (fadeIn) filters.push(`fade=t=in:st=0:d=${FADE_DURATION}`);
  if (fadeOut) filters.push(`fade=t=out:st=${(targetDuration - FADE_DURATION).toFixed(3)}:d=${FADE_DURATION}`);

  const audioArgs = keepAudio ? ['-c:a', 'aac'] : ['-an'];

  await execFileAsync('ffmpeg', [
    ...inputArgs,
    '-t', String(targetDuration),
    '-vf', filters.join(','),
    '-r', '30',
    ...audioArgs,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-y',
    outputPath,
  ], { timeout: FFMPEG_TIMEOUT });
}

/**
 * Concatenate multiple audio files into a single track.
 *
 * @param {string[]} audioPaths - Ordered array of per-scene audio file paths
 * @param {string} outputPath - Path for the concatenated audio file
 * @returns {Promise<void>}
 */
async function concatAudio(audioPaths, outputPath) {
  // Filter out null/undefined paths — scenes with missing audio are skipped
  const validPaths = audioPaths.filter((p) => p != null);
  if (validPaths.length === 0) {
    throw new Error('No audio files available for voiceover concatenation');
  }
  if (validPaths.length < audioPaths.length) {
    console.warn(`  concatAudio: ${audioPaths.length - validPaths.length} null audio path(s) skipped`);
  }

  const listPath = outputPath + '.list.txt';
  const listContent = validPaths.map((p) => `file '${p}'`).join('\n');
  await writeFile(listPath, listContent);

  await execFileAsync('ffmpeg', [
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:a', 'pcm_s16le',
    '-ar', '44100',
    '-ac', '1',
    '-y',
    outputPath,
  ], { timeout: FFMPEG_TIMEOUT });
}



/**
 * Assemble final video from talking head + B-roll clips + voiceover + subtitles.
 *
 * @param {Array<{text: string, type: string, visualPrompt: string}>} scenes - All scenes in order
 * @param {Map<number, string>} clipMap - Map of scene index → local clip path
 * @param {string[]} sceneAudioPaths - Per-scene audio file paths in scene order
 * @param {string} workDir - Temporary working directory
 * @param {string} style - Subtitle style (default: 'hormozi')
 * @param {string} [aspectRatio='9:16'] - Video aspect ratio
 * @param {string|null} [music=null] - Background music genre (null = no music)
 * @param {string|null} [cta=null] - End screen CTA text (null = no end screen)
 * @param {string|null} [overlayText=null] - Persistent top banner text with neon glow (shown throughout the video)
 * @param {string|null} [overlayImage=null] - URL to a PNG image overlaid at the top (overrides overlayText)
 * @returns {Promise<string>} Path to the final output video
 */
export async function assembleVideo(scenes, clipMap, sceneAudioPaths, workDir, style = 'hormozi', aspectRatio = '9:16', music = null, cta = null, overlayText = null, overlayImage = null, { prebuiltVoiceover = null } = {}) {
  const outputPath = join(workDir, 'final.mp4');

  // ── Step 1: Build full voiceover ────────────────────────────────────
  const voiceoverPath = join(workDir, 'voiceover.wav');

  if (prebuiltVoiceover) {
    // V2 unified voice: use the full audio from a single O3 generation as-is.
    // No concatenation, no splitting — one continuous voice track.
    console.log('  Using prebuilt unified voiceover (no concat)');
    await execFileAsync('cp', [prebuiltVoiceover, voiceoverPath]);
  } else {
    console.log('  Concatenating per-scene audio...');
    await concatAudio(sceneAudioPaths, voiceoverPath);
  }

  const totalDuration = await getMediaDuration(voiceoverPath);
  console.log(`  Total voiceover: ${totalDuration.toFixed(1)}s`);

  // ── Step 2: Calculate per-scene durations ──────────────────────────
  // Use the same TTS voiceover for ALL scenes (talking_head + broll).
  // This ensures one consistent voice throughout the entire video.
  // Kling lip-sync is visual only — we don't need its re-encoded audio.
  const sceneDurations = [];

  if (prebuiltVoiceover) {
    // With unified voiceover, derive scene durations from clip durations.
    // The voiceover runs as one continuous track over all clips.
    for (let i = 0; i < scenes.length; i++) {
      if (!clipMap.has(i)) {
        // A missing clip is an upstream generation failure — splicing in
        // 3 seconds of a held frame is the kind of "looks completed but
        // is broken" output we explicitly refuse to ship.
        throw new Error(`Assembler: scene ${i} has no clip`);
      }
      const clipDur = await getMediaDuration(clipMap.get(i));
      sceneDurations.push(clipDur);
    }
  } else {
    for (let i = 0; i < sceneAudioPaths.length; i++) {
      if (sceneAudioPaths[i] == null) {
        if (!clipMap.has(i)) {
          throw new Error(`Assembler: scene ${i} has neither audio nor clip`);
        }
        // We have a clip but no audio. Use clip duration silently here
        // is acceptable only when the clip's NATIVE audio will be used
        // by a later step (omni providers). If audio is genuinely missing
        // at this point, that's still a bug — but the higher-level
        // ugc-pipeline now throws on missing-clip before we get here.
        const clipDur = await getMediaDuration(clipMap.get(i));
        sceneDurations.push(clipDur);
        continue;
      }
      const dur = await getMediaDuration(sceneAudioPaths[i]);
      sceneDurations.push(dur);
    }
  }

  console.log(`  Scene durations: ${sceneDurations.map((d) => d.toFixed(1) + 's').join(', ')}`);

  // ── Step 3: Normalize, trim, and fade each clip (single FFmpeg pass) ──
  // Strip audio from ALL clips — the unified TTS voiceover is overlaid in Step 5.
  const normalizedPaths = [];
  const sceneIndices = []; // track which scene indices have clips
  for (let i = 0; i < scenes.length; i++) {
    if (clipMap.has(i)) sceneIndices.push(i);
  }

  for (let si = 0; si < sceneIndices.length; si++) {
    const i = sceneIndices[si];
    const clipPath = clipMap.get(i);
    const outPath = join(workDir, `clip-${i}.mp4`);

    const isFirst = si === 0;
    const isLast = si === sceneIndices.length - 1;

    console.log(`  Processing scene-${i} (${scenes[i].type}, strip audio)...`);
    await normalizeAndTrim(clipPath, outPath, sceneDurations[i], aspectRatio, !isFirst, !isLast, false);
    normalizedPaths.push(outPath);
  }

  if (normalizedPaths.length === 0) {
    throw new Error('No clips available for assembly');
  }

  // ── Step 4: Concat all clips (exact timing — no duration shift) ───────
  const concatPath = join(workDir, 'concat.mp4');
  const concatListPath = join(workDir, 'concat.txt');
  const concatContent = normalizedPaths.map((p) => `file '${p}'`).join('\n');
  await writeFile(concatListPath, concatContent);

  await execFileAsync('ffmpeg', [
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-y',
    concatPath,
  ], { timeout: FFMPEG_TIMEOUT });

  console.log('  Clips concatenated with fades');

  // ── Step 5: Mix audio ───────────────────────────────────────────────
  // Overlay the full TTS voiceover on the silent concatenated video.
  // One consistent voice for ALL scenes (talking_head + broll).
  let mixedPath = join(workDir, 'mixed.mp4');

  await execFileAsync('ffmpeg', [
    '-i', concatPath,
    '-i', voiceoverPath,
    '-map', '0:v',
    '-map', '1:a',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    '-y',
    mixedPath,
  ], { timeout: FFMPEG_TIMEOUT });
  console.log('  Audio mixed (unified TTS voiceover)');

  // ── Step 5b: Mix background music (if requested) ──────────────────────
  if (music) {
    console.log(`  Downloading background music (${music})...`);
    const musicPath = join(workDir, 'bgm.mp3');
    await downloadMusicTrack(music, musicPath);

    const videoDuration = await getMediaDuration(mixedPath);
    const musicMixPath = join(workDir, 'music-mixed.mp4');

    await execFileAsync('ffmpeg', [
      '-i', mixedPath,
      '-stream_loop', '-1',
      '-i', musicPath,
      '-filter_complex',
      `[1:a]volume=0.125,afade=t=out:st=${(videoDuration - 2).toFixed(1)}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-y',
      musicMixPath,
    ], { timeout: FFMPEG_TIMEOUT });

    mixedPath = musicMixPath;
    console.log('  Background music mixed');
  }

  // ── Step 6: Generate and burn subtitles + loudnorm ────────────────────
  const subtitledPath = join(workDir, 'subtitled.mp4');
  console.log('  Transcribing for subtitles...');

  // Extract audio-only for Whisper (video files can exceed the 25MB API limit)
  const whisperAudioPath = join(workDir, 'whisper-audio.mp3');
  await execFileAsync('ffmpeg', [
    '-i', mixedPath,
    '-vn', '-c:a', 'libmp3lame', '-q:a', '4',
    '-y', whisperAudioPath,
  ], { timeout: FFMPEG_TIMEOUT });

  const words = await transcribeWithWhisper(whisperAudioPath);

  // ── Overlay: download overlay_image or build neon drawtext from overlay_text ──
  let overlayImagePath = null;
  if (overlayImage) {
    // Download the user-provided PNG overlay
    overlayImagePath = join(workDir, 'overlay-banner.png');
    console.log(`  Downloading overlay image: ${overlayImage.substring(0, 60)}...`);
    const https = await import('https');
    const http = await import('http');
    const { createWriteStream } = await import('fs');
    await new Promise((resolve, reject) => {
      const proto = overlayImage.startsWith('https') ? https : http;
      const get = (url) => {
        proto.get(url, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location);
          }
          const ws = createWriteStream(overlayImagePath);
          res.pipe(ws);
          ws.on('finish', () => { ws.close(); resolve(); });
        }).on('error', reject);
      };
      get(overlayImage);
    });
    console.log(`  Overlay image downloaded`);
  } else if (overlayText) {
    // Generate a neon-glow text banner as a PNG using FFmpeg
    overlayImagePath = join(workDir, 'overlay-banner.png');
    const res = RESOLUTION_MAP[aspectRatio] ?? RESOLUTION_MAP['9:16'];
    const safeText = overlayText
      .replace(/\\/g, '\\\\\\\\')
      .replace(/'/g, "\\\\'")
      .replace(/:/g, '\\\\:');
    // Multi-pass glow: outer glow → inner glow → crisp text
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi',
      '-i', `color=c=black@0:s=${res.w}x80,format=rgba`,
      '-vf', [
        `drawtext=text='${safeText}':fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:fontsize=30:fontcolor=#00FFFF@0.2:borderw=10:bordercolor=#00FFFF@0.1:x=(w-text_w)/2:y=(h-text_h)/2`,
        `drawtext=text='${safeText}':fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:fontsize=30:fontcolor=#00FFFF@0.5:borderw=5:bordercolor=#00FFFF@0.25:x=(w-text_w)/2:y=(h-text_h)/2`,
        `drawtext=text='${safeText}':fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:fontsize=30:fontcolor=white:borderw=2:bordercolor=#009999:shadowcolor=#00FFFF@0.6:shadowx=0:shadowy=0:x=(w-text_w)/2:y=(h-text_h)/2`,
      ].join(','),
      '-frames:v', '1',
      '-y', overlayImagePath,
    ], { timeout: 10000 });
    console.log(`  Generated neon overlay text: "${overlayText}"`);
  }

  // Build the FFmpeg filter for overlay image (positioned at top center)
  const buildOverlayArgs = (mainInput) => {
    if (!overlayImagePath) return ['-i', mainInput];
    // Two inputs: video + overlay image. Overlay centered at top with padding.
    return ['-i', mainInput, '-i', overlayImagePath];
  };
  const buildOverlayVf = (baseFilter) => {
    if (!overlayImagePath) return baseFilter;
    // Chain: base filter → overlay image at top center
    const overlayPos = `overlay=(W-w)/2:55`;
    return baseFilter ? `${baseFilter}[v0];[v0][1:v]${overlayPos}` : `[0:v][1:v]${overlayPos}`;
  };

  if (words.length > 0) {
    const assContent = generateASS(words, style, aspectRatio);
    const assPath = join(workDir, 'subs.ass');
    await writeFile(assPath, assContent);

    if (overlayImagePath) {
      // Two-input: video with subs + overlay image
      await execFileAsync('ffmpeg', [
        '-i', mixedPath,
        '-i', overlayImagePath,
        '-filter_complex', `[0:v]ass=${assPath}[v0];[v0][1:v]overlay=(W-w)/2:55[vout]`,
        '-map', '[vout]',
        '-map', '0:a',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-y',
        subtitledPath,
      ], { timeout: FFMPEG_TIMEOUT });
    } else {
      await execFileAsync('ffmpeg', [
        '-i', mixedPath,
        '-vf', `ass=${assPath}`,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-y',
        subtitledPath,
      ], { timeout: FFMPEG_TIMEOUT });
    }

    console.log(`  Subtitles burned + audio normalized${overlayImagePath ? ' + overlay' : ''}`);
  } else {
    // Subtitles are a documented, advertised feature for this pipeline.
    // Whisper returning zero words means TTS audio is silent / corrupted
    // upstream — fail rather than ship a video that's missing the feature.
    throw new Error('Subtitle transcription returned zero words — upstream TTS likely failed');
    if (overlayImagePath) {
      await execFileAsync('ffmpeg', [
        '-i', mixedPath,
        '-i', overlayImagePath,
        '-filter_complex', `[0:v][1:v]overlay=(W-w)/2:55`,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-y',
        subtitledPath,
      ], { timeout: FFMPEG_TIMEOUT });
    } else {
      await execFileAsync('ffmpeg', [
        '-i', mixedPath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac',
        '-c:v', 'copy',
        '-y',
        subtitledPath,
      ], { timeout: FFMPEG_TIMEOUT });
    }
  }

  // ── Step 7: End screen / CTA (if provided) ────────────────────────────
  if (cta) {
    console.log(`  Generating end screen: "${cta}"`);
    const res = RESOLUTION_MAP[aspectRatio] ?? RESOLUTION_MAP['9:16'];
    const ctaPath = join(workDir, 'cta.mp4');

    // Generate 3s solid card with centered text
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi',
      '-i', `color=c=0x111111:s=${res.w}x${res.h}:d=3:r=30`,
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-vf', `drawtext=text='${cta.replace(/'/g, "\\'")}':fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-t', '3',
      '-y',
      ctaPath,
    ], { timeout: FFMPEG_TIMEOUT });

    // Concat main video + CTA card
    const ctaConcatList = join(workDir, 'cta-concat.txt');
    await writeFile(ctaConcatList, `file '${subtitledPath}'\nfile '${ctaPath}'`);

    await execFileAsync('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', ctaConcatList,
      '-c', 'copy',
      '-y',
      outputPath,
    ], { timeout: FFMPEG_TIMEOUT });

    console.log('  End screen appended');
  } else {
    // No CTA — subtitled video is the final output
    await execFileAsync('ffmpeg', [
      '-i', subtitledPath,
      '-c', 'copy',
      '-y',
      outputPath,
    ], { timeout: FFMPEG_TIMEOUT });
  }

  return outputPath;
}
