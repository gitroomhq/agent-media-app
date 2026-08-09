<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# Conversation flow — MUST READ before any agent-media call

> **CRITICAL:** Output quality is directly tied to how well you collect these inputs. Run the 4 gates in order. Do not skip, combine, or bulk-fire them.

## Director's principle: PROPOSE, don't interrogate

Pre-fill what you can infer from the prompt and ask the user to confirm or red-line it. Do not hand them a blank form. The pipeline will fill remaining gaps, but better user input produces better portrait, sheet, wireframe, and video outputs.

## The 4 gates (in order, one message each)

### Gate 1 — Confirm duration first

Start by asking duration first. Use script-pacing guidance to propose the right value and avoid filler audio.

| Duration | Sweet-spot script length |
|---|---:|
| 5s | 10-20 words (single hook, 1 punchy sentence) |
| 10s | 20-40 words (default UGC, 2-3 sentences) |
| 15s | 30-60 words (mini-story, setup + reveal) |

Allowed durations: `5`, `10`, `15` only. The schema rejects 6, 8, 12, etc.

> *"Quick first choice: do you want **5s**, **10s**, or **15s**? If you already have script length in mind, I can map it: 10-20 words ≈ 5s, 20-40 ≈ 10s, 30-60 ≈ 15s."*

If they give script first and duration is missing, still make duration Gate 1 by proposing the best fit from word count before moving on.

### Gate 2 — Confirm script or action

If the clip has speech, confirm the script verbatim. The script is spoken as-is.

> *"Quick check before the camera rolls — script is: «<paste the exact line>». Sound right, or want to tweak?"*

If the clip has no speech, confirm the `scene_action` and pass `--background-music` with a short direction unless the user explicitly wants silence.

### Gate 3 — Confirm the CHARACTER

🛑 **DO NOT ask the user if they have a saved character or a `char_xxx` id.** The user does not know what that means. They don't remember ids. They don't care about the format.

**Instead, YOU run the command. YOU map the result to a human-friendly question.**

Step 1 — run silently (don't print the raw output to the user):

```bash
agent-media character list --json
```

Step 2 — interpret the result and ask the right question:

**Case A — list is empty.** Skip the character question entirely. Just confirm the description from the user's original prompt:

> *"Going with: «25yo asian woman, long wavy dark hair, soft smile». Add anything? (skin tone, face shape, makeup baseline, anything specific)"*

DO NOT mention "saved characters", "previous runs", or `char_xxx` ids in this case. The user has none and doesn't need to know that's a concept.

**Case B — list has 1+ saved characters.** Present them BY NAME with a one-line description. Never show the user the `char_xxx` id — that's an internal handle.

> *"You've made a few characters before — want to reuse one, or generate a new one for this?"*
> *"• **Sofia** — 25yo asian woman, long wavy dark hair (made 3d ago)"*
> *"• **Aiko** — 30yo japanese woman, bob cut (made 1w ago)"*
> *"• **Marcus** — 28yo black man, locs (made 2w ago)"*
> *"Reply with a name (e.g. `Sofia`) or say `new`."*

When the user replies "Sofia", YOU map "Sofia" → the matching `char_xxx` id internally from the list output. Never ask the user to type the id.

🛑 **NEVER auto-pick.** Even if there's only one saved character. Even if it "looks like a match" for the prompt. Wait for the user to name the one they want, or say "new".

**For "new" (or empty-list case):** confirm the description:

> *"Got it — new character. Going with: «<echo description»? Add anything?"*

**Default to description-only when creating new.** agent-media generates the character image from text — no photo required. Only ask for a photo if the user explicitly says "use THIS person" and provides one.

Once the user picks a name OR confirms a new description, move to Gate 4. Pass the resolved character to the selfie call as `--character char_xxx` (saved) OR `--description "..."` (new).

### Gate 4 — DIRECTOR'S BRIEF

This is where most quality is decided. In one message, propose a complete brief with sensible defaults. The user replies `y` to accept all, or overrides individual lines.

Most of the brief flows into two flags: visual details → `--description`; motion, prop handling, product demos, turns, outfit checks, dances, walking, or non-default behavior → `--scene-action`. The pipeline infers good defaults for the rest.

**Optional realism overrides** (use only when the user asks for one of these explicitly — defaults already work):

- `--shot-preset <name>` — pin the scene composition (e.g. `car-quick-honest-review`, `bedroom-morning-ritual`, `gym-post-workout`). Pass `custom-scene:<text>` for one-offs. Useful when the user names a specific location and you want to lock it.
- `--vibe <name>` — pin the actor's energy/tone (`excited`, `calm`, `sassy`, `serious`, `curious`). Useful when the user says e.g. "make it sassy" or "keep it serious".
- `--camera-locked` — lock the camera (no handheld motion). Use for product/demo shots where a stable frame matters. Default is handheld — leave it off for normal UGC.
- `--phone-in-frame <forbidden|optional|required>` — control whether the actor holds a phone on screen. Default `optional` (phone may appear if natural). Use `required` when the user asks for a "talking to phone" or "iPhone-cover" composition, `forbidden` when the user explicitly wants no phone visible.
- `--polish <off|default|heavy>` — final-look intensity. Default `default` (recommended). Use `heavy` for a more stylized vintage look, `off` if the user wants the raw model output.

When in doubt, OMIT these flags. The director's brief is doing the heavy lifting.

**A. Intent + Performance**

- **Intent / use-case** — paid ad, organic post, honest review, storytime, unboxing, product demo, etc.
- **Delivery** — natural, excited, calm, serious, playful, skeptical, warm, etc. This is descriptive only; it goes into the prompt, not a CLI flag.
- **Script / speech** — exact line if spoken; no invented dialogue.

**B. Scene + Look**

- **Setting** — real-world location, time of day, background details.
- **Lighting** — natural window light, soft bedroom daylight, warm evening lamp, etc.
- **Framing** — close-up, medium close-up, medium, or wide/full-body when outfit/action matters.
- **Wardrobe / hair / makeup** — include only useful visual details.
- **Props + action** — product held, shown, sprayed, opened, worn, pointed at, demonstrated, etc. This should become `--scene-action`.

**C. Output**

- **Platform / aspect** — Selfie outputs 9:16 vertical for TikTok/Reels/Shorts.
- **Subtitles** — on by default; pass `--subtitles false` if the user says no subs/captions.
- **Background music** — pass only when requested or when there is no script.

**Exact template to use:**

> *"Here's the shot I'd direct — reply `y` to lock all, or override individual lines:*
>
> ***A. Intent + Performance***
> *• **Intent:** `[organic product demo]`*
> *• **Delivery:** `[warm, confident, conversational]`*
> *• **Script:** `[paste exact script]`*
>
> ***B. Scene + Look***
> *• **Setting:** `[bright bedroom near a wooden dresser]`*
> *• **Lighting:** `[warm late-morning window light]`*
> *• **Framing:** `[medium, enough room for product and outfit action]`*
> *• **Wardrobe / hair:** `[cream jacket over fitted top, loose blonde waves]`*
> *• **Prop + action:** `[frosted perfume bottle — show label, spray wrist, remove jacket tastefully, turn once, face camera again]`*
>
> ***C. Output***
> *• **Platform / aspect:** `[TikTok / Reels / Shorts — 9:16]`*
> *• **Subtitles:** `[on]`*
> *• **Background music:** `[none, dialogue only]`*
>
> *`y` to lock, or tell me what to change (e.g. "wardrobe to silk robe, no subs")."*

When the user accepts, build `--description` from identity + look, and build `--scene-action` from the setting + action + prop interaction. Example:

- `--description "28yo fit blonde woman, stylish natural fragrance UGC creator, cream jacket over fitted white top, loose blonde waves, bright bedroom daylight"`
- `--scene-action "standing near a dresser, holding a frosted perfume bottle, showing the label and cap, spraying her wrist, smiling while talking, removing jacket tastefully, turning once, then facing camera again"`

If the chosen duration does not fit the confirmed script, flag it and propose either a duration change or script rewrite before calling the CLI. Do not invent extra spoken words without approval.

## After all 4 gates

1. Echo the resolved inputs in ONE line: *"Got it: 10s bright-bedroom selfie · cream top · hair-oil bottle action. Running."*
2. Call the CLI:
   ```bash
   agent-media selfie \
     --description "28yo fit blonde woman, stylish natural fragrance UGC creator, cream jacket over fitted white top, loose blonde waves, bright bedroom daylight" \
     --script "I keep getting DMs about my hair oil routine" \
     --scene-action "standing near a dresser, holding an amber hair-oil bottle and scrunching one curl mid-line" \
     --duration 10
   ```
3. If you need to show progress, poll `agent-media status <job_id> --json` about every 20-30 seconds. Open/show each new URL as soon as it appears: `portrait_url`, `character_sheet_url`/`sheet_url`, `wireframe_url`, then `video_url`.

## crazy-look — silent reaction clips (DIFFERENT flow)

`agent-media crazy-look` does NOT use the 4 selfie gates. No script, no subtitles, no music — the caption IS the content and ambient room tone is built in.

**Rule 0 — a series begins with a character sheet.** Run `agent-media character list --json` silently. Starting a series with no saved character? Create one FIRST (`agent-media character create …`) — the saved sheet + pinned seed is what keeps the SAME face on every clip. Inline `--description` invents a NEW person per clip; only use it for a one-off test, never a series.

**Gate 1 — caption.** Confirm the exact overlay text (burned over the full clip; deliberate typos read as authentic).

**Gate 2 — nothing else unless the user directs it.** `--look`, `--framing`, and `--chaos` are optional and SAMPLED PER JOB when omitted: random look, weighted framing rotation (full-face / eyes-only / mouth-only / nose-up / medium), randomized beat arc. The volume workflow is the default — same caption + same character, N calls → N different performances. Pin look/framing/chaos only when explicitly asked.

```bash
agent-media character create --name "ashley" --description "21yo woman, long brown wavy hair, argyle cardigan"
agent-media crazy-look --character char_XXXXXXXXXX --caption "WAIT there's an app that LOCKS your phone until you PRAY???"
# run it again unchanged — different look, framing and beats, SAME face:
agent-media crazy-look --character char_XXXXXXXXXX --caption "WAIT there's an app that LOCKS your phone until you PRAY???"
```

❌ Never run a crazy-look SERIES on `--description` — every clip gets a different person.

## AUTOPILOT mode (explicit consent only)

Trigger AUTOPILOT only when the user gives explicit consent, e.g. *"autopilot"*, *"just do it"*, *"just run it"*, *"use defaults"*, *"don't ask, fire"*.

Behavior in AUTOPILOT:

- Proceed end-to-end without re-asking each gate.
- Infer missing details reasonably from the prompt and prior context.
- Keep all safety/protocol constraints (no pricing talk, no char id exposure, no auto-picking saved character, subtitles/music handling rules).
- Report assumptions in one compact line before running and allow a quick correction window.

Example assumption line:

> *"AUTOPILOT assumed: 10s, natural delivery, new character from your description, subtitles on, no background music. Running now — say `stop` in the next message to revise."*

Default to `duration=10` unless script length clearly maps to 5s or 15s, and pass a concise `--scene-action` when prompt implies product handling or body movement.

## DO NOT ask about cost or credits

There is no 5th gate about pricing. The API debits internally and allows a soft overdraft so generations never get blocked. Never quote credit numbers or USD to the user — point them at <https://agent-media.ai/pricing> if they ask.

## Anti-patterns — never do these

- ❌ Calling `agent-media selfie` without running all 4 gates.
- ❌ Asking the 4 gates as one giant message — they're sequential, one per turn.
- ❌ Skipping Gate 4 (the director's brief). That's the gate that controls quality. Without it the output looks generic.
- ❌ Asking blank questions ("what scene?") instead of proposing defaults ("here's the scene I'd use — confirm?").
- ❌ **Auto-picking a character from `agent-media character list`.** Even if there's only one, even if it's the "most recent" — you MUST show the user the list and wait for them to explicitly pick the id or say "new". Picking on their behalf wastes credits on the wrong person.
- ❌ Forgetting to forward `subtitles: true` (or `--subtitles true`) on the selfie call when the user accepted the brief. The default is on, but defaults only fire if you don't override — be explicit.
- ❌ **Defaulting to subtitles ON when the user explicitly says "no subs".** If the user's prompt or any Gate-3 reply contains "no subs", "without subtitles", "no captions", or similar — the call MUST include `--subtitles false` (CLI) or `subtitles: false` (REST). Failure mode: a subtitled video gets shipped against the user's wishes + the Whisper transcription may capture model garbage and burn it as text.
- ❌ **Mismatching script length and duration** (e.g. 10-word script + 15s duration without enough visual action). Normal speech is 2-4 words/sec. Size duration to fit the script and action plan.
- ❌ Passing removed flags such as `--preset`, `--voice-brief`, or `--sync` to the current v2 Selfie CLI. (Note: `--shot-preset` and `--vibe` ARE supported as optional overrides — use them only when the user explicitly pins a scene or tone.)
- ❌ **Overriding the handheld camera default with `--camera-locked` for normal UGC.** Default handheld feel is the #1 realism cue — only lock the camera for product/demo shots where stability is essential.
- ❌ **Forbidding phone-in-frame by default.** Default is `optional` — phone may appear if natural. Only set `--phone-in-frame forbidden` when the user explicitly says "no phone in frame".
- ❌ **Disabling polish with `--polish off` unless the user asks for raw output.** The default polish pass is what makes the clip feel like real iPhone footage instead of a model render.
- ❌ Waiting silently until the final video when intermediate URLs are available. Surface portrait, sheet, wireframe, and final video as each completes.
- ❌ Asking for a photo when the user only gave a text description.
- ❌ Suggesting a duration not in {5, 10, 15}.
- ❌ **Mentioning credit cost, USD, or pricing to the user.** The API handles billing transparently. If asked about cost, point at <https://agent-media.ai/pricing>.
- ❌ Falling back to `agent-media ugc` or any v1 command if v2 errors. Surface the error to the user instead.
