# Session Handover — 2026-07-06

**Scope of this session:** chess-ugc durability + spend-safety hardening — resumable
jobs, orphan reconciliation, partial-progress surfacing, and a third spend bound. All
shipped to `chess-ugc` `main` (commit `381bd83`). This doc closes out that work so the
next session can pivot to **real bugs in the agent-media repo**.

> **STANDING CONSTRAINT — READ FIRST:** All paid generation (video AND image) is
> **PAUSED/LOCKED**. `CHESS_UGC_GENERATION_DISABLED=1` is set in `chess-ugc/.env` and on
> the cloud studio service. Never start any paid generation — production or test —
> without an explicit founder "go" naming that generation. The founder is the only user
> and is extremely spend-sensitive (a ~$1000/day burn happened twice from my R&D). Any
> debug/test generation is 480p and must be asked for first, every time.

---

## 1. What shipped this session (chess-ugc `main` @ `381bd83`)

Founder spec (verbatim): *"if it fails / killed, hung — we need to continue from LAST
successful video, not begin fresh. also, if first / second etc. failed — do not move to
next. this is critical + if one video done — show it already."*

Delivered against that, in one commit (`feat(reels): resumable jobs …`, 8 files, +337/−40):

### Durability / resume
- **Migration 4** on `template_jobs`: adds `heartbeat_at`, `pid`, `host`, `opts`.
  (`db.py` `_MIGRATIONS`; applied at engine startup via `init_db()`; DB now at
  `user_version` 6.)
- **`jobs_store.mark_running(job_id)`** stamps the owner process (pid+host) when
  execution begins; every progress write doubles as a heartbeat (`update()` bumps
  `heartbeat_at` unless a terminal status is being set).
- **`jobs_store.reconcile_orphans(stale_after_s=2700)`** — startup sweep (called in
  `api.py` lifespan). Marks a stuck `generating` job → terminal **`interrupted`** when:
  same-host + dead pid (authoritative), OR cross-host + heartbeat older than 2700s
  (backstop; > the 1800s Seedance poll ceiling so a slow render is never mis-killed), OR
  legacy row with no owner stamp. **`interrupted` NEVER auto-runs.**
- **Resume endpoint** `POST /v1/templates/{slug}/reels/{reel_id}/resume` — explicit
  founder click only. Re-checks the kill-switch (refuses 503 while paused), then
  re-dispatches the SAME row (seed/look/caption/opts preserved) through the shared
  `_dispatch_template_job` helper. Only resumable from `interrupted|failed|aborted`.
- **Opener-slot pin** (`face_videochain.generate_videochain_face`): the opener slot is
  written to `out/vchain/look{L}/game{seed}/opener-slot` the first time and re-read on
  retry. Fixes the drift bug where `slot = seed % max(banked_slots, POOL_TARGET)` was
  recomputed from live disk and picked a DIFFERENT opener once the pool grew — stranding
  the game's checkpoints and re-paying. Now a retry reuses the banked opener + accepted
  hops → resume is ~$0.

### Partial progress ("show it already")
- `generate_videochain_face` emits `opener_ready`, `build_chain` emits `hop_accepted`
  with `{done_takes, total_takes, label:"segment N of M ready"}`.
- UI (`web/components/template-studio.tsx`): new **interrupted tile** ("Interrupted —
  engine restarted" + "Resume from last video" button + "N segments already finished"),
  and the generating tile shows **"segment N of M ready"** in amber. `resume()` calls the
  proxy; `lib/engine.ts` `TemplateReel.progress` widened with `stage/done_takes/total_takes`.

### Spend bounds (now THREE independent, all enforced at `_run_video_job`)
1. **Kill-switch** — `CHESS_UGC_GENERATION_DISABLED` (read live from `os.environ`) →
   `GenerationDisabled`.
2. **Per-job cap** — `CONFIG.max_takes_per_job` (default 8) via `begin_job_budget` /
   `_reserve_take` → `GenerationBudgetExceeded` (job status `aborted`).
3. **Global daily ceiling (NEW)** — persisted sqlite `daily_spend(day,takes,credits)`;
   `CHESS_UGC_DAILY_TAKE_CEILING` (default 40) caps TOTAL paid takes/day across ALL
   jobs/clicks/processes → `GenerationDailyCeilingReached`. Closes the recurrence gap
   where N clicks = N×per-job-cap unbounded.
- **Rerolls cut:** `ARM_E_HOP_ROLLS`=2 (was 5 → 6 attempts, now 3) + `ARM_E_TAKE0_ROLLS`=1.
  `build_chain`'s hop loop has no try/except → a failed hop HALTS the job (never marches
  to the next), satisfying "if first/second failed, do not move to next".

### Verification (before commit)
- **$0 logic tests:** all three spend bounds block before any network call; reconcile
  4-case matrix correct (dead-same-host→interrupted, live-same-host→kept, stale-cross-host
  →interrupted, fresh-cross-host→kept); resume preserves seed/opts/caption; opener pin
  survives a pool-growth retry (slot 1 kept vs would-drift-to-4); full HTTP through the
  real app (startup sweep → `interrupted` → listing → resume-while-paused 503).
- **One real 480p reel** (founder-authorized "enable + test once"): look 0 / seed 42.
  Opener free from pool (pin worked), 2 hops both accepted first-roll, all partial-progress
  events fired, spend **exactly 2 takes / $2.77**, both caps tracked, daily ledger persisted
  2/40. Produced reel saved at `chess-ugc/out/test-reel-seed42-look0.mp4` (44.7s, 1080×1920,
  h264 High, stereo AAC).
- **UI browser-verified** in the logged-in dashboard (`/dashboard/templates/30-second-game`):
  interrupted tile + Resume button + "segment N of 3 ready" all render; clicking Resume
  while paused surfaced the 503 and left the job interrupted ($0).

---

## 2. chess-ugc architecture (current)

**Product:** auto-produced TikTok reels of AI persona "Nina" playing 30s bullet chess.
Repo `github.com/yuvalsuede/chess-ugc` (private). Board renderer is a sibling repo
`betterchess` (`/Users/suede/Projects/betterchess`).

**Pipeline** (`orchestrator/pipeline.py::make_bullet_reel`):
`generate_game` (stockfish bots → clocks → beats) → `compile_timeline` (betterchess JSON +
event twin) → `betterchess.render_to_file` (board-zone mp4) → **Arm E face** →
`compose_bullet` (face top + board bottom → 1080×1920, Hormozi captions, bg music).

**Arm E face** (`persona/face_videochain.py`) — the founder-approved "100% perfect" path:
a gated pristine **take-0 opener** from the look's banked pool (checkpointed local +
R2 `chess-ugc/looks/look{L}/slot{S}.mp4`), then **video-ref continuation** per ~15s beat
(`continue_take`: tail + texture-renormalized anchor → one Seedance request), gated per
hop (take-0 band, join SSIM, adjacent texture/light/cut gates; `CUT_MAD_MAX` is
resolution-aware 10@480p/6@720p), assembled with aligned cuts + a render-residual ramp so
joins are invisible. Checkpoints: opener `out/vchain/look{L}/take0-slot{S}.mp4`; accepted
hop `out/vchain/look{L}/game{seed}/gen{hop}-{beat}.mp4` (+ `-graded`); rejects preserved to
`.../rejects/`.

**Quality:** `ARM_E_QUALITY` default **480p** (founder: production is also 480p). Native
480p grid = **496×864** (NOT 480×854). Provider clamps ANYTHING above 720p → 720p
(`_MAX_QUALITY`, `_clamp_quality`); NEVER 1080p (2.5× cost, zero visible gain).

**Voice:** Seedance generates Nina's voice **natively** — NO TTS, no OmniHuman bolt-on
(that caused robotic voice + bad lip-sync).

**Providers:** Evolink is the single generation hub (video + image + lip-sync, one
OpenAI-compatible key). R2 = asset/reel storage. Postiz = TikTok publish (AIGC label set
POST-time via `video_made_with_ai: true`, cannot be retroactive).

**Orchestration:** `ORCHESTRATOR_ENGINE` = `temporal` (Temporal Cloud namespace
`chess-ugc.v5v8r`, queue `chess-ugc-reels`, workflow `BulletReelWorkflow`,
`maximum_attempts=1` — a failed job REPORTS, founder retries from UI) or `thread` (local
dev fallback, in-process, the path where the zombie bug lived). Both now stamp owner +
heartbeat. Sentry wired (`init_sentry`).

**Deploy:** Railway project `chess-ugc` — `studio` service (engine+worker, root Dockerfile,
`/data` volume) + `web` service (`web/Dockerfile`). Dashboard:
`https://web-production-afe0c.up.railway.app`. Prod caps set: `DAY_CAP_USD=100`,
`EVOLINK_GENERATION_ATTEMPTS=1`.

**Dashboard:** Next.js (`web/`), Supabase auth (magic-link OTP), server-side proxy
`/api/engine/[...path]` injects the engine token. Slug served: **`30-second-game`**.

**Job state:** durable `template_jobs` sqlite (`jobs_store.py`) — one row per generate
click; statuses `generating | done | failed | aborted | blocked | interrupted`. Listing
(`list_template_reels`) = done reels from R2 + in-flight/failed from the store + posted marks.

**Look library:** 10 looks (0–9). Banked openers: looks 0–2 = 8 slots, looks 3–5 = 6,
looks 6 = 1, looks 7–9 = 0 (need bootstrap when unpaused). "44 openers banked" total.

---

## 3. Open issues (chess-ugc) — carried forward

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | **`compose_bullet` has NO retry** | Medium | A TRANSIENT ffmpeg compose failure (seen once this session, exit 183, non-reproducible) fails the whole job AFTER all paid takes — recoverable only via a manual Resume. A 1–2 attempt compose retry auto-heals it at $0 risk. Bundled `imageio_ffmpeg` DOES have libass/subtitles (ruled out as cause). **Recommended, not built.** |
| 2 | Resume error banner copy | Trivial | Banner reads "Couldn't **start the render**:" even for a resume failure (fits generate, not resume). |
| 3 | Old `jobs` table auto-requeue | Low (dormant) | `store.requeue_stale_running_jobs()` resets killed `running` jobs → `queued` and the worker re-runs them from scratch — the "begin fresh" + auto-run anti-pattern. Table is EMPTY today; studio path (`template_jobs`) does NOT auto-run. Latent burn vector; not neutered. Fix: exclude `kind='produce'` from requeue. |
| 4 | Evolink token separation | Medium | R&D vs prod share one Evolink account/key → my R&D 402s once broke prod users. Console task only the founder can do. Kill-switch + caps mitigate; token split still open. |
| 5 | Delete old unlabeled TikTok post | Low | One earlier post went out without the AIGC label (label is post-time only). Founder action. |
| 6 | Looks 7–9 openers | Low | 0 banked openers; need a (paid) bootstrap when generation is unpaused. |

---

## 4. Money / safety state at handover

- **LOCKED:** `CHESS_UGC_GENERATION_DISABLED=1` in `chess-ugc/.env` + cloud studio.
- **No engine/worker running** locally; nothing listening on :8000.
- Daily ledger: 2/40 takes today ($2.77, the authorized test).
- DB clean: no zombie/`generating` orphans; demo jobs removed.
- Prod Railway caps in place (`DAY_CAP_USD=100`, attempts=1).

---

## 5. Next: pivot to real bugs in agent-media

The chess-ugc durability/spend work is **done, verified, committed, and pushed**. Next
session moves to **real bugs in the agent-media repo** (this repo). No open chess-ugc work
blocks that pivot; items in §3 are enhancements/founder-actions, not blockers.

**When picking up agent-media bug work:** confirm the specific bug(s)/repro from the
founder first (do not infer scope), and remember the browser-verify rule — a UI/frontend
fix is not "done" until the failing flow is driven end-to-end in a real browser.

---

## 6. Key references
- Memory: `chess-ugc-generation-guardrails`, `chess-ugc-platform-state`, `nina-face-arm-e`,
  `chess-ugc-seedance-native-voice`, `chess-ugc-no-1080p`, `evolink-spend-postmortem`
  (all in the agent-media project memory dir).
- chess-ugc commit this session: `381bd83` on `main`.
- Repos: `github.com/yuvalsuede/chess-ugc` (private), `betterchess` (private, sibling).
