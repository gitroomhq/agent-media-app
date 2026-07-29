# Agent → "Cowork for UGC Video" — Plan

**Date:** 2026-06-25 · **Status:** proposal, founder digesting (not started)
**Source:** 4-expert design panel (agent architecture, Cowork UX, UGC market diff, "be like Claude Code") + synthesis, grounded in the real codebase.

---

## North star
The in-app agent becomes a **durable, credit-aware creative director**: hand it a goal
("a week of chess-review TikToks in my brand voice") and watch it **plan → quote → render**
end-to-end — live ticking step-timeline, artifacts tray, confirm-before-spend gate — surviving
reloads and never silently re-spending. **First-in-market agentic production, not a "make video" button.**

## The 3 flagship differentiators (the moat)
1. **Goal → a week of content.** One sentence → a server-orchestrated batch of N brand-consistent
   videos with a live plan and a *single* cost gate. No UGC competitor has an agentic planner on a
   real generation pipeline.
2. **Credit-aware director.** Quotes *exactly* (the quote already mirrors the worker's planner),
   shows the cheap intermediate (portrait/sheet ~35 cr) **before** the expensive video step (~840 cr),
   and won't spend or retry without a yes.
3. **Durable, device-portable tasks.** Start on desktop, close the laptop, finish on your phone —
   because Temporal owns the loop, not the browser tab. A client-loop competitor structurally can't match this.

## Architecture bet
Move the agent loop off the browser (today: a stateless brain + a 12-step localStorage loop in
`apps/web/.../dashboard/agent/page.tsx`) onto the **existing Temporal cluster** as a durable
`agentTaskWorkflow`, backed by a goal-level `agent_tasks` / `agent_task_steps` model and a streamed
(SSE) UI — while keeping `POST /v1/skills/<slug>/run` + the idempotent deduct/refund RPCs as the
**single execution + money path**.

Guardrails (confirm-before-spend, per-task credit ceiling, no-silent-retry) ship as **Temporal signal
gates**, not prompt rules, and **must ship in the same release as the loop** (autonomy concentrates the
credit blast radius). Idempotent deterministic child `primitive_run_id`s mean a retry never double-charges.

**Net-new infra is small:** 2 tables, 1 workflow type, 1 SSE route, 1 quote endpoint, 1 context-builder.
Everything else (Temporal, child workflows, credits, `primitive_artifacts`, R2, `skill_runs` polling) already runs in prod.

---

## Phased roadmap

### Phase 0 — Glassbox the existing run (this week, frontend-only, ZERO backend)
*Outcome: stop users cancelling working runs + kill credit anxiety, using data the API already returns.*
- Render the live step checklist from `current_step` + `steps[]` already returned by
  `GET /api/v1/skills/runs/<id>` (the client discards it today) — portrait → sheet → take 1 → take 2 → compose → captions.
- Inline-preview each step's `primitive_artifacts` the instant it finishes (URLs already in the poll response)
  → a bad character is caught for ~35 cr, not ~840.
- Replace "failed — canceled" with the persisted `error.message` + an explicit **Retry** button (never auto re-fire).
- Add `GET /v1/skills/<slug>/quote` wrapping `quoteSkillCredits`; show "~N credits (you have X) — generate?" before any paid tool_use.
- Pin a session context rail: active character thumbnail+name, b-roll, current script (all already in client state).

### Phase 1 — Plan/Task model + streaming + memory
*Outcome: it feels like Cowork — a goal becomes a visible plan it streams, and it opens knowing the user.*
- `agent_tasks` (id, user_id, goal, status, plan jsonb) + `agent_task_steps` (id, task_id, ordinal, title,
  kind, status, skill_run_id?, artifact_ids[], cost_credits, error_message). `skill_run_id` joins to the
  existing inner `steps[]` so the UI nests them.
- A `propose_plan` brain tool returning a structured `tasks[]` the right rail renders as the Cowork checklist,
  with a total quote and ONE confirm-before-spend gate.
- Convert `POST /v1/agent` from a single buffered fetch to **SSE** (AI SDK available): stream
  `token` / `plan` / `step_update` / `artifact` / `quote` / `error` events; the web client becomes a pure renderer.
- `buildContext(userId)`: inject the user's saved `user_characters` + a compact recent-gallery summary
  (brand voice **derived from the gallery** — see decisions) into the SYSTEM prompt so it stops re-asking who/what.

### Phase 2 — Durable server-side loop (the architecture bet)
*Outcome: tasks survive reload + run unattended; guardrails live at the workflow layer.*
- `agentTaskWorkflow` on Temporal: durable think → quote → child-workflow → next loop, starting the SAME
  composed workflows (`makeUgcVideoWorkflow` / `brollTalkingHeadWorkflow`) as children — no 12-step browser cap.
- Temporal signals `confirmStep` / `retryStep` / `skipStep` → confirm-before-spend + no-silent-retry as **gates**.
- Per-task hard credit ceiling in the workflow; every paid step still passes `preflightCreditCheck`;
  idempotent child `primitive_run_id`s guarantee a retry never double-charges.
- Reattach UI subscribes to a task's SSE stream on load regardless of which device started it;
  `agent_tasks` row is source of truth, localStorage is a cache.

### Phase 3 — Fan-out, scheduled, learning loop
*Outcome: a real creative-director-in-a-box — a week of content on a schedule that improves over time.*
- Parallel fan-out: ship the `Promise.all` over independent broll takes AND across multi-video goals
  (p-limit bounded, per-task ceiling) so a week doesn't run serially.
- One-shoot-many-formats: one take → vertical cutdowns + 1:1 + captioned A/B-hook variants, each in the artifacts tray.
- Wire `scheduled` + `social` so a saved task template recurs ("a chess TikTok every morning") and pushes to Social.
- A cheap **vision critic** (Sonnet/Haiku) judging the character sheet before the expensive video step,
  auto-regenerating ONCE then escalating — catches a bad face before it costs video credits.

---

## Decisions
**Locked (2026-06-25):**
- **Autonomy default = Act + checkpoint** (plan → one confirm → run, pause on spend over a threshold) — once guardrails exist.
- **Brand voice = derived from the gallery** for now (no brand-kit table yet).

**Still open:**
- Phase 0 as a standalone ship-this-week release? (recommended yes)
- Confirm-before-spend + per-task ceiling + no-silent-retry ship in the SAME release as the durable loop? (recommended yes, non-negotiable)
- Per-task credit ceiling default number (bounds worst-case spend of an unattended "week of TikToks").
- When to graduate brand voice from gallery-derived → a real brand-kit table.

## Key code touchpoints (today's reality)
- Brain (stateless): `services/api-v2/src/routes/v1/agent.ts`
- Agent UI (client-driven loop): `apps/web/app/(app-dark)/dashboard/agent/page.tsx`
- Skills + run status (`steps[]`/`current_step`/`error`): `services/api-v2/src/routes/v1/skills.ts`
- Cost quote (internal preflight today): `services/api-v2/src/skills/credit-quotes.ts`
- Composed workflows reused as children: `services/primitive-worker-vnext/src/workflows/{make-ugc-video,broll-talking-head}.ts`
- Existing surfaces to wire: `user_characters`, `GET /v1/me/gallery`, scheduled, social.
