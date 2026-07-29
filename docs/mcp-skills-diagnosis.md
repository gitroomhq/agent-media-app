# agent-media MCP/Skills — Server Issues Diagnosis + Fix Plan

**Date:** 2026-06-27 · **Status:** diagnosis (NO code written — learn+plan per founder) · **Source:** 4 read-only root-cause agents + synthesis, grounded in real file:line. Triggered by a real Codex session building AI influencer 'Lola Saint' (55 min, portrait landed, sheet never finished, submitted runs returned not_found).

## Root-cause findings

### [HIGH] User submits a primitive skill like make_portrait via POST /v1/skills/:slug/run; submit is accepted (202 Accepted, returns run_id). But immediately polling GET /v1/primitives/runs/:run_id returns 404 not_found, even though the returned run_id came directly from the submit response. The run eventually completes (image lands in R2), but is unfindable by the polling endpoint during that window.

**Root cause:** A race condition where the API returns a primitive_run_id to the caller before the database row is inserted. For PRIMITIVE skills (e.g. make_portrait), the runSkillRoute (skills.ts:85-277) generates a primitiveRunId (line 235), starts a Temporal workflow with that id (line 255), and immediately returns run_id to the caller (line 271) WITHOUT inserting a primitive_runs row. The row is only created INSIDE the Temporal activity (portrait-gpt2.ts:141-154) via an UPSERT that runs asynchronously after workflow start. If the client polls before the activity executes (typically within milliseconds, but raceable), getPrimitiveRunRoute (primitives.ts:226-267) queries the primitive_runs table with .eq('id', runId).eq('user_id', userId).maybeSingle() (line 245-246), finds nothing, and returns 404. Auth (API key or JWT) is correctly resolved to the same user_id in both submit and status paths (both use verifyToken → req.userId set by authMiddleware at server.ts:153), so the 404 is NOT a user_id mismatch — it's purely that the row does not yet exist.

**Evidence:**
- services/api-v2/src/routes/v1/skills.ts:235-277 — runSkillRoute for primitive skills: generates primitiveRunId, calls client.workflow.start(), returns run_id WITHOUT any primitive_runs insert. Zero database write before response.
- services/api-v2/src/routes/v1/skills.ts:279-371 — dispatchMakeUgcVideo (composed skill) shows the contrast: inserts skill_runs row at lines 308-319 BEFORE calling client.workflow.start() at line 349.
- services/primitive-worker-vnext/src/activities/portrait-gpt2.ts:140-155 — the activity upserts primitive_runs row with status='submitted' at lines 141-154, but this executes inside the activity AFTER Temporal workflow dispatch, not before.
- services/api-v2/src/routes/v1/primitives.ts:226-267 — getPrimitiveRunRoute queries primitive_runs table at line 245 and returns 404 if not found (line 251). This is the polling endpoint called by CLI 'skills status <id>'. No special handling for recently-submitted runs.
- services/api-v2/src/auth.ts:27-60 — verifyApiKey hashes the raw ma_* key, looks up api_keys table by key_hash, returns the user_id from the row. This is the SAME auth path used by both submit and status endpoints (both wrapped by authMiddleware at server.ts:138-156).
- services/api-v2/src/server.ts:138-156 — authMiddleware calls verifyToken, sets req.userId on all authenticated requests. Both runSkillRoute and getPrimitiveRunRoute extract userId from req.userId, so user_id resolution is identical.

**Proposed fix (described, not coded):** Insert the primitive_runs row into the database BEFORE calling client.workflow.start() and returning to the caller, matching the pattern used by composed skills (make_ugc_video, make_broll_talking_head). This eliminates the race window. In skills.ts:runSkillRoute, after line 233 (after idempotency check), insert: const { error: insertErr } = await supabase.from('primitive_runs').insert({ id: primitiveRunId, user_id: userId, primitive_id: skill.primitive, status: 'submitted', input: activityInputBody, idempotency_key: idempotencyKey ?? null, }).single(); if (insertErr) { res.status(500).json({ error: 'primitive_run_insert_failed', detail: insertErr.message }); return; } Then proceed with client.workflow.start(). The activity (portrait-gpt2.ts:141-154) will upsert this row (it already uses upsert with onConflict:'id'), so no double-insert. User will see consistent run_id and status from submit through completion.

### [HIGH] The agent-media character create flow (portrait + character sheet) stalls after portrait generation completes successfully. The job remains stuck in 'processing' state for ~15 minutes before timing out. The user's run took 55 minutes total, with the sheet generation never finishing. Status endpoint queries return 'not_found' or show the job perpetually in 'processing' state.

**Root cause:** The media-worker-v2 service's generateImageEdit() function in services/media-worker-v2/src/openai-image-client.js sends FormData over a multipart body to OpenAI's images/edits endpoint WITHOUT the required duplex:'half' option. When Node.js v18+ runs under undici (the default HTTP client), FormData bodies that stream multipart content require explicit duplex:'half' configuration, or the fetch hangs indefinitely. This affects the character sheet generation at character-create-pipeline.js:149-154. A fix was applied to primitive-worker-vnext's openai.ts (commit 173c91ae on 2026-06-23) but was never backported to media-worker-v2, which handles all v2 character-create and selfie pipeline operations.

**Evidence:**
- services/api-v2/src/routes/v2/characters.ts:5-18: Routes character create to media-worker-v2 POST /v2/characters
- services/media-worker-v2/src/v2/character-create-pipeline.js:149-154: generateImageEdit() called for character sheet without duplex option
- services/media-worker-v2/src/openai-image-client.js:132-153: FormData body constructed (line 132) and sent via fetch (lines 148-153) without duplex:'half'
- services/primitive-worker-vnext/src/client/openai.ts:38-47: Correct implementation with duplex:'half' option applied only to undici fetch, NOT to media-worker-v2
- services/media-worker-v2/src/v2/character-create-pipeline.js:124-128: Portrait generation via generateImageEdit also affected when photo_url provided

**Proposed fix (described, not coded):** Add duplex:'half' option to the fetch() call in media-worker-v2/src/openai-image-client.js generateImageEdit() function (line 148-153) to explicitly signal that the FormData body is a half-duplex stream. This matches the fix applied to primitive-worker-vnext/src/client/openai.ts line 46. The fix should wrap the body parameter conditionally: only set duplex when body is FormData. Apply same fix to generateImageFromText() fetch at line 47 for completeness, though text bodies are less prone to hanging.

**Open questions:**
- Is media-worker-v2 running on Node.js v18+ where undici is the default fetch implementation? Earlier Node versions use a different HTTP stack that may not require duplex.
- Does the portrait generation sometimes succeed despite the missing duplex? The symptom says portrait completes, which might suggest the multipart streaming succeeds occasionally due to timing or load variance.
- Are there any error logs from media-worker-v2 showing 'duplex option is required' errors that match the fix applied in commit 173c91ae?

### [HIGH] User installing agent-media via `npx skills add gitroomhq/agent-media` sees confusing skill counts: pack reports "added 11 skills", the live GET /v1/public/skills API returns 9 generation skills, user sees 12 different skills listed, plus separate 'character create' and 'character show' CLI commands. This creates confusion about what the agent should call and how many primitives actually exist.

**Root cause:** Three separate surfaces expose agent-media with different scopes and counts:

1. **Public skill pack (11 entries in /public-skill/skills/)**: 9 generation v1 skills from registry.ts (make-portrait, make-character-sheet, make-simple-selfie, make-product-in-hands, make-subtitles, make-wireframe, make-lip-sync, make-ugc-video, make-broll-talking-head) PLUS 2 hand-curated non-skill markdown files that are packaged as "skills" but are orchestration guides (agent-media-ugc SKILL.md at line 462-475 in generate-public-skill.ts, publish-to-social SKILL.md at line 480-489). These 11 files sit in /public-skill/skills/ and are what `npx skills add` counts.

2. **REST API GET /v1/public/skills (9 entries)**: Returns only the 9 v1 generation skills from services/api-v2/src/skills/registry.ts:158-249. Does NOT include the playbooks (agent-media-ugc, publish-to-social) or v2 generators like character_create, because the v1 registry is separate from the v2 generators registry.

3. **V2 CLI/MCP generators (separate, 3 total)**: V2 surface has its own V2_GENERATORS registry (services/schema/src/v2/generators.ts:75+) with 3 entries (selfie, character_create, subtitle) that are exposed via CLI (`agent-media character create`, `agent-media selfie`) and MCP tools but NOT in the v1 skill registry. character_create and character_show are separate CLI commands under `/apps/cli/src/v2/commands/character.ts` using V2_GENERATORS.character_create (lines 37-99), but "character show" is listed as "TBD" (line 9: "show — print details for a single character (TBD)"), so it's not yet implemented despite being listed.

The skill pack generation script (services/api-v2/scripts/generate-public-skill.ts:444-489) bundles v1 skills + hand-written playbooks into the 11-skill plugin structure, but agents see conflicting instruction surfaces: "call make_ugc_video" vs "call character_create" vs "use the playbook", with no clear mapping of which to call when.

**Evidence:**
- services/api-v2/src/skills/registry.ts:158-249 — 9 v1 SKILLS map entries (make_portrait, make_character_sheet, make_simple_selfie, make_product_in_hands, make_subtitles, make_wireframe, make_lip_sync, make_ugc_video, make_broll_talking_head)
- services/api-v2/scripts/generate-public-skill.ts:444-456 — skill loop generates 9 SKILL.md files, then lines 462-475 manually write agent-media-ugc playbook (not in SKILLS registry), then lines 480-489 write publish-to-social (also not in registry)
- services/api-v2/scripts/generate-public-skill.ts:491 — console.log confirms '9 skills' but 11 files are written (9 + 2 playbooks)
- find /public-skill/skills | 11 directories — agent-media-ugc, make-broll-talking-head, make-character-sheet, make-lip-sync, make-portrait, make-product-in-hands, make-simple-selfie, make-subtitles, make-ugc-video, make-wireframe, publish-to-social
- services/api-v2/src/routes/v1/skills.ts:77-82 listSkillsRoute calls listSkills() which returns 9 entries
- services/api-v2/src/server.ts app.get('/v1/public/skills', readLimiter, listSkillsRoute) — exposes v1 registry only
- packages/schema/src/v2/generators.ts:75-140 — V2_GENERATORS registry with selfie, character_create, subtitle (separate from v1)
- apps/cli/src/v2/commands/character.ts:1-99 — character_create CLI command uses V2_GENERATORS.character_create, but line 9 says 'character show — print details for a single character (TBD)' indicating not implemented
- public-skill/README.md lines 309-313 lists 9 skills, but playbook is mentioned in line 544-546 as a separate orchestration guide, causing dual-mention confusion

**Proposed fix (described, not coded):** Unify the agent-facing surface into a single, clear hierarchy:

1. **Rename the v1 skill registry to 'vNext primitives'** (services/api-v2/src/skills/registry.ts) and document explicitly that these are micro-skills wrapping single primitives, not the primary UX.

2. **Promote v2 generators as the primary surface** — expose V2_GENERATORS (selfie, character_create, subtitle) via GET /v1/public/skills (or new GET /v2/generators) instead of/alongside v1. The schema already exists at packages/schema/src/v2/generators.ts with proper metadata (cli, mcp, rest, pricing fields at lines 49-70).

3. **Remove the hand-curated playbook 'skills' from the plugin pack** — agent-media-ugc and publish-to-social are orchestration guides, not skills. They should live in reference/playbooks/*.md instead of in skills/*/SKILL.md. The pack should contain exactly 9 skills (v1 generation primitives), period. Update generate-public-skill.ts to skip the playbook writes and update the console.log to confirm the true count.

4. **Implement 'character show'** (apps/cli/src/v2/commands/character.ts:9) as a full subcommand (currently 'TBD'), and add a GET /v2/characters/:id REST endpoint so the command is real. This removes confusion about what's promised vs. what's available.

5. **Update the pack README** (public-skill/README.md) to make the entry point clear: 'Most agents want make_ugc_video (one call for the full pipeline). For tighter control, chain the primitives or use character_create → selfie. See the playbook in reference/playbooks/orchestration-guide.md.'

6. **Add a /v2/start-here or /v1/skills/orchestration endpoint** that returns { "recommended_entry_point": "make_ugc_video", "primitives": [...], "playbook_url": "..." } so agents can programmatically fetch 'which skill should I call?' guidance.

Landing: generate-public-skill.ts (remove playbook writes), services/api-v2/src/routes/v1/skills.ts (add v2 generator listing), apps/cli/src/v2/commands/character.ts (implement show subcommand), public-skill/README.md (simplify skill listing).

**Open questions:**
- Does the v2 generators registry (V2_GENERATORS) need to remain separate from v1 for backward compatibility, or can it fully replace the v1 registry?
- Should 'character show' surface in the pack as a separate skill, or remain CLI-only as a management command?
- Is 'publish-to-social' a skill that runs a primitive (lines 322 in README), or only a reference guide for REST endpoints? If the former, should it appear in the v1 registry too?
- Do agents currently use the agent-media-ugc playbook skill, or do they bypass it and call make_ugc_video directly?

### [HIGH] User's sessions experienced intermittent "generic fetch failure" / "failed at the network connection layer" errors when submitting MCP tool calls, sometimes transient and retrying worked. Separately, "The MCP tools aren't exposed in this session" errors were reported (fallback to CLI). These suggest both MCP availability and network-layer reliability issues.

**Root cause:** Three compounding issues identified:

1. **Unprotected fetch() calls in MCP forward proxy** (mcp.ts:140, 160, 219): The MCP route's `CallToolRequestSchema` handler makes outbound HTTP fetch() calls to PUBLIC_API_BASE (its own api-v2 endpoints) with NO timeout, retry, or circuit-breaker logic. When PUBLIC_API_BASE is unavailable or slow (cold start, Railway scaling), the fetch hangs or fails, surfacing as a bare "connection failed" error to the client. The MCP transport layer (StreamableHTTPServerTransport) wraps this and yields a generic JSON-RPC error.

2. **No duplex/backpressure handling on fetch responses** (mcp.ts:140-226): The response body is eagerly consumed via `resp.text()` without streaming or size limits. If a large payload or slow network causes backpressure, the StreamableHTTPServerTransport's request/response cycle may timeout or fail partway through, again yielding "connection layer" errors.

3. **Status polling path mismatch** (mcp.ts:201, status.ts:116-118, primitives.ts:252, skills.ts:485): When MCP returns a skill run (run_id/workflow_id), it instructs clients to "Poll with GET /v1/primitives/runs/<run_id>", but the skills table uses `skill_runs` (skills.ts:475-486), not `primitive_runs`. Additionally, both primitives.ts:252 and skills.ts:485 return `404 { error: 'not_found' }` when a run is not found or belongs to a different user—this is an **inline string, NOT a JSON object**. A client polling immediately after job submission may hit the status endpoint before the row is written (transient 404), or may misparse the error response if it expects `{ error: { code, message } }` format (as status.ts:116-118 provides for video jobs). The MCP documentation (line 201) points to the wrong endpoint, creating confusion during client polling.

**Evidence:**
- services/api-v2/src/routes/mcp.ts:42-43: PUBLIC_API_BASE defaults to https://api.agent-media.ai but is called with plain fetch() — no timeout/retry
- services/api-v2/src/routes/mcp.ts:140, 160, 219: Three bare fetch() calls with no AbortSignal or timeout
- services/api-v2/src/routes/mcp.ts:171, 174-176: resp.text() is awaited directly without streaming, size checks, or error context
- services/api-v2/src/routes/mcp.ts:201: Instructs 'Poll with GET /v1/primitives/runs/<run_id>' but skills use /v1/skills/runs/<skill_run_id>
- services/api-v2/src/routes/v1/primitives.ts:252: res.status(404).json({ error: 'not_found' }) — returns string, not { error: { code, message } }
- services/api-v2/src/routes/v1/skills.ts:485: res.status(404).json({ error: 'not_found' }) — same issue; inconsistent with status.ts:116-118
- services/api-v2/src/routes/status.ts:116-118: Returns { error: { code: 'VIDEO_NOT_FOUND', message: '...' } } — different schema
- services/api-v2/src/routes/mcp.ts:26-28: Documented as 'stateless' with 'each tool call is a single round-trip' but no streaming progress, only job_id polling
- services/api-v2/src/server.ts:526-527: MCP route is behind authMiddleware + generateLimiter, so auth is validated before mcpRoute runs
- services/api-v2/src/auth.ts:27-60: verifyApiKey uses Supabase query — can timeout or fail if Supabase is slow (especially on cold start)

**Proposed fix (described, not coded):** 1. **Add timeout and retry to MCP fetch calls** (mcp.ts:140, 160, 219): Wrap each fetch in an AbortSignal with a 30s timeout, and implement exponential backoff (3 retries, 200ms→800ms) for transient errors (5xx, timeout). Return a clearer error response like `{ content: [{ type: 'text', text: 'Service unavailable; API call timed out after 30s' }], isError: true }` instead of letting the bare fetch error surface.

2. **Fix status endpoint inconsistency**: Update primitives.ts:252 and skills.ts:485 to return `{ error: { code: 'not_found', message: '...' } }` (matching status.ts format) instead of a bare string. This ensures polling clients get a consistent, parseable error schema across all status endpoints.

3. **Correct MCP polling documentation** (mcp.ts:201): Change the instruction from `'Poll with GET /v1/primitives/runs/<run_id>'` to a conditional: if the submission returns `run_id` (primitive tool), use `/v1/primitives/runs/<run_id>`; if it returns `skill_run_id` (composed skill), use `/v1/skills/runs/<skill_run_id>`. Alternatively, standardize both tables to use the same URL pattern.

4. **Add eager response size limit** (mcp.ts:171): Stream resp.text() or use a size limit (e.g., max 50MB) to detect and fail fast on unexpectedly large payloads that could cause backpressure.

5. **Consider retry-on-404 for polling clients**: Document that a 404 on the first poll after submission is transient (row may not yet be written); advise a 1-2s backoff before retry. Alternatively, implement a `/v1/jobs/<job_id>` endpoint that consolidates all status lookups (video, primitive, skill) under one URL scheme and handles the transient-not-found case gracefully.

**Open questions:**
- Are there Railway cold-start or autoscaling logs that show API latency spikes when MCP requests come in? The PUBLIC_API_BASE is internal (api.agent-media.ai) but if it's behind a load balancer or has replica pooling, cold start could add 5-30s to first request.
- Is the VNEXT_PRIMITIVES_ROUTE_ENABLED flag enabled in the production environment? If not, the MCP skillTool forwarding at line 158-208 is dead code and wouldn't cause the reported errors.
- Do the intermittent errors coincide with Supabase connection pool exhaustion? verifyApiKey (auth.ts:35-42) makes a database query on every request; if the pool is saturated, the MCP request could timeout during auth, even before the tool handler runs.
- Are there error logs from the StreamableHTTPServerTransport that show the exact JSON-RPC error code when clients report 'connection layer' failures?
- Is there a client-side retry loop or circuit breaker in the agent UI that could be hiding transient 404s on status polling, or is the 'sometimes transient' behavior purely server-side?


---

## Prioritized fix plan

Both load-bearing claims are confirmed from code. Notably, the status query at primitives.ts:245 does NOT even filter `.eq('user_id', userId)` in the DB query — it fetches by id then checks ownership in app code (line 251), which collapses "wrong user" and "row missing" into the same `not_found`. The submit path (skills.ts:235-277) confirms zero DB write before the 202 response. Here is the plan.

---

# Fix Plan — agent-media MCP/Skills server (PLAN ONLY, no code changes)

Production, real-money system. Nothing below is applied. Each item needs explicit founder approval + the stated verification before it ships.

Ordered by user impact. A creator who can't track a submitted run has an unusable product, so the submit→status race is P0.

---

## P0 — Submit returns a run_id that status reports as `not_found`
**Severity: Critical. Blast radius: every primitive skill (make_portrait, make_character_sheet, make_simple_selfie, make_product_in_hands, make_subtitles, make_wireframe, make_lip_sync) submitted via `POST /v1/skills/:slug/run` and polled via `GET /v1/primitives/runs/:run_id` — i.e. the core "run a skill, watch it" loop. Confirmed.**

**Confirmed root cause:** `runSkillRoute` (skills.ts:235-277) generates `primitiveRunId`, starts the Temporal workflow, and returns 202 with that id — with **zero database write** before the response (verified: lines 235-276, no insert). The `primitive_runs` row is only created later, inside the activity (portrait-gpt2.ts:141-154, async). Any poll arriving before the activity upserts the row hits primitives.ts:240-252, finds no row, returns `not_found`. The composed path proves the correct pattern: `dispatchMakeUgcVideo` inserts the `skill_runs` row (skills.ts:308-319) **before** `workflow.start()`. This is NOT auth/user-id mismatch — both paths resolve the same `req.userId`.

**Fix (described):** In `runSkillRoute`, after the idempotency check (after line 233) and before `client.workflow.start()`, synchronously insert the `primitive_runs` row (`id=primitiveRunId`, `user_id`, `primitive_id`, `status='submitted'`, `input`, `idempotency_key`). The activity already upserts with `onConflict:'id'`, so no double-insert. If the insert fails, return 500 and do NOT start the workflow (avoids an orphan workflow with no trackable row). This closes the race entirely rather than papering over it with client retries.

**Confirm before:** (a) the activity's upsert truly uses `onConflict:'id'` and overwrites `status` correctly (read portrait-gpt2.ts:141-154 — claimed but verify the conflict target and that it doesn't clobber a later status with `submitted`); (b) the exact NOT-NULL / column set of `primitive_runs` so the pre-insert satisfies the schema; (c) idempotency replay path (skills.ts ~225-232) still resolves correctly when a row now pre-exists.
**Confirm after:** end-to-end — submit `make_portrait`, immediately (sub-100ms) poll `GET /v1/primitives/runs/<returned id>` in a tight loop; assert first poll returns 200 `status:'submitted'` (never `not_found`), then transitions submitted→…→completed with the artifact. Repeat under concurrency. Also re-run an idempotent resubmit and confirm no duplicate-row / 500.

---

## P1 — Character-sheet generation stalls ~15 min then times out (the 55-min run)
**Severity: High. Blast radius: all v2 character-create and selfie operations routed to media-worker-v2 (characters.ts:5-18 → `POST /v2/characters`); portrait sometimes lands, sheet hangs. Root cause strongly supported by the identical, already-shipped fix in the sibling service (commit 173c91ae).**

**Root cause (high confidence, one open verification):** `generateImageEdit()` in media-worker-v2/src/openai-image-client.js (FormData body line 132, fetch lines 148-153) calls `fetch()` with a multipart FormData body but **without `duplex:'half'`**. Under Node 18+/undici, a streaming request body without `duplex:'half'` hangs. The fix already exists in primitive-worker-vnext/src/client/openai.ts:38-47 (and the broader symptom matches commit 173c91ae "duplex option is required") but was never backported to media-worker-v2, which is exactly the service the character sheet runs through (character-create-pipeline.js:149-154).

**Fix (described):** Add `duplex:'half'` to the `fetch()` options in `generateImageEdit()` (and `generateImageFromText()` for parity), set conditionally only when the body is FormData — mirroring openai.ts:46. Smallest possible change, scoped to the one service.

**Confirm before (these are the open questions that gate the fix):** (1) media-worker-v2 actually runs on Node 18+ with undici as default fetch — check its runtime/Dockerfile/`node -v` in prod; if it's on an older stack or node-fetch, duplex is a no-op and the real cause is elsewhere. (2) Server logs from media-worker-v2 showing the literal `duplex option is required` / a hang at the edits call — this is the single piece that turns "high confidence" into "proven." (3) Why portrait sometimes succeeds while sheet hangs — confirm whether portrait uses the same `generateImageEdit` path (pipeline lines 124-128 suggest yes when `photo_url` provided); if portrait reliably succeeds while sheet reliably hangs, the duplex theory needs the difference explained (e.g. payload size, retry, a different fetch call).
**Confirm after:** run a full v2 character create (portrait → sheet) against the patched worker; assert the sheet image lands in R2 and the job goes processing→completed in normal time (seconds–low minutes, not 15 min), and that status never sticks in `processing`. Capture the worker log line for the successful edits call.

---

## P2 — Skill-surface confusion (9 vs 11 vs 12 + character commands)
**Severity: Medium (UX/adoption, not data loss). Blast radius: every new install via `npx skills add`; agents pick the wrong entry point or thrash between surfaces. Confirmed three surfaces with three counts.**

**Confirmed root cause:** Three registries/surfaces disagree: (1) the public pack ships **11** dirs = 9 v1 skills + 2 hand-written playbook markdowns packaged as skills (generate-public-skill.ts:444-489); (2) `GET /v1/public/skills` returns **9** (registry.ts:158-249); (3) v2 has a separate `V2_GENERATORS` of 3 (selfie, character_create, subtitle) surfaced only via CLI/MCP (packages/schema/src/v2/generators.ts:75+), with `character show` listed but "TBD"/unimplemented (character.ts:9). No mapping tells an agent which to call.

**Concrete simplification (what an agent should see):**
- **One primary entry point:** `make_ugc_video` (one call = full pipeline). This is what the README and any "start here" guidance should foreground.
- **Primitives as an explicit secondary tier:** keep the 9 v1 generation skills, but label them in the pack/README as "primitives — chain these only for tighter control," so they read as advanced, not as 9 competing top-level choices.
- **Remove the 2 playbooks from `skills/`:** move agent-media-ugc and publish-to-social out of `skills/*/SKILL.md` into `reference/playbooks/*.md`. Update generate-public-skill.ts to stop writing them as skills and fix the misleading `console.log` so the printed count matches the files written (true count = 9 skills + N reference docs, stated as such).
- **Make the surface self-describing:** add a small `start-here` / orchestration endpoint (and matching pack doc) returning `{ recommended_entry_point: "make_ugc_video", primitives: [...], playbook_url }` so an agent can fetch "which skill do I call?" instead of guessing.
- **Identity flow (the part that confused the Codex session):** document one canonical chain — `make_portrait` → `make_character_sheet` → (`make_simple_selfie` | `make_ugc_video`). Decide whether v2 `character_create` is the supported identity path or a parallel/legacy one, then expose exactly one of them to agents; do not present both `character_create` and the portrait→sheet chain as co-equal.
- **`character show`:** either implement it for real (full subcommand + `GET /v2/characters/:id`) OR remove it from the listed commands. Shipping it as "TBD" in the visible command list is itself a confusion source — pick one.

This is documentation/packaging + small additive endpoints; it touches no generation runtime. It can ship independently of P0/P1.

**Confirm before:** the 4 OPEN questions are genuinely founder decisions, not code facts — (a) can v2 generators replace v1 or must both stay for back-compat; (b) is `character show` a pack skill or CLI-only management cmd; (c) is `publish-to-social` an actual primitive run or only a REST reference; (d) do agents currently use the agent-media-ugc playbook skill or bypass it to `make_ugc_video`. The last one ideally wants **usage data/logs** (which skill slugs are actually invoked) before we demote the playbook.
**Confirm after:** regenerate the pack; `find public-skill/skills` shows exactly the agreed set; `GET /v1/public/skills` count matches the pack's skill count and the README; `npx skills add` reports the same number; if `character show` was implemented, run it end-to-end against a real character id.

---

## P3 — Intermittent MCP fetch failures + wrong polling docs; MCP as the clean surface
**Severity: Medium (intermittent, retry sometimes works) but corrosive to trust. Blast radius: all MCP tool calls. Partly proven from code (bare fetches, error-shape mismatch, wrong poll URL); the "network layer" intermittency is partly infra and needs logs.**

**Confirmed from code:** (1) MCP forward-proxy fetches to PUBLIC_API_BASE (mcp.ts:140,160,219) have **no timeout/retry/abort** — a slow/cold upstream surfaces as a bare connection error. (2) Status error shapes are inconsistent: primitives.ts:252 and skills.ts:485 return `{ error: 'not_found' }` (bare string) while status.ts:116-118 returns `{ error: { code, message } }` — clients expecting the structured shape misparse. (3) MCP tells clients to poll `GET /v1/primitives/runs/<run_id>` (mcp.ts:201) even for composed skills that live in `skill_runs` and are polled at `/v1/skills/runs/<skill_run_id>` — wrong endpoint → guaranteed `not_found`.

**Fix (described):**
- Wrap each MCP outbound fetch in an `AbortSignal` timeout (~30s) + bounded exponential-backoff retry (3 tries) on 5xx/timeout, and return a structured `isError` tool result ("API timed out after 30s") instead of leaking a bare fetch error.
- Standardize the not-found error body across primitives.ts:252, skills.ts:485, and status.ts to one shape `{ error: { code, message } }`.
- Fix the MCP poll instruction (mcp.ts:201) to branch: `run_id` → `/v1/primitives/runs/<id>`; `skill_run_id` → `/v1/skills/runs/<id>`. (Better long-term: one consolidated `/v1/jobs/:id` that resolves video/primitive/skill and handles transient not-found — but that's a larger change; do the branch fix now.)
- Add a size guard on `resp.text()` (mcp.ts:171) to fail fast on oversized payloads.
- Note: P0's pre-insert fix also removes the transient-404 that polls through MCP were hitting, so P0 + this poll-URL fix together close most of the "status flaky over MCP" reports.

**Confirm before:** Check the `VNEXT_PRIMITIVES_ROUTE_ENABLED` flag in prod — if disabled, the MCP forwarding at mcp.ts:158-208 is dead code and the intermittency is coming from elsewhere (this changes what we fix). Confirm changing the error shape won't break existing clients that parse `error === 'not_found'` (it's an API contract change — needs a deprecation note).
**Confirm after:** MCP tool call against a deliberately slowed upstream returns a clean structured timeout (not a bare connection error) and retries; submit via MCP then poll the URL the tool now hands back and confirm it resolves; assert all three status endpoints return identical error JSON for a missing id.

---

## Questions for the founder (decisions code can't answer)
1. **Surface direction:** Is v2 (`character_create`/`selfie`) the intended future and v1 primitives a compatibility layer — or are the 9 v1 skills the product and v2 experimental? This determines whether we demote, alias, or keep both. (Blocks P2.)
2. **`make_ugc_video` vs the playbook:** Do you want agents pushed to the one-shot `make_ugc_video` as THE entry point, with primitive-chaining/playbook as explicitly advanced? (Shapes the README/start-here.)
3. **Error-shape contract:** OK to standardize `not_found` to `{ error: { code, message } }` across all status endpoints, accepting it's a breaking change for any client parsing the bare-string form? (Blocks P3 item 2.)
4. **`character show` / `publish-to-social`:** Implement `character show` + `GET /v2/characters/:id`, or remove it from the visible command list? And is `publish-to-social` an actual primitive run or only a REST reference guide?
5. **Rollout/approval:** P0 and P1 touch the production submit path and a prod worker. Confirm we may stage on a branch, deploy to a non-prod/worker canary, run the verifications above, and only then promote — and who signs off on the prod deploy.

## What needs server logs vs. already proven from code
- **Already proven from code (no logs needed):** P0 race (submit writes nothing before 202 — verified skills.ts:235-276; status fetches-then-checks-owner at primitives.ts:240-252). P3 items: bare unguarded fetches (mcp.ts:140/160/219), error-shape mismatch (primitives.ts:252 / skills.ts:485 vs status.ts:116-118), wrong poll URL (mcp.ts:201). The missing `duplex:'half'` in media-worker-v2 (openai-image-client.js:148-153) vs the present one in openai.ts:46 is proven by code; what's NOT proven is that it's the cause of *this* hang.
- **Needs server logs / runtime to confirm:** (a) media-worker-v2 Node/undici version + a log line showing the edits fetch hanging or `duplex option is required` — to confirm P1's cause rather than assume it; (b) whether portrait and sheet take the same fetch path (explains "portrait sometimes succeeds"); (c) `VNEXT_PRIMITIVES_ROUTE_ENABLED` state in prod (decides if MCP forwarding is live); (d) Railway cold-start / Supabase pool-exhaustion correlation with the intermittent MCP "network layer" errors and the raw StreamableHTTPServerTransport JSON-RPC error code; (e) actual skill-slug invocation counts to decide whether agents use the playbook or `make_ugc_video` (informs P2 demotion).

**Recommended order:** P0 (unblocks tracking — unusable without it) → P1 (kills the 55-min stall, but get the Node/undici + log confirmation first) → P3 poll-URL + error-shape (cheap, removes remaining "status flaky" reports, compounds with P0) → P2 (packaging/docs, ship independently). P0, P1, and P3-error-shape are the only ones touching production runtime/contract and require the staged-deploy + verification sign-off.
---

## Issue #5 — long monologue silently truncated to a 5s clip (added 2026-06-27)

**Repro:** founder asked (via Codex) for a full ~110-word "Sophia" monologue UGC video (hook→body→CTA, highlighted keyword captions). Output `character-video-final (3) (1).mp4`: **720×1280 (9:16 ✓), 5.06s**, character/kitchen/coffee roughly match, BUT only the first sentence fits — body, CTA, and captions dropped.

**Root cause (confirmed in code):** the request was served by a SINGLE-CLIP skill (`character_video` / `make_ugc_video` / `make_simple_selfie`). Those cap at 5/10/15s, and the schema instructs the brain to **"Trim the user's line if it is longer"** (registry.ts:46) with a word budget of ~1.5–2.2 words/sec (registry.ts:68 `wc <= duration*2.2`). A 110-word monologue → trimmed to ~8 words → 5s. The ONLY full-monologue path is `make_broll_talking_head`, which chunks the script into word-sized takes and composes (~38s) (credit-quotes.ts:91-96). The agent didn't select it.

**Class:** same as P2 — skill selection + silent truncation. Distinct, high user-impact (the headline creative request silently produces 1/8th of the content).

**Fix (described, not coded):**
1. Stop silent truncation: a script over the single-clip word budget should NOT be trimmed to 8 words. Auto-route to `make_broll_talking_head`, OR reject with a clear message ("~38s monologue — use make_broll_talking_head or shorten to ~22 words").
2. Brain/system + pack guidance: "full monologue/long script → make_broll_talking_head; short one-liner → single clip." Folds into P2's single-clear-entry-point.
3. Captions: confirm whether make_subtitles supports per-keyword color highlights (yellow/green on [MONEY]/[HARD]/…). Likely NOT a feature today → separate gap.

**Confirm:** which skill the Codex agent actually invoked for this run (logs / the run's skill slug); whether character_video validation REJECTS over-budget scripts or the brain pre-trims; whether make_subtitles highlight styling exists.

---

## Adversarial review corrections (2 reviewers, 2026-06-27)

**P0 — GO, with 2 refinements:** confirmed real (skills.ts:235-276 writes nothing before the 202; activity upserts onConflict:'id' status:'submitted' first, so no clobber; deduct_credits idempotent on reference_id so no double-spend; primitive_runs NOT-NULLs = user_id/primitive_id/status/input, all provided). ADD: (1) apply the pre-insert to ALL 8 primitive paths, not just make_portrait; (2) a pre-insert with a non-null idempotency_key can hit `uniq_primitive_runs_idempotency` (23505) on a concurrent same-key submit — treat 23505 as a REPLAY (re-select + 202 idempotent_replay), do NOT blanket-500.

**P1 — STOP, root cause likely WRONG.** media-worker-v2 uses Node's BUILT-IN global fetch (no undici/node-fetch dep; node:20-slim). The duplex error only throws on the explicitly-imported `undici` package fetch (what commit 173c91ae actually patched). Global fetch + FormData does NOT throw it. Decisive tell: a duplex error fails INSTANTLY (sync throw), but the symptom is a 15-MINUTE HANG — opposite failure mode. The duplex patch would be a harmless no-op. The likely real cause is the socket-reuse/"Premature close" class that primitive-worker-vnext/openai.ts handles (fresh-socket Agent keepAliveTimeout:1, 300s timeouts, premature-close retry, api-v2 fallback) — none of which media-worker-v2 has. ACTION: pull a media-worker-v2 log line first; the real fix is backporting the connection-hardening + retry, not one flag.

**P3 — GO (error-shape + poll-URL branch), but:** confirm `VNEXT_PRIMITIVES_ENABLED` (NOT `..._ROUTE_ENABLED` as the doc said) is ON in prod — if OFF, the MCP skill-forwarding (incl. the wrong-poll-URL line mcp.ts:201) is dead code and the intermittency is elsewhere. The bare-string→{error:{code,message}} change is a CONTRACT break → deprecation note.

**make_ugc facade — ADJUST/RESCOPE (not a pure thin router):**
1. **Long monologue cannot silently become broll** — `make_broll_talking_head` REQUIRES `broll_video_url` (skills.ts:164-179 hard-fails without it) and composites an overlay = a different deliverable. So long-no-broll must either (a) become a NEW feature (make broll_video_url optional → a no-overlay multi-take talking head) or (b) REJECT with a clear message. Drop the "auto-route, results unchanged" claim.
2. **Keyword-highlight captions are a MISSING feature**, not a prop. make_subtitles only exposes style∈{hormozi,tiktok,minimal} + transcript + language (contracts.ts:230-242); no per-word color anywhere. make_ugc must NOT accept a highlight prop until the subtitle renderer gains per-word ASS color override (net-new). (This is the Sophia-video caption ask.)
3. **Two incompatible identity systems** on the MCP surface: v1 (raw character_sheet_url) and v2 (create_character→character_id→create_selfie). v1's make_character_sheet saves a user_characters row but assigns NO public_id, so it's not reusable as char_xxx. Pick ONE (char_xxx) and give make_ugc character_id IN + character_id OUT, or reuse stays broken.
4. **Preserve response shape:** the in-app web agent branches on `Boolean(subJson.skill_run_id)` (page.tsx:525) to pick composed vs primitive poll URL. make_ugc must own ONE skill_runs row + return skill_run_id (never a new combined id) or the web agent polls the wrong endpoint.
5. **Keep it narrow + keep an escape hatch:** don't pile broll+highlight+character_id+batch into ~15 props (reproduces "which combo is valid?"). Keep the advanced skills VISIBLE (deprecation window, not hard-hide) so agents have recourse.
6. **quoteSkillCredits:** a new `make_ugc` slug returns 0 (default branch) → preflight under-charges / 402 never fires → half-failed run on low balance. Must add the slug (route-resolving) to the quote.
7. **Name:** don't ship both make_ugc AND make_ugc_video — alias/rename, never two make_ugc* in tools/list. Batch = N sequential calls (no fan-out primitive exists).
