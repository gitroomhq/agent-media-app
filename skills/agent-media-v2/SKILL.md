---
name: agent-media-v2
description: 'AI UGC video production via the agent-media CLI (selfie, character, subs). BEFORE running ANY agent-media command you MUST first Read reference/conversation-flow.md and walk the user through the 4 gates IN ORDER — (1) confirm duration first with script-pacing guidance (~2.5 words/sec), (2) confirm script OR scene_action, and if there is no speech also propose background_music, (3) RUN `agent-media character list --json` YOURSELF (do not ask the user, do not mention char_xxx ids — present saved characters BY NAME if any, otherwise confirm the new description), (4) propose a director brief with setting, lighting, wardrobe, props/product, and action, passing non-default motion/product handling through --scene-action. AUTOPILOT exception: if the user explicitly says "autopilot", "just do it", or "run with defaults", proceed end-to-end without re-asking every gate, infer missing details reasonably, keep safety constraints, and report assumptions. While jobs run, poll status and open portrait, character sheet, wireframe, and final video as each URL appears. When the user says "no subs" pass --subtitles false. When there is no script pass --background-music. NEVER auto-pick a character. NEVER expose char_xxx ids. NEVER mention pricing/credits/USD.'
---

<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# agent-media — Claude skill

agent-media is a CLI for AI UGC video generation. This skill tells you how to drive it. **Loaded files are intentionally small** — open the right reference file for the task you have, don't try to memorize everything.

## 🛑 HARD GATE — read this first, every conversation

Before calling ANY `agent-media` shell command, you MUST:

1. **Read** [`reference/conversation-flow.md`](reference/conversation-flow.md) — the full 4-gate protocol with templates.
2. **Walk the user through 4 gates IN ORDER, one message each** — do not bulk-fire:
   - **Gate 1:** confirm duration first with **script-pacing guidance** (~2.5 words/sec). Propose a fit by word ceiling: 5s ≈ up to 12 words, 10s ≈ up to 25 words, 15s ≈ up to 37 words.
   - **Gate 2:** confirm the exact script (verbatim — typos land in the video), or confirm `scene_action` + `--background-music` when there is no speech.
   - **Gate 3:** confirm character. YOU run `agent-media character list --json` (do not ask the user "do you have a saved character?" — they don't know that's a thing). If the list is empty, just confirm the description from their original prompt. If non-empty, present each saved character BY NAME (not by `char_xxx` id — that format is internal). The user picks by NAME or says "new"; you map name → id internally. 🛑 NEVER auto-pick. NEVER show `char_xxx` ids to the user. Never ask for a photo by default.
   - **Gate 4:** propose a full **director's brief** with pre-filled fields in 3 sections — **A. Intent+Performance**, **B. Scene+Look**, **C. Output**. Put visual direction into `--description` and action/product handling into `--scene-action`. The shot composition and energy are inferred from the brief; you can OPTIONALLY pin them with `--shot-preset` and `--vibe`, or override the realism defaults with `--camera-locked` / `--phone-in-frame` / `--polish` (rare — only when the user explicitly asks for a stable shot, a phone-in-hand composition, or a different polish look).
3. Only then call the CLI.

**The director's brief at Gate 4 is non-optional.** It's where quality lives. Skipping it = generic output. PROPOSE smart defaults from the script + description; don't ask blank questions.

Calling the CLI without doing 1–3 is a protocol violation — the user gets a generic, mid video. Ask the extra questions.

## NEVER discuss pricing

Do NOT mention credit costs, USD amounts, or pricing tiers in any reply. Do NOT ask the user to "confirm cost". The API handles billing transparently. If the user asks about cost, point them at <https://agent-media.ai/pricing>. That is the only acceptable surface for pricing.

## What agent-media can do (router)

| Command | Use when | Deep-dive |
|---|---|---|
| **selfie** | AI UGC selfie video with generated actor, character sheet, storyboard board, and Seedance. | [`reference/generators/selfie.md`](reference/generators/selfie.md) |
| **character create** | Create a reusable AI character from a single photo. | [`reference/generators/character_create.md`](reference/generators/character_create.md) |
| **subs** | Burn styled subtitles onto an existing video. | [`reference/generators/subtitle.md`](reference/generators/subtitle.md) |

`agent-media skill update` — pull the latest skill files into ~/.claude/skills/agent-media-v2/.
`agent-media skill status` — print local vs remote version.

## What agent-media CANNOT do

These legacy v1 commands exist in the CLI binary for backwards compat but produce inferior output. They are hidden from `agent-media --help` for a reason. **Never call them.**

- ❌ `agent-media ugc` — uses a stale fixed actor library (200 actors picked at random). The actors look dated. Use `agent-media selfie` — it generates an on-model character from your description on every run.
- ❌ `agent-media show-your-app` — built on the v1 actor pool + manual screen-composite step. The v2 product is on the roadmap. For now, run `agent-media selfie` for the talking head and capture the screen separately.
- ❌ `agent-media laptop-ugc` — v1 only. Same story as show-your-app; v2 product coming.
- ❌ `agent-media character-video` — superseded by `agent-media selfie --character <id>`. The new command uses the current portrait → sheet → wireframe → Seedance pipeline.
- ❌ `agent-media text-to-video` — no character control; output is generic and off-brand. Use `agent-media selfie` with a saved character.
- ❌ `agent-media subtitle` (singular) — v1 burner with fewer styles and shakier sync. Use `agent-media subs` (plural).
- ❌ `agent-media review` — SaaS-review generator built on v1 actors. Compose with `agent-media selfie` + a script you write.
- ❌ `agent-media product-acting` — v1 product-in-hand generator. For now, use `agent-media selfie` with a strong `--scene-action` describing the product hold, demo, and interaction.

If the user wants a feature not listed in the router above, offer `agent-media selfie` when the request can be expressed as one actor, one setting, dialogue/action, and optional props/product handling.

## Reference files (lazy-loaded)

Open these only when you need them:

- [`reference/conversation-flow.md`](reference/conversation-flow.md) — the 4 gate questions, in order, with example wording
- [`reference/subtitle-styles.md`](reference/subtitle-styles.md) — all 17 subtitle styles
- [`reference/realism-rubric.md`](reference/realism-rubric.md) — visual-quality guard the pipeline enforces
- [`reference/errors.md`](reference/errors.md) — common errors + remediation
- [`reference/generators/selfie.md`](reference/generators/selfie.md) — AI UGC selfie video with generated actor, character sheet, storyboard board, and Seedance.
- [`reference/generators/character_create.md`](reference/generators/character_create.md) — Create a reusable AI character from a single photo.
- [`reference/generators/subtitle.md`](reference/generators/subtitle.md) — Burn styled subtitles onto an existing video.
