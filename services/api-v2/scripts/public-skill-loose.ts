// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The loose-surface skill pack. Imported by generate-public-skill.ts and
 * used when AGENT_SURFACE is not 'fixed' (the default, matching the
 * connector in services/api-v2/src/routes/mcp.ts).
 *
 * Everything an agent needs to make media with agent-media when the
 * agent is the director: the nine tools, the three video modes (text,
 * image-to-video, reference), how to write a prompt that comes out real,
 * which model for what, the recipes the fixed skills used to hard-code,
 * and the price of each move. Facts come from @agentmedia/schema/v2 (the
 * catalog, the schemas); the prose is the recommendation layer. Every
 * number is rendered from the catalog, never typed here.
 *
 * House style for generated text: no em dashes or en dashes. Use commas,
 * colons or "to".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  V2_MODELS,
  V2_DEFAULT_MODEL,
  V2_DEFAULT_VIDEO_QUALITY,
  V2_VOICES,
  V2_IMAGE_SIZES,
  V2_VIDEO_ASPECTS,
  V2_VIDEO_QUALITIES,
  GenerateVideoSchema,
  GenerateAudioSchema,
  GenerateImageSchema,
  liveModels,
  quoteGenerate,
  type QuoteExtras,
  type V2ModelRecord,
  type V2VideoMode,
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
  'rate_run',
] as const;

const MCP = 'https://api.agent-media.ai/mcp';
const API = 'https://api.agent-media.ai';

const VIDEO_MODE_ORDER: V2VideoMode[] = ['text', 'image', 'reference'];

function credits(kind: 'video' | 'image' | 'audio', input: Record<string, unknown>, extras?: QuoteExtras): number {
  const schema = kind === 'video' ? GenerateVideoSchema : kind === 'image' ? GenerateImageSchema : GenerateAudioSchema;
  return quoteGenerate(kind as 'video', schema.parse(input) as never, extras).credits;
}

/** The rubric the fixed pipelines injected server-side, read from the worker so the pack never drifts from it. */
export function realismRubric(repoRoot: string): string {
  const src = readFileSync(resolve(repoRoot, 'services/media-worker-v2/src/v2/realism.js'), 'utf-8');
  const m = src.match(/export const REALISM_RUBRIC = `([\s\S]*?)`;/);
  if (!m) throw new Error('REALISM_RUBRIC not found in services/media-worker-v2/src/v2/realism.js');
  return m[1].trim();
}

// ── Catalog readers (every number in the pack comes through here) ─────────

/** "15 credits/s at 480p, 30 at 720p, 75 at 1080p" for a live video model. */
export function priceLadder(m: V2ModelRecord): string {
  const c = m.video?.creditsPerSecond;
  if (!c) return 'no price';
  return V2_VIDEO_QUALITIES.filter((q) => c[q] !== undefined)
    .map((q, i) => `${c[q]}${i === 0 ? ' credits/s' : ''} at ${q}`)
    .join(', ');
}

/** Inclusive clip length range across a video model's modes, e.g. [4, 15]. */
export function videoSeconds(m: V2ModelRecord): [number, number] {
  const specs = Object.values(m.video?.modes ?? {});
  if (!specs.length) return [0, 0];
  return [Math.min(...specs.map((s) => s.seconds[0])), Math.max(...specs.map((s) => s.seconds[1]))];
}

/** One short phrase per mode: what to pass and the limits of that cell. */
export function modeLines(m: V2ModelRecord): string[] {
  const modes = m.video?.modes;
  if (!modes) return [];
  return VIDEO_MODE_ORDER.filter((mode) => modes[mode]).map((mode) => {
    const s = modes[mode]!;
    const secs = `${s.seconds[0]} to ${s.seconds[1]} s`;
    const aspect = s.aspects.length === 1 ? `aspect ${s.aspects[0]} only` : `default aspect ${s.aspectDefault}`;
    const qual = s.qualities.join('/');
    if (mode === 'text') return `text (prompt only): ${secs}, ${aspect}, ${qual}`;
    if (mode === 'image') return `image-to-video (first_frame${s.lastFrame ? ' + optional last_frame' : ''}): ${secs}, ${aspect}, ${qual}`;
    const r = s.refs;
    const refs = r
      ? [
          r.images ? `${r.images} images` : null,
          r.videos ? `${r.videos} clips${r.videoSecondsTotal ? `, ${r.videoSecondsTotal} s total` : ''}` : null,
          r.audios ? `${r.audios} audio${r.audioSecondsTotal ? `, ${r.audioSecondsTotal} s total` : ''}${r.audioAlone ? '' : ', not alone'}` : null,
        ]
          .filter(Boolean)
          .join(', ')
      : 'refs';
    return `reference (refs / video_refs / audio_refs, up to ${refs}): ${secs}, ${aspect}, ${qual}`;
  });
}

/** The limits cell of a models table, per kind. */
export function limitsCell(m: V2ModelRecord): string {
  if (m.kind === 'video') return modeLines(m).join('; ');
  if (m.kind === 'image') {
    const parts = [m.limits.resolutions?.length ? m.limits.resolutions.join(', ') : null, m.limits.refsMax !== undefined ? `refs up to ${m.limits.refsMax}` : null].filter(Boolean);
    return parts.join('; ') || 'see list_models';
  }
  return 'up to 4000 characters per call';
}

export function priceCell(m: V2ModelRecord): string {
  if (!m.credits) return 'no price (planned)';
  if (m.kind === 'video') return priceLadder(m);
  if (m.kind === 'audio') return `${m.credits.perUnit * 100} credit per 100 characters`;
  return `${m.credits.perUnit} credits per ${m.credits.unit}`;
}

/** "How to use each model", rendered from the usage card plus bestFor / avoidFor. */
export function usageSection(headingLevel = '##'): string[] {
  const live = liveModels();
  return [
    `${headingLevel} How to use each model`,
    '',
    'From the catalog `usage` card. `list_models` returns the same text plus the last 30 days of real results.',
    '',
    ...live.flatMap((m) => {
      const u = m.usage!;
      return [
        `${headingLevel}# ${m.id}${m.id === V2_DEFAULT_MODEL[m.kind] ? ` (default ${m.kind})` : ''}`,
        '',
        `- **Pick it when** ${u.pickWhen}.`,
        `- **Best for:** ${m.bestFor.join('; ')}.`,
        ...(m.avoidFor.length ? [`- **Avoid for:** ${m.avoidFor.join('; ')}.`] : []),
        `- **Latency:** ${u.latency}.`,
        `- **Price:** ${priceCell(m)}${m.kind === 'video' ? '; reference clip seconds (video_refs) are billed at the same per-second rate as output seconds' : ''}.`,
        ...(m.kind === 'video' ? ['- **Modes:**', ...modeLines(m).map((l) => `  - ${l}`)] : []),
        '- **Prompting:**',
        ...u.promptTips.map((t) => `  - ${t}`),
        '',
      ];
    }),
  ];
}

// ── Plugin manifest and README ────────────────────────────────────────────

export function loosePluginDescription(): string {
  const live = liveModels().map((m) => m.id).join(', ');
  return `Agent-Media, AI video, image and voice for agents, the loose way: you write the prompt, you pick the model (${live}), you pass frames or references. generate_video has three modes: text, image-to-video (first_frame, optional last_frame) and reference (refs, video_refs, audio_refs addressed as @image1 @video1 @audio1). Nine tools: generate_video, generate_image, generate_audio, quote, list_models, list_characters, get_run_status, upload_image, rate_run. list_models tells you what each model is good for, its modes, limits and price per quality. One MCP URL, browser sign-in.`;
}

export function looseReadme(): string {
  const live = liveModels();
  const liveVideo = live.filter((m) => m.kind === 'video');
  const v5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5 });
  return [
    '# agent-media',
    '',
    '[![npm, mcp-server](https://img.shields.io/npm/v/%40agentmedia%2Fmcp-server?label=%40agentmedia%2Fmcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)',
    '[![npm, CLI](https://img.shields.io/npm/v/agent-media-cli?label=agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)',
    '[![Claude plugin](https://img.shields.io/badge/claude-%2Fplugin%20install-A78BFA)](https://github.com/gitroomhq/agent-media-app)',
    '[![Cursor plugin](https://img.shields.io/badge/cursor-plugin-A78BFA)](https://cursor.com/marketplace)',
    '[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)',
    '',
    '**Agents: read this page, then [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md). That is everything.**',
    '',
    'agent-media renders video, images and voice from YOUR prompt on the model YOU choose. There is no fixed recipe: you describe the shot like a director, pass a first frame to animate or reference images, clips and audio to follow, pick a model from the catalog (or take the default), and poll for the URL. Works in Claude Code, Claude.ai, Cursor, Codex, Grok, or any MCP / HTTP agent.',
    '',
    '## 1. Connect, no API key needed',
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
    'Other routes: **Claude.ai / Desktop**: Settings > Connectors > add custom connector > paste the URL > Connect. **Claude Code**: `claude mcp add --transport http agent-media ' + MCP + '`. **Codex**: `codex mcp add agent-media --url ' + MCP + '`. **Grok**: `grok mcp add agent-media -t http ' + MCP + '`. **Claude Code plugin**: `/plugin marketplace add gitroomhq/agent-media-app` then `/plugin install agent-media@agent-media`. **Cursor plugin**: Settings > Plugins > search Agent Media > Install, or `/add-plugin agent-media` in chat; the plugin ships this skill plus the hosted MCP server, and Cursor opens the sign-in for you.',
    '',
    '## 2. Auth',
    '',
    'OAuth (above) is the default and needs no key. You need credits on the account, buy at agent-media.ai. 100 credits = 1 USD.',
    '',
    '**API keys** remain supported for CI, scripts, and the local stdio server (`npx @agentmedia/mcp-server`): get one with `npm i -g agent-media-cli && agent-media login` or from the dashboard, then send `Authorization: Bearer ma_...`, including to the same hosted URL above.',
    '',
    '## 3. The tools',
    '',
    '| Tool | What it does | Credits |',
    '|---|---|---|',
    `| \`generate_video\` | A clip from your prompt on the model you pick, in one of three modes: text (prompt only), image-to-video (\`first_frame\`, optional \`last_frame\`) or reference (\`refs\`, \`video_refs\`, \`audio_refs\`, addressed as @image1 @video1 @audio1). Native speech when the words are in the prompt. | seconds x the per-second rate at the chosen quality (${liveVideo.map((m) => `${m.id}: ${priceLadder(m)}`).join('; ')}); reference clip seconds are billed like output seconds |`,
    `| \`generate_image\` | One image from your prompt; with refs it edits/composes from them. The way to build a portrait, a product frame or a first frame for a video. | ${V2_MODELS['gpt-image-2'].credits!.perUnit} per image |`,
    '| `generate_audio` | Text to speech in a named voice. For voiceover over b-roll, or an audio reference for a clip; a talking head does not need it. | 1 per 100 characters |',
    '| `quote` | The price of any of the above without running it. | 0 |',
    '| `list_models` | The catalog: modes, limits, prices per quality, what each model is good and bad at, how to select it, recent results. | 0 |',
    '| `list_characters` | Saved characters (sheet + portrait URLs) to pass as `refs`. | 0 |',
    '| `get_run_status` | Poll a job id until it is done; returns the URL. | 0 |',
    '| `upload_image` | A file on disk, or bytes, or a foreign URL in; an https URL out. Call it before passing a photo. | 0 |',
    '| `rate_run` | Say what you thought of a finished run, 1 to 5 plus a note. Feeds the per-model stats and `model:"auto"`. | 0 |',
    '',
    '## 4. Ten-second tour',
    '',
    '```text',
    'generate_video { "prompt": "A 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \\"Okay, I did not expect this to actually work.\\" Natural skin, soft window light, slight head tilt.", "seconds": 5 }',
    `-> job_id ... (${v5} credits at ${V2_DEFAULT_VIDEO_QUALITY})`,
    'get_run_status { "run_id": "...", "wait": true }   (repeat until completed)',
    '-> Video: https://.../video.mp4',
    '```',
    '',
    'Same face across a series: `generate_image` a portrait once, then pass that URL in `refs` on every `generate_video` and call it @image1 in the prompt. Product in hand: pass the product photo (via `upload_image`) in `refs` and say where it is. Animate a still: pass it as `first_frame` (and a `last_frame` to say where the motion ends). Follow a clip\'s motion: pass it in `video_refs` and describe the new clip as @video1. Frames and refs cannot be mixed on Seedance: one or the other per call.',
    '',
    '## 5. Models',
    '',
    '| Model | Kind | Price | Modes and limits | Best for |',
    '|---|---|---|---|---|',
    ...live.map((m) => `| \`${m.id}\`${m.id === V2_DEFAULT_MODEL[m.kind] ? ' (default)' : ''} | ${m.kind} | ${priceCell(m)} | ${limitsCell(m)} | ${m.bestFor.slice(0, 2).join('; ')} |`),
    '',
    'Full guide with the avoid-for column, the per-mode table and one page per model: [reference/models.md](reference/models.md). Planned models are listed there too, they cannot be selected until a real run is recorded. `list_models` also carries `recent`: the last 30 days of real runs per model (fail rate, auto-judge score, user ratings, typical render time); pass `model: "auto"` and the printed policy picks from those numbers.',
    '',
    '## 6. REST',
    '',
    '- `POST ' + API + '/v2/generate/{video|image|audio}` (Bearer, JSON body = the tool arguments) returns `201 { job_id, credits_deducted, status_url }`',
    '- `POST ' + API + '/v2/quote/{video|image|audio}` returns `{ credits, usd, model, breakdown }`',
    '- `GET ' + API + '/v1/videos/{job_id}` returns `{ status, video_url }` (the URL is an image or mp3 for those kinds)',
    '- `GET ' + API + '/v1/models` returns the catalog, public',
    '- Exact input schemas: MCP `tools/list`, or [reference/tools.md](reference/tools.md). Trust those over any hand-written list.',
    '',
    '## Publish to social',
    '',
    "Post a generated video to the user's TikTok / Instagram / X via `POST /v1/social/*`, see [skills/publish-to-social/SKILL.md](skills/publish-to-social/SKILL.md).",
    '',
    '## Reference docs',
    '',
    '- [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md), the skill: modes, prompting, recipes, rules',
    '- [reference/models.md](reference/models.md), which model for what, with the per-mode limits and prices',
    '- [reference/prompting.md](reference/prompting.md), how to write a prompt that comes out real',
    '- [reference/recipes.md](reference/recipes.md), talking head, product in hand, animate a still, first and last frame, match a reference clip, crazy look, b-roll voiceover, series',
    '- [reference/tools.md](reference/tools.md), every tool with its exact input schema',
    '- [reference/auth.md](reference/auth.md), first-time setup',
    '',
    '## How this repo is built',
    '',
    'This directory is generated from the agent-media monorepo (`pnpm --filter api-v2 gen:public-skill`); CI fails if it drifts from the code. Do not hand-edit.',
    '',
    'License: Apache-2.0.',
    '',
  ].join('\n');
}

// ── SKILL.md ──────────────────────────────────────────────────────────────

export function looseSkillBody(repoRoot: string): string {
  const def = V2_MODELS[V2_DEFAULT_MODEL.video];
  const hero = liveModels().find((m) => m.kind === 'video' && m.id !== def.id) ?? def;
  const [minS, maxS] = videoSeconds(def);
  const v5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5 });
  const v10 = credits('video', { prompt: 'x'.repeat(10), seconds: 10 });
  const v15 = credits('video', { prompt: 'x'.repeat(10), seconds: 15 });
  const v5lo = credits('video', { prompt: 'x'.repeat(10), seconds: 5, quality: '480p' });
  const v5hi = credits('video', { prompt: 'x'.repeat(10), seconds: 5, quality: '1080p' });
  const p5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5, model: hero.id });
  const vRef = credits('video', { prompt: 'x'.repeat(10), seconds: 5, video_refs: ['https://example.com/ref.mp4'] }, { inputVideoSeconds: 5 });
  const img = credits('image', { prompt: 'portrait' });
  const ratio = def.credits && hero.credits ? Math.round(hero.credits.perUnit / def.credits.perUnit) : 3;
  return [
    '# agent-media, the skill',
    '',
    'You are the director. agent-media gives you three primitives and a model catalog; there is no fixed recipe between your intent and the render. Read this once; it is the whole manual.',
    '',
    '## The loop',
    '',
    '1. **Decide the shot** in words: who, where, what happens, camera, and, if anyone speaks, the exact words in quotes.',
    '2. **Pick the mode.** A still to animate: image-to-video (`first_frame`, optional `last_frame`). An identity, a look, a motion or a sound to keep: reference (`refs`, `video_refs`, `audio_refs`). Neither: text. Frames and refs cannot be mixed on Seedance.',
    '3. **Pick the model.** Omit `model` and you get the default (' + `\`${V2_DEFAULT_MODEL.video}\`` + ' for video, `' + V2_DEFAULT_MODEL.image + '` for images, `' + V2_DEFAULT_MODEL.audio + '` for speech); pass `"auto"` to let recent results decide. Call `list_models` when the job is unusual, it says what each model is good at, bad at, its modes and limits, what it costs per quality, and how it has actually performed lately. Only live models are accepted; naming a planned one returns the live list.',
    '4. **Get identity right.** Same face across clips: pass the same reference URL in `refs` every time and call it @image1 in the prompt. Make the reference with `generate_image` (a clean portrait), take it from `list_characters` (a saved character sheet), or `upload_image` the user\'s photo. References are the only way a series stays consistent; there is no other handle.',
    '5. **Quote if the user cares about cost** (`quote` costs nothing), then call the tool.',
    '6. **Poll `get_run_status`** with the job id (`wait: true`) until it is `completed`, and hand the user the URL. Never report success before you hold the URL.',
    '',
    '## The tools',
    '',
    `### generate_video, ${v5} / ${v10} / ${v15} credits for 5 / 10 / 15 s on ${def.id} at ${V2_DEFAULT_VIDEO_QUALITY} (${v5lo} at 480p, ${v5hi} at 1080p for 5 s; ${p5} for 5 s on ${hero.id})`,
    '',
    'Three modes, chosen by the fields you pass:',
    '',
    '- **Text**: the prompt alone. Aspect defaults to 9:16.',
    '- **Image-to-video**: `first_frame` is an https still that becomes frame one of the clip; optional `last_frame` is the frame the clip ends on, and the model animates between them. Frames only: `refs`, `video_refs` and `audio_refs` are refused next to a frame on Seedance. Aspect defaults to `adaptive` (the clip takes the frame\'s ratio); on `' + hero.id + '` adaptive is the only aspect in this mode, so leave `aspect` out. To keep an identity AND set the frame, put the frame image in `refs` instead and describe it as @image1.',
    '- **Reference**: `refs` (https images: a portrait, a character sheet from `list_characters`, a product photo; the identity and look are kept), `video_refs` (https clips whose motion, framing or look the model follows), `audio_refs` (https wav/mp3: a voice or a sound the clip carries). Address them in the prompt as @image1, @image2, @video1, @audio1, numbered per list from 1. Reference clip seconds are billed like output seconds. Never write edit or extend wording ("edit the video", "remove", "replace", "extend", "continue the clip") in a reference prompt: the provider reclassifies the job and fails it late. Describe the NEW clip you want.',
    '',
    'Reference mode:',
    '',
    '```json',
    '{',
    '  "prompt": "@image1, a 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \\"Okay, I did not expect this to actually work.\\" Natural skin texture, soft window light, slight head tilt, hands busy with the bottle.",',
    '  "refs": ["https://.../portrait.png"],',
    '  "seconds": 5,',
    '  "aspect": "9:16",',
    '  "quality": "720p",',
    '  "audio": true',
    '}',
    '```',
    '',
    'Image-to-video:',
    '',
    '```json',
    '{',
    '  "prompt": "The woman in the frame turns to the camera, smiles and says: \\"Okay, this one is different.\\" Slow handheld drift, soft window light stays constant.",',
    '  "first_frame": "https://.../still.png",',
    '  "seconds": 5',
    '}',
    '```',
    '',
    `- \`seconds\` ${minS} to ${maxS} on the live Seedance models (the exact range per model and mode is below), \`aspect\` ${V2_VIDEO_ASPECTS.map((a) => `\`${a}\``).join(', ')}, \`quality\` ${V2_VIDEO_QUALITIES.map((q) => `\`${q}\``).join(', ')} (default ${V2_DEFAULT_VIDEO_QUALITY}), \`audio\` true by default, \`model\` a live video id.`,
    `- Price ladder, credits per output second: ${liveModels().filter((m) => m.kind === 'video').map((m) => `${m.id}: ${priceLadder(m)}`).join('; ')}. A 5 s clip plus a 5 s reference clip on ${def.id} at ${V2_DEFAULT_VIDEO_QUALITY} is ${vRef} credits.`,
    ...liveModels().filter((m) => m.kind === 'video').map((m) => `- ${m.id} modes: ${modeLines(m).join('; ')}.`),
    '- Speech: put the exact words in quotes in the prompt and leave `audio: true`. The model renders the voice and lip-sync natively, you do not need `generate_audio` for a talking head.',
    '- Pace the words: about 2.3 words per second. 5 s is 10 to 12 words, 10 s is 20 to 25, 15 s is 30 to 35. A longer script is several clips.',
    '',
    `### generate_image, ${img} credits`,
    '',
    '```json',
    '{ "prompt": "Head-and-shoulders portrait of a 28-year-old woman, warm smile, soft window light, phone camera, natural skin, plain kitchen behind her", "size": "1024x1536" }',
    '```',
    '',
    `- \`size\` ${V2_IMAGE_SIZES.map((s) => `\`${s}\``).join(', ')} (portrait is the default). With \`refs\` (up to ${V2_MODELS['gpt-image-2'].limits.refsMax}) it edits/composes from them: put a product into a hand, re-light a portrait, pose a character sheet.`,
    '- This is how you make the reference a series needs, or the first frame a clip starts on. One portrait, then every clip cites it.',
    '',
    '### generate_audio, 1 credit per 100 characters',
    '',
    '```json',
    `{ "text": "[excited] Three things nobody tells you about launching...", "voice": "${Object.keys(V2_VOICES)[1]}", "tone": "energetic" }`,
    '```',
    '',
    `- Voices: ${Object.entries(V2_VOICES).map(([n, v]) => `\`${n}\` (${v.note})`).join(', ')}; or a raw ElevenLabs voice id. Emotion tags like \`[excited]\`, \`[whispers]\` are honoured.`,
    '- Use it for voiceover over b-roll, a standalone audio file, or an `audio_refs` entry for generate_video. Not for a talking head (see generate_video).',
    '',
    '### quote',
    '',
    '`{ "kind": "video", "input": { ...the same arguments... } }` returns credits, USD, model, mode, quality and the breakdown. Nothing is rendered. With `video_refs` the reference clip seconds are measured at submit and added at the same rate; the quote says so.',
    '',
    '### list_models, list_characters, get_run_status, upload_image, rate_run',
    '',
    'All free. `list_models` is the recommendation layer, read it before an unusual job; every video model lists its modes with inputs, seconds, aspects, qualities and credits per second, and every model carries `usage` (pick when, prompting tips, latency) and `recent` (last 30 days: runs, fail rate, auto-judge score, user ratings, typical render time). `list_characters` returns saved characters with `character_sheet_url` / portrait URLs for `refs`. `get_run_status` takes any job id this server gave you. `upload_image` turns a file on disk, raw bytes or a foreign URL into an https URL. When the photo is a FILE and you have a shell, use the file path: call `upload_image` with `file_bytes` (the exact size, `wc -c < photo.png`), run the curl PUT it prints, then call it again with the `upload_key`. The bytes go straight to storage without passing through this conversation, so send the ORIGINAL file: never resize, crop or re-encode a user\'s photo to make it fit, a shrunken product photo is what the video model will show. Base64 is the last resort, and never paste base64 into another tool call. `rate_run` records 1 to 5 and a note on a finished run: do it whenever the user reacts to an output, or you can see a defect yourself.',
    '',
    '### model: "auto"',
    '',
    'Every loose-surface job is scored by an auto-judge (3 frames or the image against the realism rubric, prompt adherence, identity match when refs were given) and every `rate_run` is stored. `model: "auto"` reads those numbers with one printed policy: the default, unless it failed more than 25% of at least 10 recent runs and another live model is healthy, or a live model within 1.5x the default\'s price beats its score by 0.10 over at least 10 judged runs. Only models that have the request\'s mode are candidates. `quote` and the submit response tell you which model auto chose and why. Use it when the user does not care which model; name the model when they do.',
    '',
    ...usageSection('##'),
    '## Writing a prompt that comes out real',
    '',
    'The fixed pipelines used to inject this rubric into every prompt. Now it is yours to include, put the relevant lines in your `prompt`, in your own words:',
    '',
    '```text',
    realismRubric(repoRoot),
    '```',
    '',
    'Also: name the age, the setting and the light; say what the hands are doing; do not write "selfie" or "phone" unless the phone should be visible; keep to one person unless it is a two-shot; quote the spoken words verbatim; with references, say what each @image1 / @video1 / @audio1 is for.',
    '',
    'Full guide: [reference/prompting.md](../../reference/prompting.md).',
    '',
    '## Recipes',
    '',
    'The things the old fixed skills did, as prompts you write yourself, see [reference/recipes.md](../../reference/recipes.md) for the full versions:',
    '',
    '- **Talking-head UGC**, generate_video with the script in quotes; a portrait in `refs` (@image1) if the face must persist.',
    '- **Product in hand**, upload_image the product, then generate_image "...holding <product> up to the lens" with the product URL in refs, then generate_video with that frame in refs.',
    '- **Animate a still (image-to-video)**, generate_image or upload_image the still, then generate_video with it as `first_frame` and a prompt that says what moves.',
    '- **First and last frame**, two stills as `first_frame` and `last_frame`; the model animates from one to the other.',
    '- **Match a reference clip\'s motion (video_refs)**, the clip in `video_refs`, a portrait in `refs`, and a prompt like "@image1 performs the same move as @video1 ..."; the clip\'s seconds are billed like output seconds.',
    '- **Crazy look**, silent 5 s extreme close-up, one exaggerated expression held to the lens, `audio: false`; burn the caption in your editor or ask for it in the prompt.',
    '- **B-roll voiceover**, generate_audio the narration; the user overlays it on their footage (agent-media does not mux external video on this surface).',
    '- **A series with one face**, one generate_image portrait, then N generate_video calls with the same `refs` and the same person and setting wording.',
    `- **Hero clip**, the one clip that must be the best: \`model: "${hero.id}"\` (about ${ratio}x the credits, and a much longer wait). Never for drafts or bulk.`,
    '',
    '## Rules',
    '',
    `- Ask before spending big: quote a 15 s ${hero.id} clip, or any 1080p clip, before running it.`,
    '- Default model and default quality for everything unless the user asked for the best possible single clip.',
    '- Every image, clip and audio URL must be https (upload_image first for images). Refs are kept private to the account.',
    '- Never downscale a photo the user gave you. `upload_image` with `file_bytes` streams the original file straight to storage (up to 25 MB) and hands back a URL; resizing to fit a context window is what turns a customer product shot into a thumbnail.',
    '- One mode per call: a first frame OR references, never both on Seedance.',
    '- Poll until `completed`; a clip takes minutes (' + liveModels().filter((m) => m.kind === 'video').map((m) => `${m.id}: ${m.usage!.latency}`).join('; ') + '), an image under a minute, audio seconds. If a job fails, the credits are refunded automatically, say so and retry with a clearer prompt.',
    '- Do not claim a video exists until get_run_status returned its URL.',
    '- After the user reacts to an output, call rate_run with an honest score. It is how the catalog learns.',
    '',
    '## Errors',
    '',
    '- `VALIDATION_ERROR` with `model` in the message, you named a planned or unknown model; the message lists the live ones.',
    '- `VALIDATION_ERROR` with `first_frame`, `refs`, `seconds`, `aspect` or `quality` in the message, the request does not fit the (model, mode) cell; the message says the allowed range. Fix the field, do not switch surfaces.',
    '- `VALIDATION_ERROR` with `prompt` in the message and `video_refs` given, the prompt reads as an edit or extend request; describe the new clip instead.',
    '- `INSUFFICIENT_CREDITS`, the account is out; point the user to agent-media.ai billing.',
    '- `TOO_MANY_ACTIVE_VIDEOS`, wait for one to finish.',
    '- `CONTENT_POLICY_BLOCKED`, the provider refused the prompt or the reference; rephrase, or use a different image.',
    '- `INVALID_REFERENCE_IMAGE`, one of your reference images does not decode; the message names the URL. Nothing was rendered and nothing was charged. It almost always means the file was uploaded through a truncated base64 string: re-upload the ORIGINAL with `upload_image` and `file_bytes`.',
    '- `INVALID_INPUT` from `upload_image` saying the image is incomplete or corrupt: same cause, caught at the door. Do not retry the same bytes, and do not shrink the file to make it fit; send it whole with `file_bytes`.',
    '',
  ].join('\n');
}

// ── Prompting ─────────────────────────────────────────────────────────────

/** Structured prompting guidance: one source for the pack and the website. */
export function promptingGuide(repoRoot: string) {
  return {
    intro: 'On the loose surface the prompt is yours, so the realism work the fixed pipelines did server-side is now in your hands. This is what they injected, and how to use it.',
    rubric: realismRubric(repoRoot),
    rules: [
      'Write the shot as prose, not tags. The models read sentences better than keyword lists.',
      'Order: who (age, look), where (setting, light), what they do with their hands, camera (phone framing, slight off-axis), the spoken words in quotes.',
      'Pick 4 to 6 rubric lines that matter for THIS shot and fold them in naturally: "natural skin texture, soft window light, slight head tilt, hands busy with the bottle".',
      'For a series, keep the wording of the person and setting identical across calls and pass the same refs.',
      'With references, name them: @image1 is the person, @image2 the product, @video1 the move to copy, @audio1 the voice. Numbering is per list, from 1.',
      'With a first frame, describe the motion, not the frame: the frame already sets who and where. Say what changes between the first and the last frame.',
      'Never put edit or extend wording ("edit the video", "remove", "replace", "extend", "continue") in a prompt that carries video_refs. Describe the new clip.',
      'Do not say "selfie" or "phone" unless a phone should be in the frame; say "talking to camera".',
      'Speech: quote the words verbatim; about 2.3 words per second. 5 s is 10 to 12 words, 10 s is 20 to 25, 15 s is 30 to 35.',
    ],
    examples: [
      {
        title: `Talking head, 5 s, ${V2_DEFAULT_MODEL.video}, text mode`,
        tool: 'generate_video',
        prompt: 'A 28-year-old woman in a bright apartment kitchen, phone-camera framing slightly off-axis, natural skin texture with a little T-zone sheen, soft window daylight from the left and a warm lamp behind her. She holds a small amber serum bottle up near her cheek, tilts her head and says: "Okay. I did not expect this to actually work." Eyes just off the lens, mouth caught mid-word.',
      },
      {
        title: 'Product frame, with the product photo in refs',
        tool: 'generate_image',
        prompt: 'The same woman holding THIS bottle (from the reference) up to the lens with both hands, label facing camera, bedroom corner, soft window light, phone photo, natural skin, no beauty-filter glow.',
      },
      {
        title: 'Reference mode, a portrait and a product',
        tool: 'generate_video',
        prompt: '@image1 sits at a kitchen counter, phone-camera framing, holds @image2 up to the lens with the label facing camera and says: "This is the one I kept coming back to." Natural skin, soft window light, a slight lean-in on the last word.',
      },
      {
        title: 'Image-to-video, from a still',
        tool: 'generate_video',
        prompt: 'The woman in the frame lowers the bottle, looks straight into the lens and says: "Told you." Handheld drift, the window light stays where it is, nothing else in the room moves.',
      },
    ],
  };
}

export function refPrompting(repoRoot: string): string {
  const g = promptingGuide(repoRoot);
  return [
    '# Prompting for real-looking output',
    '',
    g.intro,
    '',
    '## The rubric (verbatim from the worker)',
    '',
    '```text',
    g.rubric,
    '```',
    '',
    '## How to use it',
    '',
    ...g.rules.map((r) => `- ${r}`),
    '',
    '## Worked prompts',
    '',
    ...g.examples.flatMap((e) => [`**${e.title}** (${e.tool})`, '', `> ${e.prompt}`, '']),
  ].join('\n');
}

// ── Recipes ───────────────────────────────────────────────────────────────

/** Structured recipes: what the fixed skills used to do, as sequences of the loose tools. */
export function recipes() {
  const def = V2_MODELS[V2_DEFAULT_MODEL.video];
  const hero = liveModels().find((m) => m.kind === 'video' && m.id !== def.id) ?? def;
  const v5 = credits('video', { prompt: 'x'.repeat(10), seconds: 5 });
  const v5i2v = credits('video', { prompt: 'x'.repeat(10), seconds: 5, first_frame: 'https://example.com/a.png' });
  const vRef = credits('video', { prompt: 'x'.repeat(10), seconds: 5, video_refs: ['https://example.com/ref.mp4'] }, { inputVideoSeconds: 5 });
  const img = credits('image', { prompt: 'portrait' });
  const ratio = def.credits && hero.credits ? Math.round(hero.credits.perUnit / def.credits.perUnit) : 3;
  const q = V2_DEFAULT_VIDEO_QUALITY;
  return [
    {
      id: 'talking-head',
      title: 'Talking-head UGC clip',
      credits: `${v5} credits for 5 s on ${def.id} at ${q}`,
      steps: [
        { tool: 'generate_video', text: 'Script in quotes in the prompt; seconds from the word count (about 2.3 per second); refs = a portrait if the face must persist, addressed as @image1.' },
        { tool: 'get_run_status', text: 'Poll with wait:true until completed; hand over the URL.' },
      ],
    },
    {
      id: 'product-in-hand',
      title: 'Product in hand',
      credits: `${img} credits for the frame, then ${v5} for a 5 s clip at ${q}`,
      steps: [
        { tool: 'upload_image', text: 'The product photo becomes an https URL.' },
        { tool: 'generate_image', text: '"... holding THIS product up to the lens, label facing camera ..." with the product URL (and a portrait, if any) in refs.' },
        { tool: 'generate_video', text: 'The frame URL in refs as @image1, the pitch in quotes. The product stays the product.' },
      ],
    },
    {
      id: 'animate-still',
      title: 'Animate a still (image-to-video)',
      credits: `${v5i2v} credits for 5 s on ${def.id} at ${q} (same rate as text mode)`,
      steps: [
        { tool: 'generate_image', text: 'The still: a portrait, a product shot, a scene. Or upload_image a photo the user has.' },
        { tool: 'generate_video', text: 'That URL as first_frame; the prompt says what moves and what is said. Leave aspect out (adaptive follows the frame). No refs in this call: frames and refs cannot be mixed on Seedance.' },
        { tool: 'get_run_status', text: 'Poll until completed. The clip opens on the exact still.' },
      ],
    },
    {
      id: 'first-last-frame',
      title: 'First and last frame',
      credits: `${v5i2v} credits for 5 s on ${def.id} at ${q}; two stills first (${img} credits each with generate_image)`,
      steps: [
        { tool: 'generate_image', text: 'Twice: the opening still and the closing still, same person and setting wording, a different pose or state.' },
        { tool: 'generate_video', text: 'first_frame = the opening still, last_frame = the closing still; the prompt describes the move between them. The model animates from one to the other.' },
      ],
    },
    {
      id: 'match-motion',
      title: "Match a reference clip's motion (video_refs)",
      credits: `${vRef} credits for a 5 s clip plus a 5 s reference clip on ${def.id} at ${q}: the reference clip's seconds are billed at the same per-second rate`,
      steps: [
        { tool: 'quote', text: 'With video_refs the quote adds the reference clip seconds at the same rate (measured at submit); price it first.' },
        { tool: 'generate_video', text: 'The clip in video_refs (https mp4/mov), a portrait in refs, and a prompt like "@image1 performs the same move as @video1, in a bright kitchen ...". Describe the NEW clip; never write edit or extend wording.' },
        { tool: 'get_run_status', text: 'Poll until completed.' },
      ],
    },
    {
      id: 'crazy-look',
      title: 'Crazy look (silent reaction clip)',
      credits: `${v5} credits per 5 s clip at ${q}`,
      steps: [
        { tool: 'generate_video', text: '"Extreme close-up, face fills the frame, one exaggerated bug-eyed shock held straight into the lens, slow lean-in, no speech"; audio: false; seconds: 5; a portrait in refs (@image1) so it is the same face every time.' },
        { tool: null, text: 'Burn the caption in the editor, or ask for a static caption in the prompt. Volume: same prompt + same refs, N calls, N performances.' },
      ],
    },
    {
      id: 'voiceover',
      title: 'B-roll with voiceover',
      credits: '1 credit per 100 characters',
      steps: [
        { tool: 'generate_audio', text: 'The narration, a named voice, a tone.' },
        { tool: null, text: 'Lay it over the footage in the editor. Muxing external video is not on this surface; the fixed make_subtitles and make_ugc REST routes still exist for that. The mp3 URL also works as an audio_refs entry for generate_video.' },
      ],
    },
    {
      id: 'series',
      title: 'A series with one face',
      credits: `${img} credits once, then ${v5} per 5 s clip at ${q}`,
      steps: [
        { tool: 'generate_image', text: 'Once: a clean head-and-shoulders portrait.' },
        { tool: 'generate_video', text: 'Every clip: the same portrait URL in refs as @image1, the same person/setting wording, a different script. The reference is what keeps the face.' },
        { tool: 'list_characters', text: 'Saved characters from the dashboard appear here; their character_sheet_url works the same way in refs.' },
      ],
    },
    {
      id: 'two-people',
      title: 'Two people',
      credits: `${v5} to ${v5 * 3} credits per exchange at ${q}`,
      steps: [
        { tool: 'generate_video', text: 'Both portraits in refs and a prompt that names who says what: "@image1 and @image2 on a couch. @image1 says: ... @image2 laughs and says: ...". Keep it to 10 to 15 s per exchange.' },
      ],
    },
    {
      id: 'hero',
      title: 'The hero clip',
      credits: `about ${ratio}x the credits of ${def.id} (${priceLadder(hero)})`,
      steps: [
        { tool: 'quote', text: `Price it first: model "${hero.id}", seconds up to 10, the quality the user asked for.` },
        { tool: 'generate_video', text: `One take, a strong reference. In image mode leave aspect out (adaptive only). Expect a much longer render than ${def.id} (${hero.usage!.latency}).` },
      ],
    },
  ];
}

export function refRecipes(): string {
  return [
    '# Recipes',
    '',
    'What the fixed skills used to do, as sequences of the loose tools. 100 credits = 1 USD.',
    '',
    ...recipes().flatMap((r, i) => [
      `## ${i + 1}. ${r.title}`,
      '',
      `_${r.credits}_`,
      '',
      ...r.steps.map((st, j) => `${j + 1}. ${st.tool ? `\`${st.tool}\`, ` : ''}${st.text}`),
      '',
    ]),
  ].join('\n');
}

// ── Tools and models references ───────────────────────────────────────────

/** Every loose tool with its exact input schema, from the same zod the connector uses. */
export function refTools(schemas: Record<string, unknown>): string {
  return [
    '# Tools',
    '',
    'The hosted connector\'s `tools/list` on the loose surface, with each input schema rendered from the same zod definitions the server validates with (`packages/schema/src/v2/generate.ts`). If this page and `tools/list` ever disagree, `tools/list` wins and CI is broken.',
    '',
    'The JSON schema is the envelope; the per-model, per-mode limits (seconds, aspects, qualities, how many refs of each kind) are checked at submit against the catalog cell, see [models.md](models.md).',
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
  const liveVideo = live.filter((m) => m.kind === 'video');
  const cands = Object.values(V2_MODELS).filter((m) => m.status === 'candidate');
  const def = V2_MODELS[V2_DEFAULT_MODEL.video];
  const hero = liveVideo.find((m) => m.id !== def.id) ?? def;
  const ratio = def.credits && hero.credits ? Math.round(hero.credits.perUnit / def.credits.perUnit) : 3;
  const row = (m: (typeof live)[number]) =>
    `| [${m.id}](models/${m.id}.md)${m.id === V2_DEFAULT_MODEL[m.kind] ? ' (default)' : ''} | ${m.kind} | ${m.tier} | ${priceCell(m)} | ${limitsCell(m)} | ${m.bestFor.join('; ')} | ${m.avoidFor.join('; ') || 'nothing noted'} |`;
  const modeRow = (m: V2ModelRecord, mode: V2VideoMode) => {
    const s = m.video!.modes[mode]!;
    const inputs =
      mode === 'text'
        ? 'prompt only'
        : mode === 'image'
          ? `first_frame${s.lastFrame ? ' + optional last_frame' : ''}`
          : s.refs
            ? `refs up to ${s.refs.images}, video_refs up to ${s.refs.videos}${s.refs.videoSecondsTotal ? ` (${s.refs.videoSecondsTotal} s total)` : ''}, audio_refs up to ${s.refs.audios}${s.refs.audioSecondsTotal ? ` (${s.refs.audioSecondsTotal} s total)` : ''}${s.refs.audioAlone ? '' : '; audio needs an image or video beside it'}`
            : 'refs';
    const price = s.qualities.map((q) => `${m.video!.creditsPerSecond?.[q] ?? 'n/a'} at ${q}`).join(', ');
    const verified = s.verified ? `${s.verified.date}${s.verified.note ? `: ${s.verified.note}` : ''}` : 'no recorded run yet';
    return `| ${m.id} | ${mode} | ${inputs} | ${s.seconds[0]} to ${s.seconds[1]} | ${s.aspects.join(', ')} (default ${s.aspectDefault}) | ${price} | ${verified} |`;
  };
  return [
    '# Choosing a model',
    '',
    'Generated from `packages/schema/src/v2/models.ts`. Call the `list_models` MCP tool (or `GET /v1/models`) for the live version.',
    '',
    '## The one rule',
    '',
    `**Default to \`${def.id}\`.** It is right for talking-head UGC, product-in-hand, animating a still and crazy-look at ${priceLadder(def)}. \`${hero.id}\` is about ${ratio}x (${priceLadder(hero)}); pick it only when the user asks for the best possible single clip and accepts the wait. Never for drafts or bulk. The default quality is ${V2_DEFAULT_VIDEO_QUALITY}; 480p is the cheap draft, 1080p the dear finish.`,
    '',
    '## How to select',
    '',
    'Pass the id as `model` to `generate_video` / `generate_image` / `generate_audio` (MCP) or `POST /v2/generate/<kind>` (REST). Omit it for the default, or pass `"auto"`. Live video models are also the `engine` of the fixed REST skills (`/v2/selfie`, `/v2/crazy-look`, CLI `--engine`). Only live models are accepted; a planned id returns a 400 naming the live ones.',
    '',
    '## Video modes',
    '',
    'The mode follows from the fields: `first_frame` (and optional `last_frame`) is image-to-video, `refs` / `video_refs` / `audio_refs` is reference, neither is text. Frames and refs cannot be mixed on Seedance. Reference clip seconds (video_refs) are billed at the same per-second rate as output seconds. Credits below are per output second.',
    '',
    '| Model | Mode | Inputs | Seconds | Aspects | Credits/s | Verified |',
    '|---|---|---|---|---|---|---|',
    ...liveVideo.flatMap((m) => VIDEO_MODE_ORDER.filter((mode) => m.video!.modes[mode]).map((mode) => modeRow(m, mode))),
    '',
    ...liveVideo.flatMap((m) => [
      `Notes for ${m.id}:`,
      '',
      ...VIDEO_MODE_ORDER.filter((mode) => m.video!.modes[mode]).flatMap((mode) => m.video!.modes[mode]!.notes.map((n) => `- ${mode}: ${n}`)),
      '',
    ]),
    '## What the numbers mean',
    '',
    '`list_models` / `GET /v1/models` add a `recent` block per model: the last 30 days of loose-surface runs, `runs`, `fail_rate`, `auto_score` (0 to 1, an auto-judge grades every job: 3 frames or the image against the realism rubric, prompt adherence, identity match when refs were given), `scored`, `user_score` (1 to 5 from `rate_run`), `rated`, `p50_seconds`. `null` until a model has run.',
    '',
    '`model: "auto"` is one printed rule over those numbers: the kind\'s default, unless it failed more than 25% of at least 10 recent runs and another live model is healthy, or a live model within 1.5x the default\'s price beats its auto score by 0.10 or more over at least 10 judged runs. Only models that have the request\'s mode are candidates. The quote and the submit response say which model was chosen and why.',
    '',
    '## Live models',
    '',
    '| Model | Kind | Tier | Price | Modes and limits | Best for | Avoid for |',
    '|---|---|---|---|---|---|---|',
    ...live.map(row),
    '',
    ...usageSection('##'),
    '## Planned (not selectable, no price yet)',
    '',
    'Each goes live only after a real run is recorded and a user price is set.',
    '',
    '| Model | Kind | Tier | Best for |',
    '|---|---|---|---|',
    ...cands.map((m) => `| [${m.id}](models/${m.id}.md) | ${m.kind} | ${m.tier} | ${m.bestFor[0]} |`),
    '',
    '100 credits = 1 USD.',
    '',
  ].join('\n');
}
