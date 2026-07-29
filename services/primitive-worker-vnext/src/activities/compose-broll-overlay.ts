// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { r2UploadVnext } from '../client/r2.js';

const execFileP = promisify(execFile);

async function fetchToBuffer(url: string, label: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
  if (!resp.ok) throw new Error(`${label} download ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

type AspectRatio = '9:16' | '1:1' | '16:9';
type OverlaySize = 'small' | 'medium' | 'large' | 'full';
type OverlayPosition = 'bottom' | 'bottom_left' | 'bottom_right' | 'center';

/** Output canvas per aspect ratio (provider clips are normalized onto this). */
const CANVAS: Record<AspectRatio, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
};

const SIZE_FRAC: Record<OverlaySize, number> = {
  small: 0.4,
  medium: 0.6,
  large: 0.85,
  full: 1.0,
};

const MARGIN = 48;

/**
 * Compute the square overlay side + top-left (x,y) for the given canvas. The
 * square is clamped so it never exceeds the canvas, and positioned so a "bottom"
 * placement sits in the lower half without ever overlapping the actor's face
 * (which the talking-head prompt keeps in the upper portion).
 */
export function overlayGeometry(
  aspect: AspectRatio,
  size: OverlaySize,
  position: OverlayPosition,
): { canvasW: number; canvasH: number; side: number; x: number; y: number } {
  const { w: W, h: H } = CANVAS[aspect];
  const side = Math.min(Math.round(W * SIZE_FRAC[size]), W, H);
  let x: number;
  let y: number;
  switch (position) {
    case 'bottom':
      x = Math.round((W - side) / 2);
      y = H - side - MARGIN;
      break;
    case 'bottom_left':
      x = MARGIN;
      y = H - side - MARGIN;
      break;
    case 'bottom_right':
      x = W - side - MARGIN;
      y = H - side - MARGIN;
      break;
    case 'center':
      x = Math.round((W - side) / 2);
      y = Math.round((H - side) / 2);
      break;
  }
  // Never push the overlay off-canvas on small canvases.
  y = Math.max(0, Math.min(y, H - side));
  x = Math.max(0, Math.min(x, W - side));
  return { canvasW: W, canvasH: H, side, x, y };
}

export interface ComposeBrollOverlayInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  /** Talking-head clips (R2 URLs), in order. Already lip-synced + chained. */
  clip_urls: string[];
  /** Optional: the user's b-roll video (R2 URL) overlaid on the lower half.
   *  Omit → no overlay; the concatenated talking-head clips ARE the final video
   *  (the long-form monologue path that needs no b-roll asset). */
  broll_video_url?: string;
  aspect_ratio: AspectRatio;
  overlay_size: OverlaySize;
  overlay_position: OverlayPosition;
  /** Bottom b-roll width as a fraction of frame width (centered, black margins). Omit = full width. */
  broll_width_rate?: number;
  /** Seconds into the talking head when the b-roll appears. Default 0. */
  broll_start_time?: number;
  /** Fade the b-roll out (alpha) at its end. Default false. */
  broll_fade_out?: boolean;
  /** Loop the b-roll to FILL from broll_start_time to the end of the talking
   *  head (review shape) instead of playing once for its natural length. */
  broll_loop?: boolean;
  /** HARD-cut the seams instead of the default 0.2s cross-dissolve. A dissolve
   *  blends adjacent takes of the SAME person (broll's continuity trick), but it
   *  ghosts one face into the other when consecutive clips are DIFFERENT people —
   *  so make_podcast (A↔B speaker cuts) sets this true for clean straight cuts. */
  hard_cut?: boolean;
}

export interface ComposeBrollOverlayResult {
  primitive_run_id: string;
  video_url: string;
  duration_seconds: number;
  artifact_id: string;
}

/**
 * Assemble the final broll_talking_head video:
 *   1. Concat the chained talking-head clips (concat demuxer, -c copy → lossless,
 *      no re-encode, no drift). All clips share a codec (same lip_sync pipeline).
 *   2. Normalize the concatenated base onto the canvas and overlay the user's
 *      square b-roll, looped (-stream_loop -1) to fill, on the bottom half.
 *      Audio is copied bit-exact (-c:a copy) so there is zero A/V drift.
 */
export function makeComposeBrollOverlayActivity(cfg: WorkerConfig) {
  return async function composeBrollOverlay(
    input: ComposeBrollOverlayInput,
  ): Promise<ComposeBrollOverlayResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    if (!Array.isArray(input.clip_urls) || input.clip_urls.length === 0) {
      throw ApplicationFailure.nonRetryable('no clips to compose', 'INVALID_INPUT');
    }

    // SSRF guard: every input URL must be on our R2 public prefix. The b-roll is
    // optional (omit → no overlay), so only guard it when present.
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    for (const url of [...input.clip_urls, ...(input.broll_video_url ? [input.broll_video_url] : [])]) {
      if (!url.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `compose input ${url} must be hosted on the configured R2 public URL`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
    }

    const geo = overlayGeometry(input.aspect_ratio, input.overlay_size, input.overlay_position);

    const workDir = await mkdtemp(
      join(tmpdir(), `vnext-broll-${input.primitive_run_id}-`),
    );
    let videoBytes: Buffer;
    let durationSeconds = 0;
    try {
      // 1. Download clips + broll.
      const clipPaths: string[] = [];
      for (let i = 0; i < input.clip_urls.length; i += 1) {
        const p = join(workDir, `clip-${i}.mp4`);
        await writeFile(p, await fetchToBuffer(input.clip_urls[i], `clip ${i}`));
        clipPaths.push(p);
        Context.current().heartbeat({ stage: 'clip_downloaded', index: i });
      }

      // 2. Stitch the talking-head clips into the base. With >1 take we cross-
      // DISSOLVE at each seam (xfade video + acrossfade audio) so the cut between
      // independent pristine takes is hidden — the seam lands in the inter-sentence
      // breath (chunkScript splits on sentence boundaries) and under the b-roll.
      // The dissolve also blends any residual skin delta between takes. If the
      // xfade graph fails for ANY reason we fall back to a lossless concat (hard
      // cut) so a bad filter can never fail the whole render.
      const basePath = join(workDir, 'base.mp4');
      const concatFallback = async () => {
        const listPath = join(workDir, 'concat.txt');
        await writeFile(
          listPath,
          clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
        );
        await execFileP('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', basePath]);
      };
      if (clipPaths.length === 1) {
        // Single take — no seam, nothing to dissolve.
        await execFileP('ffmpeg', ['-y', '-i', clipPaths[0], '-c', 'copy', basePath]);
      } else if (input.hard_cut) {
        // Hard straight cuts between DIFFERENT speakers (podcast A↔B): a cross-
        // dissolve would ghost one face into the next. But a stream-copy concat of
        // INDEPENDENT Seedance encodes clicks at every seam (AAC encoder priming)
        // and can drift, so concat VIA FILTER — decode each clip, normalize it to
        // the final 9:16 canvas + a common audio format, and re-encode once. That
        // is seam-clean and tolerant of any per-clip codec/timebase/SAR difference.
        const { canvasW, canvasH } = geo;
        const segs = clipPaths
          .map((_, i) =>
            `[${i}:v]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,` +
            `crop=${canvasW}:${canvasH},fps=30,format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v${i}];` +
            `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`,
          )
          .join(';');
        const concatIns = clipPaths.map((_, i) => `[v${i}][a${i}]`).join('');
        const filter = `${segs};${concatIns}concat=n=${clipPaths.length}:v=1:a=1[v][a]`;
        await execFileP(
          'ffmpeg',
          [
            '-y',
            ...clipPaths.flatMap((p) => ['-i', p]),
            '-filter_complex', filter,
            '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '44100',
            '-movflags', '+faststart',
            basePath,
          ],
          { maxBuffer: 1024 * 1024 * 64 },
        );
      } else {
        const XFADE = 0.2; // seconds of cross-dissolve at each seam
        let crossfaded = false;
        try {
          // Probe each clip's exact duration to place the xfade offsets.
          const durs: number[] = [];
          for (const p of clipPaths) {
            const { stdout } = await execFileP('ffprobe', [
              '-v', 'error', '-show_entries', 'format=duration',
              '-of', 'default=noprint_wrappers=1:nokey=1', p,
            ]);
            const d = parseFloat(stdout.trim());
            if (!Number.isFinite(d) || d <= XFADE + 0.1) throw new Error(`clip too short for xfade: ${stdout.trim()}`);
            durs.push(d);
          }
          // Chain consecutive clips. Each transition starts XFADE before the prior
          // (overlap-shortened) segment ends, so offset = cumulative-length-so-far
          // minus the overlap.
          const vParts: string[] = [];
          const aParts: string[] = [];
          let vPrev = '[0:v]';
          let aPrev = '[0:a]';
          let cum = durs[0];
          for (let i = 1; i < clipPaths.length; i += 1) {
            const offset = (cum - XFADE).toFixed(3);
            const vOut = `[vx${i}]`;
            const aOut = `[ax${i}]`;
            vParts.push(`${vPrev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${vOut}`);
            aParts.push(`${aPrev}[${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri${aOut}`);
            vPrev = vOut;
            aPrev = aOut;
            cum = cum + durs[i] - XFADE;
          }
          const filter = [...vParts, ...aParts].join(';');
          await execFileP(
            'ffmpeg',
            [
              '-y',
              ...clipPaths.flatMap((p) => ['-i', p]),
              '-filter_complex', filter,
              '-map', vPrev,
              '-map', aPrev,
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              basePath,
            ],
            { maxBuffer: 1024 * 1024 * 32 },
          );
          crossfaded = true;
        } catch (err) {
          Context.current().heartbeat({
            stage: 'xfade_failed_fallback_concat',
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (!crossfaded) await concatFallback();
      }
      Context.current().heartbeat({ stage: 'concatenated', clips: clipPaths.length });

      // Probe the concatenated base duration (so the looped overlay ends with it).
      const { stdout: durOut } = await execFileP('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        basePath,
      ]);
      durationSeconds = Math.round(parseFloat(durOut.trim()) || 0);

      // 3. Compose the final video. WITH a b-roll the actor fills the full frame
      // and the b-roll is overlaid on the lower half. WITHOUT one the
      // concatenated/cross-dissolved base IS the final talking head (the long-form
      // monologue path), so the overlay step is skipped entirely.
      if (input.broll_video_url) {
        const brollPath = join(workDir, 'broll.mp4');
        await writeFile(brollPath, await fetchToBuffer(input.broll_video_url, 'broll'));

        // The actor fills the FULL frame; the b-roll is overlaid on the LOWER
        // portion (bottom-centered, above a small margin). The talking-head prompt
        // keeps the face in the upper portion, so the lower overlay never covers
        // the mouth. The b-roll is fit (not cropped) inside a width-bounded box so
        // the whole clip shows; in review shape it loop-fills the moves phase.
        const outPath = join(workDir, 'final.mp4');
        const brollFitPath = join(workDir, 'broll-fit.mp4');
        const { canvasW, canvasH } = geo;
        const dur = durationSeconds > 0 ? durationSeconds : 10;

        // Probe the b-roll's natural duration so we can place + bound it.
        const { stdout: brollDurOut } = await execFileP('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          brollPath,
        ]);
        const brollNatural = parseFloat(brollDurOut.trim()) || dur;
        // start time (clamped so there's at least 1s of runway).
        const startTime = Math.max(0, Math.min(input.broll_start_time ?? 0, Math.max(0, dur - 1)));
        // The b-roll plays ONCE for its own length (never looped), capped by the
        // remaining time. When the footage ends we FREEZE its last frame and hold
        // it while it fades out over TAIL_FADE seconds — so it lingers on the final
        // position instead of vanishing the instant the clip ends. (Testing value
        // 5s; tune to taste.)
        const brollLen = Math.max(1, Math.min(brollNatural, dur - startTime));
        const TAIL_FADE = 5;

        // ── Step A: normalize the b-roll to 30fps and FIT it inside a box that is
        // 30% of the canvas HEIGHT — preserving aspect so the WHOLE clip shows (no
        // crop, no stretch; force_divisible_by=2 so libx264 accepts the dims).
        // Height is the binding constraint; width is bounded by the full canvas.
        const BROLL_HEIGHT_FRAC = 0.30;
        const boxH = Math.max(2, Math.round(canvasH * BROLL_HEIGHT_FRAC));
        const boxW = canvasW;
        const brollVf =
          `scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1` +
          `,tpad=stop_mode=clone:stop_duration=${TAIL_FADE}`;
        await execFileP(
          'ffmpeg',
          [
            '-y',
            // -t BEFORE -i limits the SOURCE read to its footage; the tpad in the
            // filter then appends TAIL_FADE seconds of the frozen last frame.
            '-t', String(brollLen),
            '-i', brollPath,
            '-an',
            '-vf', brollVf,
            '-r', '30',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
            brollFitPath,
          ],
          { maxBuffer: 1024 * 1024 * 32 },
        );
        Context.current().heartbeat({ stage: 'broll_normalized' });

        // ── Step B: actor fills the FULL frame; the fitted b-roll (≤30% height) is
        // overlaid lower-center, appearing at startTime and playing once.
        //  - setpts shifts the b-roll to begin at startTime.
        //  - when the footage ends, the (frozen) last frame fades out over TAIL_FADE
        //    seconds, so the b-roll lingers and dissolves instead of cutting out.
        //  - enable spans the footage + the frozen tail; eof_action=pass then lets
        //    the full-frame actor show alone. Base (actor) drives length; audio bit-exact.
        const bottomMargin = Math.round(canvasH * 0.06);
        const brollEnd = startTime + brollLen + TAIL_FADE;
        const fadeFilter =
          `,fade=t=out:st=${(startTime + brollLen).toFixed(2)}:d=${TAIL_FADE}:alpha=1`;
        const filter =
          `[0:v]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,` +
          `crop=${canvasW}:${canvasH},fps=30,setsar=1[base];` +
          `[1:v]setpts=PTS-STARTPTS+${startTime.toFixed(2)}/TB,format=yuva420p${fadeFilter}[ov];` +
          `[base][ov]overlay=(W-w)/2:H-h-${bottomMargin}:` +
          `enable='between(t,${startTime.toFixed(2)},${brollEnd.toFixed(2)})':eof_action=pass[v]`;
        await execFileP(
          'ffmpeg',
          [
            '-y',
            '-i', basePath,
            '-i', brollFitPath,
            '-filter_complex', filter,
            '-map', '[v]',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            ...(dur > 0 ? ['-t', String(dur)] : []),
            outPath,
          ],
          { maxBuffer: 1024 * 1024 * 32 },
        );
        Context.current().heartbeat({ stage: 'composited' });
        videoBytes = await readFile(outPath);
      } else {
        // No b-roll: the concatenated/cross-dissolved base IS the talking head,
        // but it still must land on the REQUESTED canvas. The selfie/lip-sync
        // takes are only ever 9:16 or 1:1, so a 16:9 request needs the SAME
        // scale+crop the b-roll path applies to the base [0:v] (Step B). When the
        // base already matches the canvas (the common 9:16 / 1:1 case) we keep the
        // lossless copy and skip the re-encode.
        const { canvasW, canvasH } = geo;
        const { stdout: dimOut } = await execFileP('ffprobe', [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=s=x:p=0',
          basePath,
        ]);
        const [baseW, baseH] = dimOut.trim().split('x').map((n) => parseInt(n, 10));
        if (baseW === canvasW && baseH === canvasH) {
          Context.current().heartbeat({ stage: 'no_broll_base_is_final' });
          videoBytes = await readFile(basePath);
        } else {
          // Normalize onto the requested canvas — mirrors the b-roll Step B base
          // filter — so 16:9 is honored and the persisted aspect_ratio is truthful.
          const normPath = join(workDir, 'final.mp4');
          await execFileP(
            'ffmpeg',
            [
              '-y',
              '-i', basePath,
              '-vf', `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,crop=${canvasW}:${canvasH},fps=30,setsar=1`,
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
              '-c:a', 'copy',
              normPath,
            ],
            { maxBuffer: 1024 * 1024 * 32 },
          );
          Context.current().heartbeat({ stage: 'no_broll_normalized' });
          videoBytes = await readFile(normPath);
        }
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }

    // 4. Upload + persist.
    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      input.primitive_run_id,
      'broll-talking-head.mp4',
      videoBytes,
      'video/mp4',
    );

    await db.from('primitive_runs').upsert(
      {
        id: input.primitive_run_id,
        user_id: input.user_id,
        skill_run_id: input.skill_run_id ?? null,
        primitive_id: 'broll_talking_head',
        status: 'submitted',
        input: {
          clip_count: input.clip_urls.length,
          broll_video_url: input.broll_video_url ?? null,
          aspect_ratio: input.aspect_ratio,
          overlay_size: input.overlay_size,
          overlay_position: input.overlay_position,
        },
        estimated_credits_usd: 0,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    const { data: artifact, error: artErr } = await db
      .from('primitive_artifacts')
      .insert({
        primitive_run_id: input.primitive_run_id,
        kind: 'broll_talking_head_video',
        url: publicUrl,
        bytes: videoBytes.byteLength,
        mime: 'video/mp4',
        metadata: {
          clip_count: input.clip_urls.length,
          duration_seconds: durationSeconds,
          aspect_ratio: input.aspect_ratio,
          overlay: input.broll_video_url
            ? { size: input.overlay_size, position: input.overlay_position, ...geo }
            : null,
        },
      })
      .select('id')
      .single();
    if (artErr || !artifact) {
      throw new Error(`primitive_artifacts insert failed: ${artErr?.message ?? 'no row'}`);
    }

    await db
      .from('primitive_runs')
      .update({
        status: 'succeeded',
        actual_credits_usd: 0,
        finished_at: new Date().toISOString(),
      })
      .eq('id', input.primitive_run_id);

    return {
      primitive_run_id: input.primitive_run_id,
      video_url: publicUrl,
      duration_seconds: durationSeconds,
      artifact_id: artifact.id as string,
    };
  };
}
