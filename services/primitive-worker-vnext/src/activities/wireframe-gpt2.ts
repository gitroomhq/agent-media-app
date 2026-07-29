// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { WireframeGpt2ToolInputSchema } from '@agentmedia/schema';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { generateImageWithFallback, classifyOpenAIError } from '../client/openai.js';
import { r2UploadVnext } from '../client/r2.js';
import { buildWireframePrompt } from '../client/anthropic.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';
import { withHeartbeat } from '../lib/heartbeat.js';

export interface WireframeGpt2ActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  input: unknown;
}

export interface WireframeGpt2ActivityResult {
  primitive_run_id: string;
  wireframe_url: string;
  provider: 'gpt-image-2';
  credits_actual_usd: number;
  artifact_id: string;
}

export function makeWireframeGpt2Activity(cfg: WorkerConfig) {
  return async function wireframeGpt2(
    activityInput: WireframeGpt2ActivityInput,
  ): Promise<WireframeGpt2ActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = WireframeGpt2ToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `wireframe_gpt2 input invalid: ${parsed.error.message}`,
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
      if (!art) throw new Error(`inconsistent state: ${activityInput.primitive_run_id}`);
      return {
        primitive_run_id: activityInput.primitive_run_id,
        wireframe_url: art.url,
        provider: 'gpt-image-2',
        credits_actual_usd: Number(existing.actual_credits_usd ?? 0),
        artifact_id: art.id,
      };
    }

    // SSRF guard
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    if (!input.character_sheet_url.startsWith(allowedPrefix)) {
      throw ApplicationFailure.nonRetryable(
        `character_sheet_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
        'REFERENCE_URL_NOT_ALLOWED',
      );
    }

    const ESTIMATED_USD = 0.2;
    if (ESTIMATED_USD > cfg.caps.primitiveUsd) {
      throw ApplicationFailure.nonRetryable(
        `estimated $${ESTIMATED_USD} exceeds per-primitive cap $${cfg.caps.primitiveUsd}`,
        'BUDGET_CAP_PRIMITIVE',
      );
    }

    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'wireframe_gpt2',
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
      primitive: 'wireframe_gpt2',
      description: 'vNext wireframe_gpt2',
    });

    try {
      // Download character sheet
      const refResp = await fetch(input.character_sheet_url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (refResp.status >= 500) throw new Error(`character_sheet_url fetch transient ${refResp.status}`);
      if (!refResp.ok) {
        throw ApplicationFailure.nonRetryable(
          `character_sheet_url fetch failed (${refResp.status})`,
          'REFERENCE_FETCH_FAILED',
        );
      }
      const ct = refResp.headers.get('content-type') ?? '';
      if (!ct.startsWith('image/')) {
        throw ApplicationFailure.nonRetryable(
          `character_sheet_url is not an image (content-type=${ct})`,
          'REFERENCE_NOT_IMAGE',
        );
      }
      const sheetBytes = Buffer.from(await refResp.arrayBuffer());
      Context.current().heartbeat({ stage: 'reference_fetched' });

      // Haiku prompt
      const prompt = await buildWireframePrompt(cfg.anthropic.apiKey, input, cfg.anthropic.model);
      Context.current().heartbeat({ stage: 'prompt_built' });
      {
        const { error: pErr } = await db
          .from('primitive_runs')
          .update({ input: { ...input, generated_prompt: prompt } })
          .eq('id', activityInput.primitive_run_id);
        if (pErr) Context.current().heartbeat({ stage: 'prompt_persist_warning', error: pErr.message });
      }

      // gpt-image-2 edits with the character sheet as reference
      let bytes: Buffer;
      if (cfg.openai.simulate) {
        bytes = makeStubPng();
      } else {
        const size = input.aspect_ratio === '9:16' ? '1024x1536' : input.aspect_ratio === '16:9' ? '1536x1024' : '1024x1024';
        try {
          // Heartbeat every 15s during the provider call — see portrait-gpt2.
          const out = await withHeartbeat('provider_working', () =>
            generateImageWithFallback(cfg.openai, {
              model: cfg.openai.imageModel,
              prompt,
              referencePng: sheetBytes,
              size,
            }),
          );
          bytes = out.bytes;
        } catch (err) {
          const classified = classifyOpenAIError(err);
          if (classified.retryable) {
            throw err instanceof Error ? err : new Error(String(err));
          }
          throw ApplicationFailure.nonRetryable(classified.message, classified.code);
        }
      }
      Context.current().heartbeat({ stage: 'provider_done', bytes: bytes.byteLength });

      const { publicUrl } = await r2UploadVnext(
        cfg.r2,
        activityInput.primitive_run_id,
        'wireframe.png',
        bytes,
        'image/png',
      );
      Context.current().heartbeat({ stage: 'r2_uploaded' });

      const { data: artifact, error: artErr } = await db
        .from('primitive_artifacts')
        .insert({
          primitive_run_id: activityInput.primitive_run_id,
          kind: 'wireframe',
          url: publicUrl,
          bytes: bytes.byteLength,
          mime: 'image/png',
          metadata: {
            provider: 'gpt-image-2',
            model: cfg.openai.imageModel,
            simulated: cfg.openai.simulate,
            aspect_ratio: input.aspect_ratio,
            n_panels: input.n_panels,
            source_character_sheet_url: input.character_sheet_url,
          },
        })
        .select('id')
        .single();
      if (artErr || !artifact) throw new Error(`primitive_artifacts insert failed: ${artErr?.message ?? 'no row'}`);

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
        wireframe_url: publicUrl,
        provider: 'gpt-image-2' as const,
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

function makeStubPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}
