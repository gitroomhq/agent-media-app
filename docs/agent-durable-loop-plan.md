# Durable Agent Loop + Spend Guardrails — Build Plan

**Date:** 2026-06-26 · **Status:** design (not built) · **Source:** 5-agent subsystem-map + synthesis, grounded in real repo contracts. Founder chose this direction ("Reliable + agentic").

## Summary
Design for a durable server-side agent loop on the EXISTING Temporal cluster (`agentTaskWorkflow`) plus same-release spend guardrails, grounded in this repo's real contracts. The seam is `driveLoop` at `apps/web/app/(app-dark)/dashboard/agent/page.tsx:496-515` (the 12-step browser loop). We lift that loop into Temporal as a durable think→quote→child→loop, keep the brain stateless (`POST /api/agent` / `agentRoute` at `services/api-v2/src/routes/v1/agent.ts:183`), and keep `POST /v1/skills/<slug>/run` (`runSkillRoute`, `skills.ts:45`) + the idempotent `deduct_credits`/`refund_credits` RPCs as the single money path. Guardrails (confirm-before-spend, hard per-task credit ceiling, no-silent-retry) are Temporal signal gates + a workflow-carried ceiling, NOT prompt rules. Key real fact: today the parent route does only `preflightCreditCheck` (skills.ts:144) — actual deduction is per-primitive INSIDE the child workflows via `deductPrimitiveCredits` (worker `client/credits.ts:64`), idempotent by `primitive_run_id` via the `deduct_credits` RPC. So the agent workflow never touches the money path directly; it gates BEFORE dispatching the child run, and the child's existing per-primitive deduction stays the one charge. Everything ships behind `ORCHESTRATOR_ENGINE`-style flag (`enable_durable_loop`), additive, with the legacy `driveLoop` left intact for rollback. Net-new infra is small: 2 tables, 1 workflow type, activities, 1 SSE route, signal endpoints, 1 quote endpoint.

NOTE ON A CONFLICT I FOUND, since I must not hide it: the agent-cowork plan says reuse the existing composed workflows AS CHILDREN via `startChild`. But the way runs are dispatched today is via `client.workflow.start` from api-v2 (skills.ts:310), creating an independent `skill_runs` row and an independent top-level workflow — NOT a child. There are TWO viable groundings and the founder must pick (see open questions): (A) agentTaskWorkflow uses Temporal `startChild('makeUgcVideoWorkflow', ...)` directly in-worker (requires the parent to mint the child's `skill_run_id` + insert the `skill_runs` row via an activity, replicating what `dispatchMakeUgcVideo` does today); or (B) agentTaskWorkflow calls a `runSkill` activity that hits the EXISTING `POST /v1/skills/<slug>/run` over HTTP (zero duplication of the dispatch/skill_runs-insert logic, keeps the single money path literally single, but loses Temporal parent-child visibility and adds an HTTP hop). I recommend (B) for v1 (least new surface, the maps' own 'single money path, no duplication' rule), graduating to (A) in Phase 3 for fan-out. The design below is written for (B) with (A) noted.

## Workflow design (agentTaskWorkflow)
FILE: `services/primitive-worker-vnext/src/workflows/agent-task.ts`, exported from `workflows/index.ts` (same bundling path the worker already auto-discovers via `workflowsPath` → `worker.ts:56-58`). Runs on the SAME task queue the worker already serves (`createActivities(cfg)`, `worker.ts:65`); no new worker, no new queue.

INPUT (mirrors how composed workflows take a pre-minted id + user_id):
```
interface AgentTaskWorkflowInput { task_id: string; user_id: string; chat_id: string|null; goal: string; start_messages: Msg[]; ceiling_credits: number; auto_confirm_under: number; /* Act+checkpoint default */ }
```

DURABLE LOOP (replaces driveLoop; removes the `step<12` cap at page.tsx:498, replaces with a per-task step limit + workflowExecutionTimeout). Signals/queries via the real Temporal SDK already in the worker's deps (`@temporalio/workflow`):
```
const confirmStepSignal = defineSignal<[{ ordinal:number; approved:boolean; session_id:string }]>('confirmStep');
const retryStepSignal   = defineSignal<[{ ordinal:number }]>('retryStep');
const skipStepSignal    = defineSignal<[{ ordinal:number }]>('skipStep');
const cancelSignal      = defineSignal('cancelTask');
const raiseCeilingSignal= defineSignal<[{ new_ceiling:number; session_id:string }]>('raiseCeiling');
const statusQuery       = defineQuery<TaskStatus>('status');  // returns {status, current_ordinal, spent, ceiling, awaiting}
```
Activities via `proxyActivities<AgentTaskActivities>` (new activities added to `createActivities`): `callBrain` (calls the stateless brain), `appendMessage` (service-role write to agent_messages — the workflow becomes source of truth, replacing the client fire-and-forget at page.tsx:348), `emitTaskEvent` (writes an `agent_task_steps` row / bumps `agent_tasks`, which the SSE route tails), `quoteStep` (wraps `quoteSkillCredits`), `runSkill` (option B: HTTP POST to existing `/v1/skills/<slug>/run`), `pollRun` (the existing poll, GET `/v1/skills/runs/{id}` or `/v1/primitives/runs/{id}`).

Loop body (durable, replayable):
1. `composedSkillState`-style start: `emitTaskEvent({status:'running'})`.
2. THINK: `content = await callBrain(convo, user_id, chat_id)` → `appendMessage(assistant)` → `emitTaskEvent('step_complete', message)`. callBrain is non-deterministic, so it MUST be an activity (never inline) — Temporal records its result in history so replays are deterministic.
3. `toolUse = findToolUse(content)`; if none → break (end turn), set status `succeeded`.
4. ask_user / list_my_characters: resolve as a free (0-credit) step; for ask_user, emit `quote_needed=false` + pause on `confirmStep` only as a "user reply" gate, or surface as a message and end turn (Act+checkpoint).
5. QUOTE: `q = await quoteStep(toolUse.name, toolUse.input)` → `emitTaskEvent('quote_needed', {ordinal,q,spent,ceiling})`.
6. CEILING CHECK (hard): `if (spent + q > ceiling_credits) { emit('budget_exceeded'); await condition(raised || cancelled, TTL); if(!raised) { status='failed'/'paused'; return; } }`.
7. CONFIRM GATE: `if (q > auto_confirm_under) { awaiting=ordinal; const ok = await waitConfirm(ordinal); if(!ok){ status='paused'; return; } }` — implemented with `condition(() => confirmedOrdinals.has(ordinal) || skip || cancel, '1 hour')` so the wait is bounded (the maps flag unbounded confirmation waits as a landmine).
8. DISPATCH (single money path): `{runId, runKind} = await runSkill(toolUse.name, toolUse.input, idemKey=`${task_id}:${ordinal}`)`. The child's existing per-primitive `deduct_credits` (idempotent by `primitive_run_id`) remains the ONLY charge. Record `skill_run_id` on the `agent_task_steps` row.
9. POLL: `result = await pollRun(runId, runKind)` — activity `startToCloseTimeout` set ABOVE the client's max poll window (200×5s ≈ 1000s; use ~1200s) so a slow render fails as 'run timed out' not 'workflow timed out' (maps risk #2). On a transient infra failure Temporal retries the SAME `pollRun` against the SAME runId — read-only, no re-dispatch, no double charge.
10. `appendMessage(tool_result, client_msg_id=toolUse.id, skill_run_id=runId)`; `spent += result.credits_actual ?? q`; `emitTaskEvent('step_complete')`; `convo=[...convo, trMsg]`; loop.
RETRY (no-silent-retry): a failed step does NOT auto re-fire. It sets the `agent_task_steps` row to `failed`, emits `step_failed` with `error.message`, and the loop `await condition(retry||skip||cancel)`. On `retryStep`, dispatch with a NEW idemKey suffix (`:r1`) so it's a deliberate, ledgered re-spend; on `skipStep`, append a synthetic tool_result(error) and continue so the brain can re-plan.
TERMINATION: per-task step cap (e.g. 100) → status `failed/aborted`; `workflowExecutionTimeout` set on start (config already exposes `workflowExecutionTimeoutMs`, default raised for tasks); `cancelTask` signal → mark status `cancelled`, terminate in-flight child via `client.workflow.getHandle(childWorkflowId).terminate()` (real API per the temporal map) and mark its `skill_runs` cancelled.

## Guardrails
All three guardrails are workflow-layer gates over the UNCHANGED money path (`/v1/skills/run` → per-primitive `deduct_credits`/`refund_credits` by `primitive_run_id`). The agent workflow never calls deduct/refund itself; it gates BEFORE the child dispatch and lets the child's existing idempotent deduction be the single charge.

1) CONFIRM-BEFORE-SPEND (signal gate). After QUOTE (step 5) and before DISPATCH (step 8), if `q > auto_confirm_under` the workflow blocks on `condition(() => confirmedOrdinals.has(ordinal) || skip || cancel, '1 hour')`. The browser receives `quote_needed` over SSE, renders the confirm modal, and POSTs the signal endpoint → `handle.signal('confirmStep', {ordinal, approved, session_id})`. Default per locked decision = Act+checkpoint: auto-confirm cheap intermediates (portrait/sheet ~35 cr) under the threshold, hard-pause on the expensive video step (~840 cr). Double-signal safety (maps landmine #4): handler records `confirmedOrdinals.add(ordinal)` keyed by ordinal — a duplicate `confirmStep` for an already-confirmed ordinal is a no-op; a stray confirm for a future ordinal is ignored until the loop reaches it. `session_id` lets the workflow reject confirms from a different device for a soft single-active-session lock (maps landmine #8).

2) HARD PER-TASK CREDIT CEILING. `ceiling_credits` is carried in workflow input (NOT a prompt rule), so it survives replay and can't be argued away by the LLM. Step 6 enforces `spent + q > ceiling_credits` BEFORE dispatch → emits `budget_exceeded`, pauses for a bounded TTL awaiting `raiseCeiling` (also signal-gated + session-checked) or fails closed. This bounds the worst-case spend of an unattended "week of TikToks" (the open question the founder must set a default for). Belt-and-suspenders, additively: the worker can ALSO carry a `caps.maxCreditsPerTask` check inside `deductPrimitiveCredits` (worker `client/credits.ts:64`) throwing `ApplicationFailure.nonRetryable(..., 'TASK_CREDIT_CEILING_EXCEEDED')` — but that requires threading task_id into the primitive input, so v1 enforces the ceiling at the workflow gate only and treats the worker cap as Phase 3.

3) NO-SILENT-RETRY. Two real layers already make a retry financially safe and one new layer makes it VISIBLE+DELIBERATE: (a) `deduct_credits` is idempotent by `reference_id=primitive_run_id` (migration `20260528130000_deduct_credits_idempotent.sql`) — a Temporal activity retry against the same `primitive_run_id` returns `idempotent_replay=true` and charges once; (b) `refund_credits` is idempotent (guards `ALREADY_REFUNDED`), swallowed by `refundPrimitiveCredits`. NEW rule at the agent layer: a step FAILURE never auto re-dispatches. The loop surfaces the persisted `error.message` and waits for an explicit `retryStep` signal; a retry uses a fresh idemKey so it is a new, ledgered, user-approved spend — never a hidden one. `pollRun` retries are read-only (no new `skill_runs`/`primitive_runs` row, no charge). This matches the locked "won't spend or retry without a yes".

Crash safety: signal handlers mutate workflow-local vars that are NOT in history (maps temporal-risk #3), so the loop re-reads `confirmedOrdinals`/`spent` at each decision point rather than relying on a side-effect; durable truth is the `agent_tasks.spent_credits` / `agent_task_steps.status` rows written by `emitTaskEvent` activities, which Temporal replays deterministically.

## Schema changes
New migration (additive, RLS mirroring the existing `user_characters`/`agent_chats` pattern: four owner policies on `auth.uid()=user_id` + a `service_role FOR ALL` so the workflow's service-role client writes). NO changes to `skill_runs`/`primitive_runs`/`credit_transactions` — they stay the money/run source of truth.

agent_tasks:
- id uuid PK; user_id uuid NOT NULL; chat_id uuid NULL REFERENCES agent_chats(id) ON DELETE SET NULL (a task can be chat-bound or standalone-batch); goal text NOT NULL; status text CHECK IN ('planning','pending_confirmation','running','paused','succeeded','failed','cancelled'); plan jsonb (the propose_plan output: {steps:[{action,estimated_credits}], total_credits}); spent_credits int DEFAULT 0; ceiling_credits int NOT NULL; auto_confirm_under int NOT NULL DEFAULT 0; step_count int DEFAULT 0; workflow_id text (so api-v2 can `getHandle` for signals); active_session_id text NULL (soft single-active-device lock); error_message text; created_at/updated_at (set_updated_at trigger, already defined in the agent_chats migration).
- Index (user_id, updated_at DESC) for the rail; partial index WHERE status IN ('running','paused') for "is a task live?" reattach.

agent_task_steps (per think/ask_user/skill step; the per-step detail rows):
- id uuid PK; task_id uuid NOT NULL REFERENCES agent_tasks ON DELETE CASCADE; ordinal int NOT NULL; title text; kind text CHECK IN ('think','ask_user','skill'); skill_name text (tool_use.name); status text CHECK IN ('pending','running','awaiting_confirm','succeeded','failed','skipped'); skill_run_id uuid REFERENCES skill_runs(id) ON DELETE SET NULL; primitive_run_id uuid REFERENCES primitive_runs(id) ON DELETE SET NULL; run_kind text CHECK IN ('skill','primitive'); cost_credits int; error_message text; created_at.
- UNIQUE(task_id, ordinal).

JOINS (no denormalization of run state — we point at it):
- agent_task_steps.skill_run_id → skill_runs.id → (existing) child primitive_runs WHERE skill_run_id = :id. So the SSE/UI nests: task → step → composed skill_run → inner primitive steps[] (exactly the shape `GET /v1/skills/runs/{id}` already returns). One source of truth for run progress stays `skill_runs`/`primitive_runs`.
- agent_tasks.chat_id → agent_chats; the SAME tool_use/tool_result messages are still written to agent_messages (by the appendMessage activity instead of the browser), and agent_messages.skill_run_id continues to link a message to its run for media re-display + the existing `inflight` reattach. agent_chats.last_skill_run_id continues to point at the final run (its O(1) "is a render live?" check still works).
- Credit truth stays credit_transactions (reference_id=primitive_run_id). agent_tasks.spent_credits is a UI mirror, reconcilable by summing credit_transactions for the task's primitive_run_ids.

## API surface
UNCHANGED (must stay the single brain + single money path):
- `POST /api/agent` (`agentRoute`, agent.ts:183) — stateless brain, returns `{stop_reason, content:Block[]}` verbatim. The workflow's `callBrain` activity calls THIS, server-to-server.
- `POST /v1/skills/<slug>/run` (`runSkillRoute`, skills.ts:45) — sole execution+dispatch+preflight path; `make_ugc_video`/`make_broll_talking_head` → skill_runs row + `client.workflow.start`; primitives → primitive_runs row. The workflow's `runSkill` activity calls THIS (option B). Idempotency-Key header reused per step.
- `GET /v1/skills/runs/{id}` and `/v1/primitives/runs/{id}` — poll shape used by `pollRun`.
- `POST /v1/agent/chats/{id}/messages` (`appendMessagesToChat`, agent-chats.ts:156) — idempotent by (chat_id, client_msg_id); the workflow's `appendMessage` activity uses it (or writes service-role directly). Still works for the legacy browser path.
- deduct/refund RPCs — untouched.

NEW (all additive, behind flag):
- `POST /v1/agent/tasks` → mint an agent_tasks row (goal, chat_id?, ceiling_credits, auto_confirm_under), `client.workflow.start('agentTaskWorkflow', {workflowId:`agent_task-${task_id}`, taskQueue: same queue, workflowExecutionTimeout, args:[input]})`, store workflow_id; return {task_id, workflow_id}. Catches `WorkflowExecutionAlreadyStartedError` → {ok,alreadyRunning} (the existing dispatch idempotency pattern).
- `GET /v1/agent/tasks/{taskId}/events` (SSE) — the durable-loop analog of the proposed `/v1/skills/runs/{id}/stream` route in the SSE map. Same headers (text/event-stream, no-cache, X-Accel-Buffering:no), 20s `: keepalive`, Supabase realtime `postgres_changes` on agent_tasks + agent_task_steps with a 15s polling fallback + digest dedup. OWNERSHIP GUARD before subscribe (user_id check — maps SSE-risk #1). Events: `task.state`, `step_complete`, `step_update`, `quote_needed`, `budget_exceeded`, `step_failed`, `task.terminal`, `stream.state`. The step rows carry skill_run_id so the client can ALSO open the existing per-run stream for inner glassbox.
- Signal endpoints (api-v2 → `client.workflow.getHandle(task.workflow_id).signal(...)`, real API per temporal map): `POST /v1/agent/tasks/{taskId}/confirm {ordinal,approved}` → `confirmStep`; `POST .../retry {ordinal}` → `retryStep`; `POST .../skip {ordinal}` → `skipStep`; `POST .../cancel` → `cancelTask`; `POST .../raise-ceiling {new_ceiling}` → `raiseCeiling`. All auth'd, all verify task ownership + stamp session_id.
- `GET /v1/skills/<slug>/quote` wrapping `quoteSkillCredits` (Phase 0 item, reused by the task quote gate and the UI).
- Optional `GET /v1/agent/tasks/{taskId}` (status + steps) for non-SSE reattach + `handle.query('status')` passthrough.

## Phased rollout

### Phase 0: Phase 0 — Glassbox + quote (frontend + 1 read route, ZERO loop change)
Ship the Phase-0 items from the plan independently and first: render live steps[]/current_step from GET /v1/skills/runs/{id} (client already gets+discards it), inline-preview primitive_artifacts per step, replace 'canceled' with persisted error.message + explicit Retry (never auto-fire), add GET /v1/skills/<slug>/quote, pin the session context rail. Pure UI + one read-only route; instantly reversible.

**Risk:** Negligible — no loop/money/schema change. De-risks the UX before any Temporal work.

### Phase 1: Phase 1 — schema + SSE plumbing, loop still in browser
Land the agent_tasks/agent_task_steps migration (additive, RLS-mirrored), the SSE task-events route (modeled on the proven tooling/job stream routes), and the signal endpoints — but DO NOT move the loop yet. Add propose_plan brain tool + one confirm-before-spend gate in the EXISTING browser driveLoop so guardrails ship UX-first even before durability. Flag enable_durable_loop stays false.

**Risk:** Low — new tables/routes are dormant for users on the old path; signal endpoints just return 404 until a workflow exists. Verify SSE ownership guard + realtime/fallback in staging.

### Phase 2: Phase 2 — turn on agentTaskWorkflow WITH guardrails (the bet), internal flag
Add agentTaskWorkflow + new activities (callBrain/appendMessage/emitTaskEvent/quoteStep/runSkill/pollRun) to the worker's createActivities (same queue, same bundling). Wire POST /v1/agent/tasks to start it. Confirm-before-spend + hard ceiling + no-silent-retry ship in THIS release (non-negotiable per the locked decision — autonomy concentrates blast radius). Gate by per-user/internal allowlist flag; browser picks task-mode when a flag+?task= present, else legacy driveLoop. Set a CONSERVATIVE default ceiling. Verify end-to-end in browser: start task → cheap steps auto-confirm → expensive step pauses → confirm signal → render → reload mid-render reattaches via SSE → finishes; verify a forced step failure pauses and does NOT re-charge; verify ceiling hit pauses.

**Risk:** Highest — real renders, real credits. Mitigate: low ceiling default, internal allowlist, keep legacy driveLoop fully intact for instant rollback (flip flag), reconciler already guards stuck-submitted. Production change → explicit founder approval + pasted e2e evidence before any user sees it.

### Phase 3: Phase 3 — fan-out, parent/child, worker-level cap, scheduled
Graduate option B → option A (Temporal startChild for parent/child visibility), bounded Promise.all fan-out across independent broll takes and multi-video goals under the per-task ceiling, thread task_id into primitive input to enable the worker-level maxCreditsPerTask belt-and-suspenders cap, wire scheduled/social for recurring task templates, add the vision critic before the expensive video step.

**Risk:** Medium — concurrency + parent/child credit accounting. Only after Phase 2 is proven stable.

## Risks
- Plan-vs-reality dispatch conflict (called out in summary): the plan assumes startChild reuse, but today runs are dispatched via api-v2 client.workflow.start with their own skill_runs row, not as Temporal children. Picking option A means replicating dispatchMakeUgcVideo's skill_runs insert inside an activity (duplication risk against the 'single money path' rule); option B adds an HTTP hop + loses parent/child visibility. Founder must choose. Recommend B for v1.
- callBrain is non-deterministic (Anthropic) and MUST be an activity, never inline in the workflow, or replays diverge and corrupt the loop. Same for any genId()/UUID — must be Temporal-deterministic or activity-sourced.
- Double-charge if the agent dispatches the same logical step twice across a workflow replay: mitigated because deduct_credits is idempotent by primitive_run_id and the child workflowId is deterministic per skill_run_id — but ONLY if runSkill passes a stable idempotency key per ordinal. A bug that regenerates the key per attempt re-charges. Must test.
- pollRun activity timeout must exceed the client/worker max poll window (~1000s) or a slow render surfaces as 'workflow timed out' (fatal) instead of 'run timed out' (graceful). Seedance video gens are already slow enough to have needed heartbeat fixes (see recent commits).
- Confirmation wait must be bounded (condition with a TTL); an unbounded waitForSignal hangs the workflow forever if the user never returns (maps temporal-risk #6). Also a paused task holds a workflow slot — need a max-pause TTL that fails closed.
- Signal-handler state isn't in Temporal history; relying on a signal side-effect that's lost on crash (maps temporal-risk #3) would silently skip a confirm gate. Must re-evaluate spent/confirmed from durable rows at each decision point, and treat agent_tasks.spent_credits as a mirror reconciled from credit_transactions, not the source.
- SSE ownership: a leaked task_id streaming forever if user_id isn't checked before subscribing (maps SSE-risk #1). And subscription/channel leaks on rapid reconnect need a max-lifetime + terminal-status teardown.
- Concurrent devices both signalling the same task (maps landmine #8): without the session_id soft-lock, a double confirm or conflicting retry/skip races. Mitigated by ordinal-keyed confirm + active_session_id, but it's a soft lock, not airtight.
- Moving persistence from browser to workflow (appendMessage activity) changes the writer of agent_messages; the existing (chat_id, client_msg_id) idempotency must hold for workflow retries (a retried appendMessage hitting the UNIQUE index is a replay → must return success, not error).
- Quote drift: quoteSkillCredits (api) and quotePrimitiveCredits (worker) are hand-synced ('Numbers MUST stay in sync'); if they diverge the ceiling/confirm quote shown won't match the actual charge. Worth extracting to a shared package before trusting the ceiling math.
- Production blast radius: this is a live, real-money system. Phase 2 needs explicit founder approval + pasted e2e evidence (the project rules are explicit), a conservative default ceiling, an internal allowlist, and the legacy driveLoop kept intact for one-flag rollback.

## Open questions (founder decides before Phase 2)
- Child dispatch model: option A (Temporal startChild in-worker, duplicates the skill_runs-insert dispatch logic) vs option B (runSkill activity hits the existing /v1/skills/<slug>/run over HTTP, zero dispatch duplication, but an HTTP hop + no Temporal parent/child link). I recommend B for v1, A in Phase 3 for fan-out — confirm.
- Default per-task credit ceiling number (the plan flags this as open). What bounds the worst-case spend of an unattended 'week of TikToks'? Also: what's the auto_confirm_under threshold for Act+checkpoint (e.g. auto-confirm <=35cr intermediates, always pause the ~840cr video step)?
- When budget_exceeded: hard-fail the task, or pause and wait for an explicit raiseCeiling signal with a bounded TTL? (I designed pause-then-fail-closed; confirm the TTL.)
- Does the agent workflow write agent_messages itself (workflow becomes source of truth, browser stops persisting) or do we keep the browser as a parallel cache writer during Phase 2 for safety? This affects whether closing the tab can lose a message.
- Single-active-session enforcement: soft (session_id stamped, reject mismatched signals) or hard (server-side lock in the SSE route so only one device drives a running task)?
- Per-task step cap value (e.g. 100) and per-task workflowExecutionTimeout (composed skills use 45min; an unattended multi-video task needs much longer — what ceiling?).
- Should we extract quoteSkillCredits/quotePrimitiveCredits into a shared package now (so the ceiling/confirm quote provably matches the charge) before relying on it as a spend guardrail, or defer that hardening?
- Flag scope: per-user allowlist vs global ORCHESTRATOR-style env flag for enable_durable_loop, and the rollback contract (flip flag → browser falls back to legacy driveLoop with no data loss).