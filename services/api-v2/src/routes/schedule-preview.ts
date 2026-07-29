// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v1/schedules/preview-brief
 *
 * Generates a sample 4-6 beat script for a schedule brief. Used by the
 * Content Machine wizard step 3 so users can iterate on their brief and
 * see what kind of script it produces before they commit to a recurring
 * schedule.
 *
 * Three guards on outbound content:
 *   1. Input moderation — OpenAI omni-moderation-latest on the user's
 *      raw brief. If flagged, return 400 with the categories that hit
 *      so the UI can explain why the brief was blocked.
 *   2. Claude Opus 4.7 for the script generation itself. The model has
 *      its own safety policies and refuses obviously-bad asks.
 *   3. Output moderation — same model on the generated text. If the
 *      output is flagged we don't return it.
 *
 * If OPENAI_API_KEY is unset (local dev), moderation soft-fails:
 *   logs a console warning and lets the request through. Production
 *   has the key set on Railway so moderation always runs there.
 *
 * No credits charged. Rate-limited at the route level.
 */

import type { Request, Response } from 'express';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Brief generation is user-visible and quality-sensitive — Opus 4.7 only.
// Haiku output was too generic/templated; user explicitly rejected it.
const SCRIPT_MODEL = process.env.SCHEDULE_PREVIEW_MODEL ?? 'claude-opus-4-7';

interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

async function moderate(text: string): Promise<ModerationResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — moderation is required, refusing to soft-pass');
  }
  const resp = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`OpenAI moderation API ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
  };
  const r = json.results?.[0];
  if (!r) throw new Error('OpenAI moderation returned no result');
  const cats = Object.entries(r.categories ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  return { flagged: r.flagged === true, categories: cats };
}

const BASE_SYSTEM_PROMPT = `You write short scripts for AI-generated UGC video posts.

WHAT THE PIPELINE PRODUCES
The output video is a single continuous shot of ONE AI character performing
to camera in a real-world setting. There is NO post-production: no jump
cuts, no multi-shot edits, no separate B-roll, no graphics, no text overlay.

The character can:
  - move, walk, gesture, mime holding an object, change facial expression
  - speak directly to camera (their lips will be lip-synced to the dialogue)
  - reference things verbally ("our new dashboard", "this feature")

By default the character CANNOT:
  - show a phone, laptop, app, dashboard, screenshot, or any UI on screen
  - point at a real product the viewer can physically see
  - cut to other shots, other people, or any visual that isn't the
    character themselves in their setting
  - hold up text or signs (the AI renderer mangles text)

Given a series brief (the recurring concept), produce ONE fresh script
for today's run that fits the brief but is NOT a copy of a previous run.

Output format — strict JSON, no prose, no code fence:
  {
    "topic": "<short label for what this run is about, max 50 chars>",
    "beats": ["<beat 1>", "<beat 2>", ...]
  }

Beats:
  - 4 to 6 entries
  - Each 4 to 15 words
  - Concrete things the CHARACTER does or says on camera, in their setting
  - Flow as a coherent monologue-to-camera the AI character performs

Hard rules:
  - No nudity, hate speech, harassment, real people without permission,
    copyrighted characters, weapons, drugs, or self-harm.
  - If the brief is unsafe to fulfil, return {"topic":"BLOCKED",
    "beats":["<one-sentence reason>"]}.
  - Stay on-brand: same character behavior, same setting, same tone as
    the brief. Only the topic / dish / question / etc. varies.`;

// Per-asset capability addenda. When the user uploads a reference asset
// it's fed to the same Seedance 2.0 reference-to-video call as a second
// image reference, so the character can physically interact with it in
// the rendered shot. The model needs to know it has that capability,
// otherwise it self-censors to verbal-only.
const ASSET_ADDENDA: Record<string, string> = {
  product: `
ASSET AVAILABLE — PRODUCT PHOTO
You have a real product photo as a second image reference. Override the
default "cannot show real products" rule. The character CAN:
  - hold the product in-hand and angle it toward camera
  - mime using or demonstrating the product
  - hand it over, set it down, point to a feature on it
At least 1-2 beats should physically involve the product (not just talk
about it). Refer to it as "the product" / "it" in beats — the storyboard
step paints it from the photo.`.trim(),
  saas_capture: `
ASSET AVAILABLE — SAAS UI STILL
You have a still frame of the user's SaaS UI as a second image reference.
Override the default "no app UI on screen" rule. The character CAN:
  - gesture toward the visible UI in their setting (e.g. monitor on a desk
    next to them, laptop they're using)
  - point at a specific area of the UI
  - react to what's on the screen
The shot stays one continuous take with the character in frame — the UI
appears as a real screen in their environment, NOT as a fullscreen overlay
or cut-in. 1-2 beats should involve interacting with the displayed UI.`.trim(),
  app_screenshot: `
ASSET AVAILABLE — APP SCREENSHOT
You have an app screenshot as a second image reference. Override the
default "no phone UI" rule. The character CAN:
  - hold a phone showing the screenshot, angled toward camera
  - gesture at the screen, tap, scroll, react
  - flip the phone around to show it
1-2 beats should involve physically holding and showing the phone with
the screenshot visible. The shot stays one continuous take of the character
holding the phone — no cut to a fullscreen screenshot.`.trim(),
};

function buildSystemPrompt(assetType: string | null): string {
  if (!assetType || !ASSET_ADDENDA[assetType]) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\n${ASSET_ADDENDA[assetType]}`;
}

interface PreviewSuccess {
  topic: string;
  beats: string[];
}

async function callClaude(brief: string, recentTopics: string[], assetType: string | null): Promise<PreviewSuccess> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const assetLine = assetType ? `Reference asset attached: ${assetType}\n\n` : '';
  const userMsg = recentTopics.length > 0
    ? `${assetLine}Series brief:\n${brief}\n\nRecently posted topics (do not repeat):\n${recentTopics.map((t) => `- ${t}`).join('\n')}\n\nWrite today's script.`
    : `${assetLine}Series brief:\n${brief}\n\nThis is the first run. Write today's script.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SCRIPT_MODEL,
      max_tokens: 600,
      system: buildSystemPrompt(assetType),
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Empty Claude response');

  // Strip code fences if Claude wrapped the JSON.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected an object response');
  }
  const o = parsed as { topic?: unknown; beats?: unknown };
  if (typeof o.topic !== 'string' || !Array.isArray(o.beats)) {
    throw new Error('Missing topic or beats');
  }
  const beats = o.beats
    .filter((b): b is string => typeof b === 'string' && b.trim().length >= 3)
    .map((b) => b.trim());
  if (beats.length < 1) throw new Error('No valid beats');
  return { topic: o.topic.trim(), beats };
}

export async function schedulePreviewRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } });
    return;
  }

  const body = (req.body ?? {}) as { brief?: unknown; recent_topics?: unknown; asset_type?: unknown };
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
  if (brief.length < 20) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'brief must be at least 20 characters' } });
    return;
  }
  if (brief.length > 1000) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'brief must be 1000 characters or fewer' } });
    return;
  }
  const recentTopics = Array.isArray(body.recent_topics)
    ? (body.recent_topics as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10)
    : [];
  const assetType = typeof body.asset_type === 'string' && ASSET_ADDENDA[body.asset_type]
    ? body.asset_type
    : null;

  // 1. Moderate the input brief. Fail closed: if moderation is
  // unavailable (key missing, OpenAI down), return 503 instead of
  // letting the prompt through without a safety check.
  let inMod: ModerationResult;
  try {
    inMod = await moderate(brief);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[schedule-preview] input moderation unavailable: ${msg}`);
    res.status(503).json({
      error: {
        code: 'MODERATION_UNAVAILABLE',
        message: 'Content moderation is currently unavailable; please try again shortly.',
      },
    });
    return;
  }
  if (inMod.flagged) {
    res.status(400).json({
      error: {
        code: 'BRIEF_BLOCKED',
        message: 'This brief was rejected by content moderation. Revise it and try again.',
        categories: inMod.categories,
      },
    });
    return;
  }

  // 2. Generate via Claude.
  let result: PreviewSuccess;
  try {
    result = await callClaude(brief, recentTopics, assetType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    console.error(`[schedule-preview] generation failed: ${msg}`);
    res.status(502).json({ error: { code: 'GENERATION_FAILED', message: 'Sample generation failed. Try again.' } });
    return;
  }

  // 2a. Honour Claude's own refusal pattern.
  if (result.topic.toUpperCase() === 'BLOCKED') {
    res.status(400).json({
      error: {
        code: 'BRIEF_BLOCKED',
        message: result.beats[0] ?? 'This brief was refused by the model. Revise it and try again.',
      },
    });
    return;
  }

  // 3. Moderate the output. Same fail-closed contract as input moderation.
  const outText = `${result.topic}\n\n${result.beats.join('\n')}`;
  let outMod: ModerationResult;
  try {
    outMod = await moderate(outText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[schedule-preview] output moderation unavailable: ${msg}`);
    res.status(503).json({
      error: {
        code: 'MODERATION_UNAVAILABLE',
        message: 'Content moderation is currently unavailable; please try again shortly.',
      },
    });
    return;
  }
  if (outMod.flagged) {
    res.status(400).json({
      error: {
        code: 'OUTPUT_BLOCKED',
        message: 'The generated script was flagged by content moderation. Try rephrasing the brief.',
        categories: outMod.categories,
      },
    });
    return;
  }

  res.status(200).json(result);
}
