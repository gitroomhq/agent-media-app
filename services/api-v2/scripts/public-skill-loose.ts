// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The loose-surface skill pack. Imported by generate-public-skill.ts and
 * used when AGENT_SURFACE is not 'fixed' (the default, matching the
 * connector in services/api-v2/src/routes/mcp.ts).
 *
 * Everything an agent needs to make media with agent-media when the
 * agent is the director: the four tools, how to write a prompt that
 * comes out real, which model for what, the recipes the fixed skills
 * used to hard-code, and the price of each move. Facts come from
 * @agentmedia/schema/v2 (the catalog, the schemas); the prose is the
 * recommendation layer.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  V2_MODELS,
  V2_DEFAULT_MODEL,
  V2_VOICES,
  V2_IMAGE_SIZES,
  V2_VIDEO_ASPECTS,
  GenerateVideoSchema,
  GenerateAudioSchema,
  GenerateImageSchema,
  liveModels,
  quoteGenerate,
} from '@agentmedia/schema/v2';

/** The exact tool names the hosted connector lists on the loose surface. */
export const LOOSE_TOOLS = [
  'generate_video',
  'generate_image',
  'generate_audio',
  'quote',
  'list_models',
  'list_characters',
  'get_run_status',
  'upload_image',
] as const;

const MCP = 'https://api.agent-media.ai/mcp';
const API = 'https://api.agent-media.ai';

function credits(kind: 'video' | 'image' | 'audio', input: Record<string, unknown>): number {
  const schema = kind === 'video' ? GenerateVideoSchema : kind === 'image' ? GenerateImageSchema : GenerateAudioSchema;
  return quoteGenerate(kind as 'video', schema.parse(input) as never).credits;
}

/** The rubric the fixed pipelines injected server-side, read from the worker so the pack never drifts from it. */
export function realismRubric(repoRoot: string): string {
  const src = readFileSync(resolve(repoRoot, 'services/media-worker-v2/src/v2/realism.js'), 'utf-8');
  const m = src.match(/export const REALISM_RUBRIC = `([\s\S]*?)`;/);
  if (!m) throw new Error('REALISM_RUBRIC not found in services/media-worker-v2/src/v2/realism.js');
  return m[1].trim();
}

export function loosePluginDescription(): string {
  return 'Agent-Media — AI video, image and voice for agents, the loose way: you write the prompt, you pick the model (seedance-2.0, seedance-2.5, gpt-image-2, elevenlabs-tts…), you pass reference images. Four tools: generate_video, generate_image, generate_audio, quote. list_models tells you what each model is good for and what it costs. One MCP URL, browser sign-in.';
}

export function looseReadme(): string {
  const live = liveModels();
  return [
    '# agent-media — Claude Skill plugin',
    '',
    '[![npm — mcp-server](https://img.shields.io/npm/v/%40agentmedia%2Fmcp-server?label=%40agentmedia%2Fmcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)',
    '[![npm — CLI](https://img.shields.io/npm/v/agent-media-cli?label=agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)',
    '[![Claude plugin](https://img.shields.io/badge/claude-%2Fplugin%20install-A78BFA)](https://github.com/gitroomhq/agent-media-app)',
    '[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)',
    '',
    '**Agents: read this page, then [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md). That is everything.**',
    '',
    'agent-media renders video, images and voice from YOUR prompt on the model YOU choose. There is no fixed recipe: you describe the shot like a director, pass reference images for identity, pick a model from the catalog (or take the default), and poll for the URL. Works in Claude Code, Claude.ai, Cursor, Codex, Grok, or any MCP / HTTP agent.',
    '',
    '## 1. Connect — no API key needed',
    '',
    '```',
    MCP,
    '```',
    '',
    'The hosted connector speaks OAuth 2.1 with dynamic client registration: your agent registers itself, opens a sign-in page, and gets a token. Nothing to copy.',
    '',
    '**Paste this to your agent and it sets itself up:**',
    '',
    '```text',
    'Set up agent-media for me so I can generate videos, images and voice from here.',
    `1. Add the agent-media MCP server: ${MCP} (Streamable HTTP).`,
    '2. Authenticate: complete the sign-in in the browser it opens.',
    '3. Install the companion skill: run `npx skills add gitroomhq/agent-media-app`.',
    "Once that's done, call list_models and tell me what you can make.",
    '```',
    '',
    'Other routes: **Claude.ai / Desktop** → Settings → Connectors → add custom connector → paste the URL → Connect. **Claude Code** → `claude mcp add --transport http agent-media ' + MCP + '`. **Codex** → `codex mcp add agent-media --url ' + MCP + '`. **Grok** → `grok mcp add agent-media -t http ' + MCP + '`. **Claude Code plugin** → `/plugin marketplace add gitroomhq/agent-media-app` then `/plugin install agent-media@agent-media`.',
    '',
    '## 2. Auth',
    '',
    'OAuth (above) is the default and needs no key. You need credits on the account — buy at agent-media.ai. 1 credit = $0.01.',
    '',
    '**API keys** remain supported for CI, scripts, and the local stdio server (`npx @agentmedia/mcp-server`): get one with `npm i -g agent-media-cli && agent-media login` or from the dashboard, then send `Authorization: Bearer ma_...` — including to the same hosted URL above.',
    '',
    '## 3. The tools',
    '',
    '| Tool | What it does | Credits |',
    '|---|---|---|',
    `| \`generate_video\` | A clip from your prompt (+ reference images) on the model you pick. Native speech when the words are in the prompt. | seconds × the model's per-second rate (seedance-2.0: ${V2_MODELS['seedance-2.0'].credits!.perUnit}/s, seedance-2.5: ${V2_MODELS['seedance-2.5'].credits!.perUnit}/s) |`,
    `| \`generate_image\` | One image from your prompt; with refs it edits/composes from them. The way to build a portrait or product frame for a video. | ${V2_MODELS['gpt-image-2'].credits!.perUnit} per image |`,
    '| `generate_audio` | Text to speech in a named voice. For voiceover over b-roll — a talking head does not need it. | 1 per 100 characters |',
    '| `quote` | The price of any of the above without running it. | 0 |',
    '| `list_models` | The catalog: what each model is good and bad at, limits, price, how to select it. | 0 |',
    '| `list_characters` | Saved characters (sheet + portrait URLs) to pass as `refs`. | 0 |',
    '| `get_run_status` | Poll a job id until it is done; returns the URL. | 0 |',
    '| `upload_image` | Bytes in, https URL out. Call it before passing a photo. | 0 |',
    '',
    '## 4. Ten-second tour',
    '',
    '```text',
    'generate_video { "prompt": "A 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \\"Okay, I did not expect this to actually work.\\" Natural skin, soft window light, slight head tilt.", "seconds": 5 }',
    '→ job_id … (150 credits)',
    'get_run_status { "run_id": "…", "wait": true }   (repeat until completed)',
    '→ Video: https://…/video.mp4',
    '```',
    '',
    'Same face across a series: `generate_image` a portrait once, then pass that URL in `refs` on every `generate_video`. Product in hand: pass the product photo (via `upload_image`) in `refs` and say where it is in the prompt.',
    '',
    '## 5. Models',
    '',
    '| Model | Kind | Price | Best for |',
    '|---|---|---|---|',
    ...live.map((m) => `| \`${m.id}\`${m.id === V2_DEFAULT_MODEL[m.kind] ? ' (default)' : ''} | ${m.kind} | ${m.credits!.perUnit} credits/${m.credits!.unit} | ${m.bestFor.slice(0, 2).join('; ')} |`),
    '',
    'Full guide with the avoid-for column and one page per model: [reference/models.md](reference/models.md). Planned models are listed there too — they cannot be selected until a real run is recorded.',
    '',
    '## 6. REST',
    '',
    '- `POST ' + API + '/v2/generate/{video|image|audio}` (Bearer, JSON body = the tool arguments) → `201 { job_id, credits_deducted, status_url }`',
    '- `POST ' + API + '/v2/quote/{video|image|audio}` → `{ credits, usd, model, breakdown }`',
    '- `GET ' + API + '/v1/videos/{job_id}` → `{ status, video_url }` (the URL is an image or mp3 for those kinds)',
    '- `GET ' + API + '/v1/models` → the catalog, public',
    '- Exact input schemas: MCP `tools/list`, or [reference/tools.md](reference/tools.md). Trust those over any hand-written list.',
    '',
    '## Publish to social',
    '',
    "Post a generated video to the user's TikTok / Instagram / X via `POST /v1/social/*` — see [skills/publish-to-social/SKILL.md](skills/publish-to-social/SKILL.md).",
    '',
    '## Reference docs',
    '',
    '- [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md) — the skill: prompting, recipes, rules',
    '- [reference/models.md](reference/models.md) — which model for what, with prices',
    '- [reference/prompting.md](reference/prompting.md) — how to write a prompt that comes out real',
    '- [reference/recipes.md](reference/recipes.md) — talking head, product in hand, crazy look, b-roll voiceover, series',
    '- [reference/tools.md](reference/tools.md) — every tool with its exact input schema',
    '- [reference/auth.md](reference/auth.md) — first-time setup',
    '',
    '## How this repo is built',
    '',
    'This directory is generated from the agent-media monorepo (`pnpm --filter api-v2 gen:public-skill`); CI fails if it drifts from the code. Do not hand-edit.',
    '',
    'License: Apache-2.0.',
    '',
  ].join('\n');
}

export function looseSkillBody(repoRoot: string): string {
  const v5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5 });
  const v10 = credits('video', { prompt: 'x'.repeat(10), seconds: 10 });
  const v15 = credits('video', { prompt: 'x'.repeat(10), seconds: 15 });
  const p5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5, model: 'seedance-2.5' });
  const img = credits('image', { prompt: 'portrait' });
  return [
    '# agent-media — the skill',
    '',
    'You are the director. agent-media gives you three primitives and a model catalog; there is no fixed recipe between your intent and the render. Read this once; it is the whole manual.',
    '',
    '## The loop',
    '',
    '1. **Decide the shot** in words: who, where, what happens, camera, and — if anyone speaks — the exact words in quotes.',
    '2. **Pick the model.** Omit `model` and you get the default (' + `\`${V2_DEFAULT_MODEL.video}\`` + ' for video, `' + V2_DEFAULT_MODEL.image + '` for images, `' + V2_DEFAULT_MODEL.audio + '` for speech). Call `list_models` when the job is unusual — it says what each model is good at, bad at, and what it costs. Only live models are accepted; naming a planned one returns the live list.',
    '3. **Get identity right.** Same face across clips ⇒ pass the same reference URL in `refs` every time. Make the reference with `generate_image` (a clean portrait), take it from `list_characters` (a saved character sheet), or `upload_image` the user\'s photo.',
    '4. **Quote if the user cares about cost** (`quote` costs nothing), then call the tool.',
    '5. **Poll `get_run_status`** with the job id (`wait: true`) until it is `completed`, and hand the user the URL. Never report success before you hold the URL.',
    '',
    '## The tools',
    '',
    `### generate_video — ${v5} / ${v10} / ${v15} credits for 5 / 10 / 15s on seedance-2.0 (${p5} for 5s on seedance-2.5)`,
    '',
    '```json',
    '{',
    '  "prompt": "A 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \\"Okay, I did not expect this to actually work.\\" Natural skin texture, soft window light, slight head tilt, hands busy with the bottle.",',
    '  "refs": ["https://…/portrait.png"],',
    '  "seconds": 5,',
    '  "aspect": "9:16",',
    '  "audio": true',
    '}',
    '```',
    '',
    `- \`seconds\` 4–15, \`aspect\` ${V2_VIDEO_ASPECTS.map((a) => `\`${a}\``).join(' or ')}, \`refs\` up to 4 https URLs, \`seed\` for a repeatable take, \`model\` a live video id.`,
    '- With `refs` the model keeps that person / product / look (reference-to-video). Without, it invents one from the prompt (text-to-video).',
    '- Speech: put the exact words in quotes in the prompt and leave `audio: true`. The model renders the voice and lip-sync natively — you do not need `generate_audio` for a talking head.',
    '- Pace the words: ~2.3 words per second. 5s ≈ 10–12 words, 10s ≈ 20–25, 15s ≈ 30–35. A longer script is several clips.',
    '',
    `### generate_image — ${img} credits`,
    '',
    '```json',
    '{ "prompt": "Head-and-shoulders portrait of a 28-year-old woman, warm smile, soft window light, phone camera, natural skin, plain kitchen behind her", "size": "1024x1536" }',
    '```',
    '',
    `- \`size\` ${V2_IMAGE_SIZES.map((s) => `\`${s}\``).join(', ')} (portrait is the default). With \`refs\` it edits/composes from them: put a product into a hand, re-light a portrait, pose a character sheet.`,
    '- This is how you make the reference a series needs. One portrait, then every clip cites it.',
    '',
    '### generate_audio — 1 credit per 100 characters',
    '',
    '```json',
    `{ "text": "[excited] Three things nobody tells you about launching…", "voice": "${Object.keys(V2_VOICES)[1]}", "tone": "energetic" }`,
    '```',
    '',
    `- Voices: ${Object.entries(V2_VOICES).map(([n, v]) => `\`${n}\` (${v.note})`).join(', ')}; or a raw ElevenLabs voice id. Emotion tags like \`[excited]\`, \`[whispers]\` are honoured.`,
    '- Use it for voiceover over b-roll or a standalone audio file. Not for a talking head (see generate_video).',
    '',
    '### quote',
    '',
    '`{ "kind": "video", "input": { …the same arguments… } }` → credits, USD, model, breakdown. Nothing is rendered.',
    '',
    '### list_models · list_characters · get_run_status · upload_image',
    '',
    'All free. `list_models` is the recommendation layer — read it before an unusual job. `list_characters` returns saved characters with `character_sheet_url` / portrait URLs for `refs`. `get_run_status` takes any job id this server gave you. `upload_image` turns bytes or a foreign URL into an https URL — never paste base64 into a tool call.',
    '',
    '## Writing a prompt that comes out real',
    '',
    'The fixed pipelines used to inject this rubric into every prompt. Now it is yours to include — put the relevant lines in your `prompt`, in your own words:',
    '',
    '```text',
    realismRubric(repoRoot),
    '```',
    '',
    'Also: name the age, the setting and the light; say what the hands are doing; do not write "selfie" or "phone" unless the phone should be visible; keep to one person unless it is a two-shot; quote the spoken words verbatim.',
    '',
    'Full guide: [reference/prompting.md](../../reference/prompting.md).',
    '',
    '## Recipes',
    '',
    'The things the old fixed skills did, as prompts you write yourself — see [reference/recipes.md](../../reference/recipes.md) for the full versions:',
    '',
    '- **Talking-head UGC** — generate_video with the script in quotes; a portrait in `refs` if the face must persist.',
    '- **Product in hand** — upload_image the product → generate_image "…holding <product> up to the lens" with the product URL in refs → generate_video with that frame in refs.',
    '- **Crazy look** — silent 5s extreme close-up, one exaggerated expression held to the lens, `audio: false`; burn the caption in your editor or ask for it in the prompt.',
    '- **B-roll voiceover** — generate_audio the narration; the user overlays it on their footage (agent-media does not mux external video on this surface).',
    '- **A series with one face** — one generate_image portrait, then N generate_video calls with the same `refs` and the same `seed` family.',
    '- **Hero clip** — the one clip that must be the best: `model: "seedance-2.5"` (≈3x the credits). Never for drafts or bulk.',
    '',
    '## Rules',
    '',
    '- Ask before spending big: quote a 15s seedance-2.5 clip before running it.',
    '- Default model for everything unless the user asked for the best possible single clip.',
    '- Every image URL must be https (upload_image first). Refs are kept private to the account.',
    '- Poll until `completed`; a clip takes a few minutes, an image under a minute, audio seconds. If a job fails, the credits are refunded automatically — say so and retry with a clearer prompt.',
    '- Do not claim a video exists until get_run_status returned its URL.',
    '',
    '## Errors',
    '',
    '- `VALIDATION_ERROR` with `model` in the message — you named a planned or unknown model; the message lists the live ones.',
    '- `INSUFFICIENT_CREDITS` — the account is out; point the user to agent-media.ai billing.',
    '- `TOO_MANY_ACTIVE_VIDEOS` — wait for one to finish.',
    '- `CONTENT_POLICY_BLOCKED` — the provider refused the prompt or the reference; rephrase, or use a different image.',
    '',
  ].join('\n');
}

export function refPrompting(repoRoot: string): string {
  return [
    '# Prompting for real-looking output',
    '',
    'On the loose surface the prompt is yours, so the realism work the fixed pipelines did server-side is now in your hands. This page is what they injected, and how to use it.',
    '',
    '## The rubric (verbatim from the worker)',
    '',
    '```text',
    realismRubric(repoRoot),
    '```',
    '',
    '## How to use it',
    '',
    '- Write the shot as prose, not tags. The models read sentences better than keyword lists.',
    '- Order: who (age, look) → where (setting, light) → what they do with their hands → camera (phone framing, slight off-axis) → the spoken words in quotes.',
    '- Pick 4–6 rubric lines that matter for THIS shot and fold them in naturally: "natural skin texture, soft window light, slight head tilt, hands busy with the bottle".',
    '- For a series, keep the wording of the person and setting identical across calls and pass the same `refs`.',
    '- Do not say "selfie" or "phone" unless a phone should be in the frame; say "talking to camera".',
    '- Speech: quote the words verbatim; ~2.3 words per second.',
    '',
    '## Two worked prompts',
    '',
    '**Talking head, 5s, seedance-2.0**',
    '',
    '> A 28-year-old woman in a bright apartment kitchen, phone-camera framing slightly off-axis, natural skin texture with a little T-zone sheen, soft window daylight from the left and a warm lamp behind her. She holds a small amber serum bottle up near her cheek, tilts her head and says: "Okay. I did not expect this to actually work." Eyes just off the lens, mouth caught mid-word.',
    '',
    '**Product frame, generate_image with the product photo in refs**',
    '',
    '> The same woman holding THIS bottle (from the reference) up to the lens with both hands, label facing camera, bedroom corner, soft window light, phone photo, natural skin, no beauty-filter glow.',
    '',
  ].join('\n');
}

export function refRecipes(): string {
  const v5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5 });
  const img = credits('image', { prompt: 'portrait' });
  return [
    '# Recipes',
    '',
    'What the fixed skills used to do, as sequences of the loose tools. Prices are for seedance-2.0 unless stated; 1 credit = $0.01.',
    '',
    '## 1. Talking-head UGC clip',
    '',
    `1. \`generate_video\` — script in quotes in the prompt, \`seconds\` from the word count (~2.3 w/s), \`refs\` = a portrait if the face must persist. **${v5} credits for 5s.**`,
    '2. `get_run_status` until completed.',
    '',
    '## 2. Product in hand',
    '',
    '1. `upload_image` the product photo → URL.',
    `2. \`generate_image\` — "… holding THIS product up to the lens, label facing camera …" with the product URL (and a portrait, if any) in \`refs\`. **${img} credits.**`,
    '3. `generate_video` — the frame URL in `refs`, the pitch in quotes. The product stays the product.',
    '',
    '## 3. Crazy look (silent reaction clip)',
    '',
    '1. `generate_video` — "Extreme close-up, face fills the frame, one exaggerated bug-eyed shock held straight into the lens, slow lean-in, no speech", `audio: false`, `seconds: 5`, a portrait in `refs` so it is the same face every time.',
    '2. Burn the caption in the editor, or ask for a static caption in the prompt.',
    '3. Volume: same prompt + same refs, N calls, N performances.',
    '',
    '## 4. B-roll with voiceover',
    '',
    '1. `generate_audio` — the narration, a named voice, a tone.',
    '2. The user lays it over their footage. (Muxing external video is not on this surface; the fixed `make_subtitles` and `make_ugc` REST routes still exist for that.)',
    '',
    '## 5. A series with one face',
    '',
    `1. \`generate_image\` once — a clean head-and-shoulders portrait. **${img} credits.**`,
    '2. Every `generate_video` in the series: the same portrait URL in `refs`, the same person/setting wording, a different script.',
    '3. Saved characters from the dashboard appear in `list_characters`; their `character_sheet_url` works the same way in `refs`.',
    '',
    '## 6. Two people',
    '',
    '`generate_video` with both portraits in `refs` and a prompt that names who says what: "Two friends on a couch. The one on the left says: … The one on the right laughs and says: …". Keep it to 10–15s per exchange.',
    '',
    '## 7. The hero clip',
    '',
    '`model: "seedance-2.5"`, `seconds` ≤ 10, one take, a strong reference. ≈3x the credits — quote it first.',
    '',
  ].join('\n');
}

/** Every loose tool with its exact input schema, from the same zod the connector uses. */
export function refTools(schemas: Record<string, unknown>): string {
  return [
    '# Tools',
    '',
    'The hosted connector\'s `tools/list` on the loose surface, with each input schema rendered from the same zod definitions the server validates with (`packages/schema/src/v2/generate.ts`). If this page and `tools/list` ever disagree, `tools/list` wins and CI is broken.',
    '',
    ...LOOSE_TOOLS.flatMap((name) => [
      `## ${name}`,
      '',
      '```json',
      JSON.stringify(schemas[name] ?? { note: 'no arguments' }, null, 2),
      '```',
      '',
    ]),
  ].join('\n');
}

export function looseRefModels(): string {
  const live = liveModels();
  const cands = Object.values(V2_MODELS).filter((m) => m.status === 'candidate');
  const row = (m: (typeof live)[number]) =>
    `| [${m.id}](models/${m.id}.md)${m.id === V2_DEFAULT_MODEL[m.kind] ? ' (default)' : ''} | ${m.kind} | ${m.tier} | ${m.credits!.perUnit} credits/${m.credits!.unit} | ${m.limits.maxSeconds ? `≤${m.limits.maxSeconds}s` : '–'} | ${m.bestFor.join('; ')} | ${m.avoidFor.join('; ') || '–'} |`;
  return [
    '# Choosing a model',
    '',
    'Generated from `packages/schema/src/v2/models.ts`. Call the `list_models` MCP tool (or `GET /v1/models`) for the live version.',
    '',
    '## The one rule',
    '',
    `**Default to \`seedance-2.0\`.** It is right for talking-head UGC, product-in-hand and crazy-look at ${V2_MODELS['seedance-2.0'].credits!.perUnit} credits/second. \`seedance-2.5\` is about 3x (${V2_MODELS['seedance-2.5'].credits!.perUnit}/second); pick it only when the user asks for the best possible single clip. Never for drafts or bulk.`,
    '',
    '## How to select',
    '',
    'Pass the id as `model` to `generate_video` / `generate_image` / `generate_audio` (MCP) or `POST /v2/generate/<kind>` (REST). Omit it for the default. Live video models are also the `engine` of the fixed REST skills (`/v2/selfie`, `/v2/crazy-look`, CLI `--engine`). Only live models are accepted; a planned id returns a 400 naming the live ones.',
    '',
    '## Live models',
    '',
    '| Model | Kind | Tier | Price | Max | Best for | Avoid for |',
    '|---|---|---|---|---|---|---|',
    ...live.map(row),
    '',
    '## Planned (not selectable, no price yet)',
    '',
    "Each goes live only after a real run is recorded and its cost is confirmed against the provider's detailed table.",
    '',
    '| Model | Kind | Tier | Best for |',
    '|---|---|---|---|',
    ...cands.map((m) => `| [${m.id}](models/${m.id}.md) | ${m.kind} | ${m.tier} | ${m.bestFor[0]} |`),
    '',
    '1 credit = $0.01.',
    '',
  ].join('\n');
}
