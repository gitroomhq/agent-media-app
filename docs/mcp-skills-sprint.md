# Sprint — "agent-media skills that just work on Codex + Claude"

**Date:** 2026-06-27 · **Status:** plan (no code yet) · Built from the diagnosis, the make_ugc design, the 2-reviewer corrections, and the loss audit.

## Goal / Definition of Done
One agent-facing **`make_ugc`** skill (single `SKILL.md`, props-based) that **Codex (CLI)**, **Claude (skills + MCP)**, and the **in-app web agent** can all call to produce a full, captioned, on-brand **9:16** UGC video — with every run **trackable end-to-end** (no more `not_found`), **losing nothing** the 12-skill surface could do, and **results unchanged** (it routes to the existing pipeline).

**Locked scope (from review + audit):**
- `make_ugc` is a ROUTER over existing dispatchers — results unchanged.
- Keep a visible **advanced tier** so we lose nothing: `make_lip_sync` (BYO audio), `make_subtitles` (caption an external video). Hide the rest of the 9 from the agent surface (still REST/CLI-reachable, deprecation window).
- Build **2 quality features** make_ugc needs: (C1) optional-b-roll long-form talking head; (C2) keyword-highlight captions.
- Unify identity to a reusable **`character_id`** (in + out).
- Preserve response shape (`skill_run_id` for composed / `run_id` for primitive) — the web agent branches on it.

---

## Workstream A — Make runs trackable (unblocks everything)
**A1 · P0 pre-insert `primitive_runs` (all 8 primitives).** Insert the row (`status='submitted'`) before `workflow.start` in `runSkillRoute`; on idempotency unique-violation (23505) return the existing run as a 202 replay, never 500. Files: `skills.ts` (primitive dispatch). Deploy: api-v2. Test: submit each primitive → immediately poll `/v1/primitives/runs/:id` in a tight loop → first poll 200 `submitted` (never `not_found`); idempotent resubmit returns the same id.

**A2 · P3 MCP poll-URL + error-shape + fetch hardening.** `mcp.ts`: branch the poll URL on `run_id`→`/v1/primitives/runs/` vs `skill_run_id`→`/v1/skills/runs/`; add AbortSignal timeout + bounded retry to the MCP outbound fetches. Standardize `not_found` to `{error:{code,message}}` across `primitives.ts`/`skills.ts`/`status.ts` (deprecation note — bare-string is a contract break). Files: `mcp.ts`, `primitives.ts`, `skills.ts`. Deploy: api-v2. Test: MCP `tools/call` → poll the URL it returns → resolves; all 3 status endpoints return identical error JSON for a missing id.

**A3 · Recon (no deploy).** Confirm `VNEXT_PRIMITIVES_ENABLED=true` in prod (else MCP skill-forwarding is dead code). Pull a `media-worker-v2` log for a stalled character-sheet run = the P1 gating evidence.

## Workstream B — Fix the sheet stall (P1, gated on A3 log)
**B1 · Backport connection-hardening to `media-worker-v2`.** Mirror `primitive-worker-vnext/src/client/openai.ts`: fresh-socket agent (keepAliveTimeout:1), 300s timeouts, premature-close retry, api-v2 fallback — into `media-worker-v2/src/openai-image-client.js`. (The `duplex` flag is a no-op on global fetch — NOT the fix.) Deploy: media-worker-v2. Test: full v2 character create (portrait→sheet) → sheet lands in R2, `processing`→`completed` in normal time (not 15 min), status never sticks.

## Workstream C — Build the 2 quality features (so make_ugc loses nothing)
**C1 · Optional-b-roll long-form talking head.** Make `broll_video_url` OPTIONAL in `BrollTalkingHeadToolInputSchema` + the worker; when absent, produce the multi-take talking head with NO overlay. This is the long-monologue path that needs no b-roll asset (the issue-#5 fix). Files: `contracts.ts`, `broll-talking-head` workflow, `compose-broll-overlay` (skip overlay when no broll), `skills.ts` (don't hard-fail on missing broll). Deploy: api-v2 + primitive-worker-vnext. Test: 110-word monologue, no broll → full ~38s multi-take video, not trimmed, no overlay artifacts.

**C2 · Keyword-highlight captions.** Add a `highlight` input (keywords + color) → per-word ASS color override in the subtitle renderer. Files: subtitles schema (`contracts.ts`), subtitles worker activity. Deploy: api-v2 + worker. Test: caption with `highlight:["MONEY","HARD"], color:"yellow"` → those words render yellow on-screen.

**C3 · Reusable identity (`character_id`).** `make_character_sheet` assigns a `public_id` (`char_…`) on the `user_characters` row so v1 characters are addressable; expose `character_id` in/out. Files: character-sheet worker, characters route, migration (column/backfill if needed). Deploy: worker + api-v2 + migration. Test: create a character → get `char_…` → reuse in a 2nd make_ugc call → same face, skips portrait/sheet.

## Workstream D — The unified make_ugc skill (depends on C)
**D1 · `make_ugc` schema + router.** `MakeUgcSkillInputSchema` (`script`, `person|image|character`, `broll_url`, `captions{+highlight}`, `look`, `caption_style`, `aspect_ratio`, `duration`); a shared `decideRoute(props)→{slug,body}`; `dispatchMakeUgc` that calls the EXISTING dispatchers verbatim (short→make_ugc_video; short+character→simple_selfie; long→broll-optional-overlay; broll_url→broll-with-overlay); own ONE `skill_runs` row + return `skill_run_id` (preserve shape); add `make_ugc` to `quoteSkillCredits` (route-resolving, never 0). Files: `registry.ts`, `skills.ts`, `credit-quotes.ts`. Deploy: api-v2 (dark, `MAKE_UGC_ENABLED=off`). Test: `POST /v1/skills/make_ugc/run` for each route → correct underlying `skill_run` + correct `/quote`.

## Workstream E — One SKILL.md + the agent surface (depends on D)
**E1 · One SKILL.md + pack.** `generate-public-skill.ts`: emit ONE `skills/make-ugc/SKILL.md` (full props + examples) + keep `make-lip-sync` + `make-subtitles` (advanced tier) + `publish-to-social` + a one-line "always call make_ugc" playbook; stop generating the other 6; fix the misleading count log. Deploy: regenerate + publish `gitroomhq/agent-media` pack.
**E2 · MCP tools/list filter.** Filter to `agentFacing` (make_ugc + lip_sync + subtitles + list_characters + publish); alias/hide `make_ugc_video` (never two `make_ugc*`). Files: `mcp.ts`. Deploy: api-v2 (flip when `MAKE_UGC_ENABLED=on`).

## Workstream F — Web agent (depends on D)
**F1 · Point the web agent at make_ugc.** In-app agent (`apps/web/.../dashboard/agent/page.tsx`) uses `make_ugc` as its primary skill + brain guidance; preserve the `Boolean(skill_run_id)` composed-vs-primitive poll branch. Deploy: web (push main). Test: `agent-media.ai/dashboard/agent` → "Sophia monologue" → full captioned video, trackable.

---

## Deployment runbook (order; each behind a flag, prod-safe, needs approval + evidence)
1. **Migrations** (character `public_id` backfill, any provenance col) → **prod Supabase SQL editor** (`db push` drifts).
2. **Workers** → `railway up --service primitive-worker-vnext` / `--service media-worker-v2`.
3. **api-v2** → `railway up --service api-v2` (flags off → dark).
4. **web** → push `main` (Vercel auto-deploys).
5. **Pack** → regenerate + publish `gitroomhq/agent-media`.
6. **Flip** `MAKE_UGC_ENABLED=on` → smoke test → announce.
**Rollback:** every change flag-guarded; the 9 REST skills + previous pack tag stay live.

## Test matrix — MCP / CLI / REST / web × Codex AND Claude
**Golden E2E = the "Sophia monologue" brief** (full ~110-word monologue, from an image, highlighted captions). Run it on every surface:

| Surface | How (Codex) | How (Claude) | Assert |
|---|---|---|---|
| **REST** (money path) | n/a (shared) | n/a (shared) | submit make_ugc {short / long-monologue / from-image / +broll} → poll → 200; video is full-length, 9:16, captioned |
| **CLI** | `npx skills add gitroomhq/agent-media` → ONE skill shown → `agent-media skills run make_ugc --input-file …` → `agent-media skills status <id>` | Claude Code skills pack (same files) | status resolves (NEVER `not_found`); pack shows 1 skill + advanced tier; full video out |
| **MCP** | (Codex didn't expose MCP — CLI is its path) | Claude Desktop/Code MCP server → `tools/list` → `tools/call make_ugc` | tools/list = make_ugc(+advanced); the poll URL it returns RESOLVES (A2 fix); full video |
| **Web agent** | — | — | dashboard/agent → brief → full captioned video, trackable; web poll branch intact |

**Cross-harness acceptance:** the SAME brief in **Codex (CLI)** and **Claude (MCP + skills)** and the **web agent** all produce the full ~38s captioned Sophia video, every run trackable end-to-end, character reusable in a follow-up call.

**Evidence required per task (project rule):** `tsc` exit, `curl`/poll output, MCP `tools/list` JSON, rendered video specs (duration ≈ monologue length, 9:16, captions+highlights), one Codex run log + one Claude run log.

## Founder decisions that gate the sprint
1. **C1 optional-broll** — OK to make `broll_video_url` optional (touches the broll worker/contract)?
2. **C2 keyword-highlight captions** — build now (it's the headline creative ask)?
3. **C3 identity** — standardize on `char_…` (v1) vs v2 `character_id`?
4. **Advanced tier** — confirm `make_lip_sync` + `make_subtitles` stay agent-visible (others hidden, deprecation window)?
5. **Pack publishing** — who owns publishing `gitroomhq/agent-media` + the deprecation window for hidden skills?

---

## Loss-audit corrections (2026-06-27) — IMPORTANT re-framing

**Key fact the audit proved:** the 9 v1 skills are **NOT in the MCP tools/list today** — the live MCP agent surface is only `create_selfie` / `create_character` / `create_subtitle` (V2_GENERATORS) + `list_characters` (mcp.ts:58-75, 113-155). There is no `agentFacing` filter in the code. **So the "12 confusing skills" live in the public-skill PACK + the `agent-media` CLI** (what Codex's `npx skills add` installs — 11 SKILL.md files), NOT in MCP. → The "one SKILL.md" refactor targets the **pack/CLI**, which is exactly the right surface; the MCP side just *adds* make_ugc.

**Verdict: the consolidation loses almost nothing for AGENTS** (agents never had the 12 — Codex saw the CLI pack, Claude/MCP saw ~4 tools). Two true blockers + a clear keep-set:

**KEEP VISIBLE in the MCP agent surface (5):** `make_ugc` (new) + `create_selfie` + `create_character` (only path that returns a persistent char_id) + `create_subtitle` (only path to caption an EXTERNAL/BYO video + custom transcript/language) + `list_characters`. Removing any of these IS a real loss.

**KEEP on the pack/CLI as the start-here:** one `make-ugc/SKILL.md`; collapse the other 10 SKILL.md (they stay REST/CLI-reachable).

**TRUE BLOCKERS — build before make_ugc ships its full claim:**
- **C1 (long-script-no-broll)** is THE blocker, not optional: `broll_video_url` is HARD-REQUIRED (registry.ts:244), so a long monologue with no b-roll has **no working path today** — this is exactly why Sophia's video failed. make_ugc route-2 cannot ship until this is built + staging-tested.
- **C3 (persistent character_id out)** — v1 `make_character_sheet` saves a row with NO `public_id`, so a character made in make_ugc is use-once. make_ugc must return a `character_id` OR explicitly defer reuse to `create_character`. Don't imply reuse it can't deliver.

**ACCEPTABLE losses (kept on REST/CLI, just not the agent default):** standalone portrait/sheet/wireframe image outputs; **product-in-hands** video; **BYO-audio lip-sync** (`make_lip_sync`); 16:9; advanced b-roll geometry (width/start/fade); `n_panels`/`setting`/`pose`/`reference_photo`. None are in the agent surface today, so no agent regression.

**NEVER EXISTED (unmet requests, build behind approval — NOT losses):** keyword-highlight captions (C2), batch/"week in one call", 20/25/30s on short scripts.

**Sprint deltas:** E2 (MCP filter) → instead *add* make_ugc to MCP + keep the 4 v2 tools; do NOT "hide 9 skills from MCP" (they're not there). C1 is reclassified optional→**blocker**. Add a task to surface `make_lip_sync`/`make_subtitles` REST equivalents in the SKILL.md "advanced" note so BYO-audio/external-caption aren't silently dropped.
