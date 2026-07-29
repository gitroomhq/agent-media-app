# make_ugc design

I have enough grounding. The P0 status fix (pre-insert skill_runs row before workflow.start) is already present in both dispatchers (skills.ts:308-323 and 378-394). P2 is the MCP poll-URL bug (mcp.ts:199-201 prints `run_id` + `/v1/primitives/runs/` which is wrong for composed skills). Issue #5 is the long-monologue-trimmed-to-5s bug. Now I'll synthesize the final recommendation.

---

# Recommended design: `make_ugc` — one thin facade over the existing skills/worker

## 0. Grounding corrections (the lenses got several paths wrong)

Before the design, the facts the three lenses cited incorrectly — all verified against the tree:

- **There are 9 SKILLS, not "9 + make_ugc_video + make_broll_talking_head"**: registry.ts:158-249 holds `make_portrait, make_character_sheet, make_simple_selfie, make_product_in_hands, make_subtitles, make_wireframe, make_lip_sync, make_ugc_video, make_broll_talking_head`. The lenses all forgot `make_product_in_hands`. make_ugc is the **10th** entry.
- **mcp.ts lives at `services/api-v2/src/routes/mcp.ts`** (not `routes/v1/mcp.ts`). The vNext skill-list builder is `mcp.ts:90-106` and is **already flag-guarded** by `isPrimitivesRouteEnabled()`.
- **credit-quotes.ts lives at `services/api-v2/src/skills/credit-quotes.ts`** (not `src/lib/`). It already has the broll take-planner (`chunkScript`/`fitDuration`/`splitIntroMoves`/`brollTakeDurations`, lines 36-97) AND a `make_ugc_video` case (133-143). All the routing helpers I need are already here.
- **`BrollTalkingHeadToolInputSchema.broll_video_url` is REQUIRED** (contracts.ts source, no `.optional()`), `script` max is **1200**, `duration` is a numeric range (not the {10,15,20,25,30} union two lenses claimed). The required-broll constraint is real and load-bearing for the long-no-broll path.
- **The P2 bug is already live in mcp.ts:199-201**: on a composed skill the CallTool forward prints `Run id: ${sub.run_id}` (undefined — the composed dispatchers return `skill_run_id`) and `Poll with GET /v1/primitives/runs/<run_id>` — the **wrong table**. Composed runs must poll `GET /v1/skills/runs/<skill_run_id>` (getSkillRunRoute, skills.ts:464). So today an agent that calls make_ugc_video over MCP literally cannot poll its run. make_ugc must fix this.
- **The P0 status fix already exists** in both composed dispatchers: the `skill_runs` row is INSERTed with `status:'submitted', current_step:'pending'` (skills.ts:308-323 and 378-394) **before** `client.workflow.start`. make_ugc inherits it for free by delegating.

**Chosen base lens: BACKWARD-COMPAT FACADE**, because its skill_runs/cancel/workflowId invariant is the only one of the three that survives contact with the real code (cancel reconstructs `${skill_slug}-${id}` at skills.ts:557; poll regex-validates a UUID at skills.ts:471). I graft AGENT-DX-FIRST's tiny self-describing prop surface and its "presence-of-broll = b-roll route" inference, and RESULTS-FIDELITY's explicit anti-truncation invariant and identity-resolution helper.

---

## 1. What make_ugc is

A **pure router**. It adds **zero** generation code, **zero** new Temporal workflowType, **zero** new credit math. It Zod-validates its own props, runs ONE identity-resolution + route-decision function, builds the body of an **existing** composed dispatcher, and calls that dispatcher verbatim. Worker, `skill_runs` row, artifacts, `final_output.video_url` are byte-identical to calling the underlying skill directly today.

The whole change set:
1. New `MakeUgcSkillInputSchema` + a 10th `SkillEntry` (registry.ts).
2. A new branch at the top of `runSkillRoute` (skills.ts) → `dispatchMakeUgc()` which resolves identity, picks a route, and calls the existing `dispatchMakeUgcVideo` / `dispatchBrollTalkingHead` / generic-primitive path.
3. A `case 'make_ugc'` in `quoteSkillCredits` that resolves the route (shared function) then delegates to the underlying slug's existing numbers.
4. An `agentFacing` flag on `SkillEntry`; mcp.ts:90-106 and generate-public-skill.ts:444 filter on it.
5. Fix mcp.ts:187-204 to read `skill_run_id` and print the `/v1/skills/runs/` poll URL for composed routes (this **is** the P2 fix, needed regardless).

---

## 2. Props contract (`MakeUgcSkillInputSchema`)

Self-describing — every field's `.describe()` is the agent's manual (zodToJsonSchema emits them per-property at mcp.ts:92-100). DX-first minimal surface; only `script` requires thought.

```
script        string 1..1200   conditionally required. ".describe": "What the person SAYS — any length.
                                A one-liner makes one clip; a full monologue makes the full multi-take
                                video automatically — never trimmed. This is usually the only field you set."
scene_action  string 3..400    conditionally required (alternative to script). "A silent action clip
                                (dancing, b-roll, vibes) with no dialogue."
.refine(script XOR scene_action) → "provide either script (what they say) or scene_action (a silent clip)"

— IDENTITY (all optional; at most ONE; none → a person is generated from a default) —
person        string 8..400    "Describe the person in words. Omit if you pass image or character."
image         string           "A photo of the person — public https URL OR base64 data URL/raw base64.
                                The face is locked to it." (facade sniffs ^https?:// vs base64)
character     string           "Reuse a saved character: its character_id (char_…) OR its
                                character_sheet_url from list_characters."
name          string ≤80,≤10w  "Name/age/vibe hint, e.g. 'Sophia, 28'."
.refine(≤1 of person|image|character)

— B-ROLL (presence = b-roll route; agent never picks a skill) —
broll_url     string https     "A b-roll/gameplay/product video overlaid on the lower half while the
                                person narrates. Passing this makes it a b-roll review."

— CREATIVE KNOBS (all defaulted; agent rarely sets) —
duration      5|10|15|20|25|30 optional. "Leave blank — length is inferred from the script. Set only to
                                force a short clip."   (no default — absence means 'infer')
captions      boolean = true
caption_style 'hormozi'|'tiktok'|'minimal' = 'hormozi'
look          'natural'|'commercial'|'raw_iphone' = 'natural'   (→ realism_target)
aspect_ratio  '9:16'|'1:1' = '9:16'
music         boolean|string   optional, scene_action path only   (→ background_music)
```

Deliberately **NOT** exposed (inferred/internal): which sub-skill, take count, `---` marker, `broll_width_rate`/`broll_start_time`/`broll_fade_out`, `overlay_size`/`position`, `portrait_url`-as-second-reference, `n_panels`, `location`/`pose` (fold into `person` text), per-keyword caption colors (the worker has no such capability — exposing it would mean new generation code, RESULTS-FIDELITY lens is right to refuse). Power users keep all of these via the 9 REST skills.

The polymorphic `image`/`character` props move validation from Zod into the facade's sniffer (AGENT-DX tradeoff #3) — acceptable, but the facade's 400 messages **must** be as crisp as the existing `.refine` messages.

---

## 3. Routing table (`dispatchMakeUgc`, top of runSkillRoute; first match wins)

A single shared `decideRoute(props) → { slug, body }` function is used by **both** the run path and the quote `case` so preflight can never disagree with what runs (this is the exact class of bug commits 54f47db2 / 587286b6 fixed for broll). Length classification imports `countWords`/`fitDuration`/`chunkScript`/`brollTakeDurations` from credit-quotes.ts — **never re-implemented**.

**Step A — identity resolution** (runs first; reuses existing uploads + the `user_characters` lookup dispatchBrollTalkingHead already does at skills.ts:400-409):
- `character` = `char_…` → look up `user_characters.public_id` → `character_sheet_url`.
- `character` = https URL → use as `character_sheet_url` directly.
- `image` → base64 ⇒ `uploadUserImageBase64(userId, image)`; https ⇒ `uploadUserImageFromUrl(userId, image)` (both already imported, skills.ts:11) → `portrait_url`.
- `person` → description identity.
- none → supply a minimal default `person` so "just make a video saying X" renders (DX choice; the alternative 400 is harsher).

**Step B — content route** (evaluated top-down):

| # | Condition | → underlying slug | Body built / dispatcher called |
|---|-----------|-------------------|-------------------------------|
| 1 | `broll_url` present | **make_broll_talking_head** | `actor_image_url` = resolved sheet/portrait, `broll_video_url` = broll_url, `script` (any length — worker chunks via brollTakeDurations), `subtitles`=captions, `aspect_ratio`. The route's existing rehost (skills.ts:164-180) + `dispatchBrollTalkingHead(res,userId,body)` (skills.ts:373) run **unchanged**, including the `---` intro/moves path. |
| 2 | no broll, `script` word-count **> single-clip ceiling** (`fitDuration` would exceed 15s, i.e. >~33 words, or contains `---`) | **make_broll_talking_head** (no-overlay mode) | **THE ISSUE #5 FIX.** broll is the only existing engine that makes >15s from one script; its worker chunks into ≤10s last-frame-chained takes. `broll_video_url` is **required** by the schema, so the facade must supply a no-op overlay → see §7 risk. The full monologue is produced as N takes, never trimmed to 5s. |
| 3 | short `script` (≤ ceiling) **with** resolved `character_sheet_url` | **make_simple_selfie** | Skip portrait+sheet. Generic primitive dispatch (runSkillRoute's existing path, skills.ts:235-276) with `SimpleSelfieToolInputSchema` body. |
| 4 | short `script`, identity is `person`/`image`/default | **make_ugc_video** | Full portrait→sheet→selfie→subtitles. `dispatchMakeUgcVideo(req,res,userId,body,idemKey)` (skills.ts:279). |
| 5 | `scene_action` (no script) | **make_simple_selfie** (or **make_ugc_video** if no sheet yet) | Non-speech clip + `music`→`background_music`. |

Every arrow lands on an **existing** dispatcher with an **existing** body shape. The facade owns only the branching, never generation.

**Critical invariant (from BACKWARD-COMPAT lens, verified):** the `skill_runs.skill_slug` MUST stay the **underlying** slug (`make_ugc_video` / `make_broll_talking_head`) because cancel-by-id and the workflowId both reconstruct `${skill_slug}-${id}` (skills.ts:557, 442, 351). Stamp `make_ugc` provenance in a **separate** column (`requested_via`) for analytics — never overwrite `skill_slug`, or cancel/poll silently break. (This needs a one-column additive migration; until it ships, provenance can live in the `input` jsonb.)

---

## 4. Credits (no new pricing)

`quoteSkillCredits` (credit-quotes.ts:99) gets `case 'make_ugc'`: call the shared `decideRoute(input)`, then return `quoteSkillCredits(resolvedSlug, resolvedBody)`. Because the broll case already prices the **exact** per-take plan (credit-quotes.ts:119-132), the long-monologue route is correctly quoted take-by-take — preflight 402 (skills.ts:184-193) and the `/quote` route (skills.ts:46) stay correct with zero number changes. The shared `decideRoute` is the single source of truth that keeps quote and run from drifting.

---

## 5. Agent surface (one tool)

**tools/list** (mcp.ts:90-106): change `Object.values(SKILLS).map(...)` to `Object.values(SKILLS).filter(s => s.agentFacing).map(...)`, with `agentFacing:true` set **only** on `make_ugc`. Result returned to Claude/Codex:
- `make_ugc` (the one generation tool)
- `list_characters` (read-only, already separate, mcp.ts:113)
- the `V2_GENERATORS` with `.mcp` + social/publish tools (separate question — leave as-is for now; can be gated behind the same flag later)

The other 9 skills are **HIDDEN, not removed**: dropped from tools/list + the public pack only. They stay in `SKILLS`, stay REST-reachable, stay CLI-reachable, stay individually quotable, still resolve in CallTool's `skillBySlug` forward (mcp.ts:158).

make_ugc's listEntry: `name='make_ugc'`, `description` = the registry string *("The ONE tool for UGC video. Give a script (any length) and optionally a person/image/character; it makes the finished captioned vertical video — short script → one clip, long monologue → full multi-take, b-roll video → narrated overlay. You never pick a sub-tool.")*, `inputSchema = zodToJsonSchema(MakeUgcSkillInputSchema)` with all the `.describe()` text inline.

**CallTool**: rides the existing `skillBySlug` forward (mcp.ts:158-208) to `POST /v1/skills/make_ugc/run`. **Fix mcp.ts:187-204** (the P2 fix, required anyway): read `sub.skill_run_id ?? sub.run_id`, and when `skill_run_id` is present print `Poll with GET /v1/skills/runs/<skill_run_id>` instead of the broken `/v1/primitives/runs/<run_id>`. The facade always returns `skill_run_id` (every route resolves to a composed dispatcher, or for the simple_selfie sub-path the facade wraps it in a skill_runs row too) so the agent has **ONE** poll URL regardless of which sub-skill ran. Status/timeline is unchanged: `GET /v1/skills/runs/<id>` (skills.ts:464) returns `status`, `current_step`, `steps[].artifacts`, `final_output.video_url`.

**Public-skill pack** (generate-public-skill.ts): scope the per-skill SKILL.md loop (line 444) and the README "Skills" list (readme(), line 261-339) and the `allowed-tools` (line 469) to the `agentFacing` set → ships ONE `skills/make-ugc/SKILL.md` as start-here, plus the rewritten `agent-media-ugc` playbook ("always call make_ugc") and `publish-to-social`. Add `COSTS['make_ugc']` (= "depends on route; ~225–505 single-clip, per-take for long/broll") and `EXAMPLE_INPUTS['make_ugc'] = { script: "...", character: "char_… or a sheet url" }` so the generator doesn't print '?'. The 9 other SKILL.md files stop being generated (REST + CLI still reach them).

---

## 6. How the two issue-#5 cases work in ONE call

**Full monologue:** agent passes the entire monologue as `script`, no `duration`. Route step 2 fires (word-count > single-clip ceiling) → make_broll_talking_head (no-overlay) → the worker + `brollTakeDurations` chunk it into N ≤10s last-frame-chained takes (`chunkScript` groups ≤28 words, `fitDuration` sizes each, `splitIntroMoves` honors `---`). The FULL video is produced, never trimmed. Scripts >1200 chars are out of one call's scope — the field description says "one call = up to ~30s; longer is multiple scenes."

**"Sophia from image_21.png":** agent passes `image` = base64/URL + `name`="Sophia". Identity resolution uploads via `uploadUserImageBase64` → `portrait_url`, sets `character_description`="Sophia". Short script → make_ugc_video portrait_url path (auto-builds sheet, locks face — skills.ts:299). Long script → resolve a sheet (make_character_sheet) → broll multi-take. Either way: image in, finished captioned video out, one call. Next time the agent passes `character` = saved char_…/sheet → skips portrait+sheet via step 3.

---

## 7. Risks (named, with the one unverified assumption)

1. **HIGHEST RISK — long-script-no-broll needs a no-op overlay. NOT VERIFIED.** `broll_video_url` is required by the schema and the worker (compose-broll-overlay.ts — the file in your working tree). Two options: **(a)** facade synthesizes a no-op overlay (a still-as-loop / the sheet, with `broll_width_rate`→0 or `broll_start_time` past the end so nothing shows) — ships today, zero worker change, but **I have NOT run the worker to confirm it tolerates a zero-width / never-shown overlay**; this must be tested before claiming the long-no-broll path works. **(b)** make `broll_video_url` optional in the schema + worker — cleaner, but touches a production contract and needs founder approval. Recommendation: ship **(a)** behind the flag, test it on staging, and only then claim it.
2. **Single-clip ceiling must be ONE shared constant** used by `decideRoute` and the quote, or routing and credits drift (the 54f47db2 bug class). Pin it to `fitDuration`'s >15s boundary.
3. **Polymorphic props** move validation into the facade; error text must match the crispness of the existing Zod `.refine` messages.
4. **Provenance column** (`requested_via`) is an additive migration; until it lands, make_ugc traffic isn't distinguishable from direct calls except via the `input` jsonb. `skill_slug` must NOT be repurposed.
5. **Hiding 9 tools isn't access control** — they're still REST/CLI-reachable. Acceptable (goal is shrinking the default agent surface). Confirm with founder no MCP-only agent depends on standalone `make_subtitles`/`make_lip_sync` (captions are covered inline by `captions:true`; BYO-audio lip-sync is NOT covered by make_ugc and stays REST-only unless folded in).

---

## 8. Phased rollout (additive, flag-guarded, prod-safe — real-money system, needs approval)

This is a paid production system. Each phase ships behind the **existing** `isPrimitivesRouteEnabled()` flag (mcp.ts:90) plus a new `MAKE_UGC_ENABLED` flag, with evidence required before the next phase. **No phase ships without explicit founder sign-off and pasted test evidence** (per the project rules).

- **Phase 0 — P2/status fix, standalone (no make_ugc yet).** Fix mcp.ts:187-204 to return `skill_run_id` + the `/v1/skills/runs/` poll URL for composed routes. This is correct and needed regardless, and makes any make_ugc run trackable end-to-end the moment it ships. Evidence: MCP `tools/call make_ugc_video` returns a `skill_run_id` and `GET /v1/skills/runs/<id>` resolves.
- **Phase 1 — schema + registry + quote, NOT advertised.** Add `MakeUgcSkillInputSchema`, the 10th SkillEntry (`agentFacing:true`), `dispatchMakeUgc`, the shared `decideRoute`, and the `case 'make_ugc'` quote. Leave tools/list filtering OFF so the surface is unchanged. Evidence: `tsc --noEmit` exit 0; `POST /v1/skills/make_ugc/run` for a short script → make_ugc_video skill_run; a long script → make_broll_talking_head skill_run; `/quote` matches the underlying number.
- **Phase 2 — verify the no-op-overlay long path on staging** (Risk #1). Run a real long-monologue make_ugc end-to-end; confirm N takes, no trim, overlay invisible. If (a) fails, escalate to the founder for option (b). **Do not advertise until this passes.**
- **Phase 3 — flip the agent surface.** Turn on the `agentFacing` filter in mcp.ts + the generator. tools/list shrinks to one tool; the pack ships one start-here doc. Evidence: MCP `tools/list` JSON shows exactly `make_ugc` + `list_characters` + social.
- **Phase 4 — provenance migration** (`requested_via` column) for analytics. Additive, non-blocking.

Back-compat is permanent: the 9 REST routes, schemas, responses, CLI, and the v2 generators are never touched or deleted.

---

## 9. Founder decisions still open

1. **Long-no-broll overlay:** ship option (a) no-op overlay (zero worker change, needs staging test) or invest in (b) making `broll_video_url` optional (cleaner contract, touches production worker)? — blocks Phase 2.
2. **Default-person vs 400** when no identity is given ("just make a video saying X"): render a generic person (DX) or require one of person/image/character?
3. **Which standalone tools, if any, stay agent-visible** besides make_ugc — specifically BYO-audio `make_lip_sync` and standalone `make_subtitles` (an MCP-only agent loses these when the 9 are hidden; captions are covered inline, lip-sync is not).
4. **`>1200`-char scripts:** confirm "one call = up to ~30s, longer = multiple scenes (follow-up call)" is the intended product behavior, vs the facade auto-splitting into sequential runs.
5. **Provenance column** name/approval (`requested_via`) — additive migration on `skill_runs`.

**Files / line touch points:** registry.ts:158-249 (+10th entry, +`agentFacing`), skills.ts:85-208 (+`dispatchMakeUgc` branch), skills.ts:279 / :373 (existing dispatchers reused verbatim), skills.ts:557 (cancel invariant to preserve), credit-quotes.ts:99-148 (+`case 'make_ugc'`, reuse 36-97), mcp.ts:90-106 (filter) + mcp.ts:187-204 (P2 fix), generate-public-skill.ts:30/40/261/444/469 (filter + COSTS/EXAMPLE), contracts.ts BrollTalkingHeadToolInputSchema (`broll_video_url` required — the §7.1 constraint). The P0 pre-insert fix is already present at skills.ts:308-323 and 378-394; make_ugc inherits it by delegation.