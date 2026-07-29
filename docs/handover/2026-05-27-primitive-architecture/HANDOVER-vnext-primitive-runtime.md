# Handover — vNext Primitive Runtime + Skill Center

**Date:** 2026-05-28 · **Status:** verified against source + live API on 2026-05-28
**Scope:** the fresh primitive runtime on Temporal, the 6 production skills, the composed `make_ugc_video`, Skill Center UIs, credit ledger, MCP + CLI + plugin distribution, and the homepage hero.

> Every factual claim below is tagged `[verified: file:line]` or `[verified: live]`. Anything that can only be confirmed at runtime (deployment env values) is tagged `[env]`. If a claim has no tag, treat it as narrative, not fact.

---

## 0. Read-me-first: known production risks

These were found while verifying this doc against the code. They affect a live system with 3000+ paying customers.

| Sev | Risk | Evidence | Fix direction |
| --- | ---- | -------- | ------------- |
| 🔴 HIGH | **Credit double-charge on retry.** Activities retry up to 3× (`maximumAttempts: 3`). Credits are deducted near the top of each Activity via `deduct_credits`, which has **no idempotency guard** on `p_job_id`. The "skip if already done" guard only triggers on `status='succeeded'`. So a *retryable* failure after the deduct line (OpenAI 5xx, R2 upload blip, transient DB error) re-runs the whole Activity → deducts again. A run that finally succeeds on attempt 3 charges the user 2–3× and refunds nothing. | `workflows/portrait-gpt2.ts:17` (maximumAttempts 3); `activities/portrait-gpt2.ts:76` (guard only on succeeded), `:157` (deduct before provider); `client/credits.ts:65` (no dedupe); `migrations/20260216000015_deduct_credits.sql` (no ON CONFLICT / reference_id check) | Make `deduct_credits` idempotent on `p_job_id` (no-op if a `generation_debit` row already exists for that reference_id), **or** guard the Activity: skip deduct if `credits_deducted > 0` already. One-line-ish DB change; needs approval + a migration. |
| 🟠 MED | **Pre-flight credit check fails OPEN.** If the `user_credits` row is missing or the query errors, the API returns `{ ok: true }` and the run proceeds. Intended as "worker will catch it", but it means the 402 is best-effort, not a guarantee. | `routes/v1/skills.ts:26` | Acceptable if the worker deduct is the real gate — but the worker deduct is the thing with the double-charge bug above. Fix #1 first. |
| 🟡 LOW | Dead `client/byteplus.ts` still in the worker tree (EvoLink is the live video path). | `client/byteplus.ts` exists; `activities/simple-selfie.ts:9` imports EvoLink | Delete in a cleanup PR. |

The rest of this doc is the verified architecture.

---

## 1. Product framing

agent-media is an AI UGC video platform exposed through CLI, MCP, REST, and a Claude Code plugin. vNext is the fresh primitive runtime; it does **not** reuse the legacy `generation_jobs` table `[verified: migrations/20260527150000…sql:4-6]`. The legacy v2 selfie pipeline still exists and is good; vNext is the surface exposed publicly via the plugin.

**Two repos:**
- `yuvalsuede/agent-media` — PRIVATE monorepo, all code. `[verified: git remote -v → only origin]`
- `gitroomhq/agent-media` — PUBLIC, mirror of `public-skill/` only. Never push the monorepo there.

---

## 2. The 6 skills

Source of truth: `services/api-v2/src/skills/registry.ts` `[verified: file]`. Live and in sync: `GET agent-media.ai/api/v1/public/skills` returns all 6 `[verified: live, HTTP 200]`.

| Slug | Workflow type (camelCase!) | Primitive id | Credits | Output |
| ---- | -------------------------- | ------------ | ------- | ------ |
| `make_portrait` | `portraitGpt2Workflow` | `portrait_gpt2` | 35 | photoreal portrait PNG |
| `make_character_sheet` | `characterSheetGpt2Workflow` | `character_sheet_gpt2` | 35 | magazine-style character sheet PNG |
| `make_simple_selfie` | `simpleSelfieWorkflow` | `simple_selfie` | 100/200/300 (5/10/15s) | 9:16 lip-synced talking-head MP4 |
| `make_subtitles` | `subtitlesWorkflow` | `subtitles_v2` | 15 | MP4 with burned captions |
| `make_wireframe` | `wireframeGpt2Workflow` | `wireframe_gpt2` | 35 | multi-panel storyboard PNG |
| `make_ugc_video` | `makeUgcVideoWorkflow` | `composed:make_ugc_video` | sum of children (~285 @10s) | full captioned UGC clip |

`[verified: registry.ts:114-175 for slugs/workflow types; client/credits.ts:21-45 for credit amounts]`

**Workflow type names are camelCase** (`portraitGpt2Workflow`), not PascalCase — they are the exact strings `client.workflow.start()` dispatches `[verified: routes/v1/skills.ts:163]`.

### Why this shape
- One primitive = one prompt to debug; each has its own SKILL.md + contract.
- `make_ugc_video` creates a `skill_runs` row and starts a 3-step composed workflow; children link back via `skill_run_id` `[verified: routes/v1/skills.ts:216-267]`.
- Identity lock: the character sheet URL is the reference fed to Seedance, so every selfie of one actor stays on-model.

### Generation rules baked in
- Haiku builds the provider prompt per run; the **9 realism props live in the Haiku system prompt** (skin texture/pores, asymmetry/micro-expressions, UGC iPhone aesthetic, realism_target-driven lighting, etc.) `[verified: client/anthropic.ts:28-34]`.
- No "selfie" vocabulary → no phone-in-hand; default hands-free close-up.
- EvoLink Seedance 2.0, **not** BytePlus `[verified: activities/simple-selfie.ts:9, model seedance-2.0-reference-to-video]`.

---

## 3. Stack & hosts

| Layer | Value | Evidence |
| ----- | ----- | -------- |
| Orchestration | Temporal Cloud — namespace `quickstart-agent-media.v5v8r` `[env]`, task queue `primitive-vnext-v1` | `config.ts:80` default; namespace is a deploy env |
| Worker | `services/primitive-worker-vnext` on Railway; ffmpeg + fonts in Dockerfile | repo |
| **API host** | **`https://api.agent-media.ai`** (REST). Bearer-auth gated. | `mcp-server/src/index.ts:44`; live `GET /v1/skills` → 401 |
| Web | `apps/web` Next.js on Vercel (`agent-media.ai`) | live |
| Public skill list | `agent-media.ai/api/v1/public/skills` (web proxy, unauth) **or** `api.agent-media.ai/v1/public/skills` | `server.ts:539` |
| DB | Supabase Postgres (production only) | — |
| Storage | R2, prefix `vnext/primitive-runs/<run_id>/`, public base `pub-16e2ed8f6be84691845e91436920ce0a.r2.dev` | `config.ts:98` |
| Image | OpenAI `gpt-image-2` (env `OPENAI_IMAGE_MODEL`) | `config.ts:90` |
| Video | EvoLink `seedance-2.0-reference-to-video` | `config.ts`/evolink client |
| Prompt LLM | Anthropic `claude-haiku-4-5` (env `ANTHROPIC_PORTRAIT_PROMPT_MODEL`) | `config.ts:84` |
| Transcribe | OpenAI Whisper | `client/whisper.ts` |
| CLI | `agent-media-cli@1.16.0` (published) | `npm view` |
| MCP | `@agentmedia/mcp-server@0.6.0` (published, **stdio**) | `npm view`; `index.ts:704` |

**Cost guardrails** (worker-side, env-overridable): per-primitive `$0.50`, per-run `$5`, **per-UTC-day `$20`** `[verified: config.ts:105-107]`. The day cap is summed `actual_credits_usd` across a user's runs and will hard-stop generation once hit — relevant when load-testing on one account.

---

## 4. Endpoints

| Method · Path | Handler | Auth | Notes |
| ------------- | ------- | ---- | ----- |
| `GET /v1/skills` | listSkillsRoute | Bearer | `[server.ts:535]` |
| `GET /v1/public/skills` | listSkillsRoute | none | marketing `[server.ts:539]` |
| `POST /v1/skills/:slug/run` | runSkillRoute | Bearer | returns `202 {run_id, workflow_id, status:'submitted'}` (or `skill_run_id` for composed) `[server.ts:540]` |
| `GET /v1/skills/runs/{skill_run_id}` | getSkillRunRoute | Bearer | **composed** make_ugc_video status `[server.ts:358]` |
| `GET /v1/primitives/runs/{run_id}` | — | Bearer | **individual primitive** status `[server.ts:322]` |
| `POST /mcp` (on api host) | mcp route | Bearer | HTTP MCP surface, distinct from the stdio npm pkg |

> Note: there are **two** status paths — composed skills poll `/v1/skills/runs/<id>`, individual primitives poll `/v1/primitives/runs/<id>`. The npm MCP server branches correctly between them on `skill_run_id` vs `run_id` `[verified: mcp-server index.ts:587-591]`.

---

## 5. Credit flow (the part you care about)

**Where credits are reduced:** in the worker Activity, immediately after the `primitive_runs` upsert and **before any provider call** `[verified: activities/portrait-gpt2.ts:155-163]`. So credits drop when the worker picks up the job (seconds after the API returns `202 submitted`), not at the HTTP-creation instant.

**How:**
- API does a non-binding **pre-flight quote + balance check** → `402 insufficient_credits` if short, but **fails open** on a missing/errored credit row `[routes/v1/skills.ts:14-31, 99-108]`.
- Worker calls `deduct_credits(p_user_id, p_amount, p_job_id, p_description)` — atomic, `SELECT … FOR UPDATE`, monthly bucket first then purchased, writes `credit_transactions` rows `[migrations/20260216000015_deduct_credits.sql]`.
- On non-retryable failure the Activity calls `refund_credits(p_job_id)` `[activities/portrait-gpt2.ts:290]`.
- `primitive_runs.credits_deducted` is stamped after deduct `[client/credits.ts:82]`.

**Amounts:** portrait 35, character_sheet 35, wireframe 35, subtitles 15, selfie 100/200/300 `[client/credits.ts:21-45]`. A 10s `make_ugc_video` ≈ 35+35+200+15 = **~285 credits**.

**Two accounting axes, don't confuse them:** the *user-facing* charge is in **credits** (deduct_credits). The *internal* cost cap is in **USD** (`estimated/actual_credits_usd` on the row, default caps $0.5/$5/$20). These are independent.

**See §0 for the double-charge-on-retry risk — it lives in exactly this path.**

---

## 6. Database (vNext)

Migrations: `20260527150000` (4 tables), `…160000` (hardening), `20260528100000` (skill_runs), `20260528120000` (credits_deducted) `[verified: ls]`.

`primitive_runs` actual columns `[verified: migrations/20260527150000…sql:20-37 + credits migration]`:
`id, user_id, skill_run_id, primitive_id, status, input, idempotency_key, provider_task_id, estimated_credits_usd, actual_credits_usd, error_code, error_message, started_at, finished_at, created_at, updated_at` + `credits_deducted`.

- **status enum** = `submitted | running | succeeded | failed | canceled` (one L) `[sql:25]`. No "queued".
- Outputs live in **`primitive_artifacts`** (`primitive_run_id, kind, url, bytes, mime, metadata`), not on the run row.
- `primitive_events` = timeline; `provider_tasks` = provider polls; `skill_runs` = composed-skill parent rows.
- Idempotency: partial-unique on `(user_id, primitive_id, idempotency_key)` `[sql:50-52]`.
- RLS is ON and currently denies anon/authenticated; access is service-role only `[sql:15-17]`.

---

## 7. Worker internals

`services/primitive-worker-vnext/src/` → `activities/`, `workflows/`, `client/` (anthropic, openai, evolink, r2, db, credits, whisper, **byteplus[dead]**), `lib/ass.ts`, `config.ts`, `worker.ts` `[verified: ls]`.

- Prompt-builder pattern: every generative Activity calls Haiku first to build the provider prompt, persists it into `primitive_runs.input.generated_prompt` for audit `[activities/portrait-gpt2.ts:198-209]`.
- Retry: activities use `maximumAttempts: 3` `[workflows/portrait-gpt2.ts:17]` — see §0.
- Retry-safety guard: re-entry returns the existing artifact only when `status='succeeded'` `[activities/portrait-gpt2.ts:76]` (insufficient against the double-charge case).
- SSRF guard: reference/portrait/char-sheet/video URLs must start with the configured R2 public prefix `[activities/portrait-gpt2.ts:95-103]`.
- `SIMULATE_OPENAI=true` short-circuits to a stub PNG — **never** acceptable as "it works" evidence.

---

## 8. Distribution

- **CLI** `agent-media-cli@1.16.0`: `agent-media skills list|run|status` `[apps/cli/src/commands/skills.ts]`.
- **MCP** `@agentmedia/mcp-server@0.6.0`: **stdio**, loads skills live from `/v1/skills`, forwards to `POST /v1/skills/<slug>/run` `[index.ts:260,578]`. `.mcp.json` must use `args:['-y','-p','@agentmedia/mcp-server@latest','agent-media-mcp']` (two-bin disambiguation) `[verified: public-skill/.mcp.json]`.
- **Plugin** at `gitroomhq/agent-media`: `claude /plugin install github.com/gitroomhq/agent-media`. Ships **7** skill dirs (6 registry skills + the `agent-media-ugc` composite playbook) `[verified: gitroomhq contents API]`. plugin.json live `[verified: HTTP 200]`.
- **Codegen** `services/api-v2/scripts/generate-public-skill.ts` reads the registry → emits `public-skill/`; CI `mirror-public-skill.yml` subtree-pushes to gitroomhq (gated by `MIRROR_PUBLIC_SKILL_ENABLED` + `GITROOM_DEPLOY_KEY`).

---

## 9. UI surfaces
- Private: `app/(app-dark)/dashboard/skills/` — library (`page.tsx`, headline "Run any AgentMedia skill"), `[slug]/page.tsx`, `runs/[id]/page.tsx`, `_meta.ts`, `_forms.ts`.
- Public: `app/(landing)/skills/page.tsx` via the public proxy.
- Homepage hero `app/page.tsx` + `components/home2-skill-install.tsx`: install command at `clamp(11px,1.7vw,17px)`, no scrollbar, compact so it doesn't push the laser hero down `[verified: live, browser_evaluate 2026-05-28]`.
- Showcase: all clips 9:16.

---

## 10. Operational rules
Production only (no staging) · real calls, no mocks for verification · long text → HTML + open · questions ≠ instructions · browser-verify every UI fix · paste evidence with every claim · TaskML/sprints · EvoLink mj-v7 ≠ Midjourney · single-hyphen marketing copy · R2 `pub-…r2.dev` only.

---

## 11. Open follow-ups
1. **Fix credit double-charge (§0 HIGH)** — needs approval + migration.
2. Credential rotation (Temporal, OpenAI, `ma_*`).
3. Delete dead `client/byteplus.ts`.
4. Em-dash sweep on gitroomhq `plugin.json` description.
5. ~~Publish agent-media-cli@1.16.0~~ — **done, live on npm** `[verified]`.

---

## 12. How to re-verify this doc in 60s
```bash
# skills live + in sync
curl -s agent-media.ai/api/v1/public/skills | python3 -m json.tool | grep slug
# api up + gated
curl -s -o /dev/null -w "%{http_code}\n" https://api.agent-media.ai/v1/skills   # 401
# published packages
npm view @agentmedia/mcp-server version; npm view agent-media-cli version        # 0.6.0 / 1.16.0
# public plugin
curl -s -o /dev/null -w "%{http_code}\n" https://raw.githubusercontent.com/gitroomhq/agent-media/main/.claude-plugin/plugin.json  # 200
# workflow types / credit amounts / caps
grep workflowType services/api-v2/src/skills/registry.ts
grep -n CREDITS services/primitive-worker-vnext/src/client/credits.ts
grep -n CAP_USD services/primitive-worker-vnext/src/config.ts
```

## 13. Links
Private: github.com/yuvalsuede/agent-media · Public: github.com/gitroomhq/agent-media · Repo handover: `docs/handover/2026-05-27-primitive-architecture/` · Live: agent-media.ai · Temporal ns: `quickstart-agent-media.v5v8r`
