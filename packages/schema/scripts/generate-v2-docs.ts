#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Generate v2 docs + SKILL.md from V2_GENERATORS.
 *
 * Reads packages/schema/src/v2/generators.ts and emits:
 *   - docs/v2/api-reference.md   — Markdown reference for the v2 REST surface
 *   - skills/agent-media-v2/SKILL.md  — Claude skill file pointing only at v2
 *
 * Both files are derived. Hand edits get blown away on the next run — the
 * single source of truth is the registry.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  V2_GENERATORS,
  type V2GeneratorRecord,
} from '../src/v2/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const DOCS_OUT = resolve(repoRoot, 'docs/v2/api-reference.md');
const SKILL_OUT = resolve(repoRoot, 'skills/agent-media-v2/SKILL.md');

const GENERATED_NOTE = `<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->`;

// ── Markdown helpers ───────────────────────────────────────────────────────

function fmtInputSchema(def: V2GeneratorRecord): string {
  const schema = zodToJsonSchema(def.inputSchema, {
    name: `${def.id}_input`,
    $refStrategy: 'none',
  }) as {
    definitions?: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
  };
  const body = schema.definitions?.[`${def.id}_input`] ?? (schema as any);
  return '```json\n' + JSON.stringify(body, null, 2) + '\n```';
}

// Pricing display is intentionally suppressed everywhere — agents and
// docs should never surface USD or credit numbers. The API debits
// internally; users get no cost-anxiety prompts. (Server-side allows a
// soft -10 credit overdraft so a final job never gets rejected on a
// micro-balance edge case.)

// ── docs/v2/api-reference.md ──────────────────────────────────────────────

function renderApiReference(): string {
  const generators = Object.values(V2_GENERATORS);

  const toc = generators
    .map((g) => `- [\`${g.rest?.method ?? ''} ${g.rest?.path ?? '(internal)'}\` — ${g.summary}](#${g.id})`)
    .join('\n');

  const sections = generators
    .map((g) => {
      const status = g.status === 'beta' ? ' · _beta_' : '';
      return [
        `## ${g.id}${status}`,
        '',
        `\`${g.rest?.method ?? ''} ${g.rest?.path ?? '(internal)'}\``,
        '',
        g.description,
        '',
        '### Request body',
        '',
        fmtInputSchema(g),
        '',
        '### Response',
        '',
        g.output === 'video_url'
          ? 'Returns a job submission. Poll `GET /v1/videos/{job_id}` until `status: "completed"`; the final row carries `video_url`.'
          : 'Returns a job submission. Poll `GET /v1/videos/{job_id}` until `status: "completed"`; the final row carries the new `character_id` (`char_xxxxxxxxxx`).',
        '',
        '#### Submission (201)',
        '',
        '```json',
        JSON.stringify(
          { job_id: '<uuid>', status: 'submitted', generator: g.id },
          null,
          2,
        ),
        '```',
        '',
        ...(g.cli?.examples?.length
          ? [
              '### CLI examples',
              '',
              '```bash',
              ...g.cli.examples,
              '```',
              '',
            ]
          : []),
      ].join('\n');
    })
    .join('\n---\n\n');

  return [
    GENERATED_NOTE,
    '',
    '# agent-media v2 — API reference',
    '',
    '_Public REST surface for v2 generators (Selfie, Character). Auth is a Bearer API key (`ma_xxx`)._',
    '',
    '**Base URL:** `https://api.agent-media.ai`',
    '',
    '## Endpoints',
    '',
    toc,
    '',
    '---',
    '',
    sections,
    '## Shared',
    '',
    '### Authentication',
    '',
    'Every v2 request sends `Authorization: Bearer ma_xxx`. Get a key via `agent-media login` (CLI) or the dashboard.',
    '',
    '### Polling',
    '',
    '`GET /v1/videos/{job_id}` returns the same shape for v1 and v2 jobs. v2-specific fields:',
    '',
    '- `character_id` — present on jobs that create a v2 character (`char_xxxxxxxxxx`).',
    '- `video_url` — present on completed video jobs.',
    '',
    '### Selfie pipeline artifacts',
    '',
    'Selfie jobs expose intermediate URLs while processing:',
    '',
    '- `portrait_url` — generated actor face portrait, unless reusing a saved character.',
    '- `character_sheet_url` / `sheet_url` — full-body multi-angle character reference.',
    '- `wireframe_url` — photographic storyboard/wireframe board with 8-10 frames and captions.',
    '- `video_url` / `result_url` — final Seedance MP4 after completion.',
    '',
    'Agents should surface each artifact as soon as it appears in status instead of waiting silently for the final video.',
    '',
  ].join('\n');
}


// ─────────────────────────────────────────────────────────────────────────────
// Multi-file skill emit
//
// Layout under skills/agent-media-v2/:
//   SKILL.md                          — eager-loaded entry, ~2 KB
//   reference/
//     conversation-flow.md            — MUST-READ before any CLI call
//     pricing.md                      — formula + tables
//     subtitle-styles.md              — 17 subtitle styles
//     realism-rubric.md               — visual-quality guard
//     errors.md                       — common error codes + fixes
//     generators/
//       selfie.md                     — flags + CLI/MCP/REST + examples
//       character-create.md           — character_create cheat-sheet
//       subs.md                       — subs cheat-sheet
//
// Adding a new v2 product = a new V2_GENERATORS row + this file emits a
// fresh reference/generators/<id>.md automatically.
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_DIR = resolve(repoRoot, 'skills/agent-media-v2');

interface EmittedFile {
  /** path relative to SKILL_DIR */
  relPath: string;
  content: string;
}

function renderSkillIndex(): string {
  const generators = Object.values(V2_GENERATORS);
  const generatorRows = generators
    .map(
      (g) =>
        `| **${g.cli?.command ?? g.id}** | ${g.summary.replace(/\|/g, '\\|')} | [\`reference/generators/${g.id}.md\`](reference/generators/${g.id}.md) |`,
    )
    .join('\n');

  return [
    '---',
    'name: agent-media-v2',
    // CRITICAL: the description string is what Claude reads when deciding whether to
    // load this skill AND it's the most-attended-to text once the skill is loaded.
    // Put the hard gate here, not buried in section 3 of the body.
    'description: AI UGC video production via agent-media (selfie, character, subs, plus more soon). BEFORE running ANY agent-media command you MUST first Read reference/conversation-flow.md and walk the user through the 4 gates IN ORDER — (1) confirm duration first with script-pacing guidance (2-4 words/sec), (2) confirm script OR scene_action; if no speech, also propose background_music, (3) RUN `agent-media character list --json` YOURSELF (don\'t ask the user, don\'t mention char_xxx ids — present saved characters BY NAME if any, otherwise confirm the new description), (4) propose a director\'s brief with setting, lighting, wardrobe, props/product, and action; pass non-default motion/product handling through --scene-action. AUTOPILOT exception: if user explicitly says "autopilot", "just do it", "run with defaults", or equivalent, proceed end-to-end without re-asking every gate; infer missing details reasonably, keep safety constraints, and report assumptions. While jobs run, poll status and open portrait, character sheet, wireframe, and final video as each URL appears. When user says "no subs" → pass --subtitles false. When no script → pass --background-music. NEVER auto-pick a character. NEVER expose char_xxx ids. NEVER mention pricing/credits/USD.',
    '---',
    '',
    GENERATED_NOTE,
    '',
    '# agent-media — Claude skill',
    '',
    'agent-media is a CLI for AI UGC video generation. This skill tells you how to drive it. **Loaded files are intentionally small** — open the right reference file for the task you have, don\'t try to memorize everything.',
    '',
    '## 🛑 HARD GATE — read this first, every conversation',
    '',
    'Before calling ANY `agent-media` shell command, you MUST:',
    '',
    '1. **Read** [`reference/conversation-flow.md`](reference/conversation-flow.md) — the full 4-gate protocol with templates.',
    '2. **Walk the user through 4 gates IN ORDER, one message each** — do not bulk-fire:',
    '   - **Gate 1:** confirm duration first with **script-pacing guidance** (2-4 words/sec). Propose a fit: 5s ≈ 10-20 words, 10s ≈ 20-40 words, 15s ≈ 30-60 words.',
    '   - **Gate 2:** confirm the exact script (verbatim — typos land in the video), or confirm `scene_action` + `--background-music` when there is no speech.',
    '   - **Gate 3:** confirm character. YOU run `agent-media character list --json` (do not ask the user "do you have a saved character?" — they don\'t know that\'s a thing). If the list is empty, just confirm the description from their original prompt. If non-empty, present each saved character BY NAME (not by `char_xxx` id — that format is internal). The user picks by NAME or says "new"; you map name → id internally. 🛑 NEVER auto-pick. NEVER show `char_xxx` ids to the user. Never ask for a photo by default.',
    '   - **Gate 4:** propose a full **director\'s brief** with pre-filled fields in 3 sections — **A. Intent+Performance**, **B. Scene+Look**, **C. Output**. Put visual direction into `--description` and action/product handling into `--scene-action`. The shot composition and energy are inferred from the brief; you can OPTIONALLY pin them with `--shot-preset` and `--vibe`, or override the realism defaults with `--camera-locked` / `--phone-in-frame` / `--polish` (rare — only when the user explicitly asks for a stable shot, a phone-in-hand composition, or a different polish look).',
    '3. Only then call the CLI.',
    '',
    '**The director\'s brief at Gate 4 is non-optional.** It\'s where quality lives. Skipping it = generic output. PROPOSE smart defaults from the script + description; don\'t ask blank questions.',
    '',
    'Calling the CLI without doing 1–3 is a protocol violation — the user gets a generic, mid video. Ask the extra questions.',
    '',
    '## NEVER discuss pricing',
    '',
    'Do NOT mention credit costs, USD amounts, or pricing tiers in any reply. Do NOT ask the user to "confirm cost". The API handles billing transparently. If the user asks about cost, point them at <https://agent-media.ai/pricing>. That is the only acceptable surface for pricing.',
    '',
    '## What agent-media can do (router)',
    '',
    '| Command | Use when | Deep-dive |',
    '|---|---|---|',
    generatorRows,
    '',
    '`agent-media skill update` — pull the latest skill files into ~/.claude/skills/agent-media-v2/.',
    '`agent-media skill status` — print local vs remote version.',
    '',
    '## What agent-media CANNOT do',
    '',
    'These legacy v1 commands exist in the CLI binary for backwards compat but produce inferior output. They are hidden from `agent-media --help` for a reason. **Never call them.**',
    '',
    '- ❌ `agent-media ugc` — uses a stale fixed actor library (200 actors picked at random). The actors look dated. Use `agent-media selfie` — it generates an on-model character from your description on every run.',
    '- ❌ `agent-media show-your-app` — built on the v1 actor pool + manual screen-composite step. The v2 product is on the roadmap. For now, run `agent-media selfie` for the talking head and capture the screen separately.',
    '- ❌ `agent-media laptop-ugc` — v1 only. Same story as show-your-app; v2 product coming.',
    '- ❌ `agent-media character-video` — superseded by `agent-media selfie --character <id>`. The new command uses the current portrait → sheet → wireframe → Seedance pipeline.',
    '- ❌ `agent-media text-to-video` — no character control; output is generic and off-brand. Use `agent-media selfie` with a saved character.',
    '- ❌ `agent-media subtitle` (singular) — v1 burner with fewer styles and shakier sync. Use `agent-media subs` (plural).',
    '- ❌ `agent-media review` — SaaS-review generator built on v1 actors. Compose with `agent-media selfie` + a script you write.',
    '- ❌ `agent-media product-acting` — v1 product-in-hand generator. For now, use `agent-media selfie` with a strong `--scene-action` describing the product hold, demo, and interaction.',
    '',
    'If the user wants a feature not listed in the router above, offer `agent-media selfie` when the request can be expressed as one actor, one setting, dialogue/action, and optional props/product handling.',
    '',
    '## Reference files (lazy-loaded)',
    '',
    'Open these only when you need them:',
    '',
    '- [`reference/conversation-flow.md`](reference/conversation-flow.md) — the 4 gate questions, in order, with example wording',
    '- [`reference/subtitle-styles.md`](reference/subtitle-styles.md) — all 17 subtitle styles',
    '- [`reference/realism-rubric.md`](reference/realism-rubric.md) — visual-quality guard the pipeline enforces',
    '- [`reference/errors.md`](reference/errors.md) — common errors + remediation',
    ...generators.map(
      (g) =>
        `- [\`reference/generators/${g.id}.md\`](reference/generators/${g.id}.md) — ${g.summary}`,
    ),
    '',
  ].join('\n');
}

function renderConversationFlow(): string {
  return [
    GENERATED_NOTE,
    '',
    '# Conversation flow — MUST READ before any agent-media call',
    '',
    '> **CRITICAL:** Output quality is directly tied to how well you collect these inputs. Run the 4 gates in order. Do not skip, combine, or bulk-fire them.',
    '',
    '## Director\'s principle: PROPOSE, don\'t interrogate',
    '',
    'Pre-fill what you can infer from the prompt and ask the user to confirm or red-line it. Do not hand them a blank form. The pipeline will fill remaining gaps, but better user input produces better portrait, sheet, wireframe, and video outputs.',
    '',
    '## The 4 gates (in order, one message each)',
    '',
    '### Gate 1 — Confirm duration first',
    '',
    'Start by asking duration first. Use script-pacing guidance to propose the right value and avoid filler audio.',
    '',
    '| Duration | Sweet-spot script length |',
    '|---|---:|',
    '| 5s | 10-20 words (single hook, 1 punchy sentence) |',
    '| 10s | 20-40 words (default UGC, 2-3 sentences) |',
    '| 15s | 30-60 words (mini-story, setup + reveal) |',
    '',
    'Allowed durations: `5`, `10`, `15` only. The schema rejects 6, 8, 12, etc.',
    '',
    '> *"Quick first choice: do you want **5s**, **10s**, or **15s**? If you already have script length in mind, I can map it: 10-20 words ≈ 5s, 20-40 ≈ 10s, 30-60 ≈ 15s."*',
    '',
    'If they give script first and duration is missing, still make duration Gate 1 by proposing the best fit from word count before moving on.',
    '',
    '### Gate 2 — Confirm script or action',
    '',
    'If the clip has speech, confirm the script verbatim. The script is spoken as-is.',
    '',
    '> *"Quick check before the camera rolls — script is: «<paste the exact line>». Sound right, or want to tweak?"*',
    '',
    'If the clip has no speech, confirm the `scene_action` and pass `--background-music` with a short direction unless the user explicitly wants silence.',
    '',
    '### Gate 3 — Confirm the CHARACTER',
    '',
    '🛑 **DO NOT ask the user if they have a saved character or a `char_xxx` id.** The user does not know what that means. They don\'t remember ids. They don\'t care about the format.',
    '',
    '**Instead, YOU run the command. YOU map the result to a human-friendly question.**',
    '',
    'Step 1 — run silently (don\'t print the raw output to the user):',
    '',
    '```bash',
    'agent-media character list --json',
    '```',
    '',
    'Step 2 — interpret the result and ask the right question:',
    '',
    '**Case A — list is empty.** Skip the character question entirely. Just confirm the description from the user\'s original prompt:',
    '',
    '> *"Going with: «25yo asian woman, long wavy dark hair, soft smile». Add anything? (skin tone, face shape, makeup baseline, anything specific)"*',
    '',
    'DO NOT mention "saved characters", "previous runs", or `char_xxx` ids in this case. The user has none and doesn\'t need to know that\'s a concept.',
    '',
    '**Case B — list has 1+ saved characters.** Present them BY NAME with a one-line description. Never show the user the `char_xxx` id — that\'s an internal handle.',
    '',
    '> *"You\'ve made a few characters before — want to reuse one, or generate a new one for this?"*',
    '> *"• **Sofia** — 25yo asian woman, long wavy dark hair (made 3d ago)"*',
    '> *"• **Aiko** — 30yo japanese woman, bob cut (made 1w ago)"*',
    '> *"• **Marcus** — 28yo black man, locs (made 2w ago)"*',
    '> *"Reply with a name (e.g. `Sofia`) or say `new`."*',
    '',
    'When the user replies "Sofia", YOU map "Sofia" → the matching `char_xxx` id internally from the list output. Never ask the user to type the id.',
    '',
    '🛑 **NEVER auto-pick.** Even if there\'s only one saved character. Even if it "looks like a match" for the prompt. Wait for the user to name the one they want, or say "new".',
    '',
    '**For "new" (or empty-list case):** confirm the description:',
    '',
    '> *"Got it — new character. Going with: «<echo description»? Add anything?"*',
    '',
    '**Default to description-only when creating new.** agent-media generates the character image from text — no photo required. Only ask for a photo if the user explicitly says "use THIS person" and provides one.',
    '',
    'Once the user picks a name OR confirms a new description, move to Gate 4. Pass the resolved character to the selfie call as `--character char_xxx` (saved) OR `--description "..."` (new).',
    '',
    '### Gate 4 — DIRECTOR\'S BRIEF',
    '',
    'This is where most quality is decided. In one message, propose a complete brief with sensible defaults. The user replies `y` to accept all, or overrides individual lines.',
    '',
    'Most of the brief flows into two flags: visual details → `--description`; motion, prop handling, product demos, turns, outfit checks, dances, walking, or non-default behavior → `--scene-action`. The pipeline infers good defaults for the rest.',
    '',
    '**Optional realism overrides** (use only when the user asks for one of these explicitly — defaults already work):',
    '',
    '- `--shot-preset <name>` — pin the scene composition (e.g. `car-quick-honest-review`, `bedroom-morning-ritual`, `gym-post-workout`). Pass `custom-scene:<text>` for one-offs. Useful when the user names a specific location and you want to lock it.',
    '- `--vibe <name>` — pin the actor\'s energy/tone (`excited`, `calm`, `sassy`, `serious`, `curious`). Useful when the user says e.g. "make it sassy" or "keep it serious".',
    '- `--camera-locked` — lock the camera (no handheld motion). Use for product/demo shots where a stable frame matters. Default is handheld — leave it off for normal UGC.',
    '- `--phone-in-frame <forbidden|optional|required>` — control whether the actor holds a phone on screen. Default `optional` (phone may appear if natural). Use `required` when the user asks for a "talking to phone" or "iPhone-cover" composition, `forbidden` when the user explicitly wants no phone visible.',
    '- `--polish <off|default|heavy>` — final-look intensity. Default `default` (recommended). Use `heavy` for a more stylized vintage look, `off` if the user wants the raw model output.',
    '',
    'When in doubt, OMIT these flags. The director\'s brief is doing the heavy lifting.',
    '',
    '**A. Intent + Performance**',
    '',
    '- **Intent / use-case** — paid ad, organic post, honest review, storytime, unboxing, product demo, etc.',
    '- **Delivery** — natural, excited, calm, serious, playful, skeptical, warm, etc. This is descriptive only; it goes into the prompt, not a CLI flag.',
    '- **Script / speech** — exact line if spoken; no invented dialogue.',
    '',
    '**B. Scene + Look**',
    '',
    '- **Setting** — real-world location, time of day, background details.',
    '- **Lighting** — natural window light, soft bedroom daylight, warm evening lamp, etc.',
    '- **Framing** — close-up, medium close-up, medium, or wide/full-body when outfit/action matters.',
    '- **Wardrobe / hair / makeup** — include only useful visual details.',
    '- **Props + action** — product held, shown, sprayed, opened, worn, pointed at, demonstrated, etc. This should become `--scene-action`.',
    '',
    '**C. Output**',
    '',
    '- **Platform / aspect** — Selfie outputs 9:16 vertical for TikTok/Reels/Shorts.',
    '- **Subtitles** — on by default; pass `--subtitles false` if the user says no subs/captions.',
    '- **Background music** — pass only when requested or when there is no script.',
    '',
    '**Exact template to use:**',
    '',
    '> *"Here\'s the shot I\'d direct — reply `y` to lock all, or override individual lines:*',
    '>',
    '> ***A. Intent + Performance***',
    '> *• **Intent:** `[organic product demo]`*',
    '> *• **Delivery:** `[warm, confident, conversational]`*',
    '> *• **Script:** `[paste exact script]`*',
    '>',
    '> ***B. Scene + Look***',
    '> *• **Setting:** `[bright bedroom near a wooden dresser]`*',
    '> *• **Lighting:** `[warm late-morning window light]`*',
    '> *• **Framing:** `[medium, enough room for product and outfit action]`*',
    '> *• **Wardrobe / hair:** `[cream jacket over fitted top, loose blonde waves]`*',
    '> *• **Prop + action:** `[frosted perfume bottle — show label, spray wrist, remove jacket tastefully, turn once, face camera again]`*',
    '>',
    '> ***C. Output***',
    '> *• **Platform / aspect:** `[TikTok / Reels / Shorts — 9:16]`*',
    '> *• **Subtitles:** `[on]`*',
    '> *• **Background music:** `[none, dialogue only]`*',
    '>',
    '> *`y` to lock, or tell me what to change (e.g. "wardrobe to silk robe, no subs")."*',
    '',
    'When the user accepts, build `--description` from identity + look, and build `--scene-action` from the setting + action + prop interaction. Example:',
    '',
    '- `--description "28yo fit blonde woman, stylish natural fragrance UGC creator, cream jacket over fitted white top, loose blonde waves, bright bedroom daylight"`',
    '- `--scene-action "standing near a dresser, holding a frosted perfume bottle, showing the label and cap, spraying her wrist, smiling while talking, removing jacket tastefully, turning once, then facing camera again"`',
    '',
    'If the chosen duration does not fit the confirmed script, flag it and propose either a duration change or script rewrite before calling the CLI. Do not invent extra spoken words without approval.',
    '',
    '## After all 4 gates',
    '',
    '1. Echo the resolved inputs in ONE line: *"Got it: 10s bright-bedroom selfie · cream top · hair-oil bottle action. Running."*',
    '2. Call the CLI:',
    '   ```bash',
    '   agent-media selfie \\',
    '     --description "28yo fit blonde woman, stylish natural fragrance UGC creator, cream jacket over fitted white top, loose blonde waves, bright bedroom daylight" \\',
    '     --script "I keep getting DMs about my hair oil routine" \\',
    '     --scene-action "standing near a dresser, holding an amber hair-oil bottle and scrunching one curl mid-line" \\',
    '     --duration 10',
    '   ```',
    '3. If you need to show progress, poll `agent-media status <job_id> --json` about every 20-30 seconds. Open/show each new URL as soon as it appears: `portrait_url`, `character_sheet_url`/`sheet_url`, `wireframe_url`, then `video_url`.',
    '',
    '## crazy-look — silent reaction clips (DIFFERENT flow)',
    '',
    '`agent-media crazy-look` does NOT use the 4 selfie gates. No script, no subtitles, no music — the caption IS the content and ambient room tone is built in.',
    '',
    '**Rule 0 — a series begins with a character sheet.** Run `agent-media character list --json` silently. Starting a series with no saved character? Create one FIRST (`agent-media character create …`) — the saved sheet + pinned seed is what keeps the SAME face on every clip. Inline `--description` invents a NEW person per clip; only use it for a one-off test, never a series.',
    '',
    '**Gate 1 — caption.** Confirm the exact overlay text (burned over the full clip; deliberate typos read as authentic).',
    '',
    '**Gate 2 — nothing else unless the user directs it.** `--look`, `--framing`, and `--chaos` are optional and SAMPLED PER JOB when omitted: random look, weighted framing rotation (full-face / eyes-only / mouth-only / nose-up / medium), randomized beat arc. The volume workflow is the default — same caption + same character, N calls → N different performances. Pin look/framing/chaos only when explicitly asked.',
    '',
    '```bash',
    'agent-media character create --name "ashley" --description "21yo woman, long brown wavy hair, argyle cardigan"',
    'agent-media crazy-look --character char_XXXXXXXXXX --caption "WAIT there\'s an app that LOCKS your phone until you PRAY???"',
    '# run it again unchanged — different look, framing and beats, SAME face:',
    'agent-media crazy-look --character char_XXXXXXXXXX --caption "WAIT there\'s an app that LOCKS your phone until you PRAY???"',
    '```',
    '',
    '❌ Never run a crazy-look SERIES on `--description` — every clip gets a different person.',
    '',
    '## AUTOPILOT mode (explicit consent only)',
    '',
    'Trigger AUTOPILOT only when the user gives explicit consent, e.g. *"autopilot"*, *"just do it"*, *"just run it"*, *"use defaults"*, *"don\'t ask, fire"*.',
    '',
    'Behavior in AUTOPILOT:',
    '',
    '- Proceed end-to-end without re-asking each gate.',
    '- Infer missing details reasonably from the prompt and prior context.',
    '- Keep all safety/protocol constraints (no pricing talk, no char id exposure, no auto-picking saved character, subtitles/music handling rules).',
    '- Report assumptions in one compact line before running and allow a quick correction window.',
    '',
    'Example assumption line:',
    '',
    '> *"AUTOPILOT assumed: 10s, natural delivery, new character from your description, subtitles on, no background music. Running now — say `stop` in the next message to revise."*',
    '',
    'Default to `duration=10` unless script length clearly maps to 5s or 15s, and pass a concise `--scene-action` when prompt implies product handling or body movement.',
    '',
    '## DO NOT ask about cost or credits',
    '',
    'There is no 5th gate about pricing. The API debits internally and allows a soft overdraft so generations never get blocked. Never quote credit numbers or USD to the user — point them at <https://agent-media.ai/pricing> if they ask.',
    '',
    '## Anti-patterns — never do these',
    '',
    '- ❌ Calling `agent-media selfie` without running all 4 gates.',
    '- ❌ Asking the 4 gates as one giant message — they\'re sequential, one per turn.',
    '- ❌ Skipping Gate 4 (the director\'s brief). That\'s the gate that controls quality. Without it the output looks generic.',
    '- ❌ Asking blank questions ("what scene?") instead of proposing defaults ("here\'s the scene I\'d use — confirm?").',
    '- ❌ **Auto-picking a character from `agent-media character list`.** Even if there\'s only one, even if it\'s the "most recent" — you MUST show the user the list and wait for them to explicitly pick the id or say "new". Picking on their behalf wastes credits on the wrong person.',
    '- ❌ Forgetting to forward `subtitles: true` (or `--subtitles true`) on the selfie call when the user accepted the brief. The default is on, but defaults only fire if you don\'t override — be explicit.',
    '- ❌ **Defaulting to subtitles ON when the user explicitly says "no subs".** If the user\'s prompt or any Gate-3 reply contains "no subs", "without subtitles", "no captions", or similar — the call MUST include `--subtitles false` (CLI) or `subtitles: false` (REST). Failure mode: a subtitled video gets shipped against the user\'s wishes + the Whisper transcription may capture model garbage and burn it as text.',
    '- ❌ **Mismatching script length and duration** (e.g. 10-word script + 15s duration without enough visual action). Normal speech is 2-4 words/sec. Size duration to fit the script and action plan.',
    '- ❌ Passing removed flags such as `--preset`, `--voice-brief`, or `--sync` to the current v2 Selfie CLI. (Note: `--shot-preset` and `--vibe` ARE supported as optional overrides — use them only when the user explicitly pins a scene or tone.)',
    '- ❌ **Overriding the handheld camera default with `--camera-locked` for normal UGC.** Default handheld feel is the #1 realism cue — only lock the camera for product/demo shots where stability is essential.',
    '- ❌ **Forbidding phone-in-frame by default.** Default is `optional` — phone may appear if natural. Only set `--phone-in-frame forbidden` when the user explicitly says "no phone in frame".',
    '- ❌ **Disabling polish with `--polish off` unless the user asks for raw output.** The default polish pass is what makes the clip feel like real iPhone footage instead of a model render.',
    '- ❌ Waiting silently until the final video when intermediate URLs are available. Surface portrait, sheet, wireframe, and final video as each completes.',
    '- ❌ Asking for a photo when the user only gave a text description.',
    '- ❌ Suggesting a duration not in {5, 10, 15}.',
    '- ❌ **Mentioning credit cost, USD, or pricing to the user.** The API handles billing transparently. If asked about cost, point at <https://agent-media.ai/pricing>.',
    '- ❌ Falling back to `agent-media ugc` or any v1 command if v2 errors. Surface the error to the user instead.',
    '',
  ].join('\n');
}

function renderSubtitleStyles(): string {
  const SUBTITLE_STYLES = [
    'hormozi', 'minimal', 'bold', 'karaoke', 'clean', 'tiktok', 'neon', 'fire',
    'glow', 'pop', 'aesthetic', 'impact', 'pastel', 'electric', 'boxed',
    'gradient', 'spotlight',
  ];
  const HINT: Record<string, string> = {
    hormozi: 'Default. Big yellow caps. "Self-help" energy.',
    minimal: 'Small, white, subtle. Tasteful.',
    bold: 'Heavy serif. High contrast.',
    karaoke: 'Word-by-word highlight in sync with audio.',
    clean: 'Sans-serif, generous tracking.',
    tiktok: 'Classic TikTok auto-caption look.',
    neon: 'Glowing pink/cyan. Synthwave.',
    fire: 'Orange/red gradient. Hype.',
    glow: 'White with soft halo.',
    pop: 'Bubblegum. Playful.',
    aesthetic: 'Wispy, lowercase. Lifestyle.',
    impact: 'All-caps Impact font. Meme energy.',
    pastel: 'Soft pinks/blues.',
    electric: 'Blue glow + emphasis bursts.',
    boxed: 'Black box behind text.',
    gradient: 'Color gradient across each line.',
    spotlight: 'Faded background, highlighted current word.',
  };
  return [
    GENERATED_NOTE,
    '',
    '# Subtitle styles',
    '',
    'Pass via `--style <name>` on `agent-media subs` or `--subs-style <name>` on `agent-media selfie`. Default: `hormozi`.',
    '',
    '| Style | Look |',
    '|---|---|',
    SUBTITLE_STYLES.map((s) => `| \`${s}\` | ${HINT[s] ?? '—'} |`).join('\n'),
    '',
  ].join('\n');
}

function renderRealismRubric(): string {
  return [
    GENERATED_NOTE,
    '',
    '# Realism rubric (internal guard)',
    '',
    'The pipeline scaffolds prompts against this 9-point rubric. You usually don\'t need to think about it — but if a user complains about "fake-looking" output, this is what the pipeline is enforcing:',
    '',
    '1. Real-camera optics — focal length, depth-of-field, microcatchlights',
    '2. Skin texture — pores, sebum, asymmetry, no Photoshop smoothing',
    '3. Hair physics — flyaways, shine, natural fall',
    '4. Eye direction — meets camera, no dead-stare',
    '5. Lighting — natural sources, motivated highlights, no ring-light halo',
    '6. Wardrobe wear — wrinkles, layering, lived-in fabric',
    '7. Background — believable depth, props that match the scene',
    '8. Pose — neutral spine, natural hand position, no AI-mannequin stiffness',
    '9. Color cast — daylight white-balance, no orange tint',
    '',
    'If the output violates any of these, raise an issue with the job_id — the rubric is enforced at Stage A (portrait gen) and Stage B (character sheet).',
    '',
  ].join('\n');
}

function renderErrors(): string {
  return [
    GENERATED_NOTE,
    '',
    '# Common errors + fixes',
    '',
    '## CLI',
    '',
    '| Error | Fix |',
    '|---|---|',
    '| `ERR_MODULE_NOT_FOUND: @agentmedia/schema` | You\'re on an old CLI. Run `npm install -g agent-media-cli@latest`. |',
    '| `Not authenticated. Run agent-media login first.` | API key missing. Run `agent-media login`. |',
    '| `LOGIN_TIMEOUT` | Browser didn\'t complete OAuth in time. Re-run `agent-media login`. |',
    '| `DEPRECATED v1 command: agent-media ugc` | You called a legacy command. Switch to `agent-media selfie`. |',
    '',
    '## API',
    '',
    '| Code | Meaning | Fix |',
    '|---|---|---|',
    '| `VALIDATION_ERROR` | Input body failed schema. Check the `issues` array in the response. | Adjust args to match the input schema. |',
    '| `UNAUTHORIZED` | Bearer token missing or invalid. | Re-run `agent-media login`. |',
    '| `INSUFFICIENT_CREDITS` | Not enough credits on the account. | Run `agent-media subscribe` to top up. |',
    '| `WORKER_NOT_CONFIGURED` | Server-side misconfig — should not normally occur. | Ping support. |',
    '| `DATABASE_ERROR` | Server insert failed (often missing models row). | Ping support, report the job request. |',
    '',
  ].join('\n');
}

function renderGenerator(g: V2GeneratorRecord): string {
  const status = g.status === 'beta' ? ' · _beta_' : '';
  const examples = (g.cli?.examples ?? []) as readonly string[];
  return [
    GENERATED_NOTE,
    '',
    `# \`agent-media ${g.cli?.command ?? g.id}\`${status}`,
    '',
    g.summary,
    '',
    '## When to use',
    '',
    g.description,
    '',
    '## CLI',
    '',
    examples.length
      ? '```bash\n' + examples.join('\n') + '\n```'
      : `\`agent-media ${g.cli?.command ?? g.id} --help\``,
    '',
    '## MCP tool',
    '',
    g.mcp ? `\`${g.mcp.toolName}\`` : '_Not exposed as an MCP tool._',
    '',
    '## REST',
    '',
    g.rest ? `\`${g.rest.method} ${g.rest.path}\`` : '_Not exposed via REST._',
    '',
    '## Input schema',
    '',
    fmtInputSchema(g),
    '',
    '## Related references',
    '',
    g.id === 'selfie'
      ? [
          '- [`../conversation-flow.md`](../conversation-flow.md) — MUST-READ before calling this command',
          '- [`../subtitle-styles.md`](../subtitle-styles.md) — all 17 subtitle styles',
          '- [`../realism-rubric.md`](../realism-rubric.md) — visual-quality guard',
        ].join('\n')
      : g.id === 'character_create'
        ? [
            '- [`../conversation-flow.md`](../conversation-flow.md) — MUST-READ before calling this command',
            '- [`./selfie.md`](./selfie.md) — once you have a `char_…`, use it here',
          ].join('\n')
        : [
            '- [`../subtitle-styles.md`](../subtitle-styles.md) — all 17 styles',
          ].join('\n'),
    '',
  ].join('\n');
}

function emitSkillTree(): EmittedFile[] {
  const generators = Object.values(V2_GENERATORS);
  return [
    { relPath: 'SKILL.md', content: renderSkillIndex() },
    { relPath: 'reference/conversation-flow.md', content: renderConversationFlow() },
    { relPath: 'reference/subtitle-styles.md', content: renderSubtitleStyles() },
    { relPath: 'reference/realism-rubric.md', content: renderRealismRubric() },
    { relPath: 'reference/errors.md', content: renderErrors() },
    ...generators.map((g) => ({
      relPath: `reference/generators/${g.id}.md`,
      content: renderGenerator(g),
    })),
  ];
}

// ── Run ────────────────────────────────────────────────────────────────────

function main() {
  // 1. API reference (unchanged — still a single file)
  mkdirSync(dirname(DOCS_OUT), { recursive: true });
  const docs = renderApiReference();
  writeFileSync(DOCS_OUT, docs, 'utf8');
  console.log(`✓ wrote ${DOCS_OUT} (${docs.length} bytes)`);

  // 2. Skill tree (one file per concern)
  mkdirSync(SKILL_DIR, { recursive: true });
  mkdirSync(resolve(SKILL_DIR, 'reference'), { recursive: true });
  mkdirSync(resolve(SKILL_DIR, 'reference/generators'), { recursive: true });

  const files = emitSkillTree();
  let totalBytes = 0;
  for (const f of files) {
    const abs = resolve(SKILL_DIR, f.relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content, 'utf8');
    totalBytes += f.content.length;
    console.log(`✓ wrote ${f.relPath} (${f.content.length} bytes)`);
  }
  console.log(`  total: ${files.length} files, ${totalBytes} bytes`);
  console.log(`  generators emitted: ${Object.keys(V2_GENERATORS).length}`);
}

main();
