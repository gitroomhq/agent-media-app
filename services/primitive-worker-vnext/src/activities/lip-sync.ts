// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { LipSyncToolInputSchema } from '@agentmedia/schema';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { r2UploadVnext } from '../client/r2.js';
import { generateLipSyncEvolink } from '../client/evolink.js';
import { withHeartbeat } from '../lib/heartbeat.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';

const execFileP = promisify(execFile);

async function fetchToBuffer(url: string, label: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`${label} download ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

export interface LipSyncActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  input: unknown;
}

export interface LipSyncActivityResult {
  primitive_run_id: string;
  video_url: string;
  provider: 'seedance-2-0';
  credits_actual_usd: number;
  artifact_id: string;
}

// Seedance reference-to-video with a provided audio track; comparable cost to
// a short selfie clip.
const ESTIMATED_USD = 1.2;

export function makeLipSyncActivity(cfg: WorkerConfig) {
  return async function lipSync(
    activityInput: LipSyncActivityInput,
  ): Promise<LipSyncActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = LipSyncToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `lip_sync input invalid: ${parsed.error.message}`,
        'INVALID_INPUT',
      );
    }
    const input = parsed.data;

    // Retry-safety: return existing artifact if this run already succeeded.
    const { data: existing, error: existingErr } = await db
      .from('primitive_runs')
      .select('status, actual_credits_usd, primitive_artifacts(id, url)')
      .eq('id', activityInput.primitive_run_id)
      .maybeSingle();
    if (existingErr) throw new Error(`primitive_runs lookup failed: ${existingErr.message}`);
    if (existing && existing.status === 'succeeded') {
      const art = (existing.primitive_artifacts as Array<{ id: string; url: string }> | null)?.[0];
      if (!art) {
        throw new Error(
          `inconsistent state: primitive_run ${activityInput.primitive_run_id} is succeeded but has no artifact`,
        );
      }
      return {
        primitive_run_id: activityInput.primitive_run_id,
        video_url: art.url,
        provider: 'seedance-2-0',
        credits_actual_usd: Number(existing.actual_credits_usd ?? 0),
        artifact_id: art.id,
      };
    }

    // SSRF guard: both user-supplied URLs must be on our R2 public prefix.
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    for (const [field, url] of [
      ['image_url', input.image_url],
      ['audio_url', input.audio_url],
    ] as const) {
      if (!url.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `${field} must be hosted on the configured R2 public URL (${allowedPrefix})`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
    }

    // Budget caps.
    if (ESTIMATED_USD > cfg.caps.primitiveUsd) {
      throw ApplicationFailure.nonRetryable(
        `estimated $${ESTIMATED_USD} exceeds per-primitive cap $${cfg.caps.primitiveUsd}`,
        'BUDGET_CAP_PRIMITIVE',
      );
    }
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data: dayRows, error: dayErr } = await db
      .from('primitive_runs')
      .select('actual_credits_usd')
      .eq('user_id', activityInput.user_id)
      .gte('created_at', since.toISOString())
      .not('actual_credits_usd', 'is', null);
    if (dayErr) throw new Error(`day-cap query failed: ${dayErr.message}`);
    const dayUsed = (dayRows ?? []).reduce((s, r) => s + Number(r.actual_credits_usd ?? 0), 0);
    if (dayUsed + ESTIMATED_USD > cfg.caps.dayUsd) {
      throw ApplicationFailure.nonRetryable(
        `day budget exceeded: used $${dayUsed.toFixed(2)} + estimate $${ESTIMATED_USD} > cap $${cfg.caps.dayUsd}`,
        'BUDGET_CAP_DAY',
      );
    }

    // Upsert run row.
    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'lip_sync',
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
      primitive: 'lip_sync',
      duration: input.duration,
      description: `vNext lip_sync ${input.duration}s (bring-your-own-audio)`,
    });

    try {
      let videoBytes: Buffer;
      let providerTaskId: string | null = null;
      let providerVideoUrl: string | null = null;

      if (cfg.openai.simulate) {
        videoBytes = Buffer.from('SIMULATED', 'utf8');
      } else {
        const evolinkKey = process.env.EVOLINK_API_KEY?.trim() || process.env.EVOLINK_API_KEYS?.trim();
        if (!evolinkKey) {
          throw ApplicationFailure.nonRetryable(
            'EVOLINK_API_KEY not configured on primitive-worker-vnext',
            'PROVIDER_UNCONFIGURED',
          );
        }
        try {
          const result = await withHeartbeat('seedance_working', () => generateLipSyncEvolink({
            imageUrl: input.image_url,
            audioUrl: input.audio_url,
            aspectRatio: input.aspect_ratio,
            duration: input.duration,
          }));
          providerTaskId = result.taskId;
          providerVideoUrl = result.videoUrl;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const status = (err as { status?: number })?.status;
          // 429 (rate limit) and 402 (out of balance) are TRANSIENT — let them retry
          // with backoff instead of permanently killing the render (the "R&D 402s
          // broke prod" class). Only true 4xx caller faults are non-retryable.
          if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429 && status !== 402) {
            throw ApplicationFailure.nonRetryable(`evolink ${status}: ${msg}`, `EVOLINK_${status}`);
          }
          throw err instanceof Error ? err : new Error(msg);
        }
        Context.current().heartbeat({ stage: 'provider_done', taskId: providerTaskId });

        // Seedance returns a SILENT talking-head whose mouth is driven by the
        // provided audio (@audio1). Mux the user's audio back onto it so the
        // output actually carries their voice, lip-synced.
        const workDir = await mkdtemp(join(tmpdir(), `vnext-lipsync-${activityInput.primitive_run_id}-`));
        try {
          const silentPath = join(workDir, 'silent.mp4');
          const audioPath = join(workDir, 'audio.mp3');
          const outPath = join(workDir, 'out.mp4');
          await writeFile(silentPath, await fetchToBuffer(providerVideoUrl, 'lip-sync video'));
          await writeFile(audioPath, await fetchToBuffer(input.audio_url, 'audio'));
          Context.current().heartbeat({ stage: 'muxing' });
          await execFileP('ffmpeg', [
            '-y',
            '-i', silentPath,
            '-i', audioPath,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-shortest',
            outPath,
          ]);
          videoBytes = await readFile(outPath);
        } finally {
          await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
      }
      Context.current().heartbeat({ stage: 'video_downloaded', bytes: videoBytes.byteLength });

      const { publicUrl } = await r2UploadVnext(
        cfg.r2,
        activityInput.primitive_run_id,
        'lip-sync.mp4',
        videoBytes,
        'video/mp4',
      );
      Context.current().heartbeat({ stage: 'r2_uploaded' });

      if (providerTaskId) {
        await db.from('provider_tasks').insert({
          primitive_run_id: activityInput.primitive_run_id,
          provider: 'seedance-2-0',
          external_task_id: providerTaskId,
          status: 'succeeded',
          raw_response: { provider_video_url: providerVideoUrl },
        });
      }

      const { data: artifact, error: artErr } = await db
        .from('primitive_artifacts')
        .insert({
          primitive_run_id: activityInput.primitive_run_id,
          kind: 'lip_sync_video',
          url: publicUrl,
          bytes: videoBytes.byteLength,
          mime: 'video/mp4',
          metadata: {
            provider: 'seedance-2-0',
            model: process.env.EVOLINK_SEEDANCE_MODEL || 'seedance-2.0-mini-reference-to-video',
            simulated: cfg.openai.simulate,
            aspect_ratio: input.aspect_ratio,
            source_image_url: input.image_url,
            source_audio_url: input.audio_url,
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
          provider_task_id: providerTaskId,
        })
        .eq('id', activityInput.primitive_run_id);
      if (finErr) throw new Error(`primitive_runs finalize failed: ${finErr.message}`);

      return {
        primitive_run_id: activityInput.primitive_run_id,
        video_url: publicUrl,
        provider: 'seedance-2-0',
        credits_actual_usd: ESTIMATED_USD,
        artifact_id: artifact.id as string,
      };
    } catch (err) {
      if (err instanceof ApplicationFailure && err.nonRetryable) {
        await refundPrimitiveCredits(db, activityInput.primitive_run_id);
      }
      throw err;
    }
  };
}
