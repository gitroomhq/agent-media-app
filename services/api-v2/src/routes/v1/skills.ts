// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { supabase } from '../../server.js';
import { getSkill, listSkills, SKILLS } from '../../skills/registry.js';
import { getTemporalClient } from '../../orchestrator/temporal/client.js';
import { getTemporalConfig } from '../../orchestrator/temporal/config.js';
import { withTimeout } from '../../orchestrator/temporal/timeout.js';
import { uploadUserImageBase64, uploadUserImageFromUrl, uploadUserVideoFromUrl } from '../../lib/r2-upload.js';
import { ModerationError } from '../../lib/image-moderation.js';
import { quoteSkillCredits, quoteInFlightPrimitiveRun } from '../../skills/credit-quotes.js';
import { decideMakeUgcRoute, type MakeUgcProps } from '../../skills/make-ugc-router.js';

/**
 * Credits already COMMITTED to the user's in-flight (submitted/running) jobs.
 * Preflight checks the balance MINUS this, so a burst of submits can't all pass
 * against the same un-reserved balance and then fail mid-run on
 * INSUFFICIENT_CREDITS (real incident: 4 simultaneous selfies, 3 drained the
 * balance, the 4th died mid-workflow). Bounded to the last hour (matches the
 * 45-min workflow timeout) so an orphaned row can never block a user forever.
 * Fail-open on query errors — the worker's ledger is the final arbiter.
 */
async function committedInFlightCredits(userId: string): Promise<number> {
  const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString();
  const [sk, pr] = await Promise.all([
    supabase
      .from('skill_runs')
      .select('skill_slug, input')
      .eq('user_id', userId)
      .in('status', ['submitted', 'running'])
      .gte('created_at', sinceIso)
      .limit(200),
    supabase
      .from('primitive_runs')
      .select('primitive_id, input')
      .eq('user_id', userId)
      .in('status', ['submitted', 'running'])
      .is('skill_run_id', null)
      .gte('created_at', sinceIso)
      .limit(200),
  ]);
  let committed = 0;
  for (const r of sk.data ?? []) {
    try {
      committed += quoteSkillCredits(String(r.skill_slug), (r.input ?? {}) as Record<string, unknown>);
    } catch { /* unquotable row — skip */ }
  }
  for (const r of pr.data ?? []) {
    try {
      committed += quoteInFlightPrimitiveRun(String(r.primitive_id), (r.input ?? null) as Record<string, unknown> | null);
    } catch { /* unquotable row — skip */ }
  }
  return committed;
}

async function preflightCreditCheck(
  userId: string,
  slug: string,
  input: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; needed: number; available: number; committed: number }> {
  const needed = quoteSkillCredits(slug, input);
  if (needed <= 0) return { ok: true };
  const { data, error } = await supabase
    .from('user_credits')
    .select('monthly_credits_remaining, purchased_balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return { ok: true }; // fail open — worker will catch
  const available =
    Number(data.monthly_credits_remaining ?? 0) + Number(data.purchased_balance ?? 0);
  // Reserve the quotes of jobs already in flight, so parallel submits can't
  // overdraw the same balance.
  const committed = await committedInFlightCredits(userId);
  if (available - committed < needed) return { ok: false, needed, available, committed };
  return { ok: true };
}

function getPrimitiveTaskQueue(): string {
  return process.env.TEMPORAL_PRIMITIVE_TASK_QUEUE?.trim() || 'primitive-vnext-v1';
}

/**
 * POST /v1/skills/:slug/quote — confirm-before-spend (Phase 0).
 *
 * Read-only price preview: returns the EXACT credit cost the skill will charge
 * (same `quoteSkillCredits` the run path uses for preflight, so the number the
 * user confirms matches what gets deducted) + the user's current balance. No
 * run, no Temporal, no deduction. The agent UI calls this before a paid tool_use
 * and gates on a "~N credits (you have X) — generate?" confirm.
 */
export async function quoteSkillRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const slug = String(req.params.slug ?? '');
  const skill = getSkill(slug);
  if (!skill) {
    res.status(404).json({ error: 'unknown_skill', slug });
    return;
  }
  // A12: validate with the SAME schema the run path uses, so a quote can never
  // accept (or price) a body the run would reject with 400 invalid_input.
  const parsed = skill.inputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', skill: slug, detail: parsed.error.flatten() });
    return;
  }
  const input = parsed.data as Record<string, unknown>;
  const credits = quoteSkillCredits(slug, input);

  let available: number | null = null;
  const { data } = await supabase
    .from('user_credits')
    .select('monthly_credits_remaining, purchased_balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) available = Number(data.monthly_credits_remaining ?? 0) + Number(data.purchased_balance ?? 0);
  // Mirror the run preflight: credits reserved by in-flight jobs aren't spendable,
  // so the confirm-gate warns BEFORE the user fires a run that would 402.
  const committed = available === null ? 0 : await committedInFlightCredits(userId);
  const free = available === null ? null : Math.max(0, available - committed);

  res.status(200).json({
    slug,
    credits,
    available: free,
    committed,
    // null balance = couldn't read it (fail-open) → UI shouldn't hard-block.
    sufficient: free === null ? true : free >= credits,
  });
}

export function listSkillsRoute(_req: Request, res: Response): void {
  // When make_ugc is live it's the ONE listed generation skill (the others are
  // internal to its router) — so the CLI `skills list` and the local stdio
  // mcp-server (both read this endpoint live) collapse to make_ugc with no
  // republish. The hidden skills stay runnable by slug via /v1/skills/:slug/run.
  const makeUgcOn = process.env.MAKE_UGC_ENABLED?.trim() === 'true';
  const skills = listSkills()
    .filter((s) => (makeUgcOn ? s.agentFacing === true : true))
    .map((s) => ({
      ...s,
      input_schema: zodToJsonSchema(SKILLS[s.slug].inputSchema, s.slug),
    }));
  res.status(200).json({ skills });
}

/** Resolve a make_ugc `character` prop to a character_sheet_url: a direct https
 *  URL is used as-is; a char_… public id is looked up on user_characters. */
async function resolveCharacterSheetUrl(userId: string, character: string): Promise<string | null> {
  const c = character.trim();
  if (/^https:\/\//i.test(c)) return c;
  const { data } = await supabase
    .from('user_characters')
    .select('character_sheet_url')
    .eq('user_id', userId)
    .eq('public_id', c)
    .is('archived_at', null)
    .maybeSingle();
  return (data?.character_sheet_url as string | undefined) ?? null;
}

/**
 * make_ugc router. Resolves identity (uploads an image / looks up a saved
 * character), picks the underlying skill via the SHARED decideMakeUgcRoute (so
 * the quote can never disagree with what runs), fills the resolved identity URL
 * into the body, and re-enters runSkillRoute with the underlying slug. The
 * underlying dispatcher owns the skill_runs row (skill_slug = underlying, so
 * cancel/poll/workflowId stay correct) and returns the skill_run_id to poll.
 */
async function dispatchMakeUgc(
  req: Request,
  res: Response,
  userId: string,
  props: MakeUgcProps,
): Promise<void> {
  const { slug, body } = decideMakeUgcRoute(props);

  try {
    if (slug === 'make_broll_talking_head') {
      let actor: string | null = null;
      if (props.character) {
        actor = await resolveCharacterSheetUrl(userId, props.character);
      } else if (props.image) {
        const up = /^https?:\/\//i.test(props.image)
          ? await uploadUserImageFromUrl(userId, props.image)
          : await uploadUserImageBase64(userId, props.image);
        actor = up.url;
      }
      if (!actor) {
        res.status(400).json({
          error: 'make_ugc_needs_face',
          skill: 'make_ugc',
          detail: props.broll_url
            ? 'A b-roll video needs a face to narrate it — pass `image` (a photo) or `character` (a saved character).'
            : 'A long monologue needs a consistent face — pass `image` (a photo) or `character` (a saved character).',
        });
        return;
      }
      body.actor_image_url = actor;
    } else if (slug === 'make_simple_selfie') {
      const sheet = props.character ? await resolveCharacterSheetUrl(userId, props.character) : null;
      if (!sheet) {
        res.status(400).json({
          error: 'make_ugc_character_not_found',
          skill: 'make_ugc',
          detail: 'Could not resolve `character`. Pass a character_id (char_…) from list_characters, or its character_sheet_url.',
        });
        return;
      }
      body.character_sheet_url = sheet;
    } else if (slug === 'make_product_in_hands') {
      // Route 0: a product held/worn by a saved character. The holder is a saved
      // character's sheet; auto person-from-photo (build a sheet on the fly) is a
      // deferred composed path, so a saved `character` is required for now.
      const sheet = props.character ? await resolveCharacterSheetUrl(userId, props.character) : null;
      if (!sheet) {
        res.status(400).json({
          error: props.character ? 'make_ugc_character_not_found' : 'make_ugc_product_needs_character',
          skill: 'make_ugc',
          detail: props.character
            ? 'Could not resolve `character`. Pass a character_id (char_…) from list_characters, or its character_sheet_url.'
            : 'A product video needs a person to hold it — pass a saved `character` (create one with create_character first).',
        });
        return;
      }
      body.character_sheet_url = sheet;
      // Inject the product image; runSkillRoute re-hosts + moderates it on re-enter.
      const productImage = String(props.product_image);
      if (/^https?:\/\//i.test(productImage)) {
        body.product_image_url = productImage;
        delete (body as Record<string, unknown>).product_image_base64;
      } else {
        body.product_image_base64 = productImage;
        delete (body as Record<string, unknown>).product_image_url;
      }
    } else {
      // make_ugc_video: an image becomes portrait_url; person/default is already
      // set as `description` by decideMakeUgcRoute.
      if (props.image) {
        const up = /^https?:\/\//i.test(props.image)
          ? await uploadUserImageFromUrl(userId, props.image)
          : await uploadUserImageBase64(userId, props.image);
        delete (body as Record<string, unknown>).description;
        body.portrait_url = up.url;
      }
    }
  } catch (err) {
    if (respondIfModerationBlocked(res, err, 'make_ugc')) return;
    res.status(400).json({ error: 'make_ugc_identity_failed', skill: 'make_ugc', detail: errorMessage(err) });
    return;
  }

  // Delegate to the normal flow with the resolved underlying slug + body.
  req.params.slug = slug;
  req.body = body;
  await runSkillRoute(req, res);
}

export async function runSkillRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const slug = String(req.params.slug ?? '');
  const skill = getSkill(slug);
  if (!skill) {
    res.status(404).json({ error: 'unknown_skill', detail: { slug } });
    return;
  }

  const parsed = skill.inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_input',
      skill: slug,
      detail: parsed.error.flatten(),
    });
    return;
  }

  // Per-skill normalization: if the skill accepts a base64 image input,
  // upload it to R2 first so the downstream primitive workflow sees a
  // plain R2 URL (its SSRF guard requires R2-hosted URLs).
  let activityInputBody = parsed.data as Record<string, unknown>;

  // make_ugc is a ROUTER: resolve identity, pick an existing skill, and delegate
  // to the normal flow with that skill's slug + body — so the underlying schema,
  // re-host, preflight, dispatcher, skill_runs row and skill_run_id are all the
  // existing ones. make_ugc owns no generation of its own.
  if (slug === 'make_ugc') {
    await dispatchMakeUgc(req, res, userId, parsed.data as MakeUgcProps);
    return;
  }

  if (slug === 'make_character_sheet') {
    const b64 = (activityInputBody as { portrait_image_base64?: string }).portrait_image_base64;
    if (b64) {
      try {
        const uploaded = await uploadUserImageBase64(userId, b64);
        activityInputBody = {
          portrait_url: uploaded.url,
          description: (activityInputBody as { description?: string }).description,
          aspect_ratio: (activityInputBody as { aspect_ratio?: string }).aspect_ratio,
        };
      } catch (err) {
        if (respondIfModerationBlocked(res, err, slug)) return;
        res.status(400).json({
          error: 'image_upload_failed',
          skill: slug,
          detail: errorMessage(err),
        });
        return;
      }
    } else {
      // strip the optional base64 field if absent
      delete (activityInputBody as { portrait_image_base64?: string }).portrait_image_base64;
    }
  }

  // make_product_in_hands: the product image may be base64 OR any https URL.
  // Re-host it onto agent-media R2 so the primitive only sees an R2 URL.
  if (slug === 'make_product_in_hands') {
    const body = activityInputBody as {
      product_image_url?: string;
      product_image_base64?: string;
    };
    try {
      const uploaded = body.product_image_base64
        ? await uploadUserImageBase64(userId, body.product_image_base64)
        : await uploadUserImageFromUrl(userId, String(body.product_image_url));
      delete body.product_image_base64;
      body.product_image_url = uploaded.url;
    } catch (err) {
      if (respondIfModerationBlocked(res, err, slug)) return;
      res.status(400).json({
        error: 'image_upload_failed',
        skill: slug,
        detail: errorMessage(err),
      });
      return;
    }
  }

  // make_broll_talking_head: re-host BOTH the actor image and the b-roll video
  // onto R2 (each accepts any public https URL, or passes through if already on
  // R2). The downstream worker only ever fetches R2, so its SSRF guard stays
  // intact while callers can pass external links.
  if (slug === 'make_broll_talking_head') {
    const body = activityInputBody as { actor_image_url?: string; broll_video_url?: string };
    try {
      const up = await uploadUserImageFromUrl(userId, String(body.actor_image_url));
      body.actor_image_url = up.url;
    } catch (err) {
      if (respondIfModerationBlocked(res, err, slug)) return;
      res.status(400).json({ error: 'actor_image_rehost_failed', skill: slug, detail: errorMessage(err) });
      return;
    }
    // b-roll is optional: omit it for a plain multi-take talking head (no overlay).
    if (body.broll_video_url) {
      try {
        const upv = await uploadUserVideoFromUrl(userId, String(body.broll_video_url));
        body.broll_video_url = upv.url;
      } catch (err) {
        res.status(400).json({ error: 'broll_video_rehost_failed', skill: slug, detail: errorMessage(err) });
        return;
      }
    }
  }

  // Pre-flight credit check — return 402 immediately so the caller
  // doesn't get a half-failed workflow on an insufficient balance.
  const preflight = await preflightCreditCheck(userId, slug, activityInputBody);
  if (!preflight.ok) {
    const free = Math.max(0, preflight.available - preflight.committed);
    res.status(402).json({
      error: 'insufficient_credits',
      skill: slug,
      needed: preflight.needed,
      available: preflight.available,
      committed: preflight.committed,
      // Human-ready line the chat/web can show verbatim, with a buy pointer.
      detail:
        `This needs ${preflight.needed} credits but you have ${free} available` +
        (preflight.committed > 0 ? ` (${preflight.committed} reserved by jobs still running)` : '') +
        `. Top up on the Billing page to continue.`,
      buy_url: '/dashboard/billing',
    });
    return;
  }

  // Composed-skill dispatch — make_ugc_video has its own skill_runs row
  // and a 3-step Temporal workflow.
  if (slug === 'make_ugc_video') {
    await dispatchMakeUgcVideo(req, res, userId, activityInputBody, readIdempotencyKey(req));
    return;
  }

  // Composed-skill dispatch — make_broll_talking_head chains <=10s talking-head
  // clips + composites a square b-roll overlay; its own skill_runs row.
  if (slug === 'make_broll_talking_head') {
    await dispatchBrollTalkingHead(res, userId, activityInputBody);
    return;
  }

  // Composed-skill dispatch — make_podcast: two saved actors, one shared room,
  // A/B dialogue cut together; resolves both characters then starts its workflow.
  if (slug === 'make_podcast') {
    await dispatchMakePodcast(res, userId, activityInputBody);
    return;
  }

  const idempotencyKey = readIdempotencyKey(req);
  if (idempotencyKey) {
    const { data: existing, error: existingErr } = await supabase
      .from('primitive_runs')
      .select('id, status')
      .eq('user_id', userId)
      .eq('primitive_id', skill.primitive)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingErr) {
      res.status(500).json({ error: 'idempotency_lookup_failed', detail: existingErr.message });
      return;
    }
    if (existing) {
      res.status(202).json({
        run_id: existing.id,
        workflow_id: `${skill.primitive}-${existing.id}`,
        skill: slug,
        primitive: skill.primitive,
        status: existing.status,
        idempotent_replay: true,
      });
      return;
    }
  }

  const primitiveRunId = randomUUID();
  const workflowId = `${skill.primitive}-${primitiveRunId}`;

  const activityInput = {
    primitive_run_id: primitiveRunId,
    user_id: userId,
    idempotency_key: idempotencyKey ?? undefined,
    input: activityInputBody,
  };

  // Pre-insert the primitive_runs row BEFORE starting the workflow, so a poll
  // that arrives before the worker activity runs finds the run (was: the row
  // was only created inside the activity → status 404 / "orphaned at submit").
  // The activity upserts the SAME id (onConflict:'id') so there's no double
  // row and no clobber (it re-writes status:'submitted'). A concurrent same-key
  // submit that raced the SELECT above collides on the partial unique index →
  // treat 23505 as a replay, never a 500.
  {
    const { error: preErr } = await supabase.from('primitive_runs').insert({
      id: primitiveRunId,
      user_id: userId,
      primitive_id: skill.primitive,
      status: 'submitted',
      input: activityInputBody,
      idempotency_key: idempotencyKey ?? null,
    });
    if (preErr) {
      if (preErr.code === '23505' && idempotencyKey) {
        const { data: dup } = await supabase
          .from('primitive_runs')
          .select('id, status')
          .eq('user_id', userId)
          .eq('primitive_id', skill.primitive)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (dup) {
          res.status(202).json({
            run_id: dup.id,
            workflow_id: `${skill.primitive}-${dup.id}`,
            skill: slug,
            primitive: skill.primitive,
            status: dup.status,
            idempotent_replay: true,
          });
          return;
        }
      }
      res.status(500).json({ error: 'primitive_run_insert_failed', detail: preErr.message });
      return;
    }
  }

  let cfg: ReturnType<typeof getTemporalConfig>;
  try {
    cfg = getTemporalConfig();
  } catch (err) {
    res.status(503).json({ error: 'temporal_unconfigured', detail: errorMessage(err) });
    return;
  }
  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.start(skill.workflowType, {
        workflowId,
        taskQueue: getPrimitiveTaskQueue(),
        workflowExecutionTimeout: cfg.workflowExecutionTimeoutMs,
        workflowRunTimeout: cfg.workflowExecutionTimeoutMs,
        args: [activityInput],
      }),
      cfg.startTimeoutMs,
      `temporal.workflow.start.${skill.workflowType}`,
    );
  } catch (err) {
    // The row was pre-inserted; mark it failed so it isn't a phantom 'submitted'
    // with no workflow behind it, then surface the dispatch failure.
    await supabase
      .from('primitive_runs')
      .update({ status: 'failed', error_code: 'temporal_dispatch_failed', error_message: errorMessage(err), finished_at: new Date().toISOString() })
      .eq('id', primitiveRunId)
      .eq('user_id', userId);
    res.status(502).json({ error: 'temporal_dispatch_failed', detail: errorMessage(err) });
    return;
  }

  res.status(202).json({
    run_id: primitiveRunId,
    workflow_id: workflowId,
    skill: slug,
    primitive: skill.primitive,
    status: 'submitted',
  });
}

async function dispatchMakeUgcVideo(
  _req: Request,
  res: Response,
  userId: string,
  body: Record<string, unknown>,
  _idempotencyKey: string | null,
): Promise<void> {
  const description = (body.description as string | undefined) ?? undefined;
  let portraitUrl = (body.portrait_url as string | undefined) ?? undefined;
  const b64 = (body.portrait_image_base64 as string | undefined) ?? undefined;
  if (b64) {
    try {
      const uploaded = await uploadUserImageBase64(userId, b64);
      portraitUrl = uploaded.url;
    } catch (err) {
      if (respondIfModerationBlocked(res, err, 'make_ugc_video')) return;
      res.status(400).json({ error: 'image_upload_failed', detail: errorMessage(err) });
      return;
    }
  }

  const identity = portraitUrl
    ? { mode: 'portrait_url' as const, portrait_url: portraitUrl }
    : {
        mode: 'description' as const,
        description: description as string,
        realism_target:
          (body.realism_target as 'natural' | 'commercial' | 'raw_iphone') ?? 'natural',
      };

  const { data: skillRunRow, error: insertErr } = await supabase
    .from('skill_runs')
    .insert({
      user_id: userId,
      skill_slug: 'make_ugc_video',
      skill_version: '1.0.0',
      status: 'submitted',
      input: body,
      current_step: 'pending',
    })
    .select('id')
    .single();
  if (insertErr || !skillRunRow) {
    res.status(500).json({ error: 'skill_run_insert_failed', detail: insertErr?.message ?? 'no row' });
    return;
  }
  const skillRunId = skillRunRow.id as string;

  const workflowInput = {
    skill_run_id: skillRunId,
    user_id: userId,
    identity,
    character_description: body.character_description,
    script: body.script,
    duration: body.duration ?? 10,
    location: body.location,
    pose: body.pose,
    aspect_ratio: body.aspect_ratio ?? '9:16',
    subtitles: body.subtitles ?? true,
    subtitles_style: body.subtitles_style ?? 'hormozi',
  };

  let cfg: ReturnType<typeof getTemporalConfig>;
  try {
    cfg = getTemporalConfig();
  } catch (err) {
    res.status(503).json({ error: 'temporal_unconfigured', detail: errorMessage(err) });
    return;
  }
  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.start('makeUgcVideoWorkflow', {
        workflowId: `make_ugc_video-${skillRunId}`,
        taskQueue: getPrimitiveTaskQueue(),
        workflowExecutionTimeout: 45 * 60_000,
        workflowRunTimeout: 45 * 60_000,
        args: [workflowInput],
      }),
      cfg.startTimeoutMs,
      'temporal.workflow.start.make_ugc_video',
    );
  } catch (err) {
    res.status(502).json({ error: 'temporal_dispatch_failed', detail: errorMessage(err) });
    return;
  }

  res.status(202).json({
    skill_run_id: skillRunId,
    workflow_id: `make_ugc_video-${skillRunId}`,
    skill: 'make_ugc_video',
    status: 'submitted',
  });
}

async function dispatchBrollTalkingHead(
  res: Response,
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const { data: skillRunRow, error: insertErr } = await supabase
    .from('skill_runs')
    .insert({
      user_id: userId,
      skill_slug: 'make_broll_talking_head',
      skill_version: '1.0.0',
      status: 'submitted',
      input: body,
      current_step: 'pending',
    })
    .select('id')
    .single();
  if (insertErr || !skillRunRow) {
    res.status(500).json({ error: 'skill_run_insert_failed', detail: insertErr?.message ?? 'no row' });
    return;
  }
  const skillRunId = skillRunRow.id as string;

  // Higher-fidelity faces: pass a clean portrait alongside the sheet as a second
  // identity reference. Use the caller's portrait_url, else auto-resolve it from
  // the saved character whose sheet matches actor_image_url. Best-effort.
  let portraitUrl = typeof body.portrait_url === 'string' ? (body.portrait_url as string) : undefined;
  if (!portraitUrl && typeof body.actor_image_url === 'string') {
    const { data: char } = await supabase
      .from('user_characters')
      .select('portrait_url')
      .eq('user_id', userId)
      .eq('character_sheet_url', body.actor_image_url)
      .is('archived_at', null)
      .maybeSingle();
    if (char?.portrait_url) portraitUrl = char.portrait_url as string;
  }

  const workflowInput = {
    skill_run_id: skillRunId,
    user_id: userId,
    actor_image_url: body.actor_image_url,
    portrait_url: portraitUrl,
    broll_video_url: body.broll_video_url,
    script: body.script,
    audio_url: body.audio_url,
    duration: body.duration ?? 20,
    aspect_ratio: body.aspect_ratio ?? '9:16',
    subtitles: body.subtitles ?? false,
    // Overlay geometry is fixed (bottom-center, sized by broll_width_rate); the
    // workflow/compose still accept these internal fields, so pass constants.
    overlay_size: 'large',
    overlay_position: 'bottom',
    broll_width_rate: body.broll_width_rate,
    broll_start_time: body.broll_start_time,
    broll_fade_out: body.broll_fade_out,
  };

  let cfg: ReturnType<typeof getTemporalConfig>;
  try {
    cfg = getTemporalConfig();
  } catch (err) {
    res.status(503).json({ error: 'temporal_unconfigured', detail: errorMessage(err) });
    return;
  }
  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.start('brollTalkingHeadWorkflow', {
        workflowId: `make_broll_talking_head-${skillRunId}`,
        taskQueue: getPrimitiveTaskQueue(),
        workflowExecutionTimeout: 45 * 60_000,
        workflowRunTimeout: 45 * 60_000,
        args: [workflowInput],
      }),
      cfg.startTimeoutMs,
      'temporal.workflow.start.make_broll_talking_head',
    );
  } catch (err) {
    res.status(502).json({ error: 'temporal_dispatch_failed', detail: errorMessage(err) });
    return;
  }

  res.status(202).json({
    skill_run_id: skillRunId,
    workflow_id: `make_broll_talking_head-${skillRunId}`,
    skill: 'make_broll_talking_head',
    status: 'submitted',
  });
}

interface ResolvedPodcastCharacter {
  ref_url: string;
  seed?: number;
}

/**
 * Resolve a make_podcast character reference (a saved char_… id OR an https image
 * URL) into an R2-hosted reference image + optional pinned seed. Saved characters
 * prefer the clean portrait, else the sheet; the ref is ALWAYS re-hosted onto R2
 * so the worker's SSRF guard accepts it (mirrors the make_broll re-host).
 */
async function resolvePodcastCharacter(
  userId: string,
  ref: string,
): Promise<ResolvedPodcastCharacter | null> {
  const c = ref.trim();
  if (!c) return null;
  let sourceUrl: string | null = null;
  let seed: number | undefined;
  if (/^https?:\/\//i.test(c)) {
    sourceUrl = c;
  } else {
    const { data } = await supabase
      .from('user_characters')
      .select('portrait_url, character_sheet_url, seedance_seed')
      .eq('user_id', userId)
      .eq('public_id', c)
      .is('archived_at', null)
      .maybeSingle();
    if (!data) return null;
    sourceUrl = (data.portrait_url as string | null) || (data.character_sheet_url as string | null);
    const rawSeed = data.seedance_seed != null ? Number(data.seedance_seed) : undefined;
    if (typeof rawSeed === 'number' && Number.isFinite(rawSeed) && rawSeed >= 1 && rawSeed <= 2147483646) {
      seed = Math.floor(rawSeed);
    }
  }
  if (!sourceUrl) return null;
  const up = await uploadUserImageFromUrl(userId, sourceUrl);
  return { ref_url: up.url, seed };
}

async function dispatchMakePodcast(
  res: Response,
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const script = body.script as Array<{ speaker?: string; line?: string }> | undefined;
  if (!Array.isArray(script) || script.length === 0) {
    res.status(400).json({ error: 'invalid_input', skill: 'make_podcast', detail: 'script must be a non-empty array of A/B turns' });
    return;
  }

  let a: ResolvedPodcastCharacter | null;
  let b: ResolvedPodcastCharacter | null;
  try {
    a = await resolvePodcastCharacter(userId, String(body.character_a ?? ''));
    b = await resolvePodcastCharacter(userId, String(body.character_b ?? ''));
  } catch (err) {
    if (respondIfModerationBlocked(res, err, 'make_podcast')) return;
    res.status(400).json({ error: 'podcast_identity_failed', skill: 'make_podcast', detail: errorMessage(err) });
    return;
  }
  if (!a) {
    res.status(400).json({ error: 'podcast_character_not_found', skill: 'make_podcast', detail: 'Could not resolve character_a — pass a saved char_… id from list_characters, or an https image URL.' });
    return;
  }
  if (!b) {
    res.status(400).json({ error: 'podcast_character_not_found', skill: 'make_podcast', detail: 'Could not resolve character_b — pass a saved char_… id from list_characters, or an https image URL.' });
    return;
  }

  const { data: skillRunRow, error: insertErr } = await supabase
    .from('skill_runs')
    .insert({
      user_id: userId,
      skill_slug: 'make_podcast',
      skill_version: '1.0.0',
      status: 'submitted',
      input: body,
      current_step: 'pending',
    })
    .select('id')
    .single();
  if (insertErr || !skillRunRow) {
    res.status(500).json({ error: 'skill_run_insert_failed', detail: insertErr?.message ?? 'no row' });
    return;
  }
  const skillRunId = skillRunRow.id as string;

  const workflowInput = {
    skill_run_id: skillRunId,
    user_id: userId,
    character_a_ref_url: a.ref_url,
    character_a_seed: a.seed,
    character_b_ref_url: b.ref_url,
    character_b_seed: b.seed,
    script,
    room: body.room,
    aspect_ratio: '9:16',
    subtitles: body.subtitles ?? false,
    subtitles_style: body.subtitles_style ?? 'hormozi',
  };

  let cfg: ReturnType<typeof getTemporalConfig>;
  try {
    cfg = getTemporalConfig();
  } catch (err) {
    res.status(503).json({ error: 'temporal_unconfigured', detail: errorMessage(err) });
    return;
  }
  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.start('makePodcastWorkflow', {
        workflowId: `make_podcast-${skillRunId}`,
        taskQueue: getPrimitiveTaskQueue(),
        workflowExecutionTimeout: 45 * 60_000,
        workflowRunTimeout: 45 * 60_000,
        args: [workflowInput],
      }),
      cfg.startTimeoutMs,
      'temporal.workflow.start.make_podcast',
    );
  } catch (err) {
    res.status(502).json({ error: 'temporal_dispatch_failed', detail: errorMessage(err) });
    return;
  }

  res.status(202).json({
    skill_run_id: skillRunId,
    workflow_id: `make_podcast-${skillRunId}`,
    skill: 'make_podcast',
    status: 'submitted',
  });
}

export async function getSkillRunRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const skillRunId = String(req.params.skill_run_id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillRunId)) {
    res.status(400).json({ error: 'invalid_skill_run_id' });
    return;
  }
  const { data: run, error: runErr } = await supabase
    .from('skill_runs')
    .select('id, user_id, skill_slug, skill_version, status, current_step, started_at, finished_at, created_at, final_output, error_code, error_message')
    .eq('id', skillRunId)
    .maybeSingle();
  if (runErr) {
    res.status(500).json({ error: 'lookup_failed', detail: runErr.message });
    return;
  }
  if (!run || run.user_id !== userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const { data: steps, error: stepsErr } = await supabase
    .from('primitive_runs')
    .select('id, primitive_id, status, started_at, finished_at, error_code, error_message, primitive_artifacts(url, kind, mime, bytes)')
    .eq('skill_run_id', skillRunId)
    .order('created_at', { ascending: true });
  if (stepsErr) {
    res.status(500).json({ error: 'steps_lookup_failed', detail: stepsErr.message });
    return;
  }
  res.status(200).json({
    skill_run_id: run.id,
    skill: run.skill_slug,
    skill_version: run.skill_version,
    status: run.status,
    current_step: run.current_step,
    started_at: run.started_at,
    finished_at: run.finished_at,
    created_at: run.created_at,
    error: run.error_code ? { code: run.error_code, message: run.error_message } : null,
    // Strip our internal provider USD cost — users only ever see credit cost.
    final_output: stripUsdFields(run.final_output),
    steps: (steps ?? []).map((s) => ({
      primitive_run_id: s.id,
      primitive: s.primitive_id,
      status: s.status,
      started_at: s.started_at,
      finished_at: s.finished_at,
      error: s.error_code ? { code: s.error_code, message: s.error_message } : null,
      artifacts: s.primitive_artifacts ?? [],
    })),
  });
}

/**
 * Cancel an in-flight composed-skill run. Terminates the Temporal workflow so
 * no further provider clips are scheduled, then marks the skill_run canceled.
 * Idempotent: terminal runs return 200 with no-op. Scoped to composed skills
 * (rows in skill_runs); generic primitive runs are not addressable here.
 */
export async function cancelSkillRunRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const skillRunId = String(req.params.skill_run_id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillRunId)) {
    res.status(400).json({ error: 'invalid_skill_run_id' });
    return;
  }
  const { data: run, error: runErr } = await supabase
    .from('skill_runs')
    .select('id, user_id, skill_slug, status')
    .eq('id', skillRunId)
    .maybeSingle();
  if (runErr) {
    res.status(500).json({ error: 'lookup_failed', detail: runErr.message });
    return;
  }
  if (!run || run.user_id !== userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  // Idempotent: already finished → no-op.
  if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'canceled') {
    res.status(200).json({ skill_run_id: run.id, status: run.status, already_terminal: true });
    return;
  }

  const workflowId = `${run.skill_slug}-${run.id}`;
  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.getHandle(workflowId).terminate('canceled by user via API'),
      getTemporalConfig().startTimeoutMs,
      'temporal.workflow.terminate',
    );
  } catch (err) {
    // A missing/already-closed workflow is fine — we still mark the row canceled
    // below. Only a real dispatch failure (unreachable Temporal) should 502.
    const msg = errorMessage(err);
    if (!/not found|already completed|workflow execution already/i.test(msg)) {
      res.status(502).json({ error: 'temporal_terminate_failed', detail: msg });
      return;
    }
  }

  const { error: updErr } = await supabase
    .from('skill_runs')
    .update({
      status: 'canceled',
      current_step: 'canceled',
      finished_at: new Date().toISOString(),
      error_code: 'canceled',
      error_message: 'canceled by user',
    })
    .eq('id', run.id)
    .eq('user_id', userId);
  if (updErr) {
    res.status(500).json({ error: 'cancel_update_failed', detail: updErr.message });
    return;
  }
  res.status(200).json({ skill_run_id: run.id, status: 'canceled' });
}

function readIdempotencyKey(req: Request): string | null {
  const raw = req.header('idempotency-key') ?? req.header('Idempotency-Key');
  if (!raw) return null;
  const t = raw.trim();
  if (t.length === 0 || t.length > 200) return null;
  return t;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Map an upload failure to an HTTP response. A ModerationError (unsafe user
 * image) is a distinct, client-actionable 422 UNSAFE_CONTENT — not lumped in
 * with the generic 400 re-host/validation failures. Returns true if it handled
 * the moderation case so the caller can `return` early.
 */
function respondIfModerationBlocked(res: Response, err: unknown, skill: string): boolean {
  if (err instanceof ModerationError) {
    res.status(422).json({
      error: 'unsafe_content',
      code: err.code,
      skill,
      message: 'The uploaded image was rejected by content moderation.',
      detail: { categories: err.categories },
    });
    return true;
  }
  return false;
}

/**
 * Remove any internal USD cost fields before returning to the client. Users
 * only ever see their CREDIT cost — never our upstream provider USD.
 */
function stripUsdFields(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/_usd$|credits_actual_usd|estimated_credits_usd/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
