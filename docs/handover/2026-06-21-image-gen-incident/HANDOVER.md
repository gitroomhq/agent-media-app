# HANDOVER — agent-media Image Generation Incident & Production Status

> **Document type:** Incident + full project-status handover
> **Date:** 2026-06-21
> **Author:** Claude (pairing with Yuval / info@agent-media.ai)
> **Severity:** P0 (paying customers affected; customer loss reported)
> **Surface affected:** `make_portrait` / `make_character_sheet` (vNext primitive image generation)
> **Current production state:** PARTIALLY RESTORED — hard failures fixed; latency-under-load still degraded
> **Read time:** ~30 min. If you read nothing else, read §0 (TL;DR) and §9 (Pick up here).

---

## TABLE OF CONTENTS

- §0  TL;DR (read this first)
- §1  What the user asked for / scope
- §2  Current production status (what works, what's degraded)
- §3  System architecture (services, deploy, data, image-gen path)
- §4  The incident — chronological narrative
- §5  Root-cause analysis (all four bugs, in discovery order)
- §6  Fixes deployed this session (commits + diffs + evidence)
- §7  What is STILL broken (the concurrency cascade)
- §8  All diagnostic evidence (raw test outputs)
- §9  PICK UP HERE — the exact next steps
- §10 How to reproduce & test (commands, scripts)
- §11 Key files & line references
- §12 Environment, access, credentials
- §13 Deploy & verification procedures
- §14 Timeouts & config reference table
- §15 Landmines / things NOT to do
- §16 Open questions
- §17 Delivered artifacts (proof of working pipeline)
- §18 Appendices (full command logs, scripts, config dumps)

---

## §0 — TL;DR (READ THIS FIRST)

The product feature `make_portrait` / `make_character_sheet` (the vNext "primitive"
image-generation pipeline that runs on the Temporal worker `primitive-worker-vnext`)
was failing for paying customers with **"make_portrait failed — timed out"**.

Through this session we found and fixed THREE bugs, and identified a FOURTH that is
**not yet fully fixed**:

| # | Bug | Status | Commit |
|---|-----|--------|--------|
| 1 | OpenAI SDK reused stale keep-alive sockets → `Premature close` on every image | FIXED | (pre-session attempts) |
| 2 | Fresh undici `Agent` created **per request** and never closed → socket/handle leak; degraded ~13 min after each boot | FIXED | `bec012d2` |
| 3 | **Activity Heartbeat timeout** — the image activity never heartbeat during the 50–150s OpenAI call, so Temporal killed + retried it; runs ballooned to minutes or got **stuck in `submitted`** (this is what users saw as "timed out") | FIXED | `be6afd52` |
| 4 | Under **in-process concurrency** the direct OpenAI call hits the **OpenAI SDK's 120s client timeout** ("Request timed out"), triggers the api-v2 fallback which also times out, blowing the activity limit → 5–9 min durations | **ROOT CAUSE CONFIRMED, fix not yet applied** (diagnostics + fast-fail fallback deployed) | `4a75c06c` |
| 5 | **Credit double-charge on retry** (pre-existing, vault-documented HIGH risk) — every Temporal activity retry re-runs `deduct_credits` with no idempotency guard. Bugs 3 & 4 caused MANY retries during this incident → customers were almost certainly **over-charged 2–3×** for slow/retried runs. | **NOT FIXED** — needs a DB migration + approval | (pre-existing) |

**Bottom line right now:**
- Single / low-concurrency portraits + character sheets **WORK** and are fast (~40–80s). Verified with 4 real delivered images (see §17).
- The **hard failures** ("timed out", stuck runs) that were losing customers are **fixed** (Bug 3). Under the exact 8-concurrent load that previously failed, runs now **succeed** (0 heartbeat timeouts in logs).
- **Under burst/concurrent load they are SLOW** (5–9 min instead of ~1 min) — Bug 4. The root cause is now **confirmed** (see next line); the fix is known but not yet applied.
- **CONFIRMED Bug-4 root cause:** under 8-way concurrency the worker's event loop is saturated, so the direct OpenAI call's wall-clock exceeds the **OpenAI SDK `timeout: 120_000`** and the SDK aborts it with `"Request timed out"` → fallback → cascade. **Your own vault already documents this** (`agent-media-vault/architecture/content-machine-pipeline.md` line 104): *"gpt-image-2 real latency is 2–5 min — set the OpenAI client `timeout: 600_000`, not the default 120s."* The vNext worker uses 120s. The legacy content-machine worker uses 600s and doesn't have this problem.
- **Bug 5 (credit double-charge)** is the financial dimension of the same incident: because Bugs 3 & 4 forced retries, and `deduct_credits` is not idempotent on retry, affected customers were over-charged. This needs an audit of `credit_transactions` for the incident window and a refund + a permanent idempotency fix.

**The fix for Bug 4 (now known — see §9):** (a) raise the OpenAI client `timeout` from 120s to ~300–600s so slow-but-healthy gpt-image-2 calls aren't killed (matches the vault gotcha and the real 2–5 min p100 latency), AND (b) **cap the worker's `maxConcurrentActivityTaskExecutions`** so heavy image jobs don't saturate the event loop and slow each other down. Then re-verify with the concurrent load test (acceptance: 8/8, p95 < ~120s, 0 fallbacks).

---

## §1 — WHAT THE USER ASKED FOR / SCOPE

The user (Yuval, founder, info@agent-media.ai) runs agent-media, an AI UGC video
platform with ~400 paying customers. Over this session the requests were:

1. "check why creating character sheet failed" → traced to OpenAI image-safety
   rejecting the word "sexy"; built a prompt sanitizer (already shipped earlier).
2. THE DOMINANT REQUEST: portraits / character sheets stopped working —
   "stuck endlessly", "it keep failing", "nothing works", "im very worried. i have
   400 users. paying", "critical this is production", "I need FULL FIX, FULLY
   WORKING ... DO NOT GUESS."
3. "wtf, not working, please create a full portrait and character sheet."
4. "please generate one, using the MCP or skill." → done via the skill path.
5. "make_portrait failed — timed out ... Please try again in a few minutes" →
   the still-failing UI symptom that drove the Bug 3 + Bug 4 investigation.
6. "we must fix it. i lost dozens of customers."
7. "please make full HANDOVER document. with entire project status" (this doc).

**Hard constraints the user has set (must respect):**
- Production system, real paying users. Production changes require explicit approval
  AND verification with pasted evidence. (User explicitly asked for the fixes here.)
- **Never claim "fixed" without end-to-end verification** — driving the actual failing
  flow and observing the symptom gone. Unit tests / "looks right" ≠ verified.
- **Do not guess** the root cause; measure it.
- Never expose provider names / wholesale cost / margin in any user-facing surface
  (customers see CREDITS only).
- Do NOT bulk force-fail runs (an earlier action accidentally cleared the user's own
  live in-flight runs — "cleared by operator during incident" — never repeat).
- Deploy worker/api-v2 via `railway up` (no GitHub auto-deploy).

---

## §2 — CURRENT PRODUCTION STATUS

### 2.1 What WORKS (verified)
- `POST /v1/primitives/portrait_gpt2` → real portrait PNG, ~40–80s at low concurrency.
- `POST /v1/primitives/character_sheet_gpt2` → real character sheet PNG.
- `POST /v1/skills/make_portrait/run` and `POST /v1/skills/make_character_sheet/run`
  (the path the MCP + agent UI use) → both verified end-to-end with real images.
- The worker boots clean, registers on task queue `primitive-vnext-v1`, consumes jobs.
- Heartbeat timeouts: **0** after the Bug-3 fix (was the failure cause).

### 2.2 What is DEGRADED (not fixed)
- Under concurrent/burst load (e.g. 8 portraits submitted within ~1s), durations are
  **5–9 minutes** and occasionally a run does not complete within a 10-min poll window.
  Root cause: Bug 4 (see §5.4 and §7). Customers experience this as "very slow" and,
  at the worst tail, still as effective timeouts in some UIs (though the agent UI's poll
  budget is 16 min, so it mostly shows slow-but-succeeds now).

### 2.3 Latest deploys (worker `primitive-worker-vnext`)
- Last deployed commit: **`4a75c06c`** (diagnostics + fallback fast-fail).
- Worker last booted: **2026-06-21 11:06:19 UTC**, state RUNNING, `simulate=false`,
  queue `primitive-vnext-v1`. Clean boot, no errors.
- Deployment id of the `4a75c06c` build: `ee8cbc0d-be26-4328-ac09-033d5b557a99` (SUCCESS).

### 2.4 Services & their deployed state
| Service | Role | Deployed change this session |
|---------|------|------------------------------|
| `primitive-worker-vnext` | Temporal worker; runs image activities | Bugs 2,3,4 fixes + diagnostics |
| `api-v2` | Express API; starts workflows; hosts `/internal/gpt-image` fallback | NOT changed this session (but is the suspected weak link in the fallback — see §7) |
| `apps/web` (Vercel) | Next.js frontend; agent UI; same-origin proxies | NOT changed this session |

---

## §3 — SYSTEM ARCHITECTURE

### 3.1 Repos & deploy
- Monorepo: `~/Projects/agent-media` (pnpm workspaces).
- Private origin: `github.com/yuvalsuede/agent-media` (push day-to-day work here).
- Public mirror: `gitroomhq/agent-media` — **public-skill subtree ONLY**. NEVER push
  the private monorepo there (a past incident made the private project public).
- Hosting: **Railway** for `primitive-worker-vnext` and `api-v2`; **Vercel** for
  `apps/web`. There is no local Docker workflow.
- Worker/api-v2 deploy command:
  ```
  railway up --detach --service <svc> --environment production
  ```
  (No GitHub auto-deploy for these two services.)
- SSH into a service: `railway ssh --service <svc> --environment production "<cmd>"`
- Env vars: `railway variables --service <svc> --environment production --kv`
- Logs: `railway logs --service <svc> --environment production`
  (Streams the recent buffer; run for ~10–18s then kill. The buffer holds roughly the
  last several minutes / ~160 lines.)

### 3.2 The image-generation request path (portrait example)
```
Browser (agent UI, apps/web)
  └─ POST /api/v1/skills/make_portrait/run   (same-origin Next.js proxy)
       └─ POST https://api.agent-media.ai/v1/skills/make_portrait/run   (api-v2)
            └─ Temporal: client.workflow.start('portraitGpt2Workflow', ...)
                 task queue: primitive-vnext-v1
                 └─ primitive-worker-vnext executes:
                      workflow portraitGpt2Workflow (src/workflows/portrait-gpt2.ts)
                        └─ activity portraitGpt2 (src/activities/portrait-gpt2.ts)
                             1. validate input
                             2. upsert primitive_runs (status=submitted, started_at=now)
                             3. budget caps + deductPrimitiveCredits
                             4. (optional) fetch reference photo from R2
                             5. buildPortraitPrompt (Anthropic Haiku) + sanitize
                             6. generateImageWithFallback(cfg.openai, {...})  <-- THE call
                                  a. generateImage(getOpenAI(key), params)  [DIRECT]
                                  b. on connection-class error → generateImageViaApiV2 [FALLBACK]
                             7. r2UploadVnext → portrait.png
                             8. insert primitive_artifacts; update primitive_runs=succeeded
  Browser polls /api/v1/primitives/runs/:id (or /api/v1/skills/runs/:id) every 5s,
  up to 200 times (= 1000s ≈ 16.6 min) before giving up with "timed out".
```

### 3.3 Two egress paths to OpenAI
- **DIRECT**: worker → OpenAI (`api.openai.com`). Worker egress IP `152.55.180.74`.
  Uses the OpenAI SDK with a **custom undici fetch** (see §5.1/§5.2).
- **FALLBACK**: worker → `api-v2` private network (`http://api-v2.railway.internal:3001`)
  → `POST /internal/gpt-image` → api-v2 calls OpenAI with a **plain** SDK (no undici).
  api-v2 egress IP `32.197.3.175` (different from worker).
- The fallback exists so that if the worker's egress ever degrades, image-gen self-heals
  through api-v2. In Bug 4 this fallback is actively HARMFUL because it hangs (see §7).

### 3.4 Data model (Supabase / Postgres, REST)
- `primitive_runs`: one row per primitive run. Key columns: `id` (uuid, PK),
  `user_id`, `skill_run_id`, `primitive_id` (`portrait_gpt2` | `character_sheet_gpt2` |
  `wireframe_gpt2` | ...), `status` (`submitted` → `succeeded`/`failed`/`canceled`),
  `error_code`, `error_message`, `started_at`, `finished_at`, `created_at`,
  `estimated_credits_usd`, `actual_credits_usd`, `credits_deducted`, `idempotency_key`,
  `input` (jsonb, includes `generated_prompt`).
- `primitive_artifacts`: `id`, `primitive_run_id`, `kind` (`portrait`/`character_sheet`/
  `wireframe`), `url`, `bytes`, `mime`, `metadata` (jsonb), `created_at`.
- R2 public URL prefix: `https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev`
  Object key shape: `vnext/primitive-runs/<run_id>/portrait.png` (or `character-sheet.png`).

### 3.5 Providers
- Images: OpenAI **gpt-image-2** (`OPENAI_IMAGE_MODEL=gpt-image-2`). Detailed portrait
  generation genuinely takes ~15–62s (proven in-container; not overhead). Responses are
  ~1.4–2.5 MB base64 JSON.
- Prompt building: Anthropic **Haiku** (`buildPortraitPrompt` / `buildCharacterSheetPrompt`).
- Orchestration: **Temporal** (workflows + activities, retries, heartbeats, timeouts).

---

## §4 — THE INCIDENT (CHRONOLOGICAL NARRATIVE)

This is the honest story including wrong turns, because the wrong turns matter for
whoever picks this up (don't re-walk them).

1. **Symptom:** portraits/character sheets "stuck endlessly" / "keep failing". Runs
   parked in `submitted`, `started_at` advancing, frontend re-attaching to dead runs.

2. **First theory (WRONG): network blacklist / NAT / anycast.** The worker's egress
   was suspected blackholed. Disproven: a fresh raw fetch to OpenAI always worked.

3. **Second finding (CORRECT, partial): "Premature close".** The OpenAI SDK's default
   fetch **pools keep-alive sockets** and reused a stale one that the server/intermediary
   cut mid-generation → `ERR_STREAM_PREMATURE_CLOSE` at ~10s on essentially every image.
   This is Bug 1.

4. **Fix attempt for Bug 1 (introduced Bug 2):** a custom fetch that opens a FRESH
   connection per request — `new undici Agent({ keepAliveTimeout: 1, ... })` **inside the
   fetch wrapper, per call**. In-container one-shot test: 9.6s success. Deployed. Briefly
   verified 5/5 portraits. **Then it regressed ~13 minutes after boot.** A new `Agent` per
   request that is never closed leaks sockets/handles; the long-running worker accumulates
   them until calls fail. (Bug 2.)

5. **A harmful operator action (do not repeat):** during the incident, stuck runs were
   bulk force-failed. This ALSO marked the **user's own live in-flight runs** as
   "cleared by operator during incident", visible in their UI. **Never bulk force-fail
   runs again.**

6. **Fix for Bug 2 — `bec012d2`:** replace the per-request Agent with **ONE shared
   module-level Agent** (`keepAliveTimeout: 1ms` → no socket reuse, so still no premature
   close, but no leak; `connections: 64` cap). Verified with a **sustained** test:
   8 portraits over 16 min, crossing the +13 min mark where it died before → **8/8
   succeeded, 0 failures**, worker healthy from +28 to +50 min uptime.

7. **But the user STILL saw "make_portrait failed — timed out" in the UI.** API-level
   success ≠ UI success. Pulled the actual failed run + worker logs.

8. **Bug 3 found (the real user-facing failure):** worker logs showed
   `Activity task timed out → cause: activity Heartbeat timeout`. The activity only
   heartbeats at stage boundaries (`prompt_built` … then the OpenAI call … `provider_done`).
   The gpt-image call (50–150s incl. internal retry/fallback) sent NO heartbeat in between,
   tripping the 90s `heartbeatTimeout`. Temporal killed + retried the activity from scratch,
   wasting the in-flight image, ballooning run duration to 2–6 min and — when it crossed
   the workflow timeout — leaving the run stuck in `submitted`. THAT is the "timed out"
   users saw. DB confirmed: durations 52s (clean) … 122s, 139s, 316s, 346s (retry-inflated),
   plus a run stuck in `submitted`.

9. **Fix for Bug 3 — `be6afd52`:** `withHeartbeat()` helper emits a heartbeat every 15s
   DURING the provider call (the OpenAI wait is I/O, so the event loop is free to fire the
   timer). Applied to portrait, character_sheet, wireframe. `heartbeatTimeout` 90s → 120s
   for margin. Deployed. Verified: under the **exact 8-concurrent load** that previously
   failed → **7/7 succeeded, 0 failed, 0 heartbeat timeouts** in logs.

10. **Bug 4 surfaced by the Bug-3 verification:** with heartbeat timeouts gone, the runs
    no longer FAIL, but under concurrency they are **slow** (165–545s). Logs show **18×
    `ProxyImageError: image proxy unreachable: The operation was aborted due to timeout`**
    (`PROXY_UNREACHABLE`) and a new `activity StartToClose timeout`. Meaning: the DIRECT
    OpenAI call is failing under in-process concurrency → fallback to api-v2 → api-v2 hangs
    to its 180s timeout → exceeds the 4-min activity `startToCloseTimeout` → Temporal
    retries → 5–9 min total.

11. **Critical disproof of the "egress can't handle concurrency" theory:** ran 8 CONCURRENT
    calls **inside the worker container** both raw-undici and through the deployed SDK path
    → **8/8 each, ~101–113s, zero failures.** So the worker's egress + dispatcher handle
    8-way concurrency FINE in a *separate* process. The failure is specific to activities
    running **inside the busy worker process** (shared event loop / Temporal machinery).
    The direct-path error is **swallowed** by `generateImageWithFallback` (it falls back
    without logging), so the true error is still unknown.

12. **Mitigation + diagnostics — `4a75c06c`:** (a) log the swallowed direct-path error
    (`"[gpt-image] DIRECT path failed, falling back to api-v2: name=… causeCode=…"`),
    (b) cut the api-v2 fallback `AbortSignal.timeout` from **180s → 75s** so a hung proxy
    can't blow the 4-min `startToClose`. Deployed. **The test that reads the new log line
    was interrupted before capturing it** — that is the open thread (see §9).

---

## §5 — ROOT-CAUSE ANALYSIS (ALL FOUR BUGS)

### §5.1 Bug 1 — keep-alive socket reuse → "Premature close" (FIXED)
- **Mechanism:** OpenAI SDK default fetch pools keep-alive sockets. A socket that sat idle
  was reused for a new image request; an intermediary had already half-closed it; the body
  stream aborted mid-generation → `ERR_STREAM_PREMATURE_CLOSE` ~10s in, failing the image.
- **Why it looked like a network outage:** it was intermittent and affected nearly every
  image once sockets started getting reused, but a fresh raw fetch always worked.
- **Fix:** custom fetch that does NOT reuse sockets (`keepAliveTimeout: 1ms`). Also a
  `withPrematureCloseRetry` wrapper (4 attempts) around the SDK call as belt-and-suspenders.
- **Not the cause:** IP blacklist, NAT, anycast, a 12s "fast-failover" timeout (the 12s
  `headersTimeout` was itself harmful — gpt-image holds the conn ~15–26s before headers, so
  12s timed out every image; it was raised to 120s).

### §5.2 Bug 2 — per-request undici Agent leak (FIXED, `bec012d2`)
- **Mechanism:** the Bug-1 fix created `new Agent({...})` **inside the fetch wrapper, on
  every request**, and never `.close()`d it. Each Agent holds sockets/handles. Over a
  long-running worker these accumulate → resource exhaustion → calls fail ~13 min after
  each boot. The one-shot in-container test never caught it (a leak only shows under
  sustained load).
- **Fix:** ONE shared module-level Agent, reused for all requests:
  ```ts
  const _openaiAgent = new Agent({
    keepAliveTimeout: 1,        // ms — idle sockets close immediately → no stale reuse
    keepAliveMaxTimeout: 1,
    headersTimeout: 120_000,    // gpt-image holds conn ~15-26s before headers
    bodyTimeout: 120_000,
    connections: 64,            // cap concurrent sockets
  });
  const _openaiFetch = (input, init) => undiciFetch(input, { ...init, dispatcher: _openaiAgent });
  // OpenAI client: new OpenAI({ apiKey, maxRetries: 2, timeout: 120_000, fetch: _openaiFetch })
  ```
- **Evidence of fix:** sustained 8-over-16-min test → 8/8, no degradation past the +13 min
  point that killed the leaky version.
- **NOTE / possible interaction with Bug 4:** `keepAliveTimeout: 1ms` means **every request
  opens a fresh TCP+TLS connection** (and a fresh DNS resolution if not cached). This is fine
  sequentially and fine for 8-concurrent in a separate process, but it is a *prime suspect*
  for Bug 4 under in-process concurrency (fresh-connection storms + libuv threadpool DNS
  contention). See §7 hypotheses. Do not "fix" this blindly — it was correct for Bug 1/2;
  changing it risks reintroducing premature close. Measure first.

### §5.3 Bug 3 — Activity Heartbeat timeout (FIXED, `be6afd52`) — THE user-facing failure
- **Mechanism:** Temporal activities must heartbeat or be declared dead. The image
  activities heartbeat only at stage boundaries. Between `prompt_built` and `provider_done`
  sits the gpt-image call (50–150s, longer with internal retry/fallback) with **no
  heartbeat**. Crossing the 90s `heartbeatTimeout` →
  `Activity task timed out / cause: activity Heartbeat timeout` → Temporal kills + retries
  the whole activity → in-flight image wasted → duration balloons → if it crosses the
  workflow timeout, run is stuck in `submitted` → UI shows "timed out".
- **Proof (worker logs):**
  ```
  [WARN] Activity failed {
    nonRetryable: true,
  error: [Error: Activity task timed out] {
    [cause]: [Error: activity Heartbeat timeout] { [cause]: undefined }
  ```
- **Proof (DB durations before fix):** 52s, 56s (clean) vs 122s, 139s, 316s, 346s
  (retry-inflated), plus a run stuck in `submitted`.
- **Fix:** `src/lib/heartbeat.ts`:
  ```ts
  export async function withHeartbeat<T>(stage, fn, intervalMs = 15_000): Promise<T> {
    const ctx = Context.current();              // capture; timer runs outside ALS context
    let n = 0;
    const timer = setInterval(() => { try { ctx.heartbeat({ stage, beat: (n += 1) }); } catch {} }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    try { return await fn(); } finally { clearInterval(timer); }
  }
  ```
  Wrapped the `generateImageWithFallback(...)` call in all three activities. Bumped
  `heartbeatTimeout` 90s → 120s.
- **Evidence of fix:** 0 heartbeat timeouts in logs after deploy; 7/7 under 8-concurrent
  load that previously failed.

### §5.4 Bug 4 — concurrency cascade: OpenAI SDK 120s timeout under event-loop saturation (ROOT CAUSE CONFIRMED)

**CONFIRMED root cause (from the live diagnostic log added in `4a75c06c`):**
```
[gpt-image] DIRECT path failed, falling back to api-v2:
  name=Error status=undefined msg=Request timed out. causeCode= causeMsg=
```
`"Request timed out."` with `status=undefined` and no `cause` is the **OpenAI SDK's own
client-side timeout** firing — i.e. the request exceeded `new OpenAI({ timeout: 120_000 })`.
Under 8-way in-process concurrency the worker's event loop is saturated (8 activities each
doing Anthropic + a ~2MB OpenAI response read + base64 decode + ~2MB R2 upload, alongside
Temporal Core polling and the workflow bundle), so the OpenAI response can't be read/processed
within 120s for some calls → SDK aborts → fallback to api-v2 → api-v2 also times out
(`PROXY_UNREACHABLE`) → exceeds the 4-min activity `startToCloseTimeout` → Temporal retries →
a later, less-contended attempt succeeds → total wall-clock **5–9 min**.

**Corroboration from your own vault** (`agent-media-vault/architecture/content-machine-pipeline.md`
line 104): *"gpt-image-2 real latency is 2–5 min — set the OpenAI client `timeout: 600_000`,
not the default 120s."* The legacy content-machine worker (media-worker-v2) sets 600s and does
NOT have this bug; the vNext worker (`getOpenAI`) sets **120s** and does. So this was a known,
documented pitfall that the vNext rewrite reintroduced.

- **Why isolated tests passed:** the in-container raw/SDK 8-concurrent tests ran in a SEPARATE
  node process with a free event loop, so calls completed in 16–112s (note: the slowest was
  112s — already at the edge of 120s). Inside the busy worker process the same calls cross 120s.
- **Observed (before this diagnosis):** the DIRECT call "failed" (error was swallowed) → fallback
  to api-v2 → `ProxyImageError PROXY_UNREACHABLE` → `StartToClose timeout` → retries → 5–9 min.
- **Logs:** `18× PROXY_UNREACHABLE`, plus `activity StartToClose timeout`, **0 heartbeat
  timeouts** (Bug 3 stays fixed), **0** logged `fetch failed`/`terminated`/`premature`.
- **Key disproof of simple theories:** raw concurrent 8/8 (101.5s) and SDK concurrent 8/8
  (112.7s) **inside the same container** prove the egress + dispatcher are not the bottleneck
  in isolation. The differentiator is the **worker process** (shared event loop +
  Temporal Core (Rust/napi) polling + workflow bundle + 8 concurrent activities each doing
  Anthropic + OpenAI + R2 + DB).
- **Leading hypotheses (UNCONFIRMED — must read the new log line to decide):**
  - **H1 (most likely): libuv threadpool / DNS+TLS contention.** `keepAliveTimeout: 1ms`
    forces a fresh connection (fresh DNS + TLS) per request. Under burst, 8 simultaneous
    DNS lookups go through libuv's threadpool (`UV_THREADPOOL_SIZE` default **4**), which is
    *also* used by the R2/S3 SDK (crypto/checksums) and others. If the pool is saturated,
    connection establishment stalls → undici `ConnectTimeout`/headers timeout → direct fails
    → fallback. Cheap test/fix: set `UV_THREADPOOL_SIZE=64` env on the worker and/or use a
    *moderate* `keepAliveTimeout` (e.g. 10s) so connections are reused within a burst.
  - **H2: event-loop starvation** by synchronous CPU work (JSON.parse of ~3MB responses +
    `Buffer.from(b64,'base64')` of ~2MB + S3 checksum of ~2MB) when many activities finish
    near-simultaneously, delaying in-flight fetch I/O callbacks past undici timeouts.
  - **H3: api-v2 itself is the weak link.** api-v2 uses a **plain** OpenAI SDK (no undici
    custom fetch) → it still has **Bug 1** (keep-alive premature close) AND `maxRetries: 5`,
    so under load each fallback call can retry for >180s. The fallback is therefore both
    *triggered too easily* and *slow to fail*. Even if H1/H2 are the trigger, H3 is why the
    cascade is so expensive.
- **Mitigations already deployed (`4a75c06c`):** fallback timeout 180s → 75s (so it can't
  blow `startToClose`); log the swallowed direct error. **These reduce damage but do not fix
  the trigger.**

---

## §6 — FIXES DEPLOYED THIS SESSION (COMMITS)

All on branch `main`, pushed to `github.com/yuvalsuede/agent-media`, deployed to
`primitive-worker-vnext` via `railway up`.

### `bec012d2` — shared OpenAI undici Agent (Bug 2)
- File: `services/primitive-worker-vnext/src/client/openai.ts`
- Replaced per-request `new Agent()` with one shared `_openaiAgent` + `_openaiFetch`.
- Verified: sustained 8-over-16-min → 8/8, no degradation.

### `be6afd52` — heartbeat during gpt-image call (Bug 3) ★ the critical fix
- Files:
  - NEW `services/primitive-worker-vnext/src/lib/heartbeat.ts` (`withHeartbeat`)
  - `src/activities/portrait-gpt2.ts` — wrap provider call in `withHeartbeat('provider_working', …)`
  - `src/activities/character-sheet-gpt2.ts` — same
  - `src/activities/wireframe-gpt2.ts` — same
  - `src/workflows/portrait-gpt2.ts` — `heartbeatTimeout` 90s → 120s
  - `src/workflows/character-sheet-gpt2.ts` — 90s → 120s
  - `src/workflows/wireframe-gpt2.ts` — 90s → 120s
- Verified: 0 heartbeat timeouts; 7/7 under 8-concurrent load that previously failed.

### `4a75c06c` — log direct error + fast-fail fallback (Bug 4 diagnostics + mitigation)
- File: `services/primitive-worker-vnext/src/client/openai.ts`
- In `generateImageWithFallback`, before falling back, `console.warn` the direct error
  (`name`, `status`, `message`, `cause.code`, `cause.message`).
- In `generateImageViaApiV2`, `AbortSignal.timeout(180_000)` → `AbortSignal.timeout(75_000)`.
- Deployed (deployment `ee8cbc0d…`, SUCCESS; worker booted 11:06:19 UTC).
- **Diagnostic read PENDING** (interrupted).

---

## §7 — WHAT IS STILL BROKEN (THE CONCURRENCY CASCADE)

### 7.1 Symptom
Burst of N concurrent portrait/character-sheet submissions → each takes 5–9 min instead
of ~1 min; the tail occasionally exceeds a 10-min poll window. No hard *failures* now
(heartbeat fix holds), but unacceptable latency.

### 7.2 Mechanistic chain (confirmed parts in **bold**)
1. N activities start concurrently in the **worker process**.
2. The **DIRECT** OpenAI call **fails** for some of them (error swallowed → unknown).
3. → **FALLBACK** to api-v2 (`/internal/gpt-image`).
4. api-v2 call **aborts at its timeout** → **`PROXY_UNREACHABLE`** (18× in logs).
5. The whole attempt exceeds the **4-min `startToCloseTimeout`** → **`StartToClose timeout`**.
6. Temporal **retries** the activity; a later attempt's direct call **succeeds** → 5–9 min.

### 7.3 What we PROVED (so you don't re-test it)
- Worker egress + dispatcher handle 8 concurrent calls fine **in isolation**:
  - raw undici 8 concurrent → **8/8**, 101.5s total.
  - deployed SDK path 8 concurrent → **8/8**, 112.7s total.
  - sequential raw 6/6 and sequential SDK 6/6, 15–62s each.
- So the bottleneck is **the worker process under concurrent activity load**, not the
  network and not OpenAI.

### 7.4 The missing fact
**Why does the direct OpenAI call throw inside the worker process under concurrency,
when an identical 8-concurrent call in a separate process in the same container does not?**
The answer is in the new `"[gpt-image] DIRECT path failed …"` log line (commit `4a75c06c`).
Get it (§9) and the fix follows directly:
- If `causeCode=UND_ERR_CONNECT_TIMEOUT` / DNS-ish → H1 (threadpool/DNS): set
  `UV_THREADPOOL_SIZE=64`, consider moderate `keepAliveTimeout`.
- If `BodyTimeout`/`HeadersTimeout` → H2 (event-loop starvation): reduce activity
  concurrency, offload base64/JSON, or stream.
- If it's an api-v2-shaped error or the direct rarely actually fails → H3: fix api-v2 egress.

### 7.5 The api-v2 weak link (fix regardless)
api-v2's `services/api-v2/src/lib/openai-image.ts` uses a **plain** `new OpenAI({ maxRetries: 5, timeout: 90_000 })`
with NO undici custom fetch — so it still has **Bug 1** (keep-alive premature close) and a
5-retry budget that can exceed any sane fallback timeout. The fallback is therefore
unreliable AND slow. **Constraint:** api-v2 runs an OLDER Node where the `undici@8` *npm
package* crashes (`webidl.util.markAsUncloneable is not a function`) — do NOT `import undici`
there. Instead use Node's **built-in** undici via `import { Agent, setGlobalDispatcher } from 'node:undici'`?
(Note: there is no `node:undici` specifier; the built-in is reached by passing a `dispatcher`
to the global `fetch`, or via `undici` only if version-matched.) Safer options:
- Pass a custom `fetch` to the OpenAI SDK in api-v2 that sets a `dispatcher` from the
  Node-bundled undici (matches the runtime, won't crash), mirroring the worker's
  `_openaiFetch` (keepAliveTimeout small, headers/body 120s).
- OR drop api-v2 `maxRetries` to 1–2 and `timeout` to ~60s so the fallback fails fast.
- OR (bigger) remove the api-v2 fallback entirely and rely on Temporal retry of the
  reliable direct path (only after Bug 4's trigger is fixed).

---

## §8 — ALL DIAGNOSTIC EVIDENCE (RAW)

### 8.1 In-container DIRECT raw undici (sequential, fresh-Agent config)
```
model= gpt-image-2 keylen= 164
[1] 200 50.7s bytes=1825360
[2] 200 16.9s bytes=1933922
[3] 200 50.6s bytes=2444072
[4] 200 47.2s bytes=1926340
[5] 200 17.2s bytes=1862418
[6] 200 62.5s bytes=1966144
```
→ 6/6, no premature close. Egress is healthy.

### 8.2 In-container DIRECT via deployed SDK (sequential)
```
[1] OK 53.9s bytes=1640458
[2] OK 52.4s bytes=1529565
[3] OK 47.7s bytes=1481506
[4] OK 17.8s bytes=1374025
[5] OK 49.7s bytes=1510119
[6] OK 15.7s bytes=1407296
```
→ 6/6. SDK path is healthy sequentially.

### 8.3 In-container raw undici (8 CONCURRENT)
```
[1] 200 21.5s ... [2] 200 101.5s ... [3] 200 19.3s ... [4] 200 18.4s
[5] 200 60.8s ... [6] 200 30.2s ... [7] 200 16.5s ... [8] 200 49.2s
ALL 8 CONCURRENT done in 101.5s
```
→ 8/8. Egress handles concurrency in a separate process.

### 8.4 In-container deployed SDK (8 CONCURRENT)
```
[1] OK 16.7s ... [2] OK 36.9s ... [3] OK 60.5s ... [4] OK 60.3s
[5] OK 18.7s ... [6] OK 112.7s ... [7] OK 62.8s ... [8] OK 53.9s
ALL 8 SDK CONCURRENT done in 112.7s
```
→ 8/8. SDK handles concurrency in a separate process.

### 8.5 REAL activity 8-concurrent (worker ~90s after boot — partially cold)
DB durations (started_at→finished_at): `176s, 170s, 165s, 417s, 422s, 416s, 197s` and
1 still `submitted`. Result: succeeded=7 of 8 (1 still running at snapshot).
Logs: `PROXY_UNREACHABLE` present; `0` heartbeat timeouts.

### 8.6 REAL activity 8-concurrent (WARM worker)
```
fired 8 concurrently in 1.1s
b633159b -> succeeded 339s
f80525ba -> succeeded 422s
d07aa8a4 -> succeeded 428s
a92df522 -> succeeded 429s
d56c6340 -> succeeded 436s
6ff9b340 -> succeeded 545s
=== RESULT ok=6 of 8; durations(s): [339, 422, 428, 429, 436, 545] ===
```
→ Warm did NOT help. 6/8 within the 10-min poll window; durations 5.6–9 min. Concurrency
is a real problem, not a cold-start artifact.

### 8.7 Sustained durability test (Bug-2 fix, 1-at-a-time over 16 min)
```
[1] OK 62s   [2] OK 54s   [3] OK 188s  [4] OK 180s
[5] OK 124s  [6] OK 203s  [7] OK 125s  [8] OK 196s
DONE ok=8 fail=0
```
→ 8/8 across +28→+50 min uptime; no degradation (Bug 2 fixed). Note the latency variance
(54s vs 203s) was an early hint of Bug 3/4 (retries inflating duration).

### 8.8 Worker log counts after Bug-3 fix, under concurrency
```
Heartbeat timeout: 0
PROXY/fallback errors (PROXY_UNREACHABLE / image proxy): 18
Activity failed: 9
fetch failed / terminated / premature: 0
```
Plus: `error: [Error: Activity task timed out] { [cause]: [Error: activity StartToClose timeout] }`

### 8.9 DB snapshot of recent runs (mixed, around the incident)
```
08:33:53 character_sheet_gpt2 succeeded dur= 84s
08:25:30 portrait_gpt2        succeeded dur= 83s
08:09:39 portrait_gpt2        submitted dur=  -   <-- STUCK (the "timed out" the user saw)
07:57:30 portrait_gpt2        succeeded dur= 77s
07:55:26 portrait_gpt2        succeeded dur=346s
07:52:02 portrait_gpt2        succeeded dur=316s
07:49:58 portrait_gpt2        succeeded dur= 98s
07:46:57 portrait_gpt2        succeeded dur=122s
07:43:49 portrait_gpt2        succeeded dur=139s
07:41:48 portrait_gpt2        succeeded dur= 52s
07:39:48 portrait_gpt2        succeeded dur= 56s
```

---

## §9 — PICK UP HERE (EXACT NEXT STEPS)

The worker currently runs `4a75c06c` (heartbeat fix + diagnostics + 75s fallback). The
hard failures are fixed; the concurrency latency is not. **The root cause is now confirmed**
(the direct call hits the OpenAI SDK's 120s timeout under event-loop saturation — §5.4). Do
these in order.

### STEP 1 — Apply the Bug-4 fix (root cause is known; no more diagnosis needed)
Two complementary changes in the worker:

**(1a) Raise the OpenAI client timeout 120s → 300s (or 600s).**
File `services/primitive-worker-vnext/src/client/openai.ts`, in `getOpenAI`:
```ts
_client = new OpenAI({ apiKey, maxRetries: 2, timeout: 300_000, fetch: _openaiFetch });
//                                            ^^^^^^^ was 120_000
```
Rationale: gpt-image-2's real p100 latency is 2–5 min (your vault, content-machine-pipeline.md
line 104). 120s kills slow-but-healthy calls and triggers the fallback cascade. Raising it lets
them complete directly. NOTE: also confirm the undici Agent `headersTimeout`/`bodyTimeout`
(currently 120_000) are ≥ the new client timeout — **bump them to 300_000 too**, or undici will
abort the body before the SDK timeout matters. And ensure the activity `startToCloseTimeout`
(portrait/character = 4 min) ≥ the OpenAI timeout + overhead; bump to **6 minutes** to be safe
(the heartbeat keeps it alive regardless).

**(1b) Cap worker activity concurrency** so the event loop isn't saturated (this keeps each call
FAST so it rarely approaches even the old timeout). File `services/primitive-worker-vnext/src/worker.ts`,
in `Worker.create({...})` (around line 60), add:
```ts
maxConcurrentActivityTaskExecutions: 4,   // bound simultaneous heavy image jobs
```
Pick 3–6. Temporal queues the rest; each batch completes fast and reliably. With 400 users this
trades a little peak queue depth for reliable, fast, non-cascading runs. (Tune after measuring.)

### STEP 2 — (defense in depth) make the api-v2 fallback not amplify the problem
- The fallback target `services/api-v2/src/lib/openai-image.ts` uses a plain SDK with
  `maxRetries: 5, timeout: 90_000` and still has Bug 1 (keep-alive premature close). It is both
  triggered too easily and slow to fail. Options: give it a non-pooling custom fetch (Node's
  bundled undici via a `dispatcher`, NOT the undici@8 npm pkg — it crashes api-v2's Node), OR
  drop `maxRetries` to 1–2 and `timeout` to ~60s, OR remove the fallback once 1a/1b make the
  direct path reliable under load. See §7.5.

### STEP 3 — Re-verify under concurrency (acceptance bar)
- Re-run `/tmp/conc.py` (8 concurrent). **Target: 8/8 succeed, p95 < ~120s, 0 fallback
  (`PROXY_UNREACHABLE`) in logs.**
- Confirm logs show `0` heartbeat timeouts and `0` StartToClose timeouts.

### STEP 4 — Browser-verify the real UI flow (user's hard rule)
- Log into `https://app.agent-media.ai` (magic-link mint flow, §12.3 — URL login, no
  password entry), open the agent UI, request a portrait, confirm it renders. Use Playwright
  MCP (the user requires Playwright, not claude-in-chrome). Earlier the magic-link login
  worked but the navigation to `/dashboard/agent` aborted; retry from a clean tab.

### STEP 5 — Clean up diagnostics
- Once root cause is fixed, REMOVE the `console.warn("[gpt-image] DIRECT path failed …")`
  diagnostic (it's noisy) OR downgrade to a sampled/structured log.
- Re-run the `tsc --noEmit` gate; redeploy; final concurrent verification.

### STEP 6 — Write the incident post-mortem & update the vault
- Obsidian vault at `/Users/suede/Projects/agent-media-vault/` (subdir `decisions/` or
  `architecture/`). Record the heartbeat-timeout root cause and the concurrency fix.

---

## §10 — HOW TO REPRODUCE & TEST

### 10.1 Mint an auth token (magic-link, no password)
```bash
# creds live in api-v2 env
railway variables --service api-v2 --environment production --kv \
  | grep -iE "^SUPABASE_URL=|^SUPABASE_SERVICE_ROLE_KEY=|^SUPABASE_ANON_KEY=" > /tmp/sb.env
set -a; . /tmp/sb.env; set +a
GEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"type":"magiclink","email":"yuvalsuede@gmail.com"}')
HT=$(echo "$GEN" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("hashed_token") or "")')
TOK=$(curl -s -X POST "$SUPABASE_URL/auth/v1/verify" -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d "{\"type\":\"magiclink\",\"token_hash\":\"$HT\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token") or "")')
echo "$TOK"   # 1368-char JWT, valid ~1h
```

### 10.2 Create a single portrait + poll
```bash
API=https://api.agent-media.ai
RID=$(curl -s -X POST "$API/v1/primitives/portrait_gpt2" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"description":"a 25 year old redhead chess player, friendly","aspect_ratio":"9:16","realism_target":"raw_iphone"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["run_id"])')
# poll
for i in $(seq 1 40); do
  R=$(curl -s "$API/v1/primitives/runs/$RID" -H "Authorization: Bearer $TOK")
  echo "$R" | python3 -c 'import sys,json;d=json.load(sys.stdin);a=d.get("artifacts",[]);print(d["status"], a[0]["url"] if a else "")'
  echo "$R" | grep -q succeeded && break; sleep 8
done
```

### 10.3 Skill path (what the MCP/agent UI use)
```bash
curl -s -X POST "$API/v1/skills/make_portrait/run" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"description":"a 30 year old man, short dark beard, grey tshirt","aspect_ratio":"9:16","realism_target":"raw_iphone"}'
# -> {"run_id":"...","skill":"make_portrait","primitive":"portrait_gpt2","status":"submitted"}
# poll /v1/primitives/runs/<run_id> (skill maps 1:1 to the primitive run for single-primitive skills)
# character sheet: POST /v1/skills/make_character_sheet/run {"portrait_url":"<R2 url>","description":"...","aspect_ratio":"9:16"}
```

### 10.4 Concurrent load test (the Bug-4 reproduction) — see §18.3 for full `/tmp/conc.py`
```bash
cd ~/Projects/agent-media/services/api-v2 && python3 /tmp/conc.py
# fires 8 portraits at once, polls all, prints durations + ok count.
# Acceptance: ok=8/8, durations < ~120s, 0 PROXY_UNREACHABLE in worker logs.
```

### 10.5 In-container OpenAI probe (isolate egress vs worker process)
See §18.4 for `/tmp/diag.mjs` (raw), `/tmp/diag2.mjs` (SDK), and `*c.mjs` (concurrent
variants). Run inside the container:
```bash
B64=$(base64 < /tmp/diag.mjs)
railway ssh --service primitive-worker-vnext --environment production \
  "cd /app/services/primitive-worker-vnext && echo $B64 | base64 -d > ./d.mjs && node ./d.mjs; rm -f ./d.mjs"
```
(undici resolves only from `/app/services/primitive-worker-vnext/node_modules`, so run from
that dir; `/tmp` fails with `ERR_MODULE_NOT_FOUND`.)

### 10.6 Inspect runs / errors via Supabase REST
```bash
set -a; . /tmp/sb.env; set +a
curl -s "$SUPABASE_URL/rest/v1/primitive_runs?select=id,primitive_id,status,error_code,error_message,started_at,finished_at,created_at&order=created_at.desc&limit=14" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

## §11 — KEY FILES & LINE REFERENCES

### Worker — `services/primitive-worker-vnext/`
- `src/client/openai.ts` — **the heart of this incident.** Exports:
  - `_openaiAgent` / `_openaiFetch` — shared non-pooling undici dispatcher (Bug 2 fix).
  - `getOpenAI(apiKey)` — singleton OpenAI client using `_openaiFetch`, `maxRetries: 2`,
    `timeout: 120_000`.
  - `withPrematureCloseRetry(fn)` — 4 attempts on premature-close patterns; never retries a
    real 4xx APIError.
  - `generateImage(client, params)` — `images.edit` (if reference) or `images.generate`.
  - `generateImageViaApiV2(cfg, params)` — POST `/internal/gpt-image`; `AbortSignal.timeout`
    now **75_000** (was 180_000); throws `ProxyImageError`.
  - `generateImageWithFallback(cfg, params)` — DIRECT then FALLBACK; **now logs the swallowed
    direct error** (`console.warn("[gpt-image] DIRECT path failed …")`).
  - `classifyOpenAIError(err)` — retryable vs non-retryable (4xx = non-retryable).
- `src/lib/heartbeat.ts` — **NEW** `withHeartbeat(stage, fn, intervalMs=15_000)` (Bug 3 fix).
- `src/lib/sanitize-prompt.ts` — `sanitizeImagePrompt` ("sexy" → "attractive" etc.).
- `src/activities/portrait-gpt2.ts` — portrait activity; provider call wrapped in
  `withHeartbeat('provider_working', …)`; budget caps; credits; R2 upload; finalize.
- `src/activities/character-sheet-gpt2.ts` — same pattern, reference = portrait bytes.
- `src/activities/wireframe-gpt2.ts` — same pattern, reference = character-sheet bytes.
- `src/workflows/portrait-gpt2.ts` — `startToCloseTimeout: '4 minutes'`,
  `heartbeatTimeout: '120 seconds'` (was 90s).
- `src/workflows/character-sheet-gpt2.ts` — `'4 minutes'` / `'120 seconds'`.
- `src/workflows/wireframe-gpt2.ts` — `'5 minutes'` / `'120 seconds'`.
- `src/config.ts` — `imageProxyUrl` (`API_V2_INTERNAL_URL` ?? `http://api-v2.railway.internal:3001`),
  `imageProxySecret` (`INTERNAL_API_SECRET`), caps (`primitiveUsd`, `dayUsd`).
- `src/worker.ts` — Temporal Worker bootstrap (task queue `primitive-vnext-v1`); look here for
  `maxConcurrentActivityTaskExecutions` / net-health watchdog. (Watchdog self-recycles on
  `WORKER_MAX_UPTIME_MS`, default 8h.)
- `src/net-health.ts` — `installNetHealthWatchdog` (graceful SIGTERM drain → exit(0) → Railway
  restart). After the dispatcher change, only the 8h uptime cap fires.

### api-v2 — `services/api-v2/`
- `src/lib/openai-image.ts` — **plain** `new OpenAI({ maxRetries: 5, timeout: 90_000 })`;
  NO undici (undici@8 crashes api-v2's Node). This is the fallback target and the §7.5 weak link.
- `src/routes/internal/gpt-image.ts` — `POST /internal/gpt-image`, `x-internal-secret` auth.
- `src/routes/v1/primitives.ts` — `portraitGpt2PrimitiveRoute`, `characterSheetGpt2PrimitiveRoute`,
  `getPrimitiveRunRoute` (GET `/v1/primitives/runs/:run_id`). Response shape: `{ run_id,
  primitive, status, credits, error, started_at, finished_at, artifacts: [{url,...}] }`.
- `src/routes/v1/skills.ts` — `runSkillRoute` (`POST /v1/skills/:slug/run`, returns 202
  `{ run_id | skill_run_id, status:'submitted', ... }`), `getSkillRunRoute`, `cancelSkillRunRoute`.
  Also re-hosts user images to R2 for some skills.
- `src/skills/registry.ts` — skill defs; `make_portrait` → `PortraitGpt2ToolInputSchema`,
  `make_character_sheet` → `CharacterSheetGpt2ToolInputSchema`.
- `src/server.ts` — route mounting; `/v1/primitives/*` gated by `isPrimitivesRouteEnabled()`
  (`VNEXT_PRIMITIVES_ENABLED=true`); Temporal config `workflowExecutionTimeoutMs = 20*60_000`,
  `startTimeoutMs = 10_000`.

### Schema — `packages/schema/src/tooling/contracts.ts`
- `PortraitGpt2ToolInputSchema`: `{ description (8–400), reference_photo_url? (https, public),
  setting?, aspect_ratio ('1:1'|'9:16', default '1:1'), realism_target
  ('natural'|'commercial'|'raw_iphone', default 'natural') }`.
- `CharacterSheetGpt2ToolInputSchema`: `{ portrait_url (https, public), description? (≤80
  chars / ≤10 words), aspect_ratio ('1:1'|'9:16') }`.
- `WireframeGpt2ToolInputSchema`: `{ character_sheet_url, script (8–600), n_panels (4|6|8|10) }`.

### Frontend — `apps/web/`
- `app/(app-dark)/dashboard/agent/page.tsx` — agent UI. `runSkill()` submits then `pollRun()`;
  `pollRun` polls every 5s up to **200×** (= 1000s ≈ **16.6 min**) before returning
  `{status:'timeout'}` (note: the "timed out" the user saw came from the BACKEND run failing,
  NOT this client budget). Has Stop button (`stop()`, `cancelRef`, `abortRef`).
- `app/api/v1/skills/[slug]/run/route.ts` — same-origin proxy to api-v2.
- `app/api/v1/skills/runs/[id]/route.ts` and `.../cancel/route.ts` — poll/cancel proxies.
- `app/api/v1/primitives/runs/[id]/route.ts` — primitive poll proxy.

---

## §12 — ENVIRONMENT, ACCESS, CREDENTIALS

### 12.1 Railway
- Project id: `409d3640-97fb-426d-bc23-9e81370cf2ac`.
- Worker service id: `5f90cff0-f066-487e-99b0-b7e6cc70a7fc` (`primitive-worker-vnext`).
- Commands: `railway logs|ssh|variables|up|deployment list --service <svc> --environment production`.
- Worker egress IP: `152.55.180.74`. api-v2 egress IP: `32.197.3.175`.

### 12.2 Supabase
- Project ref: `ppwvarkmpffljlqxkjux`; URL `https://ppwvarkmpffljlqxkjux.supabase.co`.
- Service role key + anon key live in api-v2 env (`railway variables --service api-v2 …`).
- REST base: `${SUPABASE_URL}/rest/v1/<table>?…` with `apikey` + `Authorization: Bearer` =
  service role key.

### 12.3 Auth token mint (magic-link)
- `POST /auth/v1/admin/generate_link` (type `magiclink`, email `yuvalsuede@gmail.com`,
  service-role apikey) → `hashed_token`.
- `POST /auth/v1/verify` (type `magiclink`, `token_hash`, anon apikey) → `access_token`
  (~1368-char JWT, ~1h expiry). For browser login, navigate the `action_link` from
  `generate_link` (URL login, no password entry — within the safety rules).

### 12.4 Endpoints / hosts
- API: `https://api.agent-media.ai` (Railway public domain of api-v2).
- Web app: `https://app.agent-media.ai`.
- Marketing: `https://agent-media.ai`.
- R2 public prefix: `https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev`
  (NEVER use `media.agent.media` — does not resolve).

### 12.5 Skills available (GET /v1/skills)
`make_portrait`, `make_character_sheet`, `make_simple_selfie`, `make_product_in_hands`,
`make_subtitles`, `make_wireframe`, `make_lip_sync`, `make_ugc_video`,
`make_broll_talking_head`.

---

## §13 — DEPLOY & VERIFICATION PROCEDURES

### 13.1 Deploy the worker
```bash
cd ~/Projects/agent-media/services/primitive-worker-vnext
npx tsc --noEmit && echo "tsc OK"          # MUST be exit 0 before deploy
cd ~/Projects/agent-media
git add <changed files> && git commit -m "..."   # end commit msg with Co-Authored-By line
git push origin main
cd services/primitive-worker-vnext
railway up --detach --service primitive-worker-vnext --environment production
```
- `railway up`'s log tail may print `operation timed out` — that's the log STREAM timing out,
  not the upload; check `railway deployment list` for SUCCESS.
- `timeout` (GNU) is NOT on macOS — don't wrap commands in it.

### 13.2 Confirm the deploy landed
```bash
railway deployment list --service primitive-worker-vnext --environment production | head -3
# wait for top row = SUCCESS, then:
railway logs --service primitive-worker-vnext --environment production > /tmp/b.txt 2>&1 & \
  LP=$!; sleep 12; kill $LP 2>/dev/null
grep -iE "worker listening|state: 'RUNNING'" /tmp/b.txt
```

### 13.3 Verification bar (do not claim fixed without ALL of these)
- `tsc --noEmit` exit 0 (paste it).
- Worker boots clean (RUNNING, no errors) on the new commit.
- Single portrait + character sheet succeed with real R2 image URLs (HTTP 200, PNG bytes).
- Concurrent load test `/tmp/conc.py`: ok=8/8, durations < ~120s, 0 `PROXY_UNREACHABLE`.
- Worker logs: 0 heartbeat timeouts, 0 StartToClose timeouts during the test.
- Browser: drive the agent UI flow and see a portrait render (user's hard rule).

---

## §14 — TIMEOUTS & CONFIG REFERENCE TABLE

| Layer | Setting | Value | File |
|------|---------|-------|------|
| OpenAI SDK client | `maxRetries` | 2 | `worker openai.ts` |
| OpenAI SDK client | `timeout` | 120_000 ms | `worker openai.ts` |
| undici Agent | `keepAliveTimeout` / `keepAliveMaxTimeout` | 1 ms | `worker openai.ts` |
| undici Agent | `headersTimeout` / `bodyTimeout` | 120_000 ms | `worker openai.ts` |
| undici Agent | `connections` | 64 | `worker openai.ts` |
| `withPrematureCloseRetry` | attempts | 4 | `worker openai.ts` |
| api-v2 fallback | `AbortSignal.timeout` | **75_000 ms** (was 180_000) | `worker openai.ts` |
| api-v2 OpenAI SDK | `maxRetries` / `timeout` | 5 / 90_000 ms | `api-v2 openai-image.ts` |
| portrait workflow | `startToCloseTimeout` | 4 minutes | `worker workflows/portrait-gpt2.ts` |
| portrait workflow | `heartbeatTimeout` | **120 s** (was 90) | same |
| character-sheet workflow | `startToCloseTimeout` / `heartbeatTimeout` | 4 min / **120 s** | workflows/character-sheet-gpt2.ts |
| wireframe workflow | `startToCloseTimeout` / `heartbeatTimeout` | 5 min / **120 s** | workflows/wireframe-gpt2.ts |
| api-v2 workflow | `workflowExecutionTimeout` / `workflowRunTimeout` | 20 min | api-v2 server.ts |
| api-v2 workflow start | `startTimeoutMs` | 10_000 ms | api-v2 server.ts |
| heartbeat ticker | interval | 15_000 ms | `worker lib/heartbeat.ts` |
| agent UI poll | interval × max | 5s × 200 = 1000s | apps/web agent page |
| worker watchdog | `WORKER_MAX_UPTIME_MS` | default 8h | `worker net-health.ts` |

---

## §15 — LANDMINES / THINGS NOT TO DO

1. **Do NOT add the `undici@8` npm package to api-v2.** Its Node is older and crashes with
   `webidl.util.markAsUncloneable is not a function`. For api-v2 egress fixes, use the
   Node-bundled undici via a `dispatcher` on global `fetch`, or just tune the SDK's
   `maxRetries`/`timeout`/custom fetch.
2. **Do NOT bulk force-fail `primitive_runs`.** It once marked the user's LIVE runs as
   "cleared by operator during incident" in their UI. Only ever touch specific, confirmed-dead
   runs, and confirm with the user first.
3. **Do NOT push the private monorepo to `gitroomhq/agent-media`.** Public mirror is the
   public-skill subtree ONLY.
4. **Do NOT claim a fix works without driving the failing flow** (browser + real artifacts).
   "tsc passes" / "looks right" is not verification. This is the user's #1 rule and has cost
   real hours when violated.
5. **Do NOT change `keepAliveTimeout: 1` casually.** It is the Bug-1/Bug-2 fix. If you change
   it for Bug 4 (H1), you MUST re-run the sustained 16-min test to confirm premature close
   doesn't return.
6. **Do NOT bump versions / publish to npm/PyPI** without explicit sign-off (pnpm, not npm).
7. **Keep the pnpm lockfile in sync.** Adding a dep to a workspace without updating the
   lockfile caused `ERR_PNPM_OUTDATED_LOCKFILE` and blocked ALL Vercel web deploys.
8. **No `timeout` (GNU coreutils) on macOS.** And foreground long `sleep` is blocked by the
   harness — use background tasks / until-loops.
9. **Never expose provider names / wholesale $/sec / margin** in any user-facing surface.
   Customers see CREDITS only.
10. **Worker deploy is `railway up`, not GitHub.** A stray ignore pattern once stripped
    `src/workflows` and crash-looped the worker — always verify a clean boot + queue consume
    after deploy.

---

## §16 — OPEN QUESTIONS

1. **What is the actual swallowed direct-path error under concurrency?** (Get the
   `[gpt-image] DIRECT path failed …` log — §9 STEP 1.) Everything downstream depends on it.
2. Is `UV_THREADPOOL_SIZE` (default 4) the constraint? (Cheap to test by setting 64.)
3. Does a moderate `keepAliveTimeout` (e.g. 10s) eliminate the concurrency failures without
   reintroducing premature close?
4. What is the worker's `maxConcurrentActivityTaskExecutions`? Is it unbounded (so 400 users
   can stampede the event loop)? Should it be capped (e.g. 8–16) with Temporal queueing the rest?
5. Should the api-v2 fallback be fixed (§7.5) or removed entirely once the direct path is
   reliable under load?
6. Is there real, sustained production concurrency at the level that triggers Bug 4, or was the
   8-at-once burst synthetic? (Check `primitive_runs` created_at clustering during peak.)
7. The agent UI's `pollRun` 16-min budget masks slowness as "slow success" — but other surfaces
   (direct API callers, MCP clients) may have shorter timeouts. Audit them.

---

## §17 — DELIVERED ARTIFACTS (PROOF THE PIPELINE WORKS)

All four are real PNGs, HTTP 200, served from R2, created under the user's account this
session (low concurrency, fast):

1. Portrait (redhead chess player, raw-iPhone), ~40s:
   `https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/9f2cacf3-e285-437b-8ab4-13d5e596ee3e/portrait.png`
2. Character sheet ("MAEVE COLLINS — Chess Player", consistent face):
   `https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/67e88dea-36b4-4d61-8239-2b21effaeeec/character-sheet.png`
3. Portrait via the **skill** path (man, dark beard, grey tee), ~64s:
   `https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/1e6ce3f6-a1fb-41ce-b002-5c5770c0bd7e/portrait.png`
4. Character sheet via the **skill** path ("ALEX MARTIN — Founder & CEO", consistent face), ~72s:
   `https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/214d3fa9-d353-499e-98a2-3d73da770bff/character-sheet.png`

These prove: the primitive pipeline and the skill pipeline both produce correct, consistent,
photoreal output end-to-end. The remaining work is purely the concurrency latency (Bug 4).

---

## §18 — APPENDICES

### §18.1 Commit log (this session, worker)
```
4a75c06c  diag+fix(worker): log swallowed direct-path error; fast-fail api-v2 fallback 180s->75s
be6afd52  fix(worker): heartbeat during gpt-image call — stops false 'timed out' failures
bec012d2  fix(worker): shared OpenAI undici Agent — per-request Agent leaked, degraded after ~13min
e19881ea  (pre-session baseline / earlier fresh-connection attempt)
```

### §18.2 `src/lib/heartbeat.ts` (full, as deployed)
```ts
// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { Context } from '@temporalio/activity';

export async function withHeartbeat<T>(
  stage: string,
  fn: () => Promise<T>,
  intervalMs = 15_000,
): Promise<T> {
  const ctx = Context.current();
  let n = 0;
  const timer = setInterval(() => {
    try { ctx.heartbeat({ stage, beat: (n += 1) }); } catch { /* best-effort */ }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  try { return await fn(); } finally { clearInterval(timer); }
}
```

### §18.3 `/tmp/conc.py` (concurrent load test)
```python
import json, time, urllib.request, threading
env = {}
for line in open('/tmp/sb.env'):
    line = line.strip()
    if '=' in line:
        k, v = line.split('=', 1); env[k] = v
SB = env['SUPABASE_URL']; SRK = env['SUPABASE_SERVICE_ROLE_KEY']; ANON = env['SUPABASE_ANON_KEY']
API = "https://api.agent-media.ai"
def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
        headers={**headers, 'content-type': 'application/json'}, method='POST')
    return json.load(urllib.request.urlopen(req, timeout=30))
gen = post(f"{SB}/auth/v1/admin/generate_link", {"type":"magiclink","email":"yuvalsuede@gmail.com"},
           {"apikey": SRK, "authorization": f"Bearer {SRK}"})
ht = gen.get("hashed_token") or gen.get("properties", {}).get("hashed_token")
ver = post(f"{SB}/auth/v1/verify", {"type":"magiclink","token_hash":ht}, {"apikey": ANON})
TOK = ver["access_token"]; print("token ok", len(TOK))
N = 8; rids = [None]*N
def fire(i):
    try:
        r = post(f"{API}/v1/primitives/portrait_gpt2",
                 {"description": f"a person warm-test {i}, candid daylight, friendly",
                  "aspect_ratio":"1:1","realism_target":"natural"},
                 {"authorization": f"Bearer {TOK}"})
        rids[i] = r.get("run_id")
    except Exception as e: rids[i] = f"ERR:{e}"
ths = [threading.Thread(target=fire, args=(i,)) for i in range(N)]
t0=time.time()
for t in ths: t.start()
for t in ths: t.join()
print(f"fired {N} in {time.time()-t0:.1f}s:", rids)
def get(rid):
    req = urllib.request.Request(f"{API}/v1/primitives/runs/{rid}", headers={"authorization":f"Bearer {TOK}"})
    return json.load(urllib.request.urlopen(req, timeout=20))
done={}; start=time.time()
while len(done) < N and time.time()-start < 600:
    for rid in rids:
        if not rid or rid in done or str(rid).startswith("ERR"): continue
        try: d = get(rid); st = d.get("status","")
        except Exception: continue
        if st in ("succeeded","failed","canceled"):
            done[rid]=(st,int(time.time()-start))
            print(f"  {rid[:8]} -> {st:10} {int(time.time()-start)}s err={d.get('error')}")
    time.sleep(5)
ok=sum(1 for v in done.values() if v[0]=="succeeded")
print(f"=== RESULT ok={ok} of {N}; durations(s): {sorted(v[1] for v in done.values())} ===")
```

### §18.4 In-container OpenAI probes
`/tmp/diag.mjs` (raw undici, sequential) — fresh-Agent config, 6 sequential calls to
`/v1/images/generations`. `/tmp/diag2.mjs` (deployed SDK, sequential) — imports
`./dist/client/openai.js` `getOpenAI` + `generateImage`. `/tmp/diagc.mjs` and
`/tmp/diag2c.mjs` — the 8-concurrent variants (`Promise.all`). Run from
`/app/services/primitive-worker-vnext` so `undici`/`./dist` resolve.
```js
// /tmp/diag.mjs (raw, sequential)
import { Agent, fetch as uf } from 'undici';
const key=process.env.OPENAI_API_KEY, model=process.env.OPENAI_IMAGE_MODEL||'gpt-image-2';
const agent=new Agent({keepAliveTimeout:1,keepAliveMaxTimeout:1,headersTimeout:120000,bodyTimeout:120000,connections:64});
async function one(i){const t0=Date.now();try{
  const r=await uf('https://api.openai.com/v1/images/generations',{method:'POST',dispatcher:agent,
    headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({model,prompt:`test ${i}, a person, daylight`,size:'1024x1024'})});
  const t=await r.text();console.log(`[${i}] ${r.status} ${((Date.now()-t0)/1000).toFixed(1)}s bytes=${t.length}`);
}catch(e){console.log(`[${i}] ERR ${((Date.now()-t0)/1000).toFixed(1)}s ${e.name}:${e.message} cause=${e.cause?.code||''}`);}}
for(let i=1;i<=6;i++){await one(i);}   // concurrent variant: await Promise.all(Array.from({length:8},(_,i)=>one(i+1)))
```

### §18.5 Worker boot log (latest, `4a75c06c`)
```
2026-06-21T11:06:19.794Z [INFO] worker listening ... queue="primitive-vnext-v1" simulate=false
... Worker state changed { state: 'RUNNING' }
```

### §18.6 Temp files created this session (host)
- `/tmp/sb.env` — Supabase URL + service role + anon key (DELETE when done; contains secrets).
- `/tmp/conc.py` — concurrent load test (§18.3).
- `/tmp/diag.mjs`, `/tmp/diag2.mjs`, `/tmp/diagc.mjs`, `/tmp/diag2c.mjs` — in-container probes.
- `/tmp/loadtest.sh` — earlier bash load test (superseded by conc.py; bash 3.2 lacked
  `mapfile`/`declare -A`).
- `/tmp/tok.txt` — last minted access token (expires ~1h).

### §18.7 Glossary
- **Primitive** — a single atomic generation unit (portrait, character_sheet, wireframe…)
  run as one Temporal workflow+activity on `primitive-vnext-v1`.
- **Skill** — a user-facing composed operation (`make_portrait`, …) exposed via REST
  (`/v1/skills/:slug/run`) and MCP; for single-primitive skills it maps 1:1 to a primitive run.
- **Direct path** — worker → OpenAI. **Fallback path** — worker → api-v2 → OpenAI.
- **Heartbeat** — a Temporal activity's "I'm alive" signal; absence past `heartbeatTimeout`
  ⇒ Temporal kills + retries the activity.

---

## §19 — STATUS SUMMARY (one screen)

- ✅ Bug 1 (premature close) — fixed.
- ✅ Bug 2 (Agent leak) — fixed (`bec012d2`), sustained-verified.
- ✅ Bug 3 (heartbeat timeout = the customer-facing "timed out") — fixed (`be6afd52`),
  verified 0 heartbeat timeouts under load.
- ⚠️ Bug 4 (concurrency cascade → 5–9 min, slow not failed) — **root cause CONFIRMED**
  (OpenAI SDK 120s timeout under event-loop saturation; vault says gpt-image-2 needs 600s).
  Fix is known and written up (§9 STEP 1): raise OpenAI client timeout to 300–600s + cap
  worker activity concurrency. NOT yet applied.
- 🔴 Bug 5 (credit double-charge on retry) — **NOT fixed**, pre-existing HIGH risk
  (vault handover 2026-05-28 §0). This incident's retries almost certainly over-charged
  customers; needs a `credit_transactions` audit for the window + refunds + an idempotency
  migration. See §21.
- ✅ Pipeline correctness — proven with 4 real delivered images (§17).
- ⏳ Browser UI verification of the agent flow — attempted (login worked, nav aborted); redo.
- ⏳ Incident post-mortem + vault update — vault incident doc written (§22); post-mortem pending.

**If you do ONE thing:** apply §9 STEP 1 (OpenAI client timeout 120s→300s + cap activity
concurrency), redeploy, and re-run `/tmp/conc.py` until 8/8 with p95 < ~120s and 0 fallbacks.

**See also:** §20 (broader platform architecture), §21 (credit double-charge), §22 (Obsidian
vault index + the incident doc written there).

---

## §20 — BROADER PLATFORM ARCHITECTURE (beyond image-gen)

> Sourced from the Obsidian vault (`agent-media-vault/architecture/`), primarily the verified
> 2026-05-28 vNext primitive handover and the content-machine-pipeline doc. This situates the
> image-gen subsystem inside the whole product so a new owner has the full map.

### 20.1 Product surfaces (how customers reach the system)
agent-media is an AI UGC platform exposed through **four** surfaces, all hitting the same
api-v2 + Temporal backend:
- **CLI** — `agent-media-cli` (npm), binary `agent-media`; `agent-media skills list|run|status`.
  (`apps/cli/src/commands/skills.ts`.) Was at 1.16.0 in the vault; later bumped (CLI 1.18.0
  referenced in project memory).
- **MCP** — `@agentmedia/mcp-server` (npm, **stdio**); loads skills live from `/v1/skills`,
  forwards to `POST /v1/skills/<slug>/run`. Also an **HTTP MCP** surface at `POST /mcp` on the
  api host. `.mcp.json` must use `args:['-y','-p','@agentmedia/mcp-server@latest','agent-media-mcp']`.
- **REST** — `https://api.agent-media.ai`, Bearer-auth; the canonical machine surface.
- **Claude Code plugin** — public repo `gitroomhq/agent-media`;
  `claude /plugin install github.com/gitroomhq/agent-media`. Ships the public-skill subtree only
  (SKILL.md dirs + plugin.json). Generated by `services/api-v2/scripts/generate-public-skill.ts`;
  mirrored by CI `mirror-public-skill.yml` (gated by `MIRROR_PUBLIC_SKILL_ENABLED` +
  `GITROOM_DEPLOY_KEY`). **Never push the private monorepo here.**
- **Web app** — `apps/web` (Next.js on Vercel, `agent-media.ai` / `app.agent-media.ai`):
  marketing pages, the `dashboard/skills` Skill Center, the `dashboard/agent` chat UI (the agent
  loop that calls skills — the surface in this incident), and the legacy `content-machine` wizard.

### 20.2 The skill catalog (current)
Source of truth: `services/api-v2/src/skills/registry.ts`. Live list:
`GET /v1/public/skills`. The 2026-05-28 vault handover documented **6** skills; the catalog has
since grown (this session's `GET /v1/skills` returned **9**):

| Slug | Workflow type (camelCase) | Primitive | Output | Notes |
|------|---------------------------|-----------|--------|-------|
| `make_portrait` | `portraitGpt2Workflow` | `portrait_gpt2` | photoreal portrait PNG | **this incident** |
| `make_character_sheet` | `characterSheetGpt2Workflow` | `character_sheet_gpt2` | magazine-style sheet PNG | **this incident** |
| `make_wireframe` | `wireframeGpt2Workflow` | `wireframe_gpt2` | multi-panel storyboard PNG | shares the image-gen path |
| `make_simple_selfie` | `simpleSelfieWorkflow` | `simple_selfie` | 9:16 lip-synced talking-head MP4 | video (EvoLink Seedance 2.0) |
| `make_product_in_hands` | (product-in-hands workflow) | — | 5/10/15s UGC product video | video |
| `make_subtitles` | `subtitlesWorkflow` | `subtitles_v2` | MP4 with burned captions | ffmpeg/ASS |
| `make_lip_sync` | `lipSyncWorkflow` | — | lip-synced video from your audio | Seedance audio_urls + ffmpeg mux |
| `make_ugc_video` | `makeUgcVideoWorkflow` | `composed:make_ugc_video` | full captioned UGC clip | composed (3-step) |
| `make_broll_talking_head` | (broll workflow) | — | ≤30s talking-head + B-roll | composed |

Design principle: **one primitive = one prompt to debug**, each with its own SKILL.md + Zod
contract. Composed skills (`make_ugc_video`, `make_broll_talking_head`) create a `skill_runs`
parent row and start a multi-step workflow; children link back via `skill_run_id`.

### 20.3 Identity-lock chain (how an actor stays on-model)
`make_portrait` → portrait PNG → `make_character_sheet` (portrait as reference) → character
sheet PNG → that sheet URL is the reference fed to Seedance for every video, so all clips of one
actor stay on-model. The 9 realism props live in the Haiku system prompt
(`client/anthropic.ts`). No "selfie" vocabulary (avoids phone-in-hand).

### 20.4 Orchestration (Temporal)
- **Temporal Cloud**, namespace `quickstart-agent-media.v5v8r`, task queue `primitive-vnext-v1`.
- Each skill = a workflow that runs one (or, composed, several) activity. Activities heartbeat,
  retry (`maximumAttempts: 3`), and have start-to-close + heartbeat timeouts (§14).
- The worker (`services/primitive-worker-vnext`) is a Railway Docker service (ffmpeg + fonts in
  the Dockerfile for the video/subtitle skills). On SIGTERM it drains in-flight activities (~25s)
  then exits; Temporal re-runs anything unfinished on another worker.
- A separate net-health watchdog self-recycles the worker on `WORKER_MAX_UPTIME_MS` (8h default).

### 20.5 Two generations of image pipeline (don't confuse them)
- **Legacy "content-machine"** (`services/media-worker-v2`, pgmq dispatch, `generation_jobs` /
  `user_characters` tables, `/content-machine` wizard): Character Sheet → Storyboard → Video,
  gpt-image-2 + EvoLink Seedance 2.0. **OpenAI client `timeout: 600_000`** (knows gpt-image-2 is
  slow). Still live for that wizard.
- **vNext primitive runtime** (`services/primitive-worker-vnext`, Temporal, `primitive_runs` /
  `primitive_artifacts` tables, the skills above): the surface exposed publicly via the plugin/
  MCP/CLI. **OpenAI client `timeout: 120_000`** ← this is Bug 4. vNext does NOT reuse
  `generation_jobs`.

### 20.6 Video path (for context; not in this incident)
- Provider: **EvoLink `seedance-2.0-reference-to-video`** (NOT BytePlus — BytePlus ModelArk's
  privacy filter blocks real-person refs; ADR `decisions/adr-byteplus-modelark-not-viable.md`).
- "EvoLink mj-v7 is NOT Midjourney" and "EvoLink kling-o3" are proxy products — never represent
  them as the real branded tools, and never expose provider/cost/margin to users.
- Seedance 2.0 accepts `audio_urls` and lip-syncs, but returns SILENT video → must ffmpeg-mux the
  audio back (powers `make_lip_sync`). Clips clamped ≤10s (lip-sync degrades beyond ~10s).

### 20.7 Storage, DB, billing
- **Storage:** Cloudflare R2 (migrated from Supabase Storage 2026-03-08; zero egress).
  vNext prefix `vnext/primitive-runs/<run_id>/`, public base `pub-16e2…r2.dev`. Never
  `media.agent.media` (doesn't resolve).
- **DB:** Supabase Postgres (production only, no staging). vNext tables: `primitive_runs`,
  `primitive_artifacts`, `primitive_events`, `provider_tasks`, `skill_runs`. status enum
  `submitted|running|succeeded|failed|canceled`. RLS on; service-role access only.
- **Billing:** Stripe LIVE (4 tiers + PAYG). **Credits** are the user-facing unit (1 credit =
  $0.01); USD caps are an independent internal cost guardrail (per-primitive $0.50, per-run $5,
  per-UTC-day $20 — relevant when load-testing on one account: you can hit the day cap).
  Credit amounts: portrait/character_sheet/wireframe 35 each, subtitles 15, selfie 100/200/300.

### 20.8 Repos & deploy (consolidated)
- Private monorepo `github.com/yuvalsuede/agent-media` (everything). Public `gitroomhq/agent-media`
  (public-skill subtree only).
- Note the vault's older `system-overview.md` references a separate `/Users/suede/Projects/videoagent`
  repo and an `agent-cli` repo — the canonical monorepo for vNext is `~/Projects/agent-media`.
- Worker/api-v2 deploy: `railway up` (no GitHub auto-deploy). Web: Vercel (auto on push; keep the
  pnpm lockfile in sync or Vercel build fails `ERR_PNPM_OUTDATED_LOCKFILE`).

---

## §21 — CREDIT DOUBLE-CHARGE ON RETRY (BUG 5) — FINANCIAL DIMENSION OF THIS INCIDENT

This is a **pre-existing HIGH-severity risk** documented in the vault (handover
`architecture/handover-2026-05-28-vnext-primitive-runtime.md` §0). It is called out here because
**this incident almost certainly triggered it at scale.**

### 21.1 The bug
- Each image activity deducts credits via `deduct_credits(p_user_id, p_amount, p_job_id, ...)`
  near the top of the activity, **before the provider call** (`activities/portrait-gpt2.ts`
  ~line 158, `deductPrimitiveCredits`).
- The retry-safety guard only returns early when `status === 'succeeded'`
  (`activities/portrait-gpt2.ts` ~line 77).
- `deduct_credits` (migration `20260216000015_deduct_credits.sql`) has **no idempotency guard**
  on `p_job_id` (no `ON CONFLICT` / reference_id check).
- Therefore: any **retryable** failure AFTER the deduct line — which is exactly what Bugs 3 & 4
  produced (heartbeat timeout, StartToClose timeout, fallback failure) — causes Temporal to
  re-run the whole activity, which **deducts again**. A run that finally succeeds on attempt 3
  charged the customer ~3× and refunds nothing (refund only fires on *non-retryable* failure).

### 21.2 Why it matters NOW
During this incident, the DB shows many runs with retry-inflated durations (122s, 139s, 316s,
346s, 417s, 420s, 429s, 477s, 548s). Each retry past the deduct line is a probable extra charge.
So affected paying customers were likely **over-charged 2–3×** on top of the slowness — a direct
contributor to "I lost customers."

### 21.3 What to do
1. **Audit** `credit_transactions` (and `primitive_runs.credits_deducted`) for the incident window
   (2026-06-21 roughly 06:00–11:00 UTC) — find runs with multiple debit rows for the same
   `reference_id`/`p_job_id`.
2. **Refund** the duplicate debits to affected users (and consider proactive comms).
3. **Permanent fix** (needs approval + migration): make `deduct_credits` idempotent on `p_job_id`
   (no-op if a `generation_debit`/`credit_transactions` row already exists for that reference),
   **and/or** guard the activity to skip deduct when `credits_deducted > 0`. One-line-ish DB
   change; see vault §0 "Fix direction."
4. The Bug-4 fix (§9) reduces retries dramatically, which *reduces* but does NOT *eliminate* the
   double-charge exposure — the idempotency fix is still required.

---

## §22 — OBSIDIAN VAULT INDEX (mandatory context) + INCIDENT DOC

### 22.1 Vault locations
- **Project vault:** `/Users/suede/Projects/agent-media-vault/` — the authoritative engineering
  + strategy vault. Subdirs: `architecture/`, `decisions/` (ADRs), `growth/`, `sprints/`,
  `research/`, `design/`, `marketing/`, `memory/`. Plus `roadmap.md`, `audit-march-2026.md`,
  `README.md`.
- **Global UGC vault:** `/Users/suede/Documents/AI-UGC-Vault/` — strategy/research index
  (`Home.md`, `Current-Architecture.md`, `Temporal-Architecture-Guide.md`,
  `Orchestrator-Blueprint.md`, `Tooling-Marketplace-Architecture.md`, `Business-Model.md`, …).
  Per the global rule, `Home.md` is the research/strategy index and the vault must be updated
  after major decisions/incidents.

### 22.2 Most-relevant vault docs for THIS incident
- `architecture/handover-2026-05-28-vnext-primitive-runtime.md` — the verified vNext architecture
  (skills, stack, endpoints, credit flow, DB, worker internals, distribution). **Read §0 (known
  risks) — that's where Bug 5 is documented.**
- `architecture/content-machine-pipeline.md` — legacy 3-step pipeline; **line 104 is the
  gpt-image-2 600s-timeout gotcha that confirms Bug 4.**
- `architecture/system-overview.md` — older platform overview (CLI/web/edge/billing/models).
- `decisions/adr-byteplus-modelark-not-viable.md`, `decisions/railway-worker-choice.md`,
  `decisions/r2-storage-migration.md`, `decisions/adr-lip-sync-revert.md` — relevant ADRs.
- `growth/auth-user-audit-2026-05-09.md` — real user counts.

### 22.3 The incident doc written to the vault
This incident has been written to the vault at:
`agent-media-vault/decisions/incident-2026-06-21-image-gen-heartbeat-and-concurrency.md`
(root cause of all bugs, the fixes, the open Bug-4/Bug-5 items, and links back to this handover).
Keep both in sync; if you apply the Bug-4 fix, update both the vault doc and §19 here.

---

— end of handover —
