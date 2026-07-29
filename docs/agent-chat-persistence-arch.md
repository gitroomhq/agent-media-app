# Agent Chat + Project Persistence — Architecture

**Date:** 2026-06-26 · **Status:** design (not built) · **Source:** 3-architect design panel + synthesis, grounded in the real stack.

## Overview
Persist the agent conversation in **three new owner-scoped Postgres tables** (`agent_projects`, `agent_chats`, `agent_messages`) sitting **alongside** the sketched `agent_tasks` (conversation ≠ durable goal-plan — different lifecycles). The stateless brain (`POST /v1/agent`) stays the single Anthropic surface; `/v1/skills/<slug>/run` stays the single execution+credit surface. **Persistence is purely additive.**

**v1 is client-driven:** the web client already appends every message to its `convo` array + `localStorage` inside `driveLoop`/`send` — we make those same sites *also* POST the new tail to an idempotent append endpoint (~30 lines). `chatId` lives in the URL (`?chat=<id>`) so chats are deep-linkable and reload-safe; `localStorage` is demoted to a per-chat cache and **adopted once** into a server chat on first load so no live session is lost.

## Data model (3 tables, RLS mirrors `user_characters`)

**`agent_projects`** — left-rail groups; a chat belongs to 0/1 project.
`id, user_id→auth.users, name, instructions (Cowork pinned context, injected into SYSTEM), emoji, archived_at, created_at, updated_at`

**`agent_chats`** — one row per conversation.
`id, user_id, project_id→agent_projects (NULL=loose, ON DELETE SET NULL), title (null until auto-titled), status('active'|'archived'), pinned, last_skill_run_id→skill_runs (O(1) "is a render live?"), message_count, last_message_at (rail sort), archived_at, created_at, updated_at`
Indexes: `(user_id, last_message_at DESC) WHERE archived_at IS NULL`; pinned partial; project partial.

**`agent_messages`** — **one row per message** (not a jsonb blob per chat).
`id, chat_id→agent_chats (ON DELETE CASCADE), user_id (denormalized for RLS/index), seq (server-assigned MAX+1), role('user'|'assistant'), content jsonb (the client's Msg.content verbatim — string | Block[] of text|tool_use|tool_result, no transform), skill_run_id→skill_runs, primitive_run_id→primitive_runs, run_kind('skill'|'primitive'), client_msg_id (idempotency key — tool_use.id or a uuid), created_at`
Indexes: `UNIQUE (chat_id, seq)`; `UNIQUE (chat_id, client_msg_id)`.

RLS on all three: four owner policies (`auth.uid()=user_id`) + `service_role FOR ALL`. **api-v2 always keeps the explicit `.eq('user_id', userId)` filter** (the service-role client bypasses RLS — that filter is the real guard; RLS is defense-in-depth). `updated_at` via the existing `touch_primitive_updated_at()` trigger.

## API surface (api-v2)
- `GET /v1/agent/chats?project_id=&status=&q=&limit=` — left-rail list (pinned first, then recency; `q`=ilike title) + projects[]. No messages (cheap).
- `POST /v1/agent/chats {project_id?, title?, first_message?}` — create chat (optionally append msg 1) → `{id}`.
- `GET /v1/agent/chats/:id?before_seq=&limit=60` — **reopen:** `{chat, messages[] ORDER BY seq ASC (windowed), inflight:{tool_use_id, skill_run_id, run_kind, status}}` so the client rebuilds `messages[]`+`toolRuns` and re-attaches a live render.
- `POST /v1/agent/chats/:id/messages {messages:[…]}` — **the core write:** `INSERT … ON CONFLICT (chat_id, client_msg_id) DO NOTHING` (idempotent), server-assign `seq`, bump `message_count`/`last_message_at`/`last_skill_run_id`. Batched per loop step.
- `PATCH /v1/agent/chats/:id {title?, pinned?, status?, project_id?}` — rename / pin / archive / move-to-project.
- `DELETE /v1/agent/chats/:id` — **soft-archive** (never hard delete; preserves skill_run audit links).
- `GET/POST/PATCH/DELETE /v1/agent/projects`.
- **Unchanged:** `POST /v1/agent`, `POST /v1/skills/<slug>/run`, `GET /v1/skills/runs/:id`, `GET /v1/primitives/runs/:id`.

## Persistence approach — client-driven for v1
The brain is stateless and the client already holds the **complete, ordered, run-linked** transcript (and produces the `tool_result` the brain never sees). So the client is the correct writer: make its existing append sites also fire-and-forget `POST .../:id/messages`. Idempotent by `(chat_id, client_msg_id)` → retries never duplicate. The brain keeps doing `windowMessages(messages, 60)` on the full array the client posts.
**Upgrade path (no migration):** when the loop later moves onto Temporal (`agentTaskWorkflow`), the *server* becomes the writer to the *same* schema; client + server writes dedupe via `client_msg_id`. `agent_chats` gains a nullable `task_id→agent_tasks` FK. The client-driven weakness (a tab dying mid-loop loses the last unflushed turn) is exactly what the durable loop fixes later — we pay nothing now.

## Client architecture (page.tsx)
- **Sidebar** (`AgentSidebar`, ~260px, collapsible; right Workspace panel untouched): `+ New task`, search, **Pinned**, **Projects** (collapsible groups), **Recents** (loose chats). Each row `…` menu → Rename / Pin / Move to project / Archive. Backed by `GET /v1/agent/chats`.
- **chatId in `?chat=<id>` URL** (deep-linkable, reload-safe); `localStorage` = per-chat cache (instant paint).
- **Open a chat:** `GET /v1/agent/chats/:id` → `setMessages` + rebuild `toolRuns` (seed `runId` from each row's `skill_run_id`/`run_kind`) → `resumeIfNeeded()` seeded from the returned `inflight` (reuses the existing `pollRun`, zero new polling code).
- Changes: mount effect (server-load if `?chat=`, else adopt localStorage, else empty); `send()` mints a chat if none; `driveLoop()` fire-and-forget appends with `skill_run_id`/`run_kind`; `newChat()` clears `?chat` (old chat stays on the server).

## Migration (no loss)
On first load after ship: if no `?chat=` AND `localStorage` has a session AND guard `am_agent_migrated_v1` unset → (1) `POST /v1/agent/chats`; (2) `POST .../:id/messages` with the whole `messages[]` (stamp `skill_run_id` from cached `toolRuns` so in-flight renders re-attach); (3) only after 200, set the guard + push `?chat=newId` + keep the blob as cache. Idempotency + guard prevent double-adoption and partial-orphan.

## Phased rollout
- **P1 — Schema + loose-chat persistence (smallest shippable):** the migration + `POST /chats`, `POST /chats/:id/messages`, `GET /chats/:id`, `GET /chats` + web proxies + the `page.tsx` chatId/append/adopt/reopen. **Outcome: past chats survive, reopen on any device, re-show media + re-attach live renders.** Brain + skills untouched.
- **P2 — Left rail + lifecycle:** `AgentSidebar`; `PATCH`/`DELETE` for rename/pin/archive; auto-title v1 (truncate first user msg, strip the hidden `[…_url:]` markers).
- **P3 — Projects + pinned context:** projects CRUD; sidebar groups; inject `project.instructions` into the brain SYSTEM (reuse the `buildUserContext` injection point); optional Haiku title upgrade behind a flag.
- **P4 (later) — durable server writer:** `agent_chats.task_id` FK; the Temporal loop writes messages to the same endpoint; dedupe via `client_msg_id`.

## Key decisions (made)
- **One row per message** (not a transcript blob) — single-INSERT appends, windowed reopen, per-row `skill_run_id` FK.
- **Client-driven persistence** for v1 (~30 lines, brain/execution untouched); server-side upgrade is additive + idempotent.
- **Chats separate from `agent_tasks`** (conversation vs goal decomposition; linked by FK later).
- **Tool-run linkage = a column** (`skill_run_id`+`run_kind`), not a join table → reopen re-polls the existing run endpoints.
- **Re-attach live render is O(1)** via `agent_chats.last_skill_run_id` + an `inflight` object in the reopen response, reusing `resumeIfNeeded()`.
- **Soft-archive everywhere** (preserve audit links).

## Open questions (for the founder)
1. Auto-title: truncation-only (free) for v1, or also the fire-and-forget Haiku upgrade now?
2. Delete: soft-archive only (keeps audit links), or also a true hard-delete in the UI?
3. Project pinned context: free-text `instructions`, or structured jsonb (`default_character_sheet_url`, brand notes) injected into SYSTEM?
4. Confirm: no concurrent multi-tab writes to the same chat in v1 (the `MAX(seq)+1` + `UNIQUE(chat_id,seq)` retry assumes serial).
