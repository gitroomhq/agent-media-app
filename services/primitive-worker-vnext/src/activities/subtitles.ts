// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { SubtitlesV2ToolInputSchema } from '@agentmedia/schema';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { r2UploadVnext } from '../client/r2.js';
import { transcribeWithWhisper, type WhisperWord } from '../client/whisper.js';
import { generateAss } from '../lib/ass.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';

const execFileP = promisify(execFile);

export interface SubtitlesActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  input: unknown;
}

export interface SubtitlesActivityResult {
  primitive_run_id: string;
  video_url: string;
  provider: 'whisper-ffmpeg';
  credits_actual_usd: number;
  artifact_id: string;
}

export function makeSubtitlesActivity(cfg: WorkerConfig) {
  return async function subtitles(
    activityInput: SubtitlesActivityInput,
  ): Promise<SubtitlesActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = SubtitlesV2ToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `subtitles input invalid: ${parsed.error.message}`,
        'INVALID_INPUT',
      );
    }
    const input = parsed.data;

    // Retry-safety
    const { data: existing, error: existingErr } = await db
      .from('primitive_runs')
      .select('status, actual_credits_usd, primitive_artifacts(id, url)')
      .eq('id', activityInput.primitive_run_id)
      .maybeSingle();
    if (existingErr) throw new Error(`primitive_runs lookup failed: ${existingErr.message}`);
    if (existing && existing.status === 'succeeded') {
      const art = (existing.primitive_artifacts as Array<{ id: string; url: string }> | null)?.[0];
      if (!art) throw new Error(`inconsistent state: ${activityInput.primitive_run_id} succeeded with no artifact`);
      return {
        primitive_run_id: activityInput.primitive_run_id,
        video_url: art.url,
        provider: 'whisper-ffmpeg',
        credits_actual_usd: Number(existing.actual_credits_usd ?? 0),
        artifact_id: art.id,
      };
    }

    // SSRF guard
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    if (!input.video_url.startsWith(allowedPrefix)) {
      throw ApplicationFailure.nonRetryable(
        `video_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
        'REFERENCE_URL_NOT_ALLOWED',
      );
    }

    const ESTIMATED_USD = 0.05;
    if (ESTIMATED_USD > cfg.caps.primitiveUsd) {
      throw ApplicationFailure.nonRetryable(
        `estimated $${ESTIMATED_USD} exceeds per-primitive cap`,
        'BUDGET_CAP_PRIMITIVE',
      );
    }

    // Upsert run row
    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'subtitles_v2',
        status: 'submitted',
        input,
        idempotency_key: activityInput.idempotency_key ?? null,
        estimated_credits_usd: ESTIMATED_USD,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (upsertErr) throw new Error(`primitive_runs upsert failed: ${upsertErr.message}`);

    await deductPrimitiveCredits({
      db,
      userId: activityInput.user_id,
      primitiveRunId: activityInput.primitive_run_id,
      primitive: 'subtitles_v2',
      description: `vNext subtitles (${input.style})`,
    });

    const workDir = await mkdtemp(join(tmpdir(), `vnext-subs-${activityInput.primitive_run_id}-`));
    try {
      // 1) Download source video
      const dlResp = await fetch(input.video_url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (dlResp.status >= 500) throw new Error(`video_url fetch transient ${dlResp.status}`);
      if (!dlResp.ok) {
        throw ApplicationFailure.nonRetryable(
          `video_url fetch failed (${dlResp.status})`,
          'REFERENCE_FETCH_FAILED',
        );
      }
      const ct = dlResp.headers.get('content-type') ?? '';
      if (!ct.startsWith('video/') && !ct.startsWith('application/octet-stream')) {
        throw ApplicationFailure.nonRetryable(
          `video_url is not a video (content-type=${ct})`,
          'REFERENCE_NOT_VIDEO',
        );
      }
      const inputPath = join(workDir, 'input.mp4');
      await writeFile(inputPath, Buffer.from(await dlResp.arrayBuffer()));
      Context.current().heartbeat({ stage: 'downloaded' });

      // 2) Extract audio
      const audioPath = join(workDir, 'audio.wav');
      await execFileP('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav',
        audioPath,
      ], { maxBuffer: 32 * 1024 * 1024 });
      Context.current().heartbeat({ stage: 'audio_extracted' });

      // 3) Whisper transcribe
      let words: WhisperWord[];
      try {
        words = await transcribeWithWhisper(cfg.openai.apiKey, audioPath, input.language);
      } catch (err) {
        const status = (err as any)?.status as number | undefined;
        if (typeof status === 'number' && status >= 400 && status < 500) {
          throw ApplicationFailure.nonRetryable(
            `whisper ${status}: ${(err as Error).message}`,
            `OPENAI_${status}`,
          );
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
      if (words.length === 0) {
        throw ApplicationFailure.nonRetryable('whisper returned no words', 'TRANSCRIBE_EMPTY');
      }
      Context.current().heartbeat({ stage: 'transcribed', wordCount: words.length });

      // 3b) If user supplied a transcript, overlay it onto Whisper's word
      // boundaries so the text matches what the user wants but the
      // timings stay reliable.
      if (input.transcript) {
        const userWords = input.transcript.trim().split(/\s+/).filter(Boolean);
        // Only overlay the user's exact wording when the token counts match
        // 1:1 — then each script word lands on the right Whisper timestamp. The
        // old ±20% tolerance let a single Whisper merge/split shift EVERY later
        // word onto an earlier word's time, so captions drifted out of sync.
        // When counts differ, trust Whisper's own recognized words (correct timing).
        if (userWords.length > 0 && userWords.length === words.length) {
          for (let i = 0; i < words.length; i++) {
            words[i] = { ...words[i], word: userWords[i] };
          }
        }
      }

      // 4) Generate ASS
      const ass = generateAss(words, input.style, input.aspect_ratio);
      const assPath = join(workDir, 'subs.ass');
      await writeFile(assPath, ass);

      // 5) FFmpeg burn
      const outPath = join(workDir, 'output.mp4');
      await execFileP('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vf', `ass=${assPath}`,
        '-c:a', 'copy',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        outPath,
      ], { maxBuffer: 32 * 1024 * 1024 });
      Context.current().heartbeat({ stage: 'burned' });

      // 6) Upload
      const bytes = await readFile(outPath);
      const { publicUrl } = await r2UploadVnext(
        cfg.r2,
        activityInput.primitive_run_id,
        'subtitled.mp4',
        bytes,
        'video/mp4',
      );
      Context.current().heartbeat({ stage: 'uploaded' });

      // 7) Persist
      const { data: artifact, error: artErr } = await db
        .from('primitive_artifacts')
        .insert({
          primitive_run_id: activityInput.primitive_run_id,
          kind: 'subtitled_video',
          url: publicUrl,
          bytes: bytes.byteLength,
          mime: 'video/mp4',
          metadata: {
            provider: 'whisper-ffmpeg',
            style: input.style,
            language: input.language ?? null,
            aspect_ratio: input.aspect_ratio,
            source_video_url: input.video_url,
            word_count: words.length,
          },
        })
        .select('id')
        .single();
      if (artErr || !artifact) {
        throw new Error(`primitive_artifacts insert failed: ${artErr?.message ?? 'no row'}`);
      }
      const { error: finErr } = await db
        .from('primitive_runs')
        .update({
          status: 'succeeded',
          actual_credits_usd: ESTIMATED_USD,
          finished_at: new Date().toISOString(),
        })
        .eq('id', activityInput.primitive_run_id);
      if (finErr) throw new Error(`primitive_runs finalize failed: ${finErr.message}`);

      return {
        primitive_run_id: activityInput.primitive_run_id,
        video_url: publicUrl,
        provider: 'whisper-ffmpeg',
        credits_actual_usd: ESTIMATED_USD,
        artifact_id: artifact.id as string,
      };
    } catch (err) {
      if (err instanceof ApplicationFailure && err.nonRetryable) {
        await refundPrimitiveCredits(db, activityInput.primitive_run_id);
      }
      throw err;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}
