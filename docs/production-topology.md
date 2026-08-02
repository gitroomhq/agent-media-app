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
| `api-v2` | Railway | private / manual | **2026-07-30 21:15** |
| `primitive-worker-vnext` | Railway | private / manual | **2026-07-30 16:42** |
| `media-worker-v2` | Railway | private / manual | **2026-07-28 22:58** |
| `temporal-worker` | Railway | private / manual | **2026-07-25 03:48** |
| Brand extractor | Railway | private / manual | 2026-08-02 11:19 |
| 29 Supabase edge functions | Supabase | manual / CI-on-change | **2026-06-12** |

Two mechanisms are missing, not broken:

- **Nothing in either repo's CI deploys Railway.** `deploy.yml` covers Supabase
  edge functions only, and is gated on `supabase/functions/**` changing — it has
  skipped every push for weeks. Railway deploys happen by hand.
- **The edge functions are ~7 weeks old.** Most last shipped 2026-06-09/12,
  three date from February. 29 are deployed against 27 directories in the repo,
  so at least two are orphans of functions that no longer exist here.

---

## The consequence: fixes that are merged but not running

The api-v2 in production predates every backend change of the last three days.
Directly observable — the live schema still has no top-level `type`:

```
$ curl -s .../v1/skills | jq '.skills[0].input_schema.type'
null
```

So none of these are live, regardless of being green in `main`:

- the concurrency gate that caps renders at 3 in flight
- the rate-limiter fix that moved chat CRUD off the generate tier
- the subtitle re-host that stops charging for a job that cannot run
- the `/v1/skills` schema fix
- the take-planner fix for over-long takes — which lands in **both** `api-v2`
  and `primitive-worker-vnext`, and both are three days stale

A worker that renders a 34-word take today still produces one the renderer
refuses, because the worker running in production has not picked up the change.

---

## What is left, in order

**1. Deploy what is already merged.** Independent of the open-source question,
`api-v2` and the three workers are 3–8 days behind and the edge functions are
seven weeks behind. This is the step that makes the fixes real.

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
