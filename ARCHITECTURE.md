# Architecture

How agent-media is put together, and why. This is the map for contributors and
self-hosters.

## System overview & design philosophy

agent-media is an agent-native platform for generating user-generated-content (UGC) video. The caller describes a video in a single sentence — a script, and optionally a person description, a photo, or a saved character — and a server-orchestrated pipeline returns a finished, captioned vertical video. The surface is reachable four ways: a REST API, a CLI published to npm as `agent-media-cli`, MCP (a local stdio server plus a hosted HTTP connector with OAuth), and a web dashboard.

The north star is to be the best agent-native UGC video surface: one tool, `make_ugc`, script in and vertical video out, with engine selection hidden. A generation is a single durable Temporal workflow with per-step progress and an automatic credit refund on failure — not an agent hand-assembling clips from primitives. That "one durable call, not a recipe" property is the core differentiator, and the price is always quoted before spend.

Every design decision descends from a single principle called **The Spine**: *the server always does the craft; the human or agent only chooses WHAT to make, never HOW it is made.* Two authorities never leave the server. **Routing authority** — which pipeline runs for a request — is decided by the pure function `decideMakeUgcRoute` (`services/api-v2/src/skills/make-ugc-router.ts`), never by a public decision tree an agent reads and follows. **Quality authority** — the realism prompt wrapper, product staging, character consistency across takes, voice pacing, and captions — lives in worker activity code so it applies on every path, whether template, direct primitive, or chained.

The product is organized as three tiers over one quality floor. **Tier 1 — Templates** (`make_ugc`, `make_podcast`, `make_product_in_hands`) are the opinionated, server-locked default and the hero surface. **Tier 2 — Primitives** (`make_portrait`, `make_character_sheet`, `make_simple_selfie`, `make_subtitles`, `make_lip_sync`, `make_wireframe`) expose the underlying steps as composable units, hidden from listing but runnable by slug. **Tier 3 — Raw / expert access** is deliberately narrow.

## Services & responsibilities

The monorepo is a pnpm + turbo workspace.

| Service | Runtime | Responsibility |
|---|---|---|
| `services/api-v2` | TypeScript ESM, Node 20, Express 4 | Control plane: auth → validate → route → re-host + moderate → credit preflight → dispatch. Owns the OpenAPI spec, the hosted MCP endpoint (`/mcp`), and the OAuth proxy |
| `services/primitive-worker-vnext` | TypeScript, Temporal worker | Modern render plane. Executes vNext workflows and primitive activities; durable execution, idempotency, SSRF pinning, cost caps, compensating refunds |
| `services/media-worker-v2` | JavaScript, Express + FIFO queue | Legacy render plane. Calls providers and assembles with ffmpeg |
| `services/brand-extractor` | JS, Playwright + vision call | Extracts brand palette/context from a URL |
| `apps/web` | Next.js 15, React 19, Tailwind v4 | Dashboard app (auth, create, gallery, jobs, settings). Marketing pages are not part of this distribution |
| `apps/cli` | TypeScript | `agent-media-cli` on npm |
| `supabase/functions` | Deno edge functions | Checkout, webhooks, presigned URLs, job status, persona/actor CRUD, usage stats |
| `packages/mcp-server` | TypeScript | Local stdio MCP server (companion to the hosted `/mcp` connector) |
| `packages/sdk-ts`, `packages/sdk-python` | TS / Python | SDKs against api-v2 |
| `packages/schema`, `packages/types`, `packages/ui` | TS | Shared schema, types, UI components |

Every backend service ships its own `Dockerfile`, so they can be deployed independently, to different hosts, and scaled separately.

## System context

```mermaid
flowchart TB
  agents["AI agents (MCP connector + OAuth)"]
  devs["Developers (SDKs / CLI)"]
  users["End users (web dashboard)"]

  subgraph surfaces["Surfaces"]
    mcp["MCP endpoint /mcp"]
    rest["REST API"]
    web["apps/web"]
  end

  apiv2["api-v2 control plane"]

  subgraph backend["Backend"]
    workers["Render workers"]
    providers["AI providers"]
    data["Postgres"]
    storage["S3-compatible storage"]
    orch["Temporal"]
  end

  agents --> mcp
  devs --> rest
  users --> web
  mcp --> apiv2
  rest --> apiv2
  web --> apiv2
  apiv2 --> orch
  apiv2 --> workers
  apiv2 --> data
  apiv2 --> storage
  workers --> providers
  workers --> storage
  workers --> data
  orch --> workers
```

## Request path

```mermaid
sequenceDiagram
  autonumber
  participant C as Agent
  participant A as api-v2
  participant DB as Postgres
  participant S3 as Object storage
  participant T as Temporal
  participant W as vNext worker
  participant P as Video provider

  C->>A: POST /mcp → make_ugc (Bearer, Idempotency-Key)
  A->>A: verifyToken (ma_ key or JWT)
  A->>A: inputSchema.safeParse → 400 on fail
  A->>A: decideMakeUgcRoute() picks the pipeline
  A->>S3: re-host user image/video
  A->>A: image moderation → 422 on unsafe
  A->>DB: credit preflight (balance minus in-flight) → 402 if short
  A->>DB: INSERT skill_runs / primitive_runs (submitted)
  A->>T: workflow.start(type, taskQueue)
  A-->>C: 202 { skill_run_id, status submitted }
  T->>W: deliver workflow task
  W->>DB: replay guard + SSRF check + cost cap
  W->>DB: deduct credits (idempotent per run id)
  W->>P: submit + poll with heartbeat
  P-->>W: video URL
  W->>S3: download bytes, re-upload
  W->>DB: artifacts written, run → succeeded (or refund on failure)
  loop until terminal
    C->>A: GET /v1/skills/runs/:id
    A-->>C: status + per-step artifacts
  end
```

## The three generation planes

Three generation stacks coexist. They share a product surface but not the same tables or worker.

- **v1 (legacy)** — `POST /v1/generate/:generatorId`, state in `generation_jobs`, dispatched to media-worker-v2 via queue or direct HTTP.
- **v2** — `/v2/*` routes (selfie, characters, subtitle), an isolated additive plane.
- **vNext (modern)** — Temporal-orchestrated composed workflows on `primitive-worker-vnext`, state in `skill_runs` / `primitive_runs` / `artifacts`. This is where new work goes.

```mermaid
flowchart LR
  subgraph plane1["v1 legacy"]
    G1["/v1/generate/:id"] --> J1["generation_jobs"] --> MW["media-worker-v2"]
  end
  subgraph plane2["v2"]
    G2["/v2/selfie, /v2/characters"] --> MW
  end
  subgraph plane3["vNext"]
    G3["/v1/skills/:slug/run"] --> SR["skill_runs"] --> TQ["Temporal"] --> PW["primitive-worker-vnext"]
  end
  MW --> PROV["providers"]
  PW --> PROV
```

## make_ugc — the agent facade

`make_ugc` is the single agent-facing entry point. A pure function decides the route; the same function runs at quote time, so the price you are quoted is the price you are charged.

```mermaid
flowchart TD
  IN["make_ugc(script, character?, product_image?, duration?)"]
  P{"product_image present?"}
  R0["Route 0: make_product_in_hands"]
  C{"character provided?"}
  R1["reuse saved character sheet"]
  R2["portrait → character_sheet → simple_selfie"]
  OUT["vertical video (+ optional captions)"]
  IN --> P
  P -->|yes| R0 --> OUT
  P -->|no| C
  C -->|yes| R1 --> OUT
  C -->|no| R2 --> OUT
```

## Data model (core tables)

```mermaid
erDiagram
  users ||--o{ api_keys : "owns"
  users ||--o{ user_characters : "owns"
  users ||--o{ skill_runs : "requests"
  users ||--o{ credit_transactions : "ledger"
  skill_runs ||--o{ primitive_runs : "composes"
  primitive_runs ||--o{ artifacts : "produces"
  primitive_runs ||--o{ provider_tasks : "dispatches"
  users ||--o{ generation_jobs : "legacy plane"
```

Row Level Security is enabled on user-owned tables: every read is scoped to the
calling user. The `service_role` key bypasses RLS and is used only server-side.
Money-mutating RPCs are `SECURITY DEFINER` and restricted to `service_role`.

## Credits & spend safety

Credits are **duration-based and model-independent** (5s / 10s / 15s tiers), so
switching the underlying model never changes what a caller pays. Four properties
protect spend:

1. **Quote before spend** — `POST /v1/skills/:slug/quote` returns the exact price.
2. **In-flight reservation** — concurrent runs cannot overdraw a balance.
3. **Hard 402 gate** — dispatch is blocked before any provider call, not advised after.
4. **Idempotency** — `Idempotency-Key` replay returns the original run instead of double-charging.

Failures trigger a compensating refund inside the workflow, so a failed render
does not silently consume credits.

## Tool surfaces

All four surfaces funnel into the same api-v2 skill routes — there is one
implementation of the craft, not one per client.

```mermaid
flowchart LR
  MCPC["MCP connector (hosted, OAuth 2.1)"] --> API
  STDIO["packages/mcp-server (local stdio)"] --> API
  REST["REST /v1/skills/*"] --> API
  SDKS["SDK-ts / SDK-python"] --> API
  CLI["agent-media-cli"] --> API
  API["api-v2 skill routes"] --> ROUTER["decideMakeUgcRoute"] --> WORKERS["render workers"]
```

The agent-facing surface is deliberately curated. Of the internal skills, the
hosted connector lists exactly five: `make_ugc`, `make_podcast`,
`make_subtitles`, `create_character`, `list_characters`. Fewer, well-described
tools beat a large catalog for agent context.

## Self-hosting: swapping the managed pieces

The hosted product runs on Supabase, Temporal Cloud, Cloudflare R2 and Railway,
but nothing in the code requires those vendors — each is reached over a standard
protocol, so `docker-compose.yml` substitutes open equivalents:

| Hosted uses | Self-host substitute | Why it swaps cleanly |
|---|---|---|
| Supabase Postgres | `postgres:15` | Plain Postgres + the SQL in `supabase/migrations` |
| Temporal Cloud | `temporalio/auto-setup` | Same gRPC API; point `TEMPORAL_ADDRESS` at it |
| Cloudflare R2 | MinIO | R2 is S3-compatible; MinIO speaks the same API |
| Railway | any container host | Every service ships a Dockerfile |
| Vercel | any Node host | `apps/web` is a standard Next.js app |

Configuration is injected purely at runtime — no secrets baked into images, and
nothing sensitive inlined into the client bundle.

### Billing is optional

The credits/billing layer keys off whether Stripe is configured. With no
`STRIPE_SECRET_KEY`, billing is off: no credit preflight, no deduction.
Self-hosters bring their own provider keys and pay the upstream providers
directly.

## Provider abstraction

Video generation goes through an **adapter registry** — pipelines never branch
on the vendor. Adding a backend is a new file plus one registry line.

```
services/media-worker-v2/src/providers/
  index.js      registry: getVideoProvider(), normalizeRequest(), generateVideo()
  evolink.js    EvoLink / Seedance 2.0 (default)
  byteplus.js   BytePlus ModelArk / Dreamina Seedance
```

Every adapter implements one interface:

```js
{
  name: 'evolink',
  requiredEnv: ['EVOLINK_API_KEY'],
  isConfigured(): boolean,
  generateVideo(request, options): Promise<string>   // -> video URL
}
```

`request` is **provider-neutral** — `{ prompt, imageUrls, durationSeconds,
aspectRatio, generateAudio, quality }` — and each adapter translates it into its
vendor's dialect, so quirks stay contained (BytePlus calls the aspect ratio
`ratio`; EvoLink takes a `quality` tier). Duration clamping happens once in
`normalizeRequest()` rather than in every pipeline.

Selection is by `VIDEO_PROVIDER` (default `evolink`). An unknown name or missing
credentials fails fast with a message naming the required env vars, instead of a
generic 500 mid-render. Pin models with `EVOLINK_SEEDANCE_MODEL`,
`BYTEPLUS_SEEDANCE_MODEL`, `GPT_IMAGE_MODEL`.

**To add a provider:** create `providers/<name>.js` exporting an adapter, import
it in `providers/index.js`, add it to `PROVIDERS`. No pipeline changes.

Images go through `gpt-image-2` (`OPENAI_API_KEY`) and prompt craft through
Anthropic (`ANTHROPIC_API_KEY`). The legacy b-roll and talking-head lanes still
read `BROLL_PROVIDER` / `TALKING_HEAD_PROVIDER` directly and have not yet been
migrated onto the registry — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security model

- **RLS everywhere** on user-owned tables; reads are scoped to the caller.
- **`service_role` is root** — bypasses RLS, server-side only, never in a client bundle or git.
- **API keys are hashed** (SHA-256) in `api_keys`; revoke by setting `is_active = false`.
- **Rate limits are per-user post-auth**, keyed on the authenticated user id; IP-keyed limiting is used only as a pre-auth flood guard.
- **SSRF protection** on media ingest: user-supplied URLs are re-hosted through a checked fetch path.
- **Image moderation** runs before spend and fails open by default (an upstream outage should not block every upload); invert with `IMAGE_MODERATION_FAILCLOSED=1`.

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
