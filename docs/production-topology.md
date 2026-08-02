# What production actually runs, and what it would take to run this repo

**Checked:** 2026-08-02, against Railway, Vercel, Supabase and the live API.
Every date and version below was read from the platform, not inferred.

---

## The short answer

"We run on open source" is true of **one** of six deployable surfaces.

`apps/web` — the dashboard on `app.agent-media.ai` — is served from
`gitroomhq/agent-media-app` and is current. Everything else is deployed from
the private repo, and most of it has not been deployed in days.

---

## What is deployed where

| Surface | Host | Source | Last deploy |
|---|---|---|---|
| Dashboard (`apps/web`) | Vercel `app.agent-media.ai` | **`gitroomhq/agent-media-app`** | current |
| Marketing site | Vercel `agent-media.ai` | `gitroomhq/agent-media-website` (private) | current |
| `api-v2` | Railway | private / manual | 2026-08-02 13:20 |
| `primitive-worker-vnext` | Railway | private / manual | 2026-08-02 13:21 |
| `media-worker-v2` | Railway | private / manual | 2026-07-28 22:58 |
| `temporal-worker` | Railway | *not our code* | 2026-07-25 03:48 |
| Brand extractor | Railway | private / manual | 2026-08-02 11:19 |
| 29 Supabase edge functions | Supabase | manual / CI-on-change | 2026-06-12, +2 on 2026-08-02 |

`media-worker-v2` has one commit since its last deploy, and that commit says
itself that it is a no-op in production (`S3_ENDPOINT` is unset on every Railway
service, so every branch resolves as before). It does not import the take
planner. It does not need a deploy.

`temporal-worker` has no source directory in this repo — it is the Temporal
cluster, not a service we build.

Two mechanisms are missing, not broken:

- **Nothing in either repo's CI deploys Railway.** `deploy.yml` covers Supabase
  edge functions only, and is gated on `supabase/functions/**` changing — it has
  skipped every push for weeks. Railway deploys happen by hand.
- **The edge functions are ~7 weeks old.** Most last shipped 2026-06-09/12,
  three date from February. 29 are deployed against 27 directories in the repo,
  so at least two are orphans of functions that no longer exist here.

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

**1. ~~Deploy what is already merged.~~** Done 2026-08-02 — see above.

**2. Wire Railway to deploy at all.** Every service is a manual `railway up`
today, which is why the drift happened silently. Either a deploy job in CI or
Railway's git integration per service, with watch paths so a marketing-only
commit does not rebuild five containers.

**3. Repoint each Railway service to `gitroomhq/agent-media-app`.** The backend
in this repo is now byte-identical to private except for the items in step 4 —
`diff -rq services/` shows only a package.json script, a Dockerfile fix, and
generated `dist/` noise.

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
