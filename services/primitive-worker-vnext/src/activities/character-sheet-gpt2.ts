// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { CharacterSheetGpt2ToolInputSchema } from '@agentmedia/schema';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { generateImageWithFallback, classifyOpenAIError } from '../client/openai.js';
import { r2UploadVnext } from '../client/r2.js';
import { buildCharacterSheetPrompt } from '../client/anthropic.js';
import { sanitizeImagePrompt } from '../lib/sanitize-prompt.js';
import { withHeartbeat } from '../lib/heartbeat.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';

export interface CharacterSheetGpt2ActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  /** False when the sheet is generated INSIDE a video flow (make_ugc_video) — the
   *  sheet is then free; only a standalone make_character_sheet charges. Default
   *  (undefined/true) charges. */
  bill_credits?: boolean;
  input: unknown;
}

export interface CharacterSheetGpt2ActivityResult {
  primitive_run_id: string;
  character_sheet_url: string;
  provider: 'gpt-image-2';
  credits_actual_usd: number;
  artifact_id: string;
}

export function makeCharacterSheetGpt2Activity(cfg: WorkerConfig) {
  return async function characterSheetGpt2(
    activityInput: CharacterSheetGpt2ActivityInput,
  ): Promise<CharacterSheetGpt2ActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = CharacterSheetGpt2ToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `character_sheet_gpt2 input invalid: ${parsed.error.message}`,
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
      if (!art) {
        throw new Error(
          `inconsistent state: primitive_run ${activityInput.primitive_run_id} is succeeded but has no artifact`,
        );
      }
      return {
        primitive_run_id: activityInput.primitive_run_id,
        character_sheet_url: art.url,
        provider: 'gpt-image-2',
        credits_actual_usd: Number(existing.actual_credits_usd ?? 0),
        artifact_id: art.id,
      };
    }

    // SSRF guard
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    if (!input.portrait_url.startsWith(allowedPrefix)) {
      throw ApplicationFailure.nonRetryable(
        `portrait_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
        'REFERENCE_URL_NOT_ALLOWED',
      );
    }

    // Budget caps (same shape as portrait)
    const ESTIMATED_USD = 0.2;
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
    const dayUsed = (dayRows ?? []).reduce(
      (s, r) => s + Number(r.actual_credits_usd ?? 0),
      0,
    );
    if (dayUsed + ESTIMATED_USD > cfg.caps.dayUsd) {
      throw ApplicationFailure.nonRetryable(
        `day budget exceeded: used $${dayUsed.toFixed(2)} + estimate $${ESTIMATED_USD} > cap $${cfg.caps.dayUsd}`,
        'BUDGET_CAP_DAY',
      );
    }

    // Insert primitive_runs row
    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'character_sheet_gpt2',
        status: 'submitted',
        input: input,
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
      primitive: 'character_sheet_gpt2',
      description: 'vNext character_sheet_gpt2',
      // Free when generated inside a video (make_ugc_video passes bill_credits:false);
      // charged at list price for a standalone make_character_sheet.
      creditsOverride: activityInput.bill_credits === false ? 0 : undefined,
    });

    try {

    // Fetch portrait bytes from R2
    const refResp = await fetch(input.portrait_url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (refResp.status >= 500) {
      throw new Error(`portrait_url fetch transient ${refResp.status}`);
    }
    if (!refResp.ok) {
      throw ApplicationFailure.nonRetryable(
        `portrait_url fetch failed (${refResp.status})`,
        'REFERENCE_FETCH_FAILED',
      );
    }
    const ct = refResp.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) {
      throw ApplicationFailure.nonRetryable(
        `portrait_url is not an image (content-type=${ct})`,
        'REFERENCE_NOT_IMAGE',
      );
    }
    const portraitBytes = Buffer.from(await refResp.arrayBuffer());
    Context.current().heartbeat({ stage: 'reference_fetched' });

    // Step 1: Haiku-built prompt, then strip sexual descriptors that OpenAI's
    // image safety system hard-rejects (e.g. "sexy") — keeps the attractive
    // intent, just never sends the trigger words.
    const prompt = sanitizeImagePrompt(
      await buildCharacterSheetPrompt(cfg.anthropic.apiKey, input, cfg.anthropic.model),
    );
    Context.current().heartbeat({ stage: 'prompt_built' });
    {
      const { error: pErr } = await db
        .from('primitive_runs')
        .update({ input: { ...input, generated_prompt: prompt } })
        .eq('id', activityInput.primitive_run_id);
      if (pErr) {
        Context.current().heartbeat({ stage: 'prompt_persist_warning', error: pErr.message });
      }
    }

    // Step 2: gpt-image-2 edit with portrait as reference
    let bytes: Buffer;
    if (cfg.openai.simulate) {
      bytes = makeStubPng();
    } else {
      const size = input.aspect_ratio === '9:16' ? '1024x1536' : '1024x1024';
      try {
        // Heartbeat every 15s during the provider call — see portrait-gpt2 for
        // the full rationale (gpt-image holds the request long enough to trip
        // the 90s heartbeatTimeout otherwise).
        const out = await withHeartbeat('provider_working', () =>
          generateImageWithFallback(cfg.openai, {
            model: cfg.openai.imageModel,
            prompt,
            referencePng: portraitBytes,
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

    // R2 upload
    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      activityInput.primitive_run_id,
      'character-sheet.png',
      bytes,
      'image/png',
    );
    Context.current().heartbeat({ stage: 'r2_uploaded' });

    // Insert artifact + finalize run
    const { data: artifact, error: artErr } = await db
      .from('primitive_artifacts')
      .insert({
        primitive_run_id: activityInput.primitive_run_id,
        kind: 'character_sheet',
        url: publicUrl,
        bytes: bytes.byteLength,
        mime: 'image/png',
        metadata: {
          provider: 'gpt-image-2',
          model: cfg.openai.imageModel,
          simulated: cfg.openai.simulate,
          aspect_ratio: input.aspect_ratio,
          source_portrait_url: input.portrait_url,
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

    // Auto-save this sheet as a reusable character so it shows up in the user's
    // saved-characters list (the in-app picker, GET /v1/characters, MCP all read
    // user_characters). BEST-EFFORT: the sheet is already generated + finalized,
    // so a failure here must never fail the activity. Runs once — a Temporal
    // retry early-returns above (status==='succeeded') before reaching here.
    try {
      const rawName =
        typeof (input as { description?: unknown }).description === 'string'
          ? ((input as { description?: string }).description ?? '').trim()
          : '';
      await autoSaveCharacter(db, {
        userId: activityInput.user_id,
        name: rawName || 'Untitled character',
        characterSheetUrl: publicUrl,
        portraitUrl: input.portrait_url,
      });
    } catch (err) {
      Context.current().heartbeat({
        stage: 'autosave_character_warning',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const result = {
      primitive_run_id: activityInput.primitive_run_id,
      character_sheet_url: publicUrl,
      provider: 'gpt-image-2' as const,
      credits_actual_usd: ESTIMATED_USD,
      artifact_id: artifact.id as string,
    };
    return result;
    } catch (err) {
      if (err instanceof ApplicationFailure && err.nonRetryable) {
        await refundPrimitiveCredits(db, activityInput.primitive_run_id);
      }
      throw err;
    }
  };
}

/**
 * Idempotently save a generated character sheet as a reusable user character.
 * Deduped by (user_id, character_sheet_url) — the sheet URL is unique per
 * primitive run (its R2 path embeds the run id), so re-entry is a no-op.
 */
async function autoSaveCharacter(
  db: ReturnType<typeof getDb>,
  p: { userId: string; name: string; characterSheetUrl: string; portraitUrl?: string },
): Promise<void> {
  const { data: existing } = await db
    .from('user_characters')
    .select('id')
    .eq('user_id', p.userId)
    .eq('character_sheet_url', p.characterSheetUrl)
    .maybeSingle();
  if (existing) return;
  // Mint a stable char_… handle so this v1 character is addressable + reusable
  // (matches the v2 create_character format). Retry on the ~1e-15 public_id
  // collision the unique index would reject.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await db.from('user_characters').insert({
      user_id: p.userId,
      name: p.name.slice(0, 80),
      source_kind: 'description',
      public_id: makePublicId(),
      character_sheet_url: p.characterSheetUrl,
      portrait_url: p.portraitUrl ?? null,
      thumbnail_url: p.portraitUrl ?? null,
    });
    if (!error) return;
    if (error.code === '23505' && attempt < 2) continue; // public_id collision → re-mint
    throw new Error(`user_characters insert failed: ${error.message}`);
  }
}

/** char_ + 10 Crockford base32 chars (no I/L/O/U). Mirrors the v2 create path;
 *  the unique index on user_characters.public_id catches any collision. */
function makePublicId(): string {
  const ALPHA = '0123456789ABCDEFGHJKLMNPQRSTVWXYZ';
  let s = 'char_';
  for (let i = 0; i < 10; i += 1) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function makeStubPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}
