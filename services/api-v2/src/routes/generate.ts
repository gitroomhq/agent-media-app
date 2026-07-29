// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v1/generate/:generatorId
 *
 * Phase 2: Direct dispatch — no edge function hop.
 * Auth, credits, job creation, and worker dispatch all happen here.
 */

import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import {
  GENERATOR_IDS,
  GENERATORS,
  type GeneratorId,
  CREDITS_PER_SECOND,
  SCRIPT_GENERATION_CREDIT_SURCHARGE,
  LAPTOP_UGC_MAX_RECORDING_BYTES,
  LAPTOP_UGC_MAX_IMAGE_BYTES,
  LAPTOP_UGC_RECORDING_MIME_TYPES,
  LAPTOP_UGC_IMAGE_MIME_TYPES,
  CHARACTER_VIDEO_DURATIONS,
  CHARACTER_VIDEO_RATIOS,
} from '@agentmedia/schema';
import { supabase } from '../server.js';
import { USE_DURABLE_QUEUE, enqueueDispatch, type DispatchTarget } from '../queue.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Script generation is user-visible and quality-sensitive — Opus 4.7 only.
// Override with SCRIPT_MODEL env var if needed.
const SCRIPT_MODEL = process.env.SCRIPT_MODEL ?? process.env.HAIKU_MODEL ?? 'claude-opus-4-7';

const WORDS_PER_SECOND = 2.5;
const MAX_WORDS_PER_DURATION: Record<number, number> = {
  5: Math.floor(5 * WORDS_PER_SECOND),
  10: Math.floor(10 * WORDS_PER_SECOND),
  15: Math.floor(15 * WORDS_PER_SECOND),
};
const DURATIONS = [5, 10, 15];
const TIER_ORDER: Record<string, number> = {
  free: 0, newby: 1, starter: 2, creator: 3, proplus: 4, pro_plus: 4,
};
const MIN_PLAN_TIER = 'starter';

const FACE_VOICE_MAP: Record<string, string> = {
  young_female: 'cgSgspJ2msm6clMCkdW9',
  female: 'EXAVITQu4vr4xnSDxMaL',
  young_male: 'TX3LPaxmHKxFdv7VOQHJ',
  male: 'iP95p4xoKVk53GoZ742B',
  neutral: 'EXAVITQu4vr4xnSDxMaL',
};

function toDurationBucket(seconds: number): number {
  for (const b of DURATIONS) { if (seconds <= b) return b; }
  return DURATIONS[DURATIONS.length - 1];
}

function estimateDuration(script: string): number {
  return Math.ceil((script.length / 750) * 60);
}

async function detectVoiceFromFace(imageUrl: string): Promise<{ voice: string; label: string } | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You analyze face photos. Return ONLY one of these exact labels: young_female, female, young_male, male. No other text.' },
          { role: 'user', content: [{ type: 'text', text: 'What is the apparent gender and age group of this person?' }, { type: 'image_url', image_url: { url: imageUrl } }] },
        ],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const label = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? 'neutral';
    return { voice: FACE_VOICE_MAP[label] ?? 'alloy', label };
  } catch { return null; }
}

/**
 * Call Claude Opus 4.7 for script generation. Anthropic models follow length
 * constraints more reliably than GPT-4o for this task — we still post-process
 * with limitWords as defense in depth.
 */
async function callClaude(systemPrompt: string, userMsg: string, maxTokens: number, _temperature: number): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  // Opus 4.7 doesn't accept `temperature` — kept as a parameter for caller
  // compatibility but no longer forwarded to the API.
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SCRIPT_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic error: ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Anthropic returned empty script');
  return text;
}

async function generateScript(prompt: string, productUrl: string | null, template: string | null, targetDuration: number): Promise<string> {
  const maxWords = MAX_WORDS_PER_DURATION[targetDuration] ?? Math.floor(targetDuration * WORDS_PER_SECOND);
  const systemPrompt = template === 'saas-review'
    ? `You are a UGC creator reviewing a SaaS product for a ${targetDuration}s video. Write EXACTLY ${maxWords} words max. Hook → Walkthrough → Opinion → CTA. First person, punchy.`
    : `You are a UGC scriptwriter. Video is ${targetDuration}s. Write EXACTLY ${maxWords} words max. Hook → Key points → CTA. First person, conversational.`;
  let userMsg = prompt;
  if (productUrl) userMsg += `\n\nProduct URL: ${productUrl}`;
  const script = await callClaude(systemPrompt, userMsg, 1024, 0.8);
  return limitWords(script, maxWords);
}

function limitWords(text: string, maxWords: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ');
}

async function generateProductActingScript(body: any, targetDuration: number): Promise<string> {
  const maxWords = Math.round(targetDuration * 3);
  const productName = body.product_name ? `Product name: ${body.product_name}` : 'Product name not provided';
  const productDescription = body.product_description ? `Product context: ${body.product_description}` : '';
  const style = body.acting_style ? `Acting style: ${body.acting_style}` : 'Acting style: raw-selfie';
  const template = body.template ? `Scene template: ${body.template}` : 'Scene template: product-in-hand';

  const systemPrompt = `Write a short first-person UGC video line for a ${targetDuration}s clip. Max ${maxWords} words. It must sound natural, direct, and creator-shot. No hashtags. No stage directions. No quotation marks.`;
  const userMsg = [productName, productDescription, template, style].filter(Boolean).join('\n');

  const script = await callClaude(systemPrompt, userMsg, 160, 0.85);
  return limitWords(script, maxWords);
}

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

async function checkProductActingWorkerEndpoint(): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!WORKER_V2_URL || !WORKER_SECRET) {
    return { ok: false, status: 503, message: 'Video generation service is not configured.' };
  }

  try {
    const healthResp = await fetch(`${WORKER_V2_URL}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!healthResp.ok) {
      return { ok: false, status: 503, message: 'Video generation service is temporarily unavailable.' };
    }
  } catch {
    return { ok: false, status: 503, message: 'Video generation service is temporarily unavailable.' };
  }

  try {
    const probeResp = await fetch(`${WORKER_V2_URL}/product-acting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });

    if (probeResp.status === 400) return { ok: true };
    if (probeResp.status === 404) {
      return {
        ok: false,
        status: 503,
        message: 'Product Acting worker endpoint is not deployed yet. No credits charged.',
      };
    }
    if (probeResp.status === 401 || probeResp.status === 403) {
      return {
        ok: false,
        status: 503,
        message: 'Video generation worker authentication is misconfigured. No credits charged.',
      };
    }

    return {
      ok: false,
      status: 503,
      message: `Product Acting worker endpoint preflight failed with HTTP ${probeResp.status}. No credits charged.`,
    };
  } catch {
    return { ok: false, status: 503, message: 'Product Acting worker endpoint is unreachable. No credits charged.' };
  }
}

async function refundCredits(jobId: string): Promise<void> {
  try {
    await supabase.rpc('refund_credits', { p_job_id: jobId });
  } catch (err) {
    console.error(`[refund] failed for ${jobId}:`, err);
  }
}

async function failJobAndRefund(jobId: string, errorMessage: string): Promise<void> {
  await supabase.from('generation_jobs').update({
    status: 'failed', webhook_checkpoint: 'failed',
    error_message: errorMessage, error_code: 'WORKER_DISPATCH_FAILED',
  }).eq('id', jobId);
  // #40: a dispatch failure is a recorded (non-throwing) run failure — surface
  // it in Sentry next to the crashes so we see it in realtime.
  Sentry.captureMessage('generation_job failed: WORKER_DISPATCH_FAILED', {
    level: 'error',
    tags: { kind: 'run_failure', error_code: 'WORKER_DISPATCH_FAILED', job_id: jobId },
    extra: { error_message: errorMessage },
  });
  await refundCredits(jobId);
}

export async function generateRoute(req: Request, res: Response): Promise<void> {
  const requestedGeneratorId = req.params.generatorId as string;
  const generatorId = requestedGeneratorId === 'product_review' ? 'saas_review' : requestedGeneratorId;
  const userId = (req as any).userId as string;
  const authToken = (req as any).authToken as string;

  // ── Look up generator ──────────────────────────────────────────────────
  if (!(generatorId in GENERATORS)) {
    res.status(404).json({ error: { code: 'GENERATOR_NOT_FOUND', message: `Unknown generator "${requestedGeneratorId}". Available: ${GENERATOR_IDS.join(', ')}` } });
    return;
  }
  const generator = GENERATORS[generatorId as GeneratorId];

  // ── V1 compatibility: map legacy field names to v2 names ────────────────
  // CLI and existing integrations may send v1 field names.
  // Normalize before Zod validation so both formats work.
  const rawBody = { ...req.body };

  // Some older CLI commands send script: "" as a placeholder when asking the
  // API to generate a script from prompt/script_prompt. Treat blank as absent
  // so schema validation does not reject before generation can run.
  if (typeof rawBody.script === 'string' && rawBody.script.trim() === '') {
    delete rawBody.script;
  }

  // generate_script + script_prompt → prompt
  if ((rawBody.generate_script || generatorId === 'saas_review') && rawBody.script_prompt && !rawBody.prompt) {
    rawBody.prompt = rawBody.script_prompt;
    delete rawBody.generate_script;
    delete rawBody.script_prompt;
  }

  // scenes_input → scenes
  if (rawBody.scenes_input && !rawBody.scenes) {
    rawBody.scenes = rawBody.scenes_input;
    delete rawBody.scenes_input;
  }

  if (generatorId === 'saas_review') {
    rawBody.template = 'saas-review';
    if (!rawBody.prompt && !rawBody.script && rawBody.product_url) {
      const angle = typeof rawBody.angle === 'string' ? rawBody.angle : 'honest';
      rawBody.prompt = `Create a ${angle} first-person SaaS review video from this product URL.`;
    }
  }

  // Flat PIP params → nested pip_options
  if (!rawBody.pip_options) {
    const pip: Record<string, unknown> = {};
    if (rawBody.pip_position) { pip.position = rawBody.pip_position; delete rawBody.pip_position; }
    if (rawBody.pip_size) { pip.size = rawBody.pip_size; delete rawBody.pip_size; }
    if (rawBody.pip_animation) { pip.animation = rawBody.pip_animation; delete rawBody.pip_animation; }
    if (rawBody.pip_style) { pip.frame_style = rawBody.pip_style; delete rawBody.pip_style; }
    if (Object.keys(pip).length > 0) rawBody.pip_options = pip;
  }

  // tone field passed as body.tone (v1 and v2 match — no change needed)
  // tts_provider — accepted but ignored (not in schema, stripped by Zod)
  // model — accepted but ignored
  // broll_model — accepted but ignored (deprecated)

  // ── Validate body ──────────────────────────────────────────────────────
  const parseResult = generator.inputSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    const path = issue?.path?.join('.') ?? '';
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: path ? `${path}: ${issue.message}` : issue.message, details: parseResult.error.issues } });
    return;
  }

  const body = parseResult.data as any;

  // ── SSRF protection: validate user-supplied URLs ───────────────────────
  const { validateWebhookUrl, validateUrlForFetch } = await import('../url-validator.js');

  if (body.webhook_url) {
    const result = await validateWebhookUrl(body.webhook_url);
    if (result.error) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `webhook_url: ${result.error}` } }); return; }
  }
  if (body.face_photo_url) {
    const result = await validateUrlForFetch(body.face_photo_url);
    if (result.error) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `face_photo_url: ${result.error}` } }); return; }
  }
  if (body.product_image_url) {
    const result = await validateUrlForFetch(body.product_image_url);
    if (result.error) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `product_image_url: ${result.error}` } }); return; }
  }
  if (body.broll_images) {
    for (const url of body.broll_images) {
      const result = await validateUrlForFetch(url);
      if (result.error) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `broll_images: ${result.error} (${url})` } }); return; }
    }
  }

  // ── For subtitle generator, dispatch via edge function (different flow) ─
  if (generatorId === 'subtitle') {
    try {
      const { data, error } = await supabase.functions.invoke('subtitle-video', {
        body, headers: { Authorization: `Bearer ${authToken}` },
      });
      if (error) {
        res.status(500).json({ error: { code: 'DISPATCH_ERROR', message: error.message } });
        return;
      }
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Subtitle dispatch failed' } });
    }
    return;
  }

  // ── Show Your App flow ─────────────────────────────────────────────────
  if (generatorId === 'show_your_app') {
    try {
      // Validate app screenshot is vertical
      {
        const urlCheck = await validateUrlForFetch(body.app_screenshot_url);
        if (urlCheck.error) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `app_screenshot_url: ${urlCheck.error}` } });
          return;
        }
        const { probeImageDimensions } = await import('../image-probe.js');
        const dims = await probeImageDimensions(body.app_screenshot_url);
        if (!dims) {
          res.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'app_screenshot_url: could not read image dimensions (must be PNG, JPEG, or WebP)' } });
          return;
        }
        if (dims.height <= dims.width) {
          res.status(400).json({ error: { code: 'INVALID_IMAGE_ORIENTATION', message: `app_screenshot_url must be vertical (portrait). Got ${dims.width}x${dims.height}` } });
          return;
        }
      }

      // Look up actor — random if unspecified, else specific slug
      let actor: { slug: string; name: string; green_screen_url: string | null } | null = null;

      if (body.actor_slug) {
        const { data, error: actorErr } = await supabase
          .from('actors')
          .select('slug, name, green_screen_url')
          .eq('slug', body.actor_slug)
          .eq('status', 'active')
          .maybeSingle();
        if (actorErr) {
          res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor lookup failed' } });
          return;
        }
        if (!data) {
          res.status(404).json({ error: { code: 'ACTOR_NOT_FOUND', message: `Actor '${body.actor_slug}' not found` } });
          return;
        }
        actor = data;
      } else {
        const { data: candidates, error: listErr } = await supabase
          .from('actors')
          .select('slug, name, green_screen_url')
          .eq('status', 'active')
          .contains('presets', ['show_your_app'])
          .not('green_screen_url', 'is', null);
        if (listErr) {
          res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor pool lookup failed' } });
          return;
        }
        if (!candidates || candidates.length === 0) {
          res.status(503).json({ error: { code: 'NO_ACTORS_AVAILABLE', message: 'No actors with show_your_app preset are currently available' } });
          return;
        }
        actor = candidates[Math.floor(Math.random() * candidates.length)];
      }

      if (!actor.green_screen_url) {
        res.status(400).json({ error: { code: 'ACTOR_NO_GREEN_SCREEN', message: `Actor '${actor.slug}' does not have a green screen preset` } });
        return;
      }
      const selectedActorSlug = actor.slug;

      const creditCost = 75;
      const jobId = crypto.randomUUID();
      const duration = body.duration ?? 5;
      const subtitleStyle = body.subtitle_style ?? 'hormozi';

      // Create job
      const { error: jobErr } = await supabase.from('generation_jobs').insert({
        id: jobId,
        user_id: userId,
        model_slug: 'show-your-app',
        operation: 'show_your_app',
        status: 'submitted',
        prompt: body.script,
        credit_cost: creditCost,
        provider_slug: 'railway',
        provider_job_id: jobId,
        input_params: {
          actor_slug: selectedActorSlug,
          actor_random: !body.actor_slug,
          app_screenshot_url: body.app_screenshot_url,
          script: body.script,
          duration,
          subtitle_style: subtitleStyle,
          ...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
        },
      });

      if (jobErr) {
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
        return;
      }

      // Deduct credits
      const { error: creditErr } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_job_id: jobId,
        p_description: `Show Your App — ${selectedActorSlug} (${duration}s)`,
      });

      if (creditErr) {
        await supabase.from('generation_jobs').delete().eq('id', jobId);
        const msg = creditErr.message || '';
        const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
        const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
        res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
        return;
      }

      // Dispatch to worker (durable queue if flag on; HTTP otherwise)
      const workerUrl = process.env.WORKER_V2_URL || 'http://localhost:3002';
      const workerSecret = process.env.WORKER_SECRET || '';
      const showYourAppPayload = {
        job_id: jobId,
        user_id: userId,
        green_screen_url: actor.green_screen_url,
        app_screenshot_url: body.app_screenshot_url,
        script: body.script,
        duration,
        subtitle_style: subtitleStyle,
        callback_url: buildCallbackUrl(jobId),
        webhook_url: body.webhook_url ?? null,
      };

      const enqueued = USE_DURABLE_QUEUE
        ? await enqueueDispatch({
            job_id: jobId,
            target: 'show-your-app' as DispatchTarget,
            generator_id: 'show_your_app',
            body: showYourAppPayload,
            enqueued_at: new Date().toISOString(),
          })
        : null;

      if (!enqueued) {
        fetch(`${workerUrl}/show-your-app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
          body: JSON.stringify(showYourAppPayload),
        }).catch((err: Error) => console.error(`[show_your_app] Worker dispatch failed: ${err.message}`));
      }

      res.status(201).json({
        job_id: jobId,
        status: 'submitted',
        credits_deducted: creditCost,
        actor_slug: selectedActorSlug,
        actor_random: !body.actor_slug,
        subtitle_style: subtitleStyle,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Show Your App dispatch failed' } });
    }
    return;
  }

  // ── Laptop UGC flow ────────────────────────────────────────────────────
  if (generatorId === 'laptop_ugc') {
    try {
      const hasRecording = !!body.app_screen_recording_url;
      const hasImage = !!body.app_screen_image_url;
      if (hasRecording === hasImage) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide exactly one of app_screen_recording_url or app_screen_image_url' } });
        return;
      }

      // HEAD probe — enforce size + content-type at the boundary
      {
        const url = (hasRecording ? body.app_screen_recording_url : body.app_screen_image_url) as string;
        const urlCheck = await validateUrlForFetch(url);
        if (urlCheck.error) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `app_screen_${hasRecording ? 'recording' : 'image'}_url: ${urlCheck.error}` } });
          return;
        }
        let head: globalThis.Response;
        try {
          head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8_000) });
        } catch {
          res.status(400).json({ error: { code: 'INVALID_URL', message: 'Could not reach the provided URL' } });
          return;
        }
        if (!head.ok) {
          res.status(400).json({ error: { code: 'INVALID_URL', message: `URL returned HTTP ${head.status}` } });
          return;
        }
        const contentType = head.headers.get('content-type') ?? '';
        const allowedTypes = hasRecording ? LAPTOP_UGC_RECORDING_MIME_TYPES : LAPTOP_UGC_IMAGE_MIME_TYPES;
        const typeMatch = allowedTypes.some((t) => contentType.includes(t));
        if (!typeMatch) {
          res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: `Content-Type '${contentType}' not allowed. Use one of: ${allowedTypes.join(', ')}` } });
          return;
        }
        const len = parseInt(head.headers.get('content-length') ?? '0', 10);
        const max = hasRecording ? LAPTOP_UGC_MAX_RECORDING_BYTES : LAPTOP_UGC_MAX_IMAGE_BYTES;
        if (len > 0 && len > max) {
          const limitMb = Math.round(max / (1024 * 1024));
          const sizeMb = (len / (1024 * 1024)).toFixed(1);
          res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: `File is ${sizeMb} MB, max is ${limitMb} MB. Compress with: ffmpeg -i in.mp4 -crf 28 -preset fast out.mp4` } });
          return;
        }
        // Note: video duration enforcement (max 10s) happens in the worker
        // since api-v2 doesn't have ffprobe. Worker will fail-fast if longer.
      }

      // Look up actor — random if unspecified
      let actor: { id: string; slug: string; name: string; portrait_url: string | null } | null = null;
      if (body.actor_slug) {
        const { data, error: actorErr } = await supabase
          .from('actors')
          .select('id, slug, name, portrait_url')
          .eq('slug', body.actor_slug)
          .eq('status', 'active')
          .maybeSingle();
        if (actorErr) {
          res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor lookup failed' } });
          return;
        }
        if (!data) {
          res.status(404).json({ error: { code: 'ACTOR_NOT_FOUND', message: `Actor '${body.actor_slug}' not found` } });
          return;
        }
        actor = data;
      } else {
        const { data: candidates, error: listErr } = await supabase
          .from('actors')
          .select('id, slug, name, portrait_url')
          .eq('status', 'active')
          .not('portrait_url', 'is', null);
        if (listErr) {
          res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor pool lookup failed' } });
          return;
        }
        if (!candidates || candidates.length === 0) {
          res.status(503).json({ error: { code: 'NO_ACTORS_AVAILABLE', message: 'No active actors available' } });
          return;
        }
        actor = candidates[Math.floor(Math.random() * candidates.length)];
      }

      const creditCost = 200; // TODO: revisit once final pricing is set
      const jobId = crypto.randomUUID();
      const duration = body.duration ?? 20;
      const subtitleStyle = body.subtitle_style ?? 'hormozi';

      const { error: jobErr } = await supabase.from('generation_jobs').insert({
        id: jobId,
        user_id: userId,
        model_slug: 'laptop-ugc',
        operation: 'laptop_ugc',
        status: 'submitted',
        prompt: body.script,
        credit_cost: creditCost,
        provider_slug: 'railway',
        provider_job_id: jobId,
        input_params: {
          actor_slug: actor.slug,
          actor_random: !body.actor_slug,
          app_screen_recording_url: body.app_screen_recording_url ?? null,
          app_screen_image_url: body.app_screen_image_url ?? null,
          script: body.script,
          duration,
          subtitle_style: subtitleStyle,
          ...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
        },
      });
      if (jobErr) {
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
        return;
      }

      const { error: creditErr } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_job_id: jobId,
        p_description: `Laptop UGC — ${actor.slug} (${duration}s)`,
      });
      if (creditErr) {
        await supabase.from('generation_jobs').delete().eq('id', jobId);
        const msg = creditErr.message || '';
        const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
        const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
        res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
        return;
      }

      const workerUrl = process.env.WORKER_V2_URL || 'http://localhost:3002';
      const workerSecret = process.env.WORKER_SECRET || '';
      const laptopUgcPayload = {
        job_id: jobId,
        user_id: userId,
        actor: {
          id: actor.id,
          slug: actor.slug,
          portrait_url: actor.portrait_url,
        },
        app_screen_recording_url: body.app_screen_recording_url ?? null,
        app_screen_image_url: body.app_screen_image_url ?? null,
        script: body.script,
        duration,
        subtitle_style: subtitleStyle,
        callback_url: buildCallbackUrl(jobId),
        webhook_url: body.webhook_url ?? null,
      };

      const enqueued = USE_DURABLE_QUEUE
        ? await enqueueDispatch({
            job_id: jobId,
            target: 'laptop-ugc' as DispatchTarget,
            generator_id: 'laptop_ugc',
            body: laptopUgcPayload,
            enqueued_at: new Date().toISOString(),
          })
        : null;

      if (!enqueued) {
        fetch(`${workerUrl}/laptop-ugc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
          body: JSON.stringify(laptopUgcPayload),
        }).catch((err: Error) => console.error(`[laptop_ugc] Worker dispatch failed: ${err.message}`));
      }

      res.status(201).json({
        job_id: jobId,
        status: 'submitted',
        credits_deducted: creditCost,
        actor_slug: actor.slug,
        actor_random: !body.actor_slug,
        subtitle_style: subtitleStyle,
      });
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Laptop UGC dispatch failed' } });
    }
    return;
  }

  // ── Character Video flow ──────────────────────────────────────────────
  // 3rd step of the 3-step character pipeline:
  //   1. /v1/character/sheet-generate     → character_sheet_url
  //   2. /v1/character/storyboard-generate → storyboard_url
  //   3. THIS — seedance multimodal i2v with image_urls=[sheet, storyboard]
  if (generatorId === 'character_video') {
    // Hoisted so the outer catch can call failJobAndRefund(jobId) even
    // when the inner try throws after credits were deducted.
    let jobId: string | null = null;
    try {
      const characterSheetUrl = body.character_sheet_url as string | undefined;
      const storyboardUrl = body.storyboard_url as string | undefined;
      let actionPrompt = body.action_prompt as string | undefined;
      const sessionIdRaw = body.session_id as string | undefined;
      const sessionId = typeof sessionIdRaw === 'string' && /^[0-9a-f-]{36}$/i.test(sessionIdRaw) ? sessionIdRaw : null;

      if (!characterSheetUrl || typeof characterSheetUrl !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'character_sheet_url is required (generate one via POST /v1/character/sheet-generate)' } });
        return;
      }
      if (!storyboardUrl || typeof storyboardUrl !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'storyboard_url is required (generate one via POST /v1/character/storyboard-generate)' } });
        return;
      }
      // action_prompt is optional now — the worker uses a fixed instruction
      // and the two reference images instead of a creative-direction string.
      // Kept around for API back-compat; we accept it but don't validate it.

      const duration = body.duration ?? 10;
      const aspectRatio = body.aspect_ratio ?? '9:16';
      const generateAudio = body.generate_audio ?? true;

      if (!(CHARACTER_VIDEO_DURATIONS as readonly number[]).includes(duration)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `duration must be one of ${CHARACTER_VIDEO_DURATIONS.join(', ')}` } });
        return;
      }
      if (!CHARACTER_VIDEO_RATIOS.includes(aspectRatio as '9:16' | '16:9' | '1:1')) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `aspect_ratio must be one of ${CHARACTER_VIDEO_RATIOS.join(', ')}` } });
        return;
      }

      // Cost basis: upstream seedance-2.0-reference-to-video at 720p =
      // $0.199 / second of output. The worker locks quality:'720p' to
      // match. Pricing follows the 70% margin rule (retail = cost / 0.30).
      //   5s  → cost $0.995, charge 350 cr ($3.50) → 72% margin
      //   10s → cost $1.99,  charge 700 cr ($7.00) → 72% margin
      const creditCost = duration === 5 ? 350 : 700;

      // Idempotent submit (see character-sheets.ts for shape).
      if (sessionId) {
        const { data: existing } = await supabase
          .from('generation_jobs')
          .select('id, status, credit_cost')
          .eq('user_id', userId)
          .eq('operation', 'character_video')
          .eq('input_params->>session_id', sessionId)
          .maybeSingle();
        if (existing) {
          res.status(202).json({
            job_id: existing.id,
            status: existing.status,
            credits_deducted: existing.credit_cost ?? creditCost,
            duration,
            aspect_ratio: aspectRatio,
            idempotent: true,
          });
          return;
        }
      }

      // Resolve parent character_id via the session's sheet job, and
      // backstop action_prompt: Seedance needs a scene description or it
      // picks the location arbitrarily. If the client didn't send one,
      // pull the script / beats from the storyboard job in the same
      // session and prepend the sheet job's description for character
      // anchoring. Without this, Seedance ignores the wireframe.
      let characterIdForVideo: string | null = null;
      if (sessionId) {
        const { data: sheetJob } = await supabase
          .from('generation_jobs')
          .select('character_id, input_params')
          .eq('user_id', userId)
          .eq('operation', 'character_sheet')
          .eq('input_params->>session_id', sessionId)
          .maybeSingle();
        characterIdForVideo = (sheetJob?.character_id as string | null) ?? null;

        if (!actionPrompt || !actionPrompt.trim()) {
          const { data: sbJob } = await supabase
            .from('generation_jobs')
            .select('input_params, prompt')
            .eq('user_id', userId)
            .eq('operation', 'character_storyboard')
            .eq('input_params->>session_id', sessionId)
            .maybeSingle();
          const sbIp = (sbJob?.input_params ?? {}) as { script?: string; beats?: string[] };
          const sceneText =
            (typeof sbIp.script === 'string' && sbIp.script.trim().length > 0)
              ? sbIp.script.trim()
              : Array.isArray(sbIp.beats) && sbIp.beats.length > 0
                ? sbIp.beats.filter((b) => typeof b === 'string' && b.trim().length > 0).join('. ')
                : (typeof sbJob?.prompt === 'string' ? sbJob.prompt.trim() : '');
          const sheetIp = (sheetJob?.input_params ?? {}) as { description?: string };
          const charText = typeof sheetIp.description === 'string' ? sheetIp.description.trim() : '';
          const composed = [
            charText ? `Character: ${charText}.` : '',
            sceneText ? `Action: ${sceneText}` : '',
          ].filter(Boolean).join(' ').trim();
          if (composed.length > 0) actionPrompt = composed;
        }
      }

      jobId = crypto.randomUUID();

      // The DB prompt column is NOT NULL — actionPrompt is now optional, so
      // fall back to the literal Seedance instruction the worker uses.
      const dbPrompt = (typeof actionPrompt === 'string' && actionPrompt.trim().length > 0)
        ? actionPrompt
        : 'create full video from the storyboard and character sheet';

      const { error: jobErr } = await supabase.from('generation_jobs').insert({
        id: jobId,
        user_id: userId,
        model_slug: 'character-video',
        operation: 'character_video',
        status: 'submitted',
        prompt: dbPrompt,
        credit_cost: creditCost,
        provider_slug: 'railway',
        provider_job_id: jobId,
        ...(characterIdForVideo ? { character_id: characterIdForVideo } : {}),
        input_params: {
          character_sheet_url: characterSheetUrl,
          storyboard_url: storyboardUrl,
          ...(actionPrompt ? { action_prompt: actionPrompt } : {}),
          duration,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio,
          ...(sessionId ? { session_id: sessionId } : {}),
          ...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
        },
      });
      if (jobErr) {
        if (sessionId && /duplicate key|unique constraint/i.test(jobErr.message)) {
          const { data: winner } = await supabase
            .from('generation_jobs')
            .select('id, status, credit_cost')
            .eq('user_id', userId)
            .eq('operation', 'character_video')
            .eq('input_params->>session_id', sessionId)
            .maybeSingle();
          if (winner) {
            res.status(202).json({
              job_id: winner.id,
              status: winner.status,
              credits_deducted: winner.credit_cost ?? creditCost,
              duration,
              aspect_ratio: aspectRatio,
              idempotent: true,
            });
            return;
          }
        }
        console.error(`[character_video] job insert failed: ${jobErr.message}`);
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: `Failed to create job: ${jobErr.message}` } });
        return;
      }

      const { error: creditErr } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_job_id: jobId,
        p_description: `Character Video (${duration}s ${aspectRatio})`,
      });
      if (creditErr) {
        await supabase.from('generation_jobs').delete().eq('id', jobId);
        const msg = creditErr.message || '';
        const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
        const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
        res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
        return;
      }

      const workerUrl = process.env.WORKER_V2_URL || 'http://localhost:3002';
      const workerSecret = process.env.WORKER_SECRET || '';
      const characterVideoPayload = {
        job_id: jobId,
        user_id: userId,
        character_sheet_url: characterSheetUrl,
        storyboard_url: storyboardUrl,
        action_prompt: actionPrompt,
        duration,
        aspect_ratio: aspectRatio,
        generate_audio: generateAudio,
        callback_url: buildCallbackUrl(jobId),
        webhook_url: body.webhook_url ?? null,
      };

      const enqueued = USE_DURABLE_QUEUE
        ? await enqueueDispatch({
            job_id: jobId,
            target: 'character-video' as DispatchTarget,
            generator_id: 'character_video',
            body: characterVideoPayload,
            enqueued_at: new Date().toISOString(),
          })
        : null;

      // Direct (non-durable-queue) path must AWAIT and refund on failure.
      // Credits have already been deducted above; a fire-and-forget catch
      // would leave the user paying for a job that never reached the worker.
      if (!enqueued) {
        try {
          const dispatchResp = await fetch(`${workerUrl}/character-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
            body: JSON.stringify(characterVideoPayload),
            signal: AbortSignal.timeout(30_000),
          });
          if (!dispatchResp.ok) {
            const text = await dispatchResp.text().catch(() => '');
            throw new Error(`worker ${dispatchResp.status}: ${text.slice(0, 200)}`);
          }
        } catch (dispatchErr) {
          const msg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
          console.error(`[character_video] worker dispatch failed for job ${jobId}: ${msg}`);
          await failJobAndRefund(jobId, `Worker dispatch failed: ${msg}`);
          res.status(502).json({
            error: {
              code: 'WORKER_DISPATCH_FAILED',
              message: 'Could not reach the rendering worker. Credits have been refunded.',
            },
          });
          return;
        }
      }

      res.status(201).json({
        job_id: jobId,
        status: 'submitted',
        credits_deducted: creditCost,
        duration,
        aspect_ratio: aspectRatio,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[character_video] flow failed: ${msg}`);
      // Best-effort refund: jobId may not yet exist on early failures.
      if (jobId) {
        try { await failJobAndRefund(jobId, `Dispatch flow failed: ${msg}`); } catch (refundErr) {
          console.error(`[character_video] refund failed for job ${jobId}:`, refundErr);
        }
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: `Character video dispatch failed: ${msg}` } });
    }
    return;
  }

  // ── Text-to-Video flow ────────────────────────────────────────────────
  // One-shot generator: prompt → Seedance 2.0 text-to-video at 720p.
  // No character sheet, no storyboard, no actor. The prompt IS the entire
  // creative direction. Used by CLI / SDK / MCP / Skill so Claude Code
  // can spin up a video without going through the schedule wizard.
  if (generatorId === 'text_to_video') {
    let jobId: string | null = null;
    try {
      const prompt = body.prompt as string | undefined;
      if (typeof prompt !== 'string' || prompt.trim().length < 20 || prompt.length > 1000) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'prompt is required (20–1000 chars)' } });
        return;
      }
      const duration = body.duration ?? 10;
      const aspectRatio = body.aspect_ratio ?? '9:16';
      const generateAudio = body.generate_audio ?? true;

      if (![5, 10, 15].includes(duration)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'duration must be 5, 10, or 15' } });
        return;
      }
      if (!['9:16', '16:9', '1:1'].includes(aspectRatio as string)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'aspect_ratio must be 9:16 | 16:9 | 1:1' } });
        return;
      }

      // Same cost basis as character_video — both bill the upstream Seedance
      // 2.0 720p provider, 72% margin.
      const creditCost = duration === 5 ? 350 : duration === 15 ? 1050 : 700;

      // Auto-publish fields. Persisted on the job row so webhook-provider
      // can fan the rendered MP4 out to Postiz on completion — same path
      // the schedule-runner uses for scheduled jobs.
      const postizIntegrationIds = Array.isArray(body.postiz_integration_ids)
        ? (body.postiz_integration_ids as string[]).filter((s) => typeof s === 'string' && s.length > 0)
        : null;
      const captionMode = body.caption_mode === 'ai' ? 'ai' : 'static';
      const captionText = typeof body.caption === 'string' ? body.caption.trim() : null;
      const captionGuidance = typeof body.caption_guidance === 'string' ? body.caption_guidance.trim() : null;
      if (postizIntegrationIds && postizIntegrationIds.length > 0) {
        if (captionMode === 'static' && (!captionText || captionText.length < 1)) {
          res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'caption is required when posting with caption_mode=static (or set caption_mode=ai)' } });
          return;
        }
      }

      jobId = crypto.randomUUID();
      const { error: jobErr } = await supabase.from('generation_jobs').insert({
        id: jobId,
        user_id: userId,
        model_slug: 'text-to-video',
        operation: 'text_to_video',
        status: 'submitted',
        prompt: prompt.trim().slice(0, 500),
        credit_cost: creditCost,
        provider_slug: 'railway',
        provider_job_id: jobId,
        input_params: {
          prompt: prompt.trim(),
          duration,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio,
          ...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
          ...(postizIntegrationIds && postizIntegrationIds.length > 0
            ? {
                postiz_integration_ids: postizIntegrationIds,
                caption_mode: captionMode,
                ...(captionText ? { caption: captionText } : {}),
                ...(captionGuidance ? { caption_guidance: captionGuidance } : {}),
              }
            : {}),
        },
      });
      if (jobErr) {
        console.error(`[text_to_video] job insert failed: ${jobErr.message}`);
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: `Failed to create job: ${jobErr.message}` } });
        return;
      }

      const { error: creditErr } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_job_id: jobId,
        p_description: `Text-to-Video (${duration}s ${aspectRatio})`,
      });
      if (creditErr) {
        await supabase.from('generation_jobs').delete().eq('id', jobId);
        const msg = creditErr.message || '';
        const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
        const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
        res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
        return;
      }

      const workerUrl = process.env.WORKER_V2_URL || 'http://localhost:3002';
      const workerSecret = process.env.WORKER_SECRET || '';
      const t2vPayload = {
        job_id: jobId,
        user_id: userId,
        prompt: prompt.trim(),
        duration,
        aspect_ratio: aspectRatio,
        generate_audio: generateAudio,
        callback_url: buildCallbackUrl(jobId),
        webhook_url: body.webhook_url ?? null,
      };

      const enqueued = USE_DURABLE_QUEUE
        ? await enqueueDispatch({
            job_id: jobId,
            target: 'text-to-video' as DispatchTarget,
            generator_id: 'text_to_video',
            body: t2vPayload,
            enqueued_at: new Date().toISOString(),
          })
        : null;

      if (!enqueued) {
        try {
          const dispatchResp = await fetch(`${workerUrl}/text-to-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
            body: JSON.stringify(t2vPayload),
            signal: AbortSignal.timeout(30_000),
          });
          if (!dispatchResp.ok) {
            const text = await dispatchResp.text().catch(() => '');
            throw new Error(`worker ${dispatchResp.status}: ${text.slice(0, 200)}`);
          }
        } catch (dispatchErr) {
          const msg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
          console.error(`[text_to_video] worker dispatch failed for job ${jobId}: ${msg}`);
          await failJobAndRefund(jobId, `Worker dispatch failed: ${msg}`);
          res.status(502).json({
            error: { code: 'WORKER_DISPATCH_FAILED', message: 'Could not reach the rendering worker. Credits have been refunded.' },
          });
          return;
        }
      }

      res.status(201).json({
        job_id: jobId,
        status: 'submitted',
        credits_deducted: creditCost,
        duration,
        aspect_ratio: aspectRatio,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[text_to_video] flow failed: ${msg}`);
      if (jobId) {
        try { await failJobAndRefund(jobId, `Dispatch flow failed: ${msg}`); } catch (refundErr) {
          console.error(`[text_to_video] refund failed for job ${jobId}:`, refundErr);
        }
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: `Text-to-video dispatch failed: ${msg}` } });
    }
    return;
  }

  // ── Product Acting UGC flow ───────────────────────────────────────────
  if (generatorId === 'product_acting_ugc') {
    try {
      const duration = body.duration ?? 5;
      const subtitles = body.subtitles !== false && body.subtitle_style !== 'none';
      const subtitleStyle = subtitles ? (body.subtitle_style ?? 'hormozi') : 'none';

      if (!WORKER_V2_URL || !WORKER_SECRET) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Video generation service is not configured. No credits charged.',
          },
        });
        return;
      }

      const workerCheck = await checkProductActingWorkerEndpoint();
      if (!workerCheck.ok) {
        res.status(workerCheck.status).json({ error: { code: 'SERVICE_UNAVAILABLE', message: workerCheck.message } });
        return;
      }

      let script = body.script?.trim() ?? '';
      let generatedScript: string | null = null;
      if (!script) {
        try {
          generatedScript = await generateProductActingScript(body, duration);
          script = generatedScript;
        } catch (err) {
          res.status(500).json({ error: { code: 'SCRIPT_GENERATION_FAILED', message: err instanceof Error ? err.message : 'Script generation failed' } });
          return;
        }
      }

      const wordCount = script.split(/\s+/).filter(Boolean).length;
      const maxWords = duration * 3;
      if (wordCount > maxWords) {
        res.status(400).json({ error: { code: 'SCRIPT_TOO_LONG', message: `Script has ${wordCount} words; max ${maxWords} for ${duration}s.` } });
        return;
      }

      const { data: actor, error: actorErr } = await supabase
        .from('actors')
        .select('id, slug, name, portrait_url')
        .eq('slug', body.actor_slug)
        .eq('status', 'active')
        .maybeSingle();

      if (actorErr) {
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor lookup failed' } });
        return;
      }
      if (!actor?.portrait_url) {
        res.status(404).json({ error: { code: 'ACTOR_NOT_FOUND', message: `Actor '${body.actor_slug}' not found or has no portrait` } });
        return;
      }

      let actorImageUrl = actor.portrait_url as string;
      if (body.actor_variant_id) {
        const { data: variant, error: variantErr } = await supabase
          .from('actor_variants')
          .select('id, actor_id, image_url')
          .eq('id', body.actor_variant_id)
          .eq('actor_id', actor.id)
          .eq('status', 'active')
          .maybeSingle();

        if (variantErr) {
          res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor variant lookup failed' } });
          return;
        }
        if (!variant?.image_url) {
          res.status(404).json({ error: { code: 'ACTOR_VARIANT_NOT_FOUND', message: `Actor variant '${body.actor_variant_id}' not found for '${body.actor_slug}'` } });
          return;
        }
        actorImageUrl = variant.image_url as string;
      }

      const creditCost = duration * CREDITS_PER_SECOND + 50 + (generatedScript ? SCRIPT_GENERATION_CREDIT_SURCHARGE : 0);
      const jobId = crypto.randomUUID();

      const { error: jobErr } = await supabase.from('generation_jobs').insert({
        id: jobId,
        user_id: userId,
        model_slug: 'ugc-basic',
        operation: 'product_acting_ugc',
        status: 'pending',
        prompt: script.substring(0, 500),
        duration_seconds: duration,
        credit_cost: creditCost,
        provider_cost_usd: duration * 0.25,
        provider_slug: 'railway',
        provider_job_id: jobId,
        webhook_checkpoint: 'none',
        input_params: {
          actor_slug: actor.slug,
          actor_variant_id: body.actor_variant_id ?? null,
          product_image_url: body.product_image_url,
          product_name: body.product_name ?? null,
          product_description: body.product_description ?? null,
          template: body.template,
          acting_style: body.acting_style,
          visual_style: body.visual_style ?? null,
          duration,
          subtitles,
          subtitle_style: subtitleStyle,
          generated_script: generatedScript,
          ...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
        },
        started_at: new Date().toISOString(),
      });

      if (jobErr) {
        console.error('[product_acting_ugc] job insert failed:', jobErr);
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
        return;
      }

      const { error: creditErr } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: creditCost,
        p_job_id: jobId,
        p_description: `Product Acting UGC — ${actor.slug} (${duration}s)`,
      });

      if (creditErr) {
        await supabase.from('generation_jobs').delete().eq('id', jobId);
        const msg = creditErr.message || '';
        const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
        const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
        res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
        return;
      }

      const productActingPayload = {
        job_id: jobId,
        user_id: userId,
        actor_image_url: actorImageUrl,
        product_image_url: body.product_image_url,
        script,
        product_name: body.product_name ?? null,
        product_description: body.product_description ?? null,
        template: body.template,
        acting_style: body.acting_style,
        visual_style: body.visual_style ?? null,
        duration,
        subtitles,
        subtitle_style: subtitleStyle,
        callback_url: buildCallbackUrl(jobId),
        webhook_url: body.webhook_url ?? null,
      };

      // Try durable queue first if flag on; fall back to HTTP dispatch.
      const productActingEnqueued = USE_DURABLE_QUEUE
        ? await enqueueDispatch({
            job_id: jobId,
            target: 'product-acting' as DispatchTarget,
            generator_id: 'product_acting_ugc',
            body: productActingPayload,
            enqueued_at: new Date().toISOString(),
          })
        : null;

      if (!productActingEnqueued) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15_000);
          const workerResp = await fetch(`${WORKER_V2_URL}/product-acting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
            body: JSON.stringify(productActingPayload),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!workerResp.ok) {
            const errorText = await workerResp.text().catch(() => 'unknown');
            throw new Error(`Worker returned ${workerResp.status}: ${errorText}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Worker dispatch failed';
          console.error(`[product_acting_ugc] worker dispatch failed for ${jobId}:`, msg);
          await failJobAndRefund(jobId, msg);
          res.status(500).json({ error: { code: 'DISPATCH_ERROR', message: 'Video generation failed to start. Credits refunded.' } });
          return;
        }
      }

      await supabase.from('generation_jobs').update({ status: 'submitted', webhook_checkpoint: 'submitted' }).eq('id', jobId);

      res.status(201).json({
        job_id: jobId,
        status: 'submitted',
        credits_deducted: creditCost,
        actor_slug: actor.slug,
        actor_variant_id: body.actor_variant_id ?? null,
        generated_script: generatedScript,
        subtitles,
        subtitle_style: subtitleStyle,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Product Acting UGC dispatch failed' } });
    }
    return;
  }

  // ── UGC / SaaS Review flow — direct dispatch ──────────────────────────

  let script = body.script?.trim() ?? '';
  let generatedScript: string | null = null;
  let voice = body.voice ?? 'alloy';
  let voiceAutoDetected = false;
  let facePhotoUrl: string | null = body.face_photo_url ?? null;
  const model = 'kling3';
  const ttsProvider = null;
  const style = body.style ?? 'hormozi';
  const tone = body.tone ?? null;
  const aspectRatio = body.aspect_ratio ?? '9:16';
  const music = body.music ?? null;
  const cta = body.cta ?? null;

  // ── Resolve actor ──────────────────────────────────────────────────────
  if (body.actor_slug) {
    const { data: actor, error } = await supabase
      .from('actors')
      .select('id, name, slug, portrait_url, voice_id, voice_gender, lip_sync_engine')
      .eq('slug', body.actor_slug).eq('status', 'active').maybeSingle();

    if (error) { res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor lookup failed' } }); return; }
    if (!actor) {
      // Suggest similar slugs
      const { data: allSlugs } = await supabase.from('actors').select('slug').eq('status', 'active');
      let hint = '';
      if (allSlugs) {
        const lev = (a: string, b: string): number => {
          const m = a.length, n = b.length;
          const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
          for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
          return d[m][n];
        };
        const similar = allSlugs.map((r: any) => ({ slug: r.slug, dist: lev(body.actor_slug!, r.slug) })).filter((r: any) => r.dist <= 2 && r.dist > 0).sort((a: any, b: any) => a.dist - b.dist).slice(0, 3).map((r: any) => r.slug);
        if (similar.length) hint = ` Did you mean: ${similar.join(', ')}?`;
      }
      res.status(404).json({ error: { code: 'ACTOR_NOT_FOUND', message: `Actor '${body.actor_slug}' not found.${hint}` } });
      return;
    }
    if (actor.portrait_url) facePhotoUrl = actor.portrait_url;
    if (actor.voice_id && !body.voice) voice = actor.voice_id;
  }

  // ── Resolve persona ────────────────────────────────────────────────────
  if (body.persona_slug) {
    const { data: persona, error } = await supabase
      .from('user_personas')
      .select('id, voice_id, voice_clone_status, face_photo_url')
      .eq('user_id', userId).eq('slug', body.persona_slug).maybeSingle();

    if (error) { res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Persona lookup failed' } }); return; }
    if (!persona) { res.status(404).json({ error: { code: 'NOT_FOUND', message: `Persona '${body.persona_slug}' not found.` } }); return; }
    if (persona.voice_id && persona.voice_clone_status === 'ready') voice = persona.voice_id;
    if (persona.face_photo_url) {
      const { data: signed } = await supabase.storage.from('persona-assets').createSignedUrl(persona.face_photo_url, 3600);
      facePhotoUrl = signed?.signedUrl ?? null;
    }
  }

  // ── Auto-detect voice from face ────────────────────────────────────────
  if (facePhotoUrl && !body.voice) {
    const detection = await detectVoiceFromFace(facePhotoUrl);
    if (detection) { voice = detection.voice; voiceAutoDetected = true; }
  }

  // ── Generate script from prompt ────────────────────────────────────────
  if (body.prompt && !script) {
    try {
      generatedScript = await generateScript(body.prompt, body.product_url ?? null, body.template ?? null, body.target_duration ?? 10);
      script = generatedScript;
    } catch (err) {
      res.status(500).json({ error: { code: 'SCRIPT_GENERATION_FAILED', message: err instanceof Error ? err.message : 'Script generation failed' } });
      return;
    }
  }

  if (!script) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No script provided and prompt generation failed' } }); return; }

  // ── Check plan tier ────────────────────────────────────────────────────
  const { data: subscription } = await supabase
    .from('subscriptions').select('plan_slug, status')
    .eq('user_id', userId).in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false }).maybeSingle();

  let userTier = subscription?.plan_slug ?? 'free';
  if (userTier === 'free') {
    const { data: creditRow } = await supabase.from('user_credits').select('purchased_balance').eq('user_id', userId).maybeSingle();
    if (creditRow && (creditRow.purchased_balance as number) > 0) userTier = 'newby';
  }

  const userLevel = TIER_ORDER[userTier] ?? 0;
  if (userLevel < (TIER_ORDER[MIN_PLAN_TIER] ?? 0)) {
    res.status(403).json({ error: 'plan_required', error_description: `UGC video requires at least the Starter plan. You are on the '${userTier}' plan.` });
    return;
  }

  const isCreatorTier = userTier === 'starter' || userTier === 'newby';
  if (isCreatorTier && body.target_duration && body.target_duration > 10) {
    res.status(403).json({ error: 'plan_limit', error_description: `Your plan (${userTier}) supports up to 10s videos. Upgrade for 15s.` });
    return;
  }

  // ── Duration + pacing ──────────────────────────────────────────────────
  const targetDuration = body.target_duration ?? null;
  const durationBucket = toDurationBucket(targetDuration ?? estimateDuration(script));
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const maxWords = MAX_WORDS_PER_DURATION[durationBucket] ?? Math.floor(durationBucket * WORDS_PER_SECOND);

  if (wordCount > maxWords) {
    const recommended = toDurationBucket(Math.ceil(wordCount / WORDS_PER_SECOND));
    const recommendedClamped = Math.min(recommended, DURATIONS[DURATIONS.length - 1]);
    res.status(400).json({
      error: 'script_too_long',
      error_description: `Script has ${wordCount} words; max ${maxWords} for ${durationBucket}s. Shorten the script or pass --duration ${recommendedClamped}.`,
    });
    return;
  }

  // ── Simple-mode lip-sync cap ───────────────────────────────────────────
  // The upstream kling-o3 lip-sync degrades >10s in a single clip. Multi-scene
  // mode (B-roll, custom scenes, or PIP) splits into ≤10s segments with
  // last-frame continuity. Single talking-head simple mode does not — so
  // reject >10s upfront with a clear path to multi-scene mode.
  const willRunSimpleMode = (
    facePhotoUrl &&
    !body.scenes &&
    !body.allow_broll &&
    !(body.broll_images?.length) &&
    body.composition_mode !== 'pip'
  );
  if (willRunSimpleMode && durationBucket > 10) {
    res.status(400).json({
      error: 'duration_exceeds_simple_mode_cap',
      error_description: `Single talking-head clips are capped at 10s (lip-sync degrades past that). Use --duration 5 or 10, or pass --broll / --scenes to enable multi-scene mode for longer videos.`,
    });
    return;
  }

  const baseCost = durationBucket * CREDITS_PER_SECOND;
  const creditCost = baseCost + (generatedScript ? SCRIPT_GENERATION_CREDIT_SURCHARGE : 0);

  // ── Circuit breaker: check worker health before charging ────────────────
  if (WORKER_V2_URL) {
    try {
      const healthResp = await fetch(`${WORKER_V2_URL}/health`, { signal: AbortSignal.timeout(5_000) });
      if (!healthResp.ok) {
        res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Video generation service is temporarily unavailable. No credits charged. Try again shortly.' } });
        return;
      }
    } catch {
      res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Video generation service is temporarily unavailable. No credits charged. Try again shortly.' } });
      return;
    }
  }

  // ── Create job first (pending) to avoid lost credits on crash ───────────
  const jobId = crypto.randomUUID();
  const { error: insertError } = await supabase.from('generation_jobs').insert({
    id: jobId, user_id: userId, model_slug: 'ugc-basic', operation: 'ugc_video',
    status: 'pending', prompt: script.substring(0, 500), credit_cost: creditCost,
    provider_cost_usd: durationBucket * 0.2, provider_slug: 'railway',
    provider_job_id: jobId, webhook_checkpoint: 'none',
    input_params: {
      script, voice, model, style, tone,
      estimated_duration: durationBucket,
      has_face: !!facePhotoUrl,
      aspect_ratio: aspectRatio,
      music, generated_script: generatedScript,
      ...(body.webhook_url ? { webhook_url: body.webhook_url } : {}),
    },
    started_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[generate] job insert failed:', insertError);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create job' } });
    return;
  }

  // ── Deduct credits (atomic — stored procedure handles insufficient balance) ─
  const { error: deductError } = await supabase.rpc('deduct_credits', {
    p_user_id: userId, p_amount: creditCost, p_job_id: jobId,
    p_description: `UGC Video: ${script.substring(0, 50)}...`,
  });

  if (deductError) {
    // Clean up the pending job since credits weren't charged
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    if (deductError.message?.includes('INSUFFICIENT_CREDITS')) {
      const { data: balance } = await supabase.rpc('get_credit_balance', { p_user_id: userId });
      res.status(402).json({
        error: 'insufficient_credits',
        error_description: `UGC video (~${durationBucket}s) costs ${creditCost} credits, but you only have ${balance?.total_credits ?? 0} available.`,
        credits_required: creditCost, credits_available: balance?.total_credits ?? 0,
      });
      return;
    }
    res.status(500).json({ error: { code: 'CREDIT_ERROR', message: 'Failed to deduct credits' } });
    return;
  }

  // ── Dispatch to worker-v2 directly ─────────────────────────────────────
  if (!WORKER_V2_URL || !WORKER_SECRET) {
    await failJobAndRefund(jobId, 'Worker not configured');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Video service unavailable. Credits refunded.' } });
    return;
  }

  const ugcPayload = {
    job_id: jobId, script, voice, model, style, tone,
    user_id: userId, callback_url: buildCallbackUrl(jobId),
    face_photo_url: facePhotoUrl, target_duration: durationBucket,
    aspect_ratio: aspectRatio, music, cta,
    tts_provider: ttsProvider,
    allow_broll: body.allow_broll ?? false,
    broll_images: body.broll_images ?? null,
    dub_language: body.dub_language ?? null,
    scenes_input: body.scenes ?? null,
    product_image_url: body.product_image_url ?? null,
    template: body.template ?? null,
    broll_model: null,
    voice_speed: body.voice_speed ?? null,
    composition_mode: body.composition_mode ?? null,
    pip_position: body.pip_options?.position ?? null,
    pip_size: body.pip_options?.size ?? null,
    pip_animation: body.pip_options?.animation ?? null,
    pip_style: body.pip_options?.frame_style ?? null,
    unified_voice: true,
    webhook_url: body.webhook_url ?? null,
  };

  // Try durable queue first if flag on; fall back to HTTP dispatch.
  const ugcEnqueued = USE_DURABLE_QUEUE
    ? await enqueueDispatch({
        job_id: jobId,
        target: 'ugc' as DispatchTarget,
        generator_id: generatorId === 'saas_review' ? 'saas_review' : 'ugc_video',
        body: ugcPayload,
        enqueued_at: new Date().toISOString(),
      })
    : null;

  if (!ugcEnqueued) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const workerResp = await fetch(`${WORKER_V2_URL}/ugc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
        body: JSON.stringify(ugcPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!workerResp.ok) {
        const errorText = await workerResp.text().catch(() => 'unknown');
        throw new Error(`Worker returned ${workerResp.status}: ${errorText}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Worker dispatch failed';
      console.error(`[generate] worker dispatch failed for ${jobId}:`, msg);
      await failJobAndRefund(jobId, msg);
      res.status(500).json({ error: { code: 'DISPATCH_ERROR', message: 'Video generation failed to start. Credits refunded.' } });
      return;
    }
  }

  // ── Update job status ──────────────────────────────────────────────────
  await supabase.from('generation_jobs').update({ status: 'submitted', webhook_checkpoint: 'submitted' }).eq('id', jobId);

  res.status(201).json({
    job_id: jobId,
    status: 'submitted',
    estimated_duration: durationBucket,
    credits_deducted: creditCost,
    selected_voice: voice,
    voice_auto_detected: voiceAutoDetected,
    word_count: wordCount,
    words_per_second: parseFloat((wordCount / durationBucket).toFixed(1)),
    max_words: maxWords,
  });
}
