// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Persona brief generator.
 *
 * Single Claude call that turns a free-text character description into
 * a 9-field locked persona brief. Used at character creation time so
 * the brief gets stored on user_characters and reused across every
 * future video that references the saved character — eliminating
 * cross-video identity drift.
 *
 * Output shape (BRIEF_KEYS):
 *   {
 *     age, ethnicity, build, hair, face_features,
 *     skin_tone, clothing, energy, signature_mannerism
 *   }
 *
 * All fields are strings. Empty string means the model could not
 * confidently infer the field — the caller treats those as gaps the
 * downstream sheet prompt should leave open rather than guess.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL =
  process.env.PERSONA_BRIEF_MODEL ??
  process.env.SELFIE_ORCHESTRATOR_MODEL ??
  'claude-opus-4-7';

export const BRIEF_KEYS = [
  'age', 'ethnicity', 'build', 'hair', 'face_features',
  'skin_tone', 'clothing', 'energy', 'signature_mannerism',
];

const SYSTEM_PROMPT = `You are agent-media's persona-brief generator.

You receive a free-text character description. Your job is to produce a 9-field locked persona brief that fully describes the character — every visible detail explicit, no ambiguity.

This brief gets stored on the character and re-used across every video that references this character. Vague brief ⇒ different person in every video.

Output ONLY valid JSON. No markdown. No commentary. No code fence.

Required JSON shape (all 9 fields, all strings):
{
  "age": "string (e.g. '30-35')",
  "ethnicity": "string (e.g. 'south-asian', 'mediterranean', 'east-asian')",
  "build": "string (e.g. 'slim', 'athletic', 'average build', 'soft')",
  "hair": "string (color, length, style, parting — be specific)",
  "face_features": "string (eye color, eye shape, brow, nose, jaw, marks, freckles)",
  "skin_tone": "string (e.g. 'warm olive', 'fair with freckles', 'deep cool brown')",
  "clothing": "string (default outfit fabric, color, fit, length — be exact)",
  "energy": "string (default tone, e.g. 'warm casual', 'calm grandmotherly', 'sharp pro')",
  "signature_mannerism": "string (one specific micro-gesture, e.g. 'wipes hands on apron mid-sentence')"
}

Rules:
- Fill ALL 9 fields. Leave none empty.
- Infer plausibly from the description. If the description says "30yo Israeli male", fill age='30', ethnicity='Mediterranean / Israeli', then choose plausible defaults for the rest.
- For signature_mannerism, pick ONE specific micro-gesture that matches the persona. This is what makes the character feel like a person.
- Brief details that contradict the description = FORBIDDEN. If the description says "blonde", do not put "brown hair" in the brief.
- Keep each field short and visual — one short sentence max per field.`;

function stripCodeFence(text) {
  return String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('persona-brief: model did not return JSON');
  }
}

/**
 * Generate a locked persona brief from a free-text description.
 *
 * @param {object} params
 * @param {string} params.description  free-text character description
 * @param {string} [params.jobId]      tracking id (for logs)
 * @returns {Promise<Record<string, string>>}  9-field brief
 */
export async function generatePersonaBrief({ description, jobId }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — persona brief generation requires it.');
  }
  if (typeof description !== 'string' || description.trim().length < 3) {
    throw new Error('persona-brief: description (≥3 chars) required');
  }

  const user = [
    'Character description:',
    description.trim(),
    '',
    'Return the 9-field persona brief JSON now.',
  ].join('\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`persona-brief: Anthropic ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('persona-brief: Anthropic returned empty content');

  const parsed = parseJsonObject(text);

  // Coerce to a strict 9-field object — missing keys become empty strings.
  const brief = Object.fromEntries(
    BRIEF_KEYS.map((k) => {
      const v = parsed[k];
      return [k, typeof v === 'string' ? v.trim() : ''];
    }),
  );

  const filled = BRIEF_KEYS.filter((k) => brief[k]).length;
  console.log(`[persona-brief${jobId ? `:${jobId}` : ''}] model=${MODEL} fields_filled=${filled}/${BRIEF_KEYS.length}`);
  return brief;
}
