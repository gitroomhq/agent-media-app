// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v2/characters
 *
 * Public REST entry for v2 character creation.
 *   1. Auth (bearer token)
 *   2. Validate input via @agentmedia/schema/v2 → CharacterCreateSchema
 *   3. Create generation_jobs row (operation='character_create')
 *   4. Deduct credits
 *   5. Dispatch to media-worker-v2 POST /v2/characters
 *   6. Return 201 + job_id + credits_deducted
 *
 * The worker generates portrait + sheet via gpt-image-2, pins a
 * Seedance seed, persists a user_characters row, and reports back via
 * callback. The returned `character_id` (char_xxxxxxxxxx) lands on the
 * job row through the webhook handler so the user can fetch it via
 * GET /v1/status/:job_id or via the characters list endpoint.
 */

import type { Request, Response } from 'express';
import {
  CharacterCreateSchema,
  CharacterUpdateSchema,
  V2_GENERATORS,
  quoteV2Credits,
} from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

export async function characterCreateRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  const parsed = CharacterCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        issues: parsed.error.issues,
      },
    });
    return;
  }
  const input = parsed.data;
  const creditCost = quoteV2Credits('character_create');

  if (!WORKER_V2_URL || !WORKER_SECRET) {
    res.status(503).json({
      error: { code: 'WORKER_NOT_CONFIGURED', message: 'Generation service is not configured.' },
    });
    return;
  }

  const jobId = crypto.randomUUID();
  const { error: jobErr } = await supabase.from('generation_jobs').insert({
    id: jobId,
    user_id: userId,
    model_slug: 'gpt-image-2-character',
    operation: 'character_create',
    status: 'submitted',
    prompt: input.description,
    credit_cost: creditCost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: {
      photo_url: input.photo_url,
      display_name: input.display_name,
      description: input.description,
      ...(input.voice_brief ? { voice_brief: input.voice_brief } : {}),
      ...(input.preset_default ? { preset_default: input.preset_default } : {}),
      ...(input.signature_look ? { signature_look: input.signature_look } : {}),
    },
  });
  if (jobErr) {
    console.error(`[v2 characters] job insert failed:`, jobErr.message);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
    return;
  }

  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_job_id: jobId,
    p_description: `Character · ${input.display_name}`,
  });
  if (creditErr) {
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    const msg = creditErr.message || '';
    const code = /INSUFFICIENT_CREDITS/i.test(msg)
      ? 'INSUFFICIENT_CREDITS'
      : 'CREDIT_DEDUCTION_FAILED';
    res.status(code === 'INSUFFICIENT_CREDITS' ? 402 : 500).json({
      error: { code, message: msg || 'Credit deduction failed' },
    });
    return;
  }

  const payload = {
    job_id: jobId,
    user_id: userId,
    photo_url: input.photo_url,
    display_name: input.display_name,
    description: input.description,
    ...(input.voice_brief ? { voice_brief: input.voice_brief } : {}),
    ...(input.preset_default ? { preset_default: input.preset_default } : {}),
    ...(input.signature_look ? { signature_look: input.signature_look } : {}),
    callback_url: buildCallbackUrl(jobId),
  };

  fetch(`${WORKER_V2_URL}/v2/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
    body: JSON.stringify(payload),
  }).catch((err: Error) =>
    console.error(`[v2 characters] worker dispatch failed: ${err.message}`),
  );

  res.status(201).json({
    job_id: jobId,
    status: 'submitted',
    credits_deducted: creditCost,
    generator: V2_GENERATORS.character_create.id,
  });
}


/**
 * GET /v2/characters — list the auth user's saved characters.
 * Returns the active rows from public.user_characters with the columns
 * the CLI / dashboard care about: public_id (char_xxx), display_name,
 * description, created_at, portrait_url.
 */
export async function listCharactersRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  // Only surface USABLE characters. A saved character is usable only if it has a
  // portrait; rows without one are legacy/partial records that the public_id
  // backfill (migration 20260628080000) made addressable but that cannot drive a
  // generation — so the `portrait_url IS NOT NULL` filter hides them.
  // NOTE (follow-up): a character whose portrait_url is set but whose creating
  // job later failed/was reconciled (a 404 portrait) still slips through; that
  // needs the sheet_job_id → generation_jobs.status check and is tracked
  // separately (it is also entangled with the R2 bucket/host 404 diagnosis).
  const { data, error } = await supabase
    .from('user_characters')
    .select('public_id, name, description, portrait_url, voice_brief, preset_default, signature_look, created_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .not('public_id', 'is', null)
    .not('portrait_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error(`[v2 characters list] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to list characters' } });
    return;
  }

  res.status(200).json({
    characters: (data ?? []).map((c) => ({
      character_id: c.public_id,
      display_name: c.name,
      description: c.description,
      portrait_url: c.portrait_url,
      voice_brief: c.voice_brief,
      preset_default: c.preset_default,
      signature_look: c.signature_look ?? null,
      created_at: c.created_at,
    })),
  });
}

/**
 * PATCH /v2/characters/:characterId
 *
 * Update mutable properties of a saved character. Today that is
 * `signature_look` — the expression this person opens EVERY crazy-look
 * clip on. Without this route a pin could only be set at create time,
 * so changing a character's look meant creating a second character:
 * a new face, a new pinned seed, and the series identity broken —
 * exactly what the signature exists to prevent.
 *
 * Identity fields (portrait, sheet, seed) are deliberately immutable;
 * they ARE the character.
 */
export async function updateCharacterRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  const characterId = String(req.params.characterId ?? '');
  if (!/^char_[A-Za-z0-9]{10,}$/.test(characterId)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'characterId must look like char_XXXXXXXXXX' },
    });
    return;
  }

  const parsed = CharacterUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: parsed.error.issues },
    });
    return;
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'No updatable fields provided' },
    });
    return;
  }

  // null clears the pin (back to the id-derived signature).
  const update: Record<string, unknown> = {};
  if ('signature_look' in patch) update.signature_look = patch.signature_look ?? null;
  if ('voice_brief' in patch) update.voice_brief = patch.voice_brief ?? null;
  if ('preset_default' in patch) update.preset_default = patch.preset_default ?? null;

  const { data, error } = await supabase
    .from('user_characters')
    .update(update)
    .eq('public_id', characterId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .select('public_id, name, voice_brief, preset_default, signature_look')
    .maybeSingle();

  if (error) {
    if (/signature_look/.test(error.message)) {
      console.error(`[v2 characters patch] signature_look column missing: ${error.message}`);
      res.status(503).json({
        error: {
          code: 'MIGRATION_REQUIRED',
          message: 'signature_look is not available yet — apply migration 20260809140000_character_signature_look.sql',
        },
      });
      return;
    }
    console.error(`[v2 characters patch] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to update character' } });
    return;
  }
  if (!data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No character ${characterId}` } });
    return;
  }

  res.status(200).json({
    character_id: data.public_id,
    display_name: data.name,
    voice_brief: data.voice_brief,
    preset_default: data.preset_default,
    signature_look: data.signature_look ?? null,
  });
}
