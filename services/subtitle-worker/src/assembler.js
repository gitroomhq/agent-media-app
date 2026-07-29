// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Assembler — FFmpeg pipeline to combine talking head clips, B-roll clips,
 * TTS audio, and subtitles into a final UGC video.
 *
 * Pipeline:
 *   1. Build full voiceover + selective voiceover (silence for talking_head, TTS for B-roll)
 *   2. Calculate per-scene durations from audio
 *   3. Normalize each clip — keep Aurora's lip-synced audio on talking_head, strip on B-roll
 *   4. Concat all clips (exact timing, no duration shift)
 *   5. Mix audio: blend concat's baked-in audio (Aurora) with selective voiceover (TTS for B-roll)
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
/**
 * @param {boolean} [keepAudio=false] - Preserve source audio (for talking head clips with baked-in lip sync)
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
  const listPath = outputPath + '.list.txt';
  const listContent = audioPaths.map((p) => `file '${p}'`).join('\n');
  await writeFile(listPath, listContent);

  await execFileAsync('ffmpeg', [
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-y',
    outputPath,
  ], { timeout: FFMPEG_TIMEOUT });
}

/**
 * Generate a silent audio file of exact duration (44100Hz stereo, matches TTS format).
 *
 * @param {number} duration - Duration in seconds
 * @param {string} outputPath - Path for the silence file
 * @returns {Promise<void>}
 */
async function generateSilence(duration, outputPath) {
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(duration),
    '-c:a', 'libmp3lame',
    '-y',
    outputPath,
  ], { timeout: FFMPEG_TIMEOUT });
}


/**
 * Assemble final video from interleaved A-roll + B-roll clips + voiceover + subtitles.
 *
 * @param {Array<{text: string, type: string, visualPrompt: string}>} scenes - All scenes in order
 * @param {Map<number, string>} clipMap - Map of scene index → local clip path (both A-roll and B-roll)
 * @param {string[]} sceneAudioPaths - Per-scene audio file paths in scene order
 * @param {string} workDir - Temporary working directory
 * @param {string} style - Subtitle style (default: 'hormozi')
 * @param {string} [aspectRatio='9:16'] - Video aspect ratio
 * @param {string|null} [music=null] - Background music genre (null = no music)
 * @param {string|null} [cta=null] - End screen CTA text (null = no end screen)
 * @returns {Promise<string>} Path to the final output video
 */
export async function assembleVideo(scenes, clipMap, sceneAudioPaths, workDir, style = 'hormozi', aspectRatio = '9:16', music = null, cta = null) {
  const outputPath = join(workDir, 'final.mp4');

  // ── Step 1: Build voiceover tracks ──────────────────────────────────
  // Full voiceover: all scenes concatenated (used for duration calculation + Whisper)
  // Selective voiceover: silence for talking_head scenes, TTS for B-roll scenes
  //   → this lets us preserve Aurora's lip-synced audio on talking heads
  const voiceoverPath = join(workDir, 'voiceover.mp3');
  console.log('  Concatenating per-scene audio...');
  await concatAudio(sceneAudioPaths, voiceoverPath);

  const totalDuration = await getMediaDuration(voiceoverPath);
  console.log(`  Total voiceover: ${totalDuration.toFixed(1)}s`);

  // ── Step 2: Calculate per-scene durations + build selective voiceover ──
  const sceneDurations = [];
  const selectiveAudioPaths = [];
  const hasTalkingHead = scenes.some((s, i) => s.type === 'talking_head' && clipMap.has(i));

  for (let i = 0; i < sceneAudioPaths.length; i++) {
    const dur = await getMediaDuration(sceneAudioPaths[i]);
    sceneDurations.push(dur);

    if (hasTalkingHead && scenes[i].type === 'talking_head' && clipMap.has(i)) {
      // Generate silence for this talking_head scene — Aurora's audio will be used instead
      const silPath = join(workDir, `silence-${i}.mp3`);
      await generateSilence(dur, silPath);
      selectiveAudioPaths.push(silPath);
    } else {
      // B-roll or missing clip — use TTS audio
      selectiveAudioPaths.push(sceneAudioPaths[i]);
    }
  }

  // Build selective voiceover track (only if we have talking head scenes)
  let selectiveVoiceoverPath = voiceoverPath; // fallback: full voiceover
  if (hasTalkingHead) {
    selectiveVoiceoverPath = join(workDir, 'selective-voiceover.mp3');
    await concatAudio(selectiveAudioPaths, selectiveVoiceoverPath);
    console.log('  Built selective voiceover (silence for talking_head, TTS for B-roll)');
  }

  console.log(`  Scene durations: ${sceneDurations.map((d) => d.toFixed(1) + 's').join(', ')}`);

  // ── Step 3: Normalize, trim, and fade each clip (single FFmpeg pass) ──
  // Talking head clips: KEEP Aurora's lip-synced audio (keepAudio=true)
  // B-roll clips: strip audio, but add silent audio track if we have talking heads
  //   (concat demuxer requires all clips to have matching streams)
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
    const isTalkingHead = scenes[i].type === 'talking_head';

    console.log(`  Processing scene-${i} (${scenes[i].type}, ${isTalkingHead ? 'keep audio' : 'strip audio'})...`);
    await normalizeAndTrim(clipPath, outPath, sceneDurations[i], aspectRatio, !isFirst, !isLast, isTalkingHead);

    // If we have talking heads, B-roll clips need a silent audio track
    // so concat demuxer can merge clips with consistent streams
    if (hasTalkingHead && !isTalkingHead) {
      const withSilence = join(workDir, `clip-${i}-silent.mp4`);
      await execFileAsync('ffmpeg', [
        '-i', outPath,
        '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-t', String(sceneDurations[i]),
        '-y',
        withSilence,
      ], { timeout: FFMPEG_TIMEOUT });
      normalizedPaths.push(withSilence);
    } else {
      normalizedPaths.push(outPath);
    }
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
  // If we have talking head clips, the concat video already has Aurora's lip-synced
  // audio on those segments (and silence on B-roll). We blend with the selective
  // voiceover (which has TTS on B-roll and silence on talking_head) using amix.
  // Result: talking_head = Aurora audio, B-roll = TTS audio.
  let mixedPath = join(workDir, 'mixed.mp4');

  if (hasTalkingHead) {
    await execFileAsync('ffmpeg', [
      '-i', concatPath,
      '-i', selectiveVoiceoverPath,
      '-filter_complex',
      '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout]',
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-y',
      mixedPath,
    ], { timeout: FFMPEG_TIMEOUT });
    console.log('  Audio mixed (Aurora lip-sync preserved on talking heads)');
  } else {
    // No talking heads — just overlay the full voiceover
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
    console.log('  Audio mixed (full voiceover)');
  }

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
  const words = await transcribeWithWhisper(mixedPath);

  if (words.length > 0) {
    const assContent = generateASS(words, style, aspectRatio);
    const assPath = join(workDir, 'subs.ass');
    await writeFile(assPath, assContent);

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

    console.log('  Subtitles burned + audio normalized');
  } else {
    console.warn('  No words detected for subtitles, using mixed video as final');
    await execFileAsync('ffmpeg', [
      '-i', mixedPath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac',
      '-c:v', 'copy',
      '-y',
      subtitledPath,
    ], { timeout: FFMPEG_TIMEOUT });
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
