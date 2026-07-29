// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v1/character/storyboard-suggest
 *
 * Returns N storyboard beat options. Each option is an ordered list
 * of short beat strings (e.g. ["downward dog", "tree pose",
 * "child's pose", "namaste at camera"]) that becomes the input to
 * /v1/character/storyboard-generate (which paints them as numbered
 * panels via gpt-image-2).
 *
 * Input shape:
 *   { actor_slug?: string, character_description?: string,
 *     vibe?: string, duration?: 5|10, n_panels?: 4..10 }
 *
 * Output shape:
 *   { options: [{ title: string, beats: string[] }, ...] }   // 3 options
 *
 * No credits are deducted — text-only Claude Opus 4.7 call.
 * Auth-gated like the rest of /v1.
 */

import type { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPUS_MODEL = process.env.CHARACTER_STORYBOARD_MODEL ?? 'claude-opus-4-7';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cachedSupabase: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!cachedSupabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    cachedSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return cachedSupabase;
}

async function callOpus(systemPrompt: string, userMsg: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: OPUS_MODEL,
      max_tokens: 1500,
      // `temperature` is deprecated for Opus 4.7 — Anthropic 400s if sent.
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic error: ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('Anthropic returned empty content');
  return text;
}

const SYSTEM_PROMPT = `You are a video director planning storyboards for an AI video generator (Seedance 2.0). The character has been designed already — you describe the SEQUENCE OF BEATS that will be painted as numbered storyboard panels.

For each story option, return:
- title: a short evocative title (3-7 words, e.g. "Frogdog Yoga Class")
- beats: an ordered array of 4-8 short beat descriptions (each 4-15 words),
  describing one frame/moment that a storyboard panel should depict.

Beats must:
- Be CONCRETE actions, poses, or moments (e.g. "downward dog stretch with tongue out").
- Specify the character ACTING — not a static portrait.
- Flow as a coherent narrative across the panels.
- Stay on-character: the same creature/actor throughout.

Vary the three options: each is a DIFFERENT scenario (e.g. one wholesome, one chaotic, one cinematic).

Return ONLY a JSON object of shape:
{ "options": [{ "title": "...", "beats": ["beat 1", "beat 2", ...] }, ...] }
No prose, no commentary outside the JSON.`;

// When the caller supplies a reference asset (product / SaaS UI / app
// screenshot), feed it as a second image to Seedance and tell the
// director it's available so beats actually pose the character with it.
const ASSET_ADDENDA: Record<string, string> = {
  product: `\n\nReference asset attached: PRODUCT PHOTO. At least 1-2 beats per option must physically involve the product (hold it up, mime using it, set it down). Reference it as "the product" / "it" — the renderer paints it from the photo.`,
  saas_capture: `\n\nReference asset attached: SAAS UI STILL. At least 1-2 beats per option must place the UI in the scene (visible on a monitor / laptop next to the character) and have the character interact with it (point, gesture, react). Keep the shot continuous — no fullscreen cuts.`,
  app_screenshot: `\n\nReference asset attached: APP SCREENSHOT (phone). At least 1-2 beats per option must have the character physically hold a phone showing the screenshot, angled to camera, possibly tapping or pointing at it. No fullscreen cut to the screenshot.`,
};

function systemPromptForAsset(assetType: string | null): string {
  if (!assetType || !ASSET_ADDENDA[assetType]) return SYSTEM_PROMPT;
  return SYSTEM_PROMPT + ASSET_ADDENDA[assetType];
}

type BeatOption = { title: string; beats: string[] };

function buildUserMessage({
  characterLabel,
  vibe,
  duration,
  nPanels,
}: {
  characterLabel: string;
  vibe?: string;
  duration: number;
  nPanels: number;
}) {
  const lines = [
    `Character: ${characterLabel}`,
    `Duration target: ${duration} seconds`,
    `Panels per option: ${nPanels} (the storyboard will be a ${nPanels}-panel grid)`,
    `Output: 3 distinct beat-sequence options as the JSON object specified.`,
  ];
  if (vibe) lines.push(`User vibe note: ${vibe}`);
  return lines.join('\n');
}

function parseStoryboardOptions(raw: string): BeatOption[] {
  // Strip code fences if Claude wrapped the JSON
  const fenceless = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(fenceless) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !('options' in parsed)) {
    throw new Error('Expected an object with an options array');
  }
  const options = (parsed as { options: unknown }).options;
  if (!Array.isArray(options)) {
    throw new Error('Expected options to be an array');
  }
  const valid: BeatOption[] = [];
  for (const opt of options) {
    if (typeof opt !== 'object' || opt === null) continue;
    const o = opt as { title?: unknown; beats?: unknown };
    if (typeof o.title !== 'string' || !Array.isArray(o.beats)) continue;
    const beats = o.beats.filter(
      (b): b is string => typeof b === 'string' && b.trim().length >= 3,
    );
    if (beats.length < 3) continue;
    valid.push({ title: o.title.trim(), beats });
    if (valid.length >= 3) break;
  }
  if (valid.length < 3) {
    throw new Error(`Expected at least 3 valid beat options; got ${valid.length}`);
  }
  return valid;
}

export async function characterStoryboardSuggestRoute(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as {
    actor_slug?: string;
    character_description?: string;
    vibe?: string;
    duration?: number;
    n_panels?: number;
    asset_type?: string;
  };
  const assetType = typeof body.asset_type === 'string' && ASSET_ADDENDA[body.asset_type]
    ? body.asset_type
    : null;

  const hasActor = !!body.actor_slug;
  const hasDescription = !!body.character_description;
  if (hasActor === hasDescription) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Provide exactly one of actor_slug or character_description',
      },
    });
    return;
  }

  const duration = body.duration ?? 10;
  if (![5, 10].includes(duration)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'duration must be 5 or 10' },
    });
    return;
  }

  const nPanels = body.n_panels ?? 6;
  if (nPanels < 4 || nPanels > 10) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'n_panels must be between 4 and 10' },
    });
    return;
  }

  // Build the human-readable character label sent to Claude
  let characterLabel: string;
  if (hasActor) {
    try {
      const { data, error } = await supabase()
        .from('actors')
        .select('slug, name, gender, age, ethnicity, persona_summary')
        .eq('slug', body.actor_slug)
        .eq('status', 'active')
        .maybeSingle();
      if (error || !data) {
        res.status(404).json({
          error: { code: 'ACTOR_NOT_FOUND', message: `Actor '${body.actor_slug}' not found` },
        });
        return;
      }
      const traits = [data.gender, data.age, data.ethnicity].filter(Boolean).join(', ');
      const persona = data.persona_summary ? `. Persona: ${data.persona_summary}` : '';
      characterLabel = `Library actor "${data.name}" (${data.slug})${traits ? ` — ${traits}` : ''}${persona}`;
    } catch (err) {
      console.error('[storyboard-suggest] actor lookup failed:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Actor lookup failed' },
      });
      return;
    }
  } else {
    characterLabel = body.character_description!.trim();
    if (characterLabel.length < 1 || characterLabel.length > 200) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'character_description must be 1–200 characters',
        },
      });
      return;
    }
  }

  try {
    const userMsg = buildUserMessage({
      characterLabel,
      vibe: body.vibe,
      duration,
      nPanels,
    });
    const raw = await callOpus(systemPromptForAsset(assetType), userMsg);
    const options = parseStoryboardOptions(raw);
    res.status(200).json({ options });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[storyboard-suggest] generation failed:', message);
    // If Claude returned malformed JSON, fall back gracefully
    const isParseError = /JSON|Expected/i.test(message);
    res.status(isParseError ? 502 : 500).json({
      error: {
        code: isParseError ? 'LLM_PARSE_ERROR' : 'INTERNAL_ERROR',
        message: isParseError
          ? 'The storyboard model returned malformed output; please try again'
          : 'Storyboard suggestion failed',
      },
    });
  }
}
