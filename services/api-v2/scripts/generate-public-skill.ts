#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Generate the public Claude Skills plugin from the api-v2 skill
 * registry. Source of truth: services/api-v2/src/skills/registry.ts.
 * Output: public-skill/ at the repo root, structured as a Claude Code
 * plugin (.claude-plugin/plugin.json + skills/<slug>/SKILL.md + .mcp.json).
 *
 * Runs via `pnpm gen:skills`. CI guards drift with
 * `git diff --exit-code public-skill/`.
 *
 * Plugin is mirrored to github.com/gitroomhq/agent-media-app on push via the
 * .github/workflows/mirror-public-skill.yml workflow (subtree split).
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILLS, type SkillEntry } from '../src/skills/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const OUT = resolve(REPO_ROOT, 'public-skill');

// ── Per-skill metadata that does NOT live in the registry (yet) ──
// Cost (in agent-media credits) and rough wall-clock estimates so
// agents can budget before calling.
const COSTS: Record<string, { credits: number | string; seconds: number | string }> = {
  make_portrait: { credits: 35, seconds: 60 },
  make_character_sheet: { credits: 35, seconds: 90 },
  make_wireframe: { credits: 35, seconds: 90 },
  make_simple_selfie: { credits: '140/280/420 (5s/10s/15s)', seconds: '240–420' },
  make_subtitles: { credits: 15, seconds: 20 },
  make_lip_sync: { credits: '140/280/420 (5s/10s/15s)', seconds: '420–480' },
  make_ugc_video: { credits: '~225/~365/~505 (5s/10s/15s)', seconds: '360–600' },
  make_ugc: {
    credits: 'route-dependent: ~190–505 for a short clip; priced per-take for a long monologue or b-roll review',
    seconds: '360–1400',
  },
  make_podcast: {
    credits: 'per-take: 140/280/420 per 5s/10s/15s take, summed across every A/B turn (+15 if subtitles); the master scene + both close-ups are free',
    seconds: '360–1400',
  },
};

const EXAMPLE_INPUTS: Record<string, unknown> = {
  make_portrait: {
    description: 'a friendly young woman smiling at the camera, soft natural daylight, candid framing',
    realism_target: 'natural',
    aspect_ratio: '1:1',
  },
  make_character_sheet: {
    portrait_url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/<id>/portrait.png',
    description: 'Sara, 28 years old',
  },
  make_simple_selfie: {
    character_sheet_url: 'https://pub-...r2.dev/vnext/primitive-runs/<id>/character-sheet.png',
    duration: 5,
    script: 'Honestly, this app changed my whole morning routine, you have to try it.',
  },
  make_subtitles: {
    video_url: 'https://pub-...r2.dev/vnext/primitive-runs/<id>/simple-selfie.mp4',
    style: 'hormozi',
  },
  make_wireframe: {
    character_sheet_url: 'https://pub-...r2.dev/vnext/primitive-runs/<id>/character-sheet.png',
    script: 'walks into bedroom, picks up phone, smiles, hits record, talks to camera',
    n_panels: 6,
    aspect_ratio: '9:16',
  },
  make_lip_sync: {
    image_url: 'https://pub-...r2.dev/vnext/primitive-runs/<id>/character-sheet.png',
    audio_url: 'https://pub-...r2.dev/vnext/<your-uploaded-audio>.mp3',
    duration: 10,
    aspect_ratio: '9:16',
  },
  make_ugc_video: {
    description: 'a friendly young woman, soft daylight, candid framing',
    character_description: 'Maya, 27 years old',
    script: 'Okay this is wild, I tried the new flow and it actually works.',
    duration: 5,
    subtitles: true,
    subtitles_style: 'hormozi',
  },
  make_ugc: {
    script:
      'Okay I have to be honest, this completely changed how I work — I plan my whole week in ten minutes now, and I actually log off at five.',
    character: 'char_… (from list_characters) OR a character_sheet_url — or pass `image`/`person` instead',
  },
  make_podcast: {
    character_a: 'char_… (a saved character_id from list_characters, or a character_sheet_url)',
    character_b: 'char_… (a DIFFERENT saved character)',
    script: [
      { speaker: 'A', line: 'Welcome back to the show — today we are talking AI video.' },
      { speaker: 'B', line: 'Honestly I have been waiting all week for this one.' },
    ],
    room: 'a cozy wood-panelled podcast studio with warm lamps',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

function writeFile(rel: string, body: string): void {
  const path = join(OUT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf-8');
}

/** Write relative to the REPO ROOT rather than public-skill/ (marketplace manifest). */
function writeRepoFile(rel: string, body: string): void {
  const path = join(REPO_ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf-8');
}

function frontmatter(o: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      // Escape single quotes by doubling them for YAML safety, then quote.
      const safe = v.replace(/'/g, "''");
      lines.push(`${k}: '${safe}'`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function slugToKebab(slug: string): string {
  return slug.replace(/_/g, '-');
}

function pluginVersion(): string {
  // Pin to the max(skill versions). All five are 1.0.0 today, so 1.0.0.
  const versions = Object.values(SKILLS).map((s) => s.version);
  return versions.sort().at(-1) ?? '1.0.0';
}

/**
 * make_ugc is the ONE skill in the pack, so it gets a hand-crafted manual
 * (every prop + worked examples) instead of the generic template — an agent
 * reading this should be able to call it correctly without a tools/list probe.
 */
function makeUgcSkillBody(cost: { credits: number | string; seconds: number | string }): string {
  return `# Agent-Media UGC Video

**One tool. One call. A finished, captioned, vertical UGC video.**

You give a \`script\` and (optionally) who says it — agent-media picks the pipeline, the take count, and the duration for you. You NEVER pick a sub-tool:

- **Short line** → one clean talking-head clip.
- **Full monologue** (any length) → a seamless multi-take video, **never trimmed to fit a clip**.
- **\`broll_url\`** → the person narrates over your b-roll / gameplay / product footage.

## Inputs

**What they say** — exactly one of:
- \`script\` — the spoken line, **any length**. A sentence becomes one clip; a paragraph becomes the full multi-take video. Never trimmed.
- \`scene_action\` — a silent clip instead (dancing, b-roll, vibes). Requires a \`character\`.

**Who says it** — optional, pass at most one (omit → a default person is generated):
- \`person\` — describe them in words, e.g. \`"a 25-year-old woman with curly red hair"\`.
- \`image\` — a photo of the person: a public \`https\` URL **or** base64. The face is locked to it.
- \`character\` — reuse a saved character: its \`char_…\` id (from \`list_characters\`) **or** its \`character_sheet_url\`.
- \`name\` — optional name/age/vibe hint, e.g. \`"Sophia, 28"\`.

> A **long monologue** or a **\`broll_url\`** review needs a real face — pass \`image\` or \`character\`, not just \`person\`.

**Captions are OPT-IN — do NOT add them on your own.** First ASK the user whether they want captions and which \`caption_style\` (\`hormozi\` | \`tiktok\` | \`minimal\`); set \`captions:true\` only if they say yes, otherwise leave it off.

**Look & format** — all optional:
- \`captions\` — off unless set true (ask first, above); \`caption_style\` (\`hormozi\` | \`tiktok\` | \`minimal\`)
- \`look\` (\`natural\` | \`commercial\` | \`raw_iphone\`), \`aspect_ratio\` (\`9:16\` | \`1:1\`)
- \`broll_url\` — an \`https\` video overlaid on the lower half while they narrate.
- \`duration\` — leave blank; length is inferred from the script. Set only to force a short clip.

## Examples

A quick clip from a text description:
\`\`\`json
{ "script": "Honestly? This app saved my whole morning routine.", "person": "a friendly young woman, soft daylight" }
\`\`\`

A full monologue from a saved character — multi-take, never trimmed:
\`\`\`json
{ "script": "Okay I have to be honest with you for a second. Three months ago I was completely overwhelmed … (the entire monologue, as long as you like) … and that is your sign.", "character": "char_8f3ac210" }
\`\`\`

From a photo of a real person:
\`\`\`json
{ "script": "Wait — you have to see what this actually does.", "image": "https://example.com/face.jpg", "name": "Maya, 27" }
\`\`\`

A narrated b-roll / gameplay review:
\`\`\`json
{ "script": "Watch this play — this is where the whole match turns around.", "broll_url": "https://example.com/clip.mp4", "character": "char_8f3ac210" }
\`\`\`

## Reuse the same person across a session

After a video finishes, the character is **saved** — \`GET /v1/characters\` lists it with a \`character_id\` (\`char_…\`) and a \`character_sheet_url\`. For the NEXT video in the same task, pass that as \`character\` instead of a new \`person\`: it keeps the exact same face, and it's faster + cheaper because it reuses the existing portrait + character sheet rather than re-making them (the character sheet is never skipped — it's reused). Only generate a NEW person when the user asks for a different one. **If you're not sure whether they want the same person or a new one, ASK the user before generating.**

## How to call it

Preferred path: MCP tool \`mcp__agent-media__make_ugc\`. The full schema is auto-published via \`tools/list\`; the fields above are the manual.

Fallback path: REST.
\`\`\`http
POST https://api.agent-media.ai/v1/skills/make_ugc/run
Authorization: Bearer $AGENT_MEDIA_API_KEY
Content-Type: application/json
Idempotency-Key: <any unique string per intent>

{ "script": "Okay this completely changed how I work — I plan my whole week in ten minutes now.", "character": "char_8f3ac210" }
\`\`\`

## Cost & timing

- Credits: \`${cost.credits}\`
- Wall time (typical): \`${cost.seconds}s\`
- Deducted as each take runs.

## Polling the result

\`\`\`http
GET https://api.agent-media.ai/v1/skills/runs/<skill_run_id>
Authorization: Bearer $AGENT_MEDIA_API_KEY
\`\`\`

Returns per-step \`status\` + \`current_step\`; \`final_output.video_url\` is your finished MP4 when \`status\` is \`succeeded\`.

**Keep the user posted — don't go silent.** A video takes a few minutes: a new person runs portrait → character sheet → the video (→ captions if asked); reusing a saved person skips straight to the video. When you submit, tell the user the plan + a rough ETA, then poll and report each \`current_step\` as it changes (e.g. "building the character sheet…", "rendering the video…", "adding captions…") so they always know what's happening.

## House rules

- See [reference/realism-rubric.md](../../reference/realism-rubric.md) for the realism doctrine baked into every prompt.
- See [reference/pacing.md](../../reference/pacing.md) — you don't manage pacing; make_ugc sizes every take to the words.
- See [reference/auth.md](../../reference/auth.md) for first-time install and \`agent-media login\`.

## Source of truth

Auto-generated by \`scripts/generate-public-skill.ts\` from \`services/api-v2/src/skills/registry.ts\`. Do not hand-edit; CI rejects drift.
`;
}

function skillBody(skill: SkillEntry): string {
  const cost = COSTS[skill.slug] ?? { credits: '?', seconds: '?' };
  if (skill.slug === 'make_ugc') return makeUgcSkillBody(cost);
  const example = EXAMPLE_INPUTS[skill.slug];
  const toolName = `mcp__agent-media__${skill.slug}`;
  return [
    `# ${skill.name}`,
    '',
    skill.description,
    '',
    '## When to use this',
    '',
    `Call this skill when the user asks for the outcome described above. ` +
      `It runs on the agent-media vNext primitive runtime via the \`${toolName}\` MCP tool. ` +
      `Authentication is the user's existing agent-media Bearer token (issued by \`agent-media login\`).`,
    '',
    '## How to call it',
    '',
    `Preferred path: MCP tool \`${toolName}\`. Schema is auto-published via \`tools/list\` ` +
      `against the same MCP server, so don\'t restate the schema here — trust the server\'s response.`,
    '',
    'Fallback path: REST.',
    '',
    '```http',
    `POST https://api.agent-media.ai/v1/skills/${skill.slug}/run`,
    'Authorization: Bearer $AGENT_MEDIA_API_KEY',
    'Content-Type: application/json',
    'Idempotency-Key: <any unique string per intent>',
    '',
    JSON.stringify(example, null, 2),
    '```',
    '',
    '## What it costs and how long it takes',
    '',
    `- Credits: \`${cost.credits}\``,
    `- Wall time (typical): \`${cost.seconds}s\``,
    '- Deducted at submit.',
    '',
    '## Polling the result',
    '',
    skill.primitive.startsWith('composed:')
      ? '```http\nGET https://api.agent-media.ai/v1/skills/runs/<skill_run_id>\nAuthorization: Bearer $AGENT_MEDIA_API_KEY\n```\n\nReturns per-step status with intermediate artifact URLs as each primitive completes.'
      : '```http\nGET https://api.agent-media.ai/v1/primitives/runs/<run_id>\nAuthorization: Bearer $AGENT_MEDIA_API_KEY\n```',
    '',
    '## House rules baked into this skill',
    '',
    '- See [reference/realism-rubric.md](../../reference/realism-rubric.md) for the realism doctrine baked into every prompt.',
    skill.slug === 'make_simple_selfie' || skill.slug === 'make_ugc_video'
      ? '- See [reference/pacing.md](../../reference/pacing.md) for how word count picks the take duration.'
      : null,
    '- See [reference/auth.md](../../reference/auth.md) for first-time install and `agent-media login`.',
    '',
    '## Source of truth',
    '',
    `This file is auto-generated by \`scripts/generate-public-skill.ts\` from the registry at ` +
      `\`services/api-v2/src/skills/registry.ts\`. Do not hand-edit; CI rejects drift.`,
    '',
  ].filter((line) => line !== null).join('\n');
}

function pluginJson(): string {
  return JSON.stringify(
    {
      name: 'agent-media',
      description:
        'Agent-Media UGC Video — one tool. Give a script + a person (description, photo, or saved character) and get a finished, captioned, lip-synced vertical UGC video. Short line → one clip; full monologue → seamless multi-take; b-roll URL → narrated overlay. One Bearer token, one MCP server.',
      version: pluginVersion(),
      author: { name: 'gitroomhq', url: 'https://github.com/gitroomhq' },
      homepage: 'https://agent-media.ai',
      repository: 'https://github.com/gitroomhq/agent-media-app',
      license: 'Apache-2.0',
      keywords: [
        'claude-plugin',
        'claude-skill',
        'claude-code',
        'mcp',
        'model-context-protocol',
        'ugc-video',
        'ai-video',
        'ai-actors',
        'tiktok',
        'hormozi-subtitles',
        'gpt-image-2',
        'seedance',
        'video-generation',
        'agent-media',
      ],
      categories: ['video', 'media', 'ai-creative'],
      api: {
        rest: 'https://api.agent-media.ai',
        openapi: 'https://api.agent-media.ai/openapi.json',
        mcp: 'https://api.agent-media.ai/mcp',
      },
    },
    null,
    2,
  ) + '\n';
}

/**
 * Marketplace manifest — written to the REPO ROOT (`/.claude-plugin/marketplace.json`),
 * which is where `/plugin marketplace add gitroomhq/agent-media-app` looks.
 *
 * `source` must be `./public-skill`, NOT `./`.
 *
 * History: when `public-skill/` was subtree-mirrored to its own repo it WAS the
 * repo root, so `source: "./"` resolved correctly. Now that the whole monorepo is
 * public, `"./"` points at the monorepo root — where there is no plugin.json, no
 * skills/, and no .mcp.json — so the install silently resolves to the wrong
 * directory and the user gets a plugin with no tools.
 */
function marketplaceJson(): string {
  return JSON.stringify(
    {
      name: 'agent-media',
      owner: { name: 'gitroomhq', url: 'https://github.com/gitroomhq' },
      metadata: {
        description: 'Agent-Media UGC Video for Claude Code — one tool: give a script + a person/image/character, get a finished captioned vertical UGC video.',
        version: pluginVersion(),
      },
      plugins: [
        {
          name: 'agent-media',
          source: './public-skill',
          description:
            'Agent-Media UGC Video — one tool. Give a script + a person/image/character; get a finished captioned vertical UGC video (short clip, multi-take monologue, or narrated b-roll). Connects over the hosted MCP server with browser sign-in — no API key.',
        },
      ],
    },
    null,
    2,
  ) + '\n';
}

/**
 * Point the plugin at the HOSTED connector, not a local stdio process.
 *
 * The hosted server speaks OAuth 2.1 with dynamic client registration, so the
 * client registers itself and opens a browser sign-in — the user never copies an
 * API key and no secret lands in a config file. Emitting the old
 * `npx @agentmedia/mcp-server` + `${AGENT_MEDIA_API_KEY}` form made a
 * zero-config product look like it needed a key.
 *
 * API keys still work (send `Authorization: Bearer ma_...` to the same URL) and
 * the stdio server is still published for CI/headless use — both are documented
 * in the README as the optional path.
 */
function mcpJson(): string {
  return JSON.stringify(
    {
      mcpServers: {
        'agent-media': {
          type: 'http',
          url: 'https://api.agent-media.ai/mcp',
        },
      },
    },
    null,
    2,
  ) + '\n';
}

function readme(): string {
  return [
    '# agent-media — Claude Skill plugin',
    '',
    '[![npm — mcp-server](https://img.shields.io/npm/v/%40agentmedia%2Fmcp-server?label=%40agentmedia%2Fmcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)',
    '[![npm — CLI](https://img.shields.io/npm/v/agent-media-cli?label=agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)',
    '[![Claude plugin](https://img.shields.io/badge/claude-%2Fplugin%20install-A78BFA)](https://github.com/gitroomhq/agent-media-app)',
    '[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)',
    '',
    '**Agents: read this whole page. It is everything you need to create UGC videos with agent-media — no other docs required.**',
    '',
    'agent-media turns a short description (or a photo) + a script into a finished, captioned, lip-synced vertical UGC video. Works in Claude Code, Cursor, Claude.ai, or any MCP / HTTP agent — connect with one URL and a browser sign-in, no API key.',
    '',
    '## 1. Connect — no API key needed',
    '',
    '**One URL. Sign in with your browser.**',
    '',
    '```',
    'https://api.agent-media.ai/mcp',
    '```',
    '',
    'The hosted connector speaks OAuth 2.1 with dynamic client registration: your agent registers itself, opens a sign-in page, and gets a token. Nothing to copy, no secret in a config file.',
    '',
    '**Fastest path — paste this to your agent and it sets itself up:**',
    '',
    '```text',
    'Set up agent-media for me so I can generate UGC videos from here.',
    '1. Add the agent-media MCP server: https://api.agent-media.ai/mcp (Streamable HTTP).',
    '2. Authenticate: complete the sign-in in the browser it opens.',
    '3. Install the companion skills: run `npx skills add gitroomhq/agent-media-app`.',
    'Once that\'s done, let me know when it\'s ready.',
    '```',
    '',
    'Other routes: **Claude.ai / Desktop** → Settings → Connectors → add custom connector → paste the URL → Connect. **Claude Code plugin** → `/plugin marketplace add gitroomhq/agent-media-app` then `/plugin install agent-media@agent-media`. **Skills only** → `npx skills add gitroomhq/agent-media-app`.',
    '',
    '## 2. Auth',
    '',
    'OAuth (above) is the default and needs no key. You need credits on the account — buy at agent-media.ai.',
    '',
    '**API keys** remain supported for CI, scripts, and the local stdio server: get one with `npm i -g agent-media-cli && agent-media login` (stored at `~/.agent-media/credentials.json`) or from the dashboard, then send `Authorization: Bearer ma_...` — including to the same hosted URL above.',
    '',
    '## 3. Make a video — `make_ugc` (the one tool)',
    '',
    '`make_ugc` is the only generation tool: give it a `script` + a person/image/character and it returns the finished captioned video. Short script → one clip; long monologue → seamless multi-take (never trimmed); add `broll_url` → narrated overlay.',
    '',
    '```bash',
    'curl -X POST https://api.agent-media.ai/v1/skills/make_ugc/run \\',
    '  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \\',
    '  -d \'{ "script": "Okay, this changed my whole morning routine — you have to try it.",',
    '        "person": "a friendly 28-year-old woman, soft daylight" }\'',
    '#   (captions are opt-in — add "captions": true only if the user asked for them)',
    '# -> 202 { "skill_run_id": "..." }   then poll:',
    'curl https://api.agent-media.ai/v1/skills/runs/<skill_run_id> -H "Authorization: Bearer ma_..."',
    '# when status == "succeeded", final_output.video_url is your MP4.',
    '```',
    '',
    'In Claude/Cursor you just say it in words: *"Make a UGC video of a friendly woman saying \'…\' with TikTok captions."* — the agent calls the one tool, `make_ugc`.',
    '',
    '## 4. Calling it (REST / MCP / CLI)',
    '',
    '- **REST:** `POST https://api.agent-media.ai/v1/skills/make_ugc/run` (Bearer auth, JSON body) → `202` with a `skill_run_id`.',
    '- **Poll:** `GET /v1/skills/runs/<skill_run_id>` → `final_output.video_url` when `status` is `succeeded`.',
    '- **MCP:** call the `make_ugc` tool; arguments = its input fields.',
    '- **Exact input schema (always current):** `GET https://api.agent-media.ai/v1/public/skills` or MCP `tools/list`. Trust that over any hand-written list.',
    '',
    '## Skills',
    '',
    Object.values(SKILLS)
      .filter((s) => s.agentFacing)
      .map((s) => `- \`${s.slug}\` (v${s.version}) — ${s.description}`)
      .join('\n'),
    '',
    'Rules: give `make_ugc` the full `script` (any length — it is never trimmed) or a `scene_action` for a silent clip; pass `person`, `image` (https or base64), or `character` (a `char_…` id / sheet URL) for identity, or none for a default person; captions are OFF unless you set them — ASK the user if they want captions and which style first, never add them unprompted. Each run costs credits (see the cost in the skill). Reuse a saved character by passing its `character` on the next call — no re-generation. The other primitives (portrait, character sheet, lip-sync from your own audio, captioning an external video, etc.) stay available over REST/MCP for advanced use.',
    '',
    '## Publish to social',
    '',
    'Post a generated video to the user\'s TikTok / Instagram / X — via REST, the CLI, or MCP tools:',
    '- `POST /v1/social/connect { provider }` → returns an OAuth `url` the user opens to authorize (agents can\'t OAuth for them). CLI: `agent-media social connect x`. MCP: `social_connect`.',
    '- `GET /v1/social/channels` → the user\'s connected channels `[{ id, name, provider, profile }]`. CLI: `agent-media social channels`. MCP: `social_channels`.',
    '- `POST /v1/social/publish { video_url, channel_ids, caption, type:"now"|"schedule", date? }` → re-hosts the R2 video on the network and posts/schedules it; returns `{ success, media_id, post_ids }`. CLI: `agent-media social publish`. MCP: `social_publish`.',
    '',
    'See `skills/publish-to-social/SKILL.md` for the full flow.',
    '',
    '## Reference docs',
    '',
    '- [reference/auth.md](reference/auth.md) — first-time setup',
    '- [reference/pacing.md](reference/pacing.md) — how word count picks the take duration',
    '- [reference/realism-rubric.md](reference/realism-rubric.md) — realism props baked into every prompt',
    '',
    '## How this repo is built',
    '',
    'This repo is generated. The source of truth is the agent-media private monorepo. A GitHub Action mirrors the `public-skill/` subtree here on every push. Do not commit hand-edits — they will be overwritten.',
    '',
    'License: Apache-2.0.',
    '',
  ].join('\n');
}

function refAuth(): string {
  return [
    '# Auth — first-time setup',
    '',
    'agent-media uses a `ma_*` Bearer API key. Get one via the CLI:',
    '',
    '```bash',
    'npm install -g agent-media-cli',
    'agent-media login',
    '```',
    '',
    'This stores the key at `~/.agent-media/credentials.json`. The bundled MCP server reads it via the `AGENT_MEDIA_API_KEY` environment variable; the plugin\'s `.mcp.json` does `${AGENT_MEDIA_API_KEY}` interpolation.',
    '',
    '## Without the CLI',
    '',
    'You can paste the `ma_*` token directly:',
    '',
    '```bash',
    'export AGENT_MEDIA_API_KEY="ma_..."',
    '```',
    '',
    '## How the key is used',
    '',
    '- MCP server forwards it as `Authorization: Bearer ma_...` to `api.agent-media.ai`.',
    '- Server resolves it to a `user_id` and runs every primitive against that account.',
    '- Credits debit from the same account.',
    '',
    '## Rotation',
    '',
    '`agent-media logout && agent-media login` rotates the key. The old key keeps working for ~30 days unless explicitly revoked.',
    '',
  ].join('\n');
}

function refPacing(): string {
  return [
    // ⚠ These thresholds MUST match `fitDuration()` in
    // services/api-v2/src/skills/credit-quotes.ts — they decide both the take
    // length AND the price. The previous table (10-20 / 20-40 / 30-60) did not:
    // an agent writing a "5s" 15-word script silently got a 10s video and was
    // charged 280 credits instead of 140.
    '# Script pacing — how word count picks the duration',
    '',
    '`make_ugc` does **not** ask you for a duration. It counts the words in your `script` and picks the take length for you:',
    '',
    '| Words in your script | Duration you get | Credits |',
    '| -------------------- | ---------------- | ------- |',
    '| 1 – 11               | 5s               | 140     |',
    '| 12 – 22              | 10s              | 280     |',
    '| 23 +                 | 15s              | 420     |',
    '',
    'That mapping is the server\'s `fitDuration()` — the same function the quote and the run both use, so the number `/quote` returns is the number you are charged.',
    '',
    '**The boundaries are what matter.** A 12-word script is a 10-second video, not a 5-second one — and costs 280 credits, not 140. For a 5s take, stay at **11 words or fewer**.',
    '',
    'Roughly 2.5 words per second is the natural TikTok talking-head cadence: too few words leaves dead air the model fills with filler "um"s, too many and it races and the lip-sync breaks.',
    '',
    '## Longer scripts',
    '',
    'There is no rejection for a long script. Anything past 22 words becomes a 15s take, and a multi-sentence script is split into several takes stitched together — each priced by the same table. Call `/quote` first if you want the cost before spending.',
    '',
    '## Examples',
    '',
    '- 5s clip: *"This app completely changed my morning routine — try it."* (9 words)',
    '- 10s clip: *"I\'ve used this for two weeks and it saves me thirty minutes every morning. My coffee is still hot."* (20 words)',
    '- 15s clip: *"Okay so I\'ve been using this for two weeks now and it genuinely saves me thirty minutes every single morning, no joke — my coffee is still hot by the time I\'m finished."* (33 words)',
    '',
  ].join('\n');
}

// Outcome-level ONLY. The internal rubric (specific prompt clauses, provider-behavior
// discoveries, lighting recipes) lives at docs/internal/realism-rubric.md and is NOT
// mirrored — publishing it would hand a competitor our prompt engineering for free
// (publication rule / invariant 7). This describes WHAT you get, not HOW it's made.
function refRealism(): string {
  return [
    '# Realism',
    '',
    'Every image and video is automatically enhanced so people look real, not AI-perfect — natural skin and lighting, candid UGC framing, believable imperfection. This happens server-side on every render; there is nothing to configure and no way (or need) to hand-write it.',
    '',
    '## Choosing the look',
    '',
    'Use `realism_target` to pick the overall look:',
    '',
    '- `natural` — soft, natural daylight look.',
    '- `commercial` — clean, brand-ready look.',
    '- `raw_iphone` — unpolished, shot-on-phone look.',
    '',
    'Just describe the person and scene in plain language in `description`; the realism enhancement is applied for you.',
    '',
  ].join('\n');
}

// ── Generate ──────────────────────────────────────────────────────────

if (existsSync(OUT)) {
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });

writeFile('.claude-plugin/plugin.json', pluginJson());
// Repo ROOT, not public-skill/ — see marketplaceJson() for why.
writeRepoFile('.claude-plugin/marketplace.json', marketplaceJson());
writeFile('.mcp.json', mcpJson());
writeFile('README.md', readme());
writeFile('LICENSE', readFromRepo('LICENSE'));
writeFile('reference/auth.md', refAuth());
writeFile('reference/pacing.md', refPacing());
writeFile('reference/realism-rubric.md', refRealism());

// Only the curated agent-facing skill (make_ugc) ships a per-skill SKILL.md, so
// the pack presents ONE entry point instead of a dozen. The other skills stay
// REST/CLI-reachable; agents discover their full schema via tools/list when they
// genuinely need an advanced primitive.
for (const skill of Object.values(SKILLS).filter((s) => s.agentFacing)) {
  const kebab = slugToKebab(skill.slug);
  const fm = frontmatter({
    name: skill.name,
    description: skill.description,
    'allowed-tools': [`mcp__agent-media__${skill.slug}`],
    'x-skill-slug': skill.slug,
    'x-skill-version': skill.version,
    'x-primitive': skill.primitive,
    'x-mcp-tool': `mcp__agent-media__${skill.slug}`,
  });
  writeFile(`skills/${kebab}/SKILL.md`, fm + skillBody(skill));
}

// Composite "playbook" skill — not a registry entry; a hand-curated
// orchestration guide for agents that want the bigger picture before
// picking which primitive(s) to call. The 4 hand-written sections
// (one-shot, step-by-step, image-first, troubleshooting) reference
// the codegen-controlled per-skill markdowns above.
writeFile(
  'skills/agent-media-ugc/SKILL.md',
  frontmatter({
    name: 'Agent-Media UGC Playbook',
    description:
      'Playbook for Agent-Media UGC Video — the one tool for UGC video on agent-media. Always call the single make_ugc skill: give it a `script` (any length) and optionally a person/image/character; it returns the finished captioned vertical video. Short script → one clip, long monologue → full multi-take (never trimmed), `broll_url` → narrated overlay. You never pick a sub-skill.',
    'allowed-tools': Object.values(SKILLS)
      .filter((s) => s.agentFacing)
      .map((s) => `mcp__agent-media__${s.slug}`),
    'x-skill-slug': 'agent-media-ugc',
    // Bundle version anchor (the CLI update-check compares against this).
    // 1.1.0 = added the publish-to-social skill (TikTok / Instagram / X).
    'x-skill-version': '1.1.0',
  }) + playbookBody(),
);

// Social-publishing skill — not a registry primitive; a guide for posting a
// generated video to the user's connected TikTok/Instagram/X via the
// /v1/social/* REST endpoints (Postiz Enterprise under the hood).
writeFile(
  'skills/publish-to-social/SKILL.md',
  frontmatter({
    name: 'Publish to Social',
    description:
      'Publish a generated Agent-Media UGC Video to the user\'s connected TikTok, Instagram, or X. Connect channels (OAuth) and post or schedule via the REST API. Use after producing a video with make_ugc.',
    'x-skill-slug': 'publish-to-social',
    'x-skill-version': '1.0.0',
  }) + socialBody(),
);

// Crazy Look skill — not a vNext registry primitive; it runs on the v2
// generator surface (media-worker-v2 via POST /v2/crazy-look). The hosted
// MCP server already exposes it as `create_crazy_look` (derived from
// V2_GENERATORS in @agentmedia/schema/v2), so the pack documents that
// tool + the sheet-first series flow.
writeFile(
  'skills/make-crazy-look/SKILL.md',
  frontmatter({
    name: 'Make Crazy Look',
    description:
      'Silent 5-10s extreme close-up reaction clip with a static caption overlay ("the crazy look"). One recurring character opens on an exaggerated look and keeps morphing through randomized silent beats — no speech, no subtitles, ambient room tone only. A SERIES MUST START WITH A CHARACTER (create_character first; the saved sheet + pinned seed keeps the SAME face on every clip). Volume workflow: same caption + same character, N calls, N different performances.',
    'allowed-tools': ['mcp__agent-media__create_crazy_look', 'mcp__agent-media__create_character'],
    'x-skill-slug': 'make-crazy-look',
    'x-skill-version': '1.0.0',
    'x-mcp-tool': 'mcp__agent-media__create_crazy_look',
  }) + crazyLookBody(),
);

console.log(`generated ${OUT} for ${Object.keys(SKILLS).length} skills`);

function crazyLookBody(): string {
  return [
    '# Make Crazy Look',
    '',
    'Silent vertical reaction clip: one character, tight framing, an exaggerated expression that keeps MOVING (brow pops, mouth drops, eye darts, head tilts), and the hook text burned as a static caption. No speech, no lip-sync, no music — creators layer trending sounds in their editor. This is the high-volume TikTok creative-testing format: same hook, many looks, one recurring face.',
    '',
    '## The one rule: a series begins with a character sheet',
    '',
    'Run `create_character` ONCE (description, or description + photo). The saved sheet + pinned seed is what keeps the SAME face across every clip. Passing an inline `description` to the video call invents a NEW person each time — fine for a one-off test, wrong for a series.',
    '',
    '## The look is the identity — and it starts at frame one',
    '',
    'Two guarantees you can rely on: (1) the clip OPENS at peak expression — at 0.0 seconds the face is already fully committed, never a neutral face easing into it; (2) a saved character keeps the SAME signature look on every clip, derived from its `character_id`, so a series reads as one recognisable person. Pass `look` explicitly only when you deliberately want to break that consistency for one clip.',
    '',
    '## How to call it',
    '',
    'Preferred path: MCP tools `mcp__agent-media__create_character` then `mcp__agent-media__create_crazy_look`. Schemas are auto-published via `tools/list` — trust the server.',
    '',
    'Fallback path: REST.',
    '',
    '```http',
    'POST https://api.agent-media.ai/v2/crazy-look',
    'Authorization: Bearer $AGENT_MEDIA_API_KEY',
    'Content-Type: application/json',
    '',
    JSON.stringify(
      {
        character_id: 'char_XXXXXXXXXX',
        caption: "WAIT there's an app that LOCKS your phone until you PRAY???",
        duration: 5,
      },
      null,
      2,
    ),
    '```',
    '',
    'Poll `GET https://api.agent-media.ai/v1/videos/<job_id>` until `completed` → `video_url`.',
    '',
    '## Inputs that matter',
    '',
    '- `caption` (required) — the hook, burned over the full clip. Deliberate typos read as authentic. Use `\\n` for forced line breaks.',
    '- `look` (optional) — preset (bug-eyed-shock, jaw-drop, unhinged-grin, deadpan-stare, eyes-rolled-up, suspicious-squint, crying-smile, lean-in-conspiracy, guilty-pout, slow-realization, sweet-smile, giggle-fit) or `custom:<freetext>`. OMIT to sample per call.',
    '- `framing` (optional) — full-face | eyes-only | mouth-only | nose-up | medium. OMIT to rotate crop levels automatically.',
    '- `chaos` (optional, 0-1, default 0.6) — how wildly the expression evolves: 0 = one held look, 1 = fast unhinged morphing.',
    '- `duration` — 5 (default) or 10 seconds.',
    '',
    '## The volume workflow',
    '',
    'Same `character_id` + same `caption`, submitted N times → N different performances (look, framing and beat sequence are re-sampled per job). Mix in `sweet-smile` / `giggle-fit` clips as warm contrast beats between the shocked faces so the feed never reads as one note.',
    '',
    '## House rules',
    '',
    '- Do NOT add subtitles on top — the caption IS the text layer.',
    '- See [reference/auth.md](../../reference/auth.md) for first-time install and `agent-media login`.',
    '',
    '## Source of truth',
    '',
    'Auto-generated by `scripts/generate-public-skill.ts`; the generator contract lives in `packages/schema/src/v2/generators.ts` (V2_GENERATORS.crazy_look). Do not hand-edit; CI rejects drift.',
    '',
  ].join('\n');
}

function socialBody(): string {
  return [
    '# Publish to Social',
    '',
    'Post a finished agent-media video (an R2 `video_url` from any of the video skills) to the user\'s connected social channels — **TikTok, Instagram, or X**. Works from three surfaces: REST, the CLI (`agent-media social ...`), and MCP tools (`social_channels` / `social_connect` / `social_publish`). All calls use the user\'s `Authorization: Bearer ma_...` token against `https://api.agent-media.ai`.',
    '',
    '## 1. Connect a channel (one-time, requires the human)',
    '',
    '```',
    'GET    /v1/social/providers             -> connectable networks: tiktok, instagram, instagram-standalone, x',
    'POST   /v1/social/connect { provider }  -> { url }   # the user opens this OAuth url and authorizes',
    'GET    /v1/social/channels              -> { channels: [{ id, name, provider, profile, picture }] }',
    'DELETE /v1/social/channels/:channelId   -> disconnect',
    '```',
    '',
    'The connect step returns an OAuth URL the **human** must open and authorize — an agent cannot complete OAuth itself. Once authorized, the channel appears in `/v1/social/channels` with an `id` you pass to publish.',
    '',
    'CLI: `agent-media social providers` · `agent-media social connect x` · `agent-media social channels`.',
    'MCP: `social_connect { provider }` (returns the URL for the user) · `social_channels`.',
    '',
    '## 2. Publish a video',
    '',
    '```bash',
    'curl -X POST https://api.agent-media.ai/v1/social/publish \\',
    '  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \\',
    '  -d \'{ "video_url": "https://pub-...r2.dev/generation-outputs/<user>/<job>/...mp4",',
    '        "channel_ids": ["<channel-id-from-/channels>"],',
    '        "caption": "made with agent-media",',
    '        "type": "now" }\'    # or "type":"schedule" + "date":"2026-06-01T10:00:00.000Z"',
    '```',
    '',
    'CLI: `agent-media social publish --video <url> --channels <id,id> --caption "..."` (add `--at <iso>` to schedule).',
    'MCP: `social_publish { video_url, channel_ids, caption, type }`.',
    '',
    '`video_url` must be an agent-media R2 URL (the output of a video skill) — agent-media re-hosts it on the publishing provider for you. `channel_ids` come from `/v1/social/channels`. Per-network requirements (e.g. X reply settings) are filled in server-side; you don\'t send them.',
    '',
    '**Returns** `{ success: true, media_id, post_ids: ["..."] }`. A real post was created only when `post_ids` is non-empty — treat an empty `post_ids` as a failure, not a success.',
    '',
    '## Typical flow',
    '',
    '1. Produce a video → `make_ugc` → `final_output.video_url`.',
    '2. If the user has no connected channel, send them to connect (step 1) — you can\'t OAuth for them.',
    '3. Publish that `video_url` to the chosen `channel_ids`; confirm `post_ids` came back.',
    '',
    'Note: social operations run on a shared rate budget — don\'t poll; connect once and publish on demand.',
    '',
  ].join('\n');
}

function playbookBody(): string {
  return [
    '# Agent-Media UGC Playbook',
    '',
    'You\'re an agent (Claude, Cursor, custom) that needs to produce a finished UGC video on agent-media. There is exactly ONE tool — `make_ugc` (Agent-Media UGC Video). You never pick a sub-skill; make_ugc resolves identity and runs the whole pipeline internally.',
    '',
    '## One tool, three shapes',
    '',
    '| You want | Give make_ugc | Result |',
    '| --- | --- | --- |',
    '| A short clip | a one-line `script` (+ optional person/image/character) | one clean talking-head clip |',
    '| A full monologue | a long `script` (+ a real face via `image` or `character`) | a seamless multi-take video, never trimmed |',
    '| A narrated b-roll review | `script` + `broll_url` + a `character`/`image` | the person narrates over your footage |',
    '',
    '## How to call it',
    '',
    'A single call. The server picks the pipeline, the take count and the duration, runs it in one Temporal workflow, and returns a `skill_run_id` you poll.',
    '',
    '```http',
    'POST https://api.agent-media.ai/v1/skills/make_ugc/run',
    'Authorization: Bearer $AGENT_MEDIA_API_KEY',
    '',
    '{',
    '  "script": "Okay this is wild, I tried the new flow and it actually works.",',
    '  "person": "a friendly young woman, soft daylight, candid framing",',
    '  "name": "Maya, 27"',
    '}',
    '```',
    '',
    'Poll with `GET /v1/skills/runs/<skill_run_id>` until `status` is `succeeded`; `final_output.video_url` is your finished MP4.',
    '',
    'See [skills/make-ugc/SKILL.md](../make-ugc/SKILL.md) for the full field manual.',
    '',
    '## Step D — publish it (optional)',
    '',
    'Once you have a `video_url`, you can post it straight to the user\'s TikTok / Instagram / X with the **publish-to-social** skill — `POST /v1/social/publish` (CLI `agent-media social publish`, MCP `social_publish`). The user connects each network once via OAuth (`/v1/social/connect`). See [skills/publish-to-social/SKILL.md](../publish-to-social/SKILL.md).',
    '',
    '## Identity',
    '',
    '- `person` — describe them in words; `image` — a photo (https URL or base64); `character` — a saved `char_…` id or `character_sheet_url` from list_characters; omit all three for a default person.',
    '- A full monologue or a b-roll review needs a real face — pass `image` or `character`, not just `person`.',
    '- Reuse a saved character: pass the same `character` on the next call — no re-generation.',
    '',
    '## Rules',
    '',
    '- make_ugc paces and chunks the script for you — pass the FULL line or monologue and do NOT trim it. Length is inferred from the script.',
    '- Any image/video URL you pass must be a public https URL (make_ugc re-hosts it onto R2 for you) — or a `character_sheet_url` / `char_…` for a saved character.',
    '- Credits are deducted as each take runs. Portrait + character-sheet prep inside a video are FREE — you only pay for the video itself.',
    '- Don\'t put "selfie" or "phone" in a description — say "talking to camera" instead. make_ugc already handles this internally.',
    '',
    '## Troubleshooting',
    '',
    '- **`INSUFFICIENT_CREDITS`** — user is out. Surface the agent-media.ai billing page link.',
    '- **`make_ugc_needs_face`** — a full monologue or a b-roll review needs `image` or `character` (a real face), not just `person`.',
    '- **Video has subject holding a phone** — they used a pose hint mentioning "selfie" or "phone". Strip it or set `pose: ""`.',
    '- **Step stuck in `submitted`** — Temporal worker may be restarting. Wait 30s and re-poll; if still stuck after 5 min, the workflow is hung — contact agent-media support with the `workflow_id`.',
    '',
    '## See also',
    '',
    '- [reference/auth.md](../../reference/auth.md) — first-time setup',
    '- [reference/pacing.md](../../reference/pacing.md) — word-count → duration table with examples',
    '- [reference/realism-rubric.md](../../reference/realism-rubric.md) — the 9 realism props baked into every prompt',
    '',
  ].join('\n');
}

function readFromRepo(file: string): string {
  const path = resolve(REPO_ROOT, file);
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return `Apache License 2.0 — see ${file} in the source repository.\n`;
  }
}
