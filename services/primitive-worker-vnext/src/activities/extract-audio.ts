// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerConfig } from '../config.js';
import { r2UploadVnext } from '../client/r2.js';

const execFileP = promisify(execFile);

export interface ExtractAudioActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  /** R2-hosted video URL to pull the audio track from (e.g. take 1's clip). */
  video_url: string;
  /** Cap the extracted clip (Seedance audio_urls accept 2–15s). Default 15. */
  max_seconds?: number;
}

export interface ExtractAudioActivityResult {
  primitive_run_id: string;
  /** R2 URL of the extracted .mp3, usable as a Seedance audio_urls voice ref. */
  audio_url: string;
}

/**
 * Extract the spoken audio track from a generated clip and re-host it as an
 * .mp3 on R2. Powers voice carry-over: take 1's native Seedance voice becomes
 * the timbre reference for take 2+, so the same voice speaks the new lines.
 * Seedance audio_urls accept .wav/.mp3, 2–15s — we clamp to <=15s.
 */
export function makeExtractAudioActivity(cfg: WorkerConfig) {
  return async function extractAudio(
    input: ExtractAudioActivityInput,
  ): Promise<ExtractAudioActivityResult> {
    // SSRF guard: only pull from our own R2.
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    if (!input.video_url.startsWith(allowedPrefix)) {
      throw ApplicationFailure.nonRetryable(
        `extract_audio video_url must be hosted on the configured R2 public URL`,
        'REFERENCE_URL_NOT_ALLOWED',
      );
    }
    const maxSeconds = Math.max(2, Math.min(input.max_seconds ?? 15, 15));

    const workDir = await mkdtemp(join(tmpdir(), `vnext-audio-${input.primitive_run_id}-`));
    let mp3Bytes: Buffer;
    try {
      const resp = await fetch(input.video_url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });
      if (!resp.ok) throw new Error(`video download ${resp.status}`);
      const videoPath = join(workDir, 'src.mp4');
      await writeFile(videoPath, Buffer.from(await resp.arrayBuffer()));
      Context.current().heartbeat({ stage: 'video_downloaded' });

      const mp3Path = join(workDir, 'voice-ref.mp3');
      // -vn drops video; -t clamps length; resample to a clean 44.1k mono mp3.
      await execFileP(
        'ffmpeg',
        [
          '-y',
          '-i', videoPath,
          '-vn',
          '-t', String(maxSeconds),
          '-ac', '1',
          '-ar', '44100',
          '-c:a', 'libmp3lame',
          '-q:a', '3',
          mp3Path,
        ],
        { maxBuffer: 1024 * 1024 * 16 },
      );
      mp3Bytes = await readFile(mp3Path);
      if (mp3Bytes.byteLength < 256) {
        // No usable audio track (e.g. a silent clip) — surface clearly.
        throw ApplicationFailure.nonRetryable(
          'extracted audio is empty — source clip has no usable voice track',
          'TRANSCRIBE_EMPTY',
        );
      }
      Context.current().heartbeat({ stage: 'audio_extracted', bytes: mp3Bytes.byteLength });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }

    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      input.primitive_run_id,
      'voice-ref.mp3',
      mp3Bytes,
      'audio/mpeg',
    );

    return { primitive_run_id: input.primitive_run_id, audio_url: publicUrl };
  };
}
