// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Hormozi-style subtitles — large, bold, word-by-word reveal, yellow/white
 * with black stroke and a quick pop-in scale animation.
 *
 * Generates an ASS subtitle file where each word is its own cue timed to
 * evenly span the video duration. Call `burnHormoziSubtitles` to produce
 * a new MP4 with subtitles burned in via FFmpeg.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Convert seconds to ASS timestamp (H:MM:SS.cc)
 */
function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Build an ASS subtitle file body for Hormozi-style word-by-word captions.
 *
 * @param {string} script — full script text
 * @param {number} durationSec — total video duration
 * @param {object} [opts]
 * @param {number} [opts.videoWidth=1080]
 * @param {number} [opts.videoHeight=1920]
 * @param {number} [opts.fontSize=120]
 * @param {string} [opts.fontName='Impact'] — fallback-safe bold font
 * @returns {string} ASS file contents
 */
export function buildHormoziAss(script, durationSec, opts = {}) {
  const {
    videoWidth = 1080,
    videoHeight = 1920,
    fontSize = 120,
    fontName = 'Impact',
  } = opts;

  const words = script
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return '';

  // Reserve a small head/tail so subtitles don't appear at the very edges.
  const head = Math.min(0.15, durationSec * 0.02);
  const tail = Math.min(0.15, durationSec * 0.02);
  const usableDuration = Math.max(0.5, durationSec - head - tail);
  const perWord = usableDuration / words.length;

  // Bright yellow fill (&H0000F0FF = BGR alpha) + black outline.
  // Alignment 2 = bottom-center. Pop-in: scale 120→100 over 120ms.
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hormozi,${fontName},${fontSize},&H0000F0FF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,2,2,80,80,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  for (let i = 0; i < words.length; i++) {
    const start = head + i * perWord;
    const end = Math.min(durationSec, start + perWord);
    // Pop-in animation: scale 120→100 over 120ms, small upward wobble
    const popDurMs = Math.min(120, Math.floor(perWord * 1000 * 0.35));
    const text = `{\\fscx120\\fscy120\\t(0,${popDurMs},\\fscx100\\fscy100)}${escapeAss(words[i])}`;
    events.push(
      `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Hormozi,,0,0,0,,${text}`,
    );
  }

  return header + events.join('\n') + '\n';
}

function escapeAss(text) {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/**
 * Burn Hormozi-style subtitles into a video.
 *
 * @param {string} inputMp4Path
 * @param {string} outputMp4Path
 * @param {string} script
 * @param {number} durationSec
 * @param {string} workDir — where to write the temp .ass file
 */
export async function burnHormoziSubtitles(inputMp4Path, outputMp4Path, script, durationSec, workDir) {
  const assPath = join(workDir, 'hormozi.ass');
  const ass = buildHormoziAss(script, durationSec);
  if (!ass) {
    throw new Error('hormozi-subtitles: empty script, cannot build ASS');
  }
  await writeFile(assPath, ass, 'utf8');

  // Escape the filter argument — FFmpeg `subtitles=` is sensitive to `:` and `'`
  const safePath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputMp4Path,
    '-vf', `subtitles='${safePath}'`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    outputMp4Path,
  ]);
}
