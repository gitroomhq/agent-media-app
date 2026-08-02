# What production actually runs, and what it would take to run this repo

**Checked:** 2026-08-02, against Railway, Vercel, Supabase and the live API.
Every date and version below was read from the platform, not inferred.

---

## The short answer

**As of 2026-08-02, four of five surfaces we build are sourced from this repo**
and deploy automatically on push. One is not: `media-worker-v2`, held back
deliberately — see step 4.

Ask production what it is running:

```
$ curl -s https://api.agent-media.ai/health
{ "status": "ok",
  "release": "f036ee8db04038b0e78812ca2175672a96e64a1e",
  "source": "gitroomhq/agent-media-app",
  "environment": "production" }
```

A null `source` there means someone deployed from a laptop rather than the
repo. That is not hypothetical — until today `api-v2` had **no repo connected
at all**, which is how production came to run three days behind `main` with
nothing to show for it from the outside.

---

## What is deployed where

| Surface | Host | Source | Last deploy |
|---|---|---|---|
| Dashboard (`apps/web`) | Vercel `app.agent-media.ai` | **`gitroomhq/agent-media-app`** | current |
| Marketing site | Vercel `agent-media.ai` | `gitroomhq/agent-media-website` (private) | current |
| `api-v2` | Railway | **`gitroomhq/agent-media-app`** | 2026-08-02 18:09, auto |
| `primitive-worker-vnext` | Railway | **`gitroomhq/agent-media-app`** | 2026-08-02 18:04 |
| Brand extractor | Railway | **`gitroomhq/agent-media-app`** | 2026-08-02 18:04 |
| `media-worker-v2` | Railway | *no repo — manual only* | 2026-07-28 22:58 |
| `temporal-worker` | Railway | *not our code* | 2026-07-25 03:48 |
| 29 Supabase edge functions | Supabase | manual / CI-on-change | 2026-06-12, +2 on 2026-08-02 |

### Watch patterns

`api-v2` and `primitive-worker-vnext` both compile `@agentmedia/schema` into
their image, and the take planner lives there — quote/run parity depends on the
two moving together. So both watch `packages/schema/**` and the lockfile as well
as their own directory. Watching only a service's own path would mean a planner
change deploys neither, which is the drift this exercise exists to end.

`media-worker-v2` has one commit since its last deploy, and that commit says
itself that it is a no-op in production (`S3_ENDPOINT` is unset on every Railway
service, so every branch resolves as before). It does not import the take
planner. It does not need a deploy.

`temporal-worker` has no source directory in this repo — it is the Temporal
cluster, not a service we build.

**Railway deploys are now automatic** for the three connected services —
verified, not assumed: commit `f036ee8` was pushed to this repo and Railway
built and released it with nobody triggering anything. Before today, `api-v2`
had no repo attached and `deploy.yml` covered only Supabase edge functions
(gated on `supabase/functions/**`, so it had skipped every push for weeks).

Still outstanding: **the edge functions are ~7 weeks old.** Most last shipped
2026-06-09/12, three date from February. 29 are deployed against 27 directories
in the repo, so at least two are orphans of functions that no longer exist here.

---

## The consequence: fixes that were merged but not running

**Resolved 2026-08-02 13:20/13:21** by deploying `api-v2` and
`primitive-worker-vnext`, one minute apart so quote and run could not disagree
about take planning for longer than that.

Before the deploy, api-v2 predated every backend change of the last three days —
directly observable, because the live schema had no top-level `type`:

```
$ curl -s .../v1/skills | jq '.skills[0].input_schema.type'
null          # before
"object"      # after
```

Merged-but-not-running, now live: the concurrency gate capping renders at 3 in
flight; the rate-limiter fix moving chat CRUD off the generate tier; the
subtitle re-host that stops charging for a job that cannot run; the
`/v1/skills` schema fix; and the take-planner fix, which lands in **both**
`api-v2` and `primitive-worker-vnext` — both were three days stale, so a 34-word
script produced a take the renderer refuses, after charging for it.

Verified against production by quoting scripts at every boundary. The 34-word
row is the fix:

| Words | Credits |
|---|---|
| 9, 11 | 140 |
| 12, 22 | 280 |
| 23, 33 | 420 |
| 34, 37 | **560** (was 420 for one unrenderable take) |

Two edge functions also shipped — `webhook-provider` (v55→56) and
`schedule-runner` (v12→13), both adding permissive-until-configured inbound
auth that had sat undeployed since 2026-07-28. Deployed individually rather than
running the whole 27-function loop, which would have redeployed `checkout` and
`webhook-stripe` for no reason.

---

## What is left, in order

**1. ~~Deploy what is already merged.~~** Done 2026-08-02.

**2. ~~Wire Railway to deploy at all.~~** Done — git integration per service
with watch paths, so a docs-only commit does not rebuild containers.

**3. ~~Repoint the Railway services to `gitroomhq/agent-media-app`.~~** Done for
`api-v2`, `primitive-worker-vnext` and the brand extractor.

**4. Resolve the one real divergence before repointing `media-worker-v2`.**
This repo replaces the direct Evolink/BytePlus clients with a provider registry
(`services/media-worker-v2/src/providers/`). Private still calls the clients
directly. **The registry has never executed anywhere.** `media-worker-v2` is the
service that renders customer video, so this is the only step in the list that
can produce a bad frame rather than a failed deploy. It needs to run somewhere
that is not production first.

Note the Dockerfile fix in `services/subtitle-worker` is in this repo and not in
private: private's `COPY src/` resolves against the repo root and fails, because
both compose and the container workflow build with the root as context. Anything
building that service from private is building a broken image.

**5. Deploy the edge functions from here.** The workflow exists and works; it
just has not had a reason to fire. A one-off manual run brings the ~7-week gap
to zero, after which the on-change trigger is enough.

**6. Set the env vars this repo expects.** Open-sourcing replaced hardcoded
values with environment variables. Each unset one is a silent regression, not a
crash: `NEXT_PUBLIC_ADMIN_EMAILS` (the admin link disappears), `SUPPORT_INBOX` /
`SUPPORT_FROM` / `RESEND_API_KEY` (support form quietly disabled),
`NEXT_PUBLIC_DISCORD_INVITE_URL`, `SESSION_HINT_DOMAIN` (the marketing site
stops recognising signed-in visitors), `NEXT_PUBLIC_MARKETING_URL`.

---

## What "fully open source in production" would not cover

The marketing site is a separate private repo (`gitroomhq/agent-media-website`)
and is not part of this one — deliberately, since this repo's `robots.ts` serves
`Disallow: /` and it has no `(landing)` route group. Deploying this repo to the
apex would deindex the domain.

Supabase Auth, Stripe, R2 and the Temporal cluster are managed services. The
functions that talk to them are here; the accounts are not.

---

## Monitoring

Sentry is initialised in `api-v2` and `primitive-worker-vnext` (`[sentry] api-v2
initialised` on boot) and the DSN accepts events — verified by posting an
envelope directly and getting a `200` with an event id back, and by the
`/_debug/sentry` route returning `500` through the Express error handler.

Connecting the repo fixed release tracking as a side effect.
`instrument.ts` sets `release` from `RAILWAY_GIT_COMMIT_SHA`, which Railway
injects **only for git-sourced deploys**. While `api-v2` had no repo attached
that variable was unset, so every event it ever sent had no release — you could
see that something broke but not which build broke it. It is now populated;
`/health` echoes the same sha so an alert can be tied to a deploy.

`environment` comes from `RAILWAY_ENVIRONMENT_NAME` and reads `production`.

### One Sentry project for three services

Confirmed by the alert the `/_debug/sentry` probe produced: it filed as
**`AGENT-MEDIA-WEB-6`, project `agent-media-web`**. But the error came from
`api-v2`. Both backend services point at the same DSN project id
(`4511496330543104`) as the dashboard, so API errors, worker errors and
front-end errors land in one bucket.

The cost is triage. At 3am "is this the API or the dashboard?" should be
answered by which project alerted, not by reading a stack trace. Ownership,
alert rules and issue counts are all mixed, and a noisy front-end release
buries a real backend regression.

Fix: create a Sentry project per service (`agent-media-api`,
`agent-media-worker`) and set each service's `SENTRY_DSN` to its own. No code
change — `instrument.ts` already reads the DSN from the environment.

Release tagging, by contrast, now works: that same alert reads *"regression in
61bbe5538e32"*, which is the exact commit deployed at 18:03. Before the repo
was connected there was no sha to report.

The marketing site has no Sentry at all — no `sentry.*.config.*` in
`gitroomhq/agent-media-website`. It is the one surface where a white screen
would go unreported.
