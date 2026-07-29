# Sentry Triage Plan — agent-media

_Snapshot: 19 unresolved issues, last 14 days, project `agent-media-web` (all services report here). Generated 2026-06-21._

Priority key: **P0** = fix now (active crash / revenue-blocking), **P1** = this week, **P2** = backlog/polish.
Effort: **S** ≤ ½ day · **M** ≈ 1–2 days · **L** > 2 days.

---

## Workstream A — Image-gen reliability (the incident cluster) — **P0**

**Issues (74 events total, highest volume, still firing <24h ago):**
- `ProxyImageError: image proxy unreachable … aborted due to timeout` — 33, escalating, seen 13h ago — `generateImageViaApiV2`
- `FetchError: …/v1/images/generations: Premature close` — 24, escalating
- `Error: Connection error` — 13 — `withPrematureCloseRetry`
- `Error: Request timed out` — 3 · `Connection closed` — 1

**Root cause:** flaky OpenAI image calls (premature close / socket reuse / client timeout) → the api-v2 fallback also times out → `ProxyImageError`. These are Bugs 1–4.

**Plan:**
1. **Confirm the latest worker code is actually deployed** (`railway up` — git push ≠ Railway deploy). The cluster firing 13h ago implies the 300s-timeout + concurrency-cap + heartbeat code isn't live. — **S, do first**
2. Watch the cluster in Sentry over 24–48h after deploy; it should fall toward zero. — verify
3. **Harden the api-v2 fallback** (`services/api-v2/src/lib/openai-image.ts`): plain SDK, `maxRetries: 5`, no keep-alive guard → triggered too easily AND slow to fail. Drop retries to 1–2, lower timeout, give it a non-pooling fetch. — **M**
4. Resolve these issues in Sentry once the post-deploy graph confirms they're gone.

---

## Workstream B — Unhandled undici crash — **P0**

**Issue:** `TypeError: webidl.util.markAsUncloneable is not a function` — 11, escalating, **Unhandled** (`undici…cachestorage`).

**Root cause:** `undici@8` imported in a runtime whose Node is too old (the handover documented this crashing api-v2). Module-load crash = whole request/service dies.

**Plan:**
1. `grep -rn "undici" services apps --include=package.json` + find the import site. — **S**
2. Remove the direct `undici@8` dep (use Node's bundled undici via a `dispatcher`), or pin a compatible version, **and resync the pnpm lockfile** (a lockfile mismatch already broke Vercel once). — **S–M**
3. Verify the service boots clean + the event stops.

---

## Workstream C — Broll / video pipeline — **P1** (explains the broll problems directly)

**Issues:**
- `ENOENT: no such file or directory, open` — 3 — **`extractLastFrame`**
- `Command failed: ffmpeg … broll.mp4 -t 10 -an -vf scale=…` — 3 — broll compose
- `evolink task failed: input media URL could not be fetched (not found)` — 3 — `pollEvolinkTask`

**Root cause / impact:**
- **`extractLastFrame` ENOENT is why last-frame continuity never worked.** The frame file isn't written/found, so `continuityFrameUrl` is empty and segment 2 has no continuity. Re-adding the call (done) is necessary but **not sufficient** — this activity must be fixed.
- The broll-overlay ffmpeg command fails on some inputs (bad scale dims / the user's webm) → "stitched video wrong."
- EvoLink can't fetch some input URLs (expired/short-lived signed URLs, or not yet re-hosted).

**Plan:**
1. **Fix `extractLastFrame`** (`activities/extract-last-frame.ts`): inspect its ffmpeg output path + temp-dir lifecycle; ensure the frame is written before it's read/uploaded; add an existence check + clear error. — **S–M** (unblocks the continuity)
2. **Fix the compose ffmpeg failure**: reproduce with the failing input, fix `force_divisible_by`/scale/`-t` edge cases; add a guard that fails with the ffmpeg stderr (not a bare "Command failed"). — **M**
3. **EvoLink URL fetch**: ensure all input URLs are re-hosted to R2 (long-lived) before submit, not passed as short-TTL signed URLs. — **S**
4. Re-run the broll test render and verify continuity + clean compose.

---

## Workstream D — Credits / onboarding — **P1**

**Issues:**
- `insufficient credits … USER_NOT_FOUND: no credit record for user …` — 6 — `deductPrimitiveCredits`
- `ApplicationFailure: day budget exceeded $19.85 > $20 cap` — 3 — `lipSync`

**Plan:**
1. **`USER_NOT_FOUND`** — some users have **no `user_credits` row**, so every generation fails. Backfill missing rows for existing users + fix the signup/onboarding trigger to always create one. — **M**
2. **`$20/day cap`** — the per-UTC-day USD guardrail blocks legit heavy users (and our own test renders). Make it plan-aware / raise for paid tiers. — **S**
3. Tie-in: ship **refund-on-failure** (already drafted for vNext) so failed runs never keep credits; run the **credit audit + refund** for the escalated customer (`125f9673…`).

---

## Workstream E — Content policy & composed skills — **P2**

**Issues:**
- `openai 400: rejected by the safety system` — 8 — `portraitGpt2`
- `skill_run failed: WORKFLOW_FAILED` (no message) — 6

**Plan:**
1. Strengthen the prompt sanitizer (broaden the term list) and convert the hard fail into a friendly "tweak the wording" message + no charge. — **S**
2. `WORKFLOW_FAILED` logs **no error message** → undiagnosable. Capture the underlying cause into the skill_run error + Sentry, then triage what's actually failing. — **S**

---

## Workstream F — Frontend — **P2**

**Issues:**
- `Hydration failed` on **/onboarding/plan** — 22, ongoing
- `TypeError: Cannot set properties of null (setting 'renderer')` on **/login** — 13
- `Cannot read properties of undefined (reading 'addListener')` — 3, unhandled
- promise rejection on **/onboarding** (`code, message`) — 3 · generic `Event` error rejection — 2
- `Inefficient HTTP Requests`: redundant middleware auth on **/dashboard** — 1 (perf)

**Plan:**
1. **Hydration /onboarding/plan** — find the server/client mismatch (Date/locale/random or conditional render); most-seen frontend issue, worth fixing. — **M**
2. **/login `renderer` + `addListener` + promise rejections** — likely third-party scripts / browser extensions. Triage which are real vs noise; add guards for the real ones and **filter extension noise in Sentry** (`beforeSend`). — **S**
3. **/dashboard redundant auth** — dedupe the 6 concurrent middleware auth checks per pageload. — **S**

---

## Recommended execution order

1. **Confirm worker `railway up` is live** → validates Workstream A with real data. _(S)_
2. **undici crash (B)** — unhandled, escalating, cheap to kill. _(S)_
3. **`extractLastFrame` ENOENT (C1)** — unblocks the broll continuity you asked for. _(S–M)_
4. **`USER_NOT_FOUND` credit row (D1)** + the customer refund/audit. _(M)_
5. **api-v2 fallback hardening (A3)** + **broll compose ffmpeg (C2)**. _(M each)_
6. **Content-policy UX + WORKFLOW_FAILED logging (E)**. _(S)_
7. **Frontend: hydration + Sentry noise filtering (F)**. _(S–M)_

## Process (so this doesn't pile up again)
- Add Sentry **alerts** on new unhandled + on spikes for the image-gen and credit issues.
- A weekly 30-min triage: resolve fixed issues, assign owners, archive noise.
