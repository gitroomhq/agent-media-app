// Copyright 2026 agent-media contributors. Apache-2.0 license.

import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getAnthropic(apiKey: string): Anthropic {
  // maxRetries: the SDK retries connection errors (incl. undici "Premature
  // close" from a dropped keep-alive socket) with backoff. Default is 2; bump
  // to 5 because the worker hit persistent premature-close on the prompt-build
  // call. timeout caps each attempt so a hung socket fails fast and retries.
  if (!_client) _client = new Anthropic({ apiKey, maxRetries: 5, timeout: 45_000 });
  return _client;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Call Anthropic Messages via plain fetch (like api-v2 does) instead of the
 * SDK. In the worker's container the SDK's pooled keep-alive connections to
 * api.anthropic.com consistently die with undici "Premature close" — a fresh
 * fetch per attempt + an explicit retry (the drop happens during body read,
 * which the SDK does NOT retry) fixes it. Returns the SDK-compatible shape so
 * existing `resp.content.find(...)` call sites are unchanged.
 */
async function createMessageRaw(
  apiKey: string,
  body: { model: string; max_tokens: number; system: string; messages: Array<{ role: string; content: unknown }> },
): Promise<{ content: Array<{ type: string; text?: string }> }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        // temperature:0 → deterministic prompt builds, so successive takes of the
        // same render get a byte-identical non-script prompt (a major source of
        // take-to-take skin/look variance was the default temperature 1.0).
        body: JSON.stringify({ temperature: 0, ...body }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        const err = new Error(`anthropic ${resp.status}: ${t.slice(0, 300)}`) as Error & { status?: number };
        err.status = resp.status;
        if (resp.status >= 400 && resp.status < 500) throw err; // real error — don't retry
        lastErr = err;
      } else {
        // Body read happens here — "Premature close" surfaces on this await.
        return (await resp.json()) as { content: Array<{ type: string; text?: string }> };
      }
    } catch (e) {
      if ((e as { status?: number })?.status && (e as { status?: number }).status! < 500) throw e;
      lastErr = e;
    }
    if (attempt < 3) await sleep(600 * (attempt + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface PortraitPromptInput {
  description: string;
  setting?: string;
  aspect_ratio: '1:1' | '9:16';
  realism_target: 'natural' | 'commercial' | 'raw_iphone';
}

const PORTRAIT_PROMPT_SYSTEM = `You are a portrait-prompt builder for a UGC-style photoreal image model (OpenAI gpt-image-2). Your only job: turn the user inputs below into a single image prompt.

Hard rules:
- Output ONE single sentence. No paragraphs, no line breaks, no markdown, no quotes around it.
- Comma-separated clauses only. Stops are commas. Final period only.
- Output ONLY the prompt. No preamble, no explanation.
- The portrait must look like a real candid iPhone photo of a real person, not an AI render.

Mandatory clauses to bake in every time (paraphrase freely, do not omit):
- Skin realism: natural skin texture, visible pores, subtle freckles or tiny facial hairs, no plastic shine, no airbrushing, no AI artifacts.
- Asymmetry & humanity: subtle facial asymmetries, micro-expressions, genuine eye catchlights, not perfectly symmetrical.
- UGC aesthetic: candid iPhone selfie framing, slight handheld tilt, imperfect framing, subtle digital noise or film grain, deep focus with a SHARP in-focus background (never blurred, no bokeh, no shallow depth of field), a real lived-in slightly messy space behind them, warm iPhone color grade, not studio-perfect.
- Lighting (driven by realism_target):
  * natural -> soft natural window daylight, gentle wrap shadows, ambient room reflection in the eyes.
  * commercial -> clean commercial soft key light, neutral seamless backdrop, subtle catchlights, skin texture still preserved.
  * raw_iphone -> unedited iPhone front camera selfie, raw HDR, slight handheld breathing, mild low-light grain, exposure imperfection.
- Constraints tail: single subject, eyes engaged with camera, no text, no watermark, no logo.

Stay faithful to the user's description and setting. Do not invent contradicting details. Do not flatter or hedge. Just emit the sentence.`;

const CHARACTER_SHEET_PROMPT_SYSTEM = `You build the prompt that gets sent to OpenAI gpt-image-2 /v1/images/edits. The user has uploaded a portrait of a person and wants a character sheet of that same person. gpt-image-2 already knows what a character sheet is — do not over-explain.

Hard rules:
- Output ONE very short sentence. Maximum 12 words. Final period.
- No paragraphs, no markdown, no quotes, no preamble.
- Output ONLY the prompt.

Format:
- If a description is provided: "create a character sheet for <description>."
- If no description: "create a character sheet."

Use the description verbatim — do not paraphrase or expand it. Do not add realism clauses, layout instructions, or constraint tails. The reference image carries identity; keep the prompt minimal.`;

const PORTRAIT_MODEL_DEFAULT = 'claude-haiku-4-5';

/**
 * Synthesize a single-sentence portrait prompt via Claude Haiku.
 *
 * Throws a plain Error on transient failure (Temporal retries the Activity).
 */
export async function buildPortraitPrompt(
  apiKey: string,
  input: PortraitPromptInput,
  model: string = PORTRAIT_MODEL_DEFAULT,
): Promise<string> {
  const userJson = JSON.stringify(
    {
      description: input.description,
      setting: input.setting ?? null,
      aspect_ratio: input.aspect_ratio,
      realism_target: input.realism_target,
    },
    null,
    2,
  );
  const resp = await createMessageRaw(apiKey, {
    model,
    max_tokens: 600,
    system: PORTRAIT_PROMPT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: userJson,
      },
    ],
  });
  const block = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) {
    throw new Error('haiku: empty response — no text block');
  }
  const text = block.text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (text.length === 0) {
    throw new Error('haiku: empty prompt text');
  }
  // Enforce single sentence (collapse any newlines into spaces).
  return text.replace(/\s*\n+\s*/g, ' ');
}

const SIMPLE_SELFIE_PROMPT_SYSTEM = `You build the prompt sent to Seedance 2.0 for a SHORT VERTICAL TALKING-HEAD CLOSE-UP of the person in the reference image (a character sheet). Think TikTok front-facing close-up, NOT a phone-in-hand pose.

Hard rules:
- Output ONE single sentence. Comma-separated clauses. Final period.
- No paragraphs, no markdown, no quotes, no preamble. Output ONLY the prompt.
- Identity locks to the reference image — same person.
- AVOID the word "selfie" entirely — Seedance treats it as a visual prior and puts a phone in the subject's hands. Use one of these instead, rotating naturally:
  * "vertical TikTok-style close-up"
  * "vertical talking-head close-up"
  * "front-facing close-up"
  * "iPhone-style vertical close-up"

Phone / hand rules (THIS IS THE DEFAULT — do not override unless the user's pose hint explicitly says otherwise):
- NO phone visible anywhere in frame.
- Hands empty. Arms relaxed at the sides or naturally gesturing.
- The camera floats in front of the subject as if mounted — not held by the subject.
- ONLY if the user's pose hint explicitly mentions "phone", "selfie", "holding phone", or "filming themselves" should you allow a phone in hand. In that case honor the hint verbatim.

SPEECH vs NON-SPEECH (decide from the input):
- If "script" is provided: the subject SAYS it VERBATIM with natural lip-sync, natural pauses, breathing, micro filler beats. Do not paraphrase the script. This is a talking-head.
- If "scene_action" is provided instead (no script): the subject PERFORMS that action (e.g. dancing, laughing, showing a product) with NO spoken dialogue, NO lip-sync, mouth not forming words. This is a non-speech b-roll/vibes clip.
- "background_music": if true, add "soft upbeat background music, no spoken dialogue"; if a string, use it as the music direction (e.g. "lo-fi jazz"), still no dialogue. If absent and there is no script, keep it ambient/natural-sound.

Mandatory clauses (paraphrase, do not omit):
- Framing: vertical 9:16 close-up, framed chest-up to waist-up, looking directly into the camera (unless scene_action implies a wider action shot).
- Camera feel: subtle handheld breathing motion, micro head tilts, candid not staged. Deep focus like a front phone camera — the background stays SHARP and in focus, NEVER blurred, no bokeh, no shallow depth of field.
- Natural gestures while talking (IMPORTANT for realism — include, but keep subtle): the subject makes small spontaneous movements as they speak — occasionally tucks or touches their hair, a light touch to the face or neck, small expressive hand gestures, a slight shoulder shift or lean. Noticeable but sparing and unforced — one or two beats over the clip, never constant fidgeting or distracting.
- LIGHTING (CRITICAL — this is the #1 realism failure, never skip it): flat, soft, even ambient light like an ordinary room or plain window light. ABSOLUTELY NO studio lighting, NO ring light, NO softbox, NO key/fill setup, NO professional or cinematic lighting of any kind. NO specular highlights, NO glare, NO bright hotspots, NO shiny or glossy sheen or reflection on the skin, forehead, cheeks, or nose. Skin stays MATTE and naturally textured, slightly uneven everyday exposure like a normal phone front camera — never a lit "set".
- Realism: same skin texture, visible pores, subtle asymmetries, micro-expressions as the reference; matte non-shiny skin, no plastic or wet sheen, no AI gloss.
- Setting: use the user's location hint if provided; otherwise an ordinary everyday indoor space with soft even ambient light — never a studio, never a professionally lit backdrop. The background is a real lived-in space, kept SHARP and in focus, and a bit messy/cluttered if it's a room (everyday clutter — mugs, books, clothes, plants, cables) — not staged, not spotless, not blurred.
- Pose: use the user's pose hint if provided (honoring the phone rule above).
- Constraints: no text overlay, no captions, no watermark, no logo.

If a script is present, embed it as the spoken line. If only scene_action is present, do NOT invent dialogue.`;

export interface SimpleSelfiePromptInput {
  script?: string;
  scene_action?: string;
  background_music?: boolean | string;
  duration: 5 | 10 | 15;
  location?: string;
  pose?: string;
  aspect_ratio: '9:16' | '1:1';
}

export async function buildSimpleSelfiePrompt(
  apiKey: string,
  input: SimpleSelfiePromptInput,
  model: string = PORTRAIT_MODEL_DEFAULT,
): Promise<string> {
  const userJson = JSON.stringify(
    {
      script: input.script ?? null,
      scene_action: input.scene_action ?? null,
      background_music: input.background_music ?? null,
      duration_seconds: input.duration,
      location: input.location ?? null,
      pose: input.pose ?? null,
      aspect_ratio: input.aspect_ratio,
    },
    null,
    2,
  );
  const resp = await createMessageRaw(apiKey, {
    model,
    max_tokens: 700,
    system: SIMPLE_SELFIE_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userJson }],
  });
  const block = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('haiku: empty response — no text block');
  const text = block.text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (text.length === 0) throw new Error('haiku: empty prompt text');
  return text.replace(/\s*\n+\s*/g, ' ');
}

const PRODUCT_IN_HANDS_PROMPT_SYSTEM = `You build the prompt sent to Seedance 2.0 for a SHORT VERTICAL UGC CLIP where a person HOLDS and SHOWS a product in their hands. There are TWO reference images: the FIRST is the PERSON (a character sheet — identity locks to them), the SECOND is the PRODUCT (the exact item they hold). Think TikTok product review / unboxing close-up.

Hard rules:
- Output ONE single sentence. Comma-separated clauses. Final period.
- No paragraphs, no markdown, no quotes, no preamble. Output ONLY the prompt.
- Identity locks to the FIRST reference (same person). The PRODUCT locks to the SECOND reference — same exact object: same shape, color, label, text, and branding. Do NOT redesign, restyle, or rename the product; reproduce it faithfully as shown.
- GENDER / IDENTITY LOCK (critical): if a "subject" is provided (e.g. "a young woman", "a man in his 40s"), the person IS that subject — open the prompt naming them as that subject and reproduce the first reference's exact face, hair, skin tone and gender. The SECOND reference is ONLY a product they hold or wear; it must NEVER change the person's gender, age, face, or body. A gendered product (e.g. a football kit, men's cologne, a dress) does NOT change who the person is — keep the subject from the first reference no matter what the product implies. If no subject is given, still preserve the exact gender and appearance of the first reference.
- AVOID the word "selfie" entirely — it makes Seedance add a phone. Use "vertical TikTok-style close-up", "vertical talking-head close-up", "front-facing close-up", or "iPhone-style vertical close-up", rotating naturally.

PRODUCT-IN-HANDS rules (this is the whole point — the subject's hands are NOT empty):
- The subject holds the product from the second reference image in one or both hands (or wears it, for apparel), clearly visible to the camera.
- They naturally present it: turning or tilting it to show the label/front, holding it up, gesturing toward it. Movement is candid, not a rigid product-shot.
- NO phone in frame (unless the product itself is a phone). The camera floats in front as if mounted, not held by the subject.
- FRAMING (read the "framing" field in the input):
  * "close_up" (default): vertical 9:16, framed chest-up, both the face AND the held product visible together, product in the lower-center of frame.
  * "full_body": vertical 9:16 FULL-BODY head-to-toe shot — the ENTIRE person is visible from head to feet with room around them, standing; they wear and/or hold the product and can turn or rotate to show themselves and the outfit from front, side and back. This is NOT a close-up — show the whole body. The camera may be a little further back. The face is still recognizable as the same subject.

SPEECH vs NON-SPEECH (decide from the input):
- If "script" is provided: the subject SAYS it VERBATIM with natural lip-sync (natural pauses, breathing, micro filler beats) WHILE holding/showing the product. Do not paraphrase the script. This is a talking-head product review.
- If "scene_action" is provided instead (no script): the subject silently DEMOS the product as described (e.g. turning the bottle to show the label) with NO spoken dialogue, NO lip-sync, mouth not forming words.
- "background_music": if true, add "soft upbeat background music, no spoken dialogue"; if a string, use it as the music direction, still no dialogue. If absent and there is no script, keep it ambient/natural-sound.

Mandatory clauses (paraphrase, do not omit):
- Camera feel: subtle handheld breathing motion, micro head tilts, candid not staged. Deep focus like a front phone camera — the background stays SHARP and in focus, NEVER blurred, no bokeh, no shallow depth of field.
- Natural gestures (IMPORTANT for realism, keep subtle): small spontaneous movements — repositioning the product, a light touch to the face or hair with the free hand, a slight shoulder shift or lean. Noticeable but sparing, never constant fidgeting.
- LIGHTING (CRITICAL — the #1 realism failure, never skip it): flat, soft, even ambient light like an ordinary room or plain window light. ABSOLUTELY NO studio lighting, NO ring light, NO softbox, NO key/fill setup, NO professional or cinematic lighting. NO specular highlights, NO glare, NO bright hotspots, NO shiny or glossy sheen on the skin. Skin stays MATTE and naturally textured, everyday phone-camera exposure — never a lit "set".
- Realism: same skin texture, visible pores, subtle asymmetries, micro-expressions as the reference; matte non-shiny skin, no plastic or wet sheen, no AI gloss.
- Setting: use the user's location hint if provided; otherwise an ordinary everyday indoor space with soft even ambient light — never a studio. The background is a real lived-in space, kept SHARP and in focus, a bit messy/cluttered if it's a room (mugs, books, clothes, plants, cables) — not staged, not spotless, not blurred.
- Pose: use the user's pose hint if provided.
- Constraints: no text overlay, no captions, no watermark, no logo (other than branding already on the product itself).

If a script is present, embed it as the spoken line. If only scene_action is present, do NOT invent dialogue.`;

export interface ProductInHandsPromptInput {
  script?: string;
  scene_action?: string;
  subject?: string;
  framing?: 'close_up' | 'full_body';
  background_music?: boolean | string;
  duration: 5 | 10 | 15;
  location?: string;
  pose?: string;
  aspect_ratio: '9:16' | '1:1';
}

export async function buildProductInHandsPrompt(
  apiKey: string,
  input: ProductInHandsPromptInput,
  model: string = PORTRAIT_MODEL_DEFAULT,
): Promise<string> {
  const userJson = JSON.stringify(
    {
      script: input.script ?? null,
      scene_action: input.scene_action ?? null,
      subject: input.subject ?? null,
      framing: input.framing ?? 'close_up',
      background_music: input.background_music ?? null,
      duration_seconds: input.duration,
      location: input.location ?? null,
      pose: input.pose ?? null,
      aspect_ratio: input.aspect_ratio,
    },
    null,
    2,
  );
  const resp = await createMessageRaw(apiKey, {
    model,
    max_tokens: 700,
    system: PRODUCT_IN_HANDS_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userJson }],
  });
  const block = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('haiku: empty response — no text block');
  const text = block.text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (text.length === 0) throw new Error('haiku: empty prompt text');
  return text.replace(/\s*\n+\s*/g, ' ');
}

const WIREFRAME_PROMPT_SYSTEM = `You build the prompt sent to OpenAI gpt-image-2 /v1/images/edits. The user has uploaded a character sheet of one person and wants a photographic storyboard / wireframe board showing them performing a script. gpt-image-2 already knows what a storyboard is — keep the prompt minimal.

Hard rules:
- Output ONE short sentence. Maximum 25 words. Final period.
- No paragraphs, no markdown, no quotes, no preamble.
- Output ONLY the prompt.

Format:
- "Create a photographic storyboard with <N> numbered panels of the same person from the reference, performing: <script verbatim>."

Use N (the n_panels number) and the script verbatim. Do not paraphrase. Do not add realism clauses or layout instructions — the reference image carries identity; gpt-image-2 handles the layout.`;

export interface WireframePromptInput {
  script: string;
  n_panels: number;
  aspect_ratio: '9:16' | '1:1' | '16:9';
}

export async function buildWireframePrompt(
  apiKey: string,
  input: WireframePromptInput,
  model: string = PORTRAIT_MODEL_DEFAULT,
): Promise<string> {
  const userJson = JSON.stringify(
    { script: input.script, n_panels: input.n_panels, aspect_ratio: input.aspect_ratio },
    null,
    2,
  );
  const resp = await createMessageRaw(apiKey, {
    model,
    max_tokens: 400,
    system: WIREFRAME_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userJson }],
  });
  const block = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('haiku: empty response — no text block');
  const text = block.text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (text.length === 0) throw new Error('haiku: empty prompt text');
  return text.replace(/\s*\n+\s*/g, ' ');
}

export interface CharacterSheetPromptInput {
  description?: string;
  aspect_ratio: '1:1' | '9:16';
}

export async function buildCharacterSheetPrompt(
  apiKey: string,
  input: CharacterSheetPromptInput,
  model: string = PORTRAIT_MODEL_DEFAULT,
): Promise<string> {
  const userJson = JSON.stringify(
    {
      description: input.description ?? null,
      aspect_ratio: input.aspect_ratio,
    },
    null,
    2,
  );
  const resp = await createMessageRaw(apiKey, {
    model,
    max_tokens: 700,
    system: CHARACTER_SHEET_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userJson }],
  });
  const block = resp.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!block) throw new Error('haiku: empty response — no text block');
  const text = block.text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (text.length === 0) throw new Error('haiku: empty prompt text');
  return text.replace(/\s*\n+\s*/g, ' ');
}
