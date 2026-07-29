# Current Status

Date: 2026-05-27

## Repository

Repository path:

`/Users/suede/Projects/agent-media`

Known clean baseline restored earlier:

`origin/main` at `3dec3477`

After the reset, new uncommitted work was added only for the first primitive:

- `portrait_gpt2` contract.
- `portrait_gpt2` runtime slot.
- generated tool contract docs/schema.
- tests.
- `.env.example` documentation for fresh primitive worker env vars.

No commit has been made for this primitive work yet.

## Production

Production was restored to clean `origin/main` before primitive work continued.

Verified health after clean redeploy:

- `https://api.agent-media.ai/health` returned `status: ok`.
- `https://media-worker-v2-production.up.railway.app/health` returned `status: ok`.

Known important Railway envs after restoration:

- `api-v2 USE_DURABLE_QUEUE=true`
- `media-worker-v2 USE_DURABLE_QUEUE=true`
- `media-worker-v2 VIDEO_PROVIDER=byteplus`

## Current Primitive Work

Primitive:

`portrait_gpt2`

Purpose:

Create exactly one realistic portrait using `gpt-image-2`.

Current implementation state:

- Schema contract exists in `packages/schema/src/tooling/contracts.ts`.
- Generated docs exist in `docs/v2/tool-contracts.md`.
- Generated JSON schema exists in `generated/v1-tool-contracts.schema.json`.
- API runtime accepts `portrait_gpt2` in custom graphs.
- API runtime forwards it only to a fresh primitive worker endpoint.
- Runtime is disabled unless both env vars exist:
  - `VNEXT_PRIMITIVE_WORKER_URL`
  - `VNEXT_PRIMITIVE_WORKER_SECRET`

Fresh worker endpoint expected later:

`POST /v1/primitives/portrait_gpt2`

## Verification Completed

Commands run after primitive work:

```bash
pnpm --filter @agentmedia/schema test -- src/__tests__/tooling-contracts.test.ts
pnpm --filter @agentmedia/schema build
pnpm --filter api-v2 test -- src/__tests__/tooling-tool-registry.test.ts src/__tests__/tooling-repository.test.ts src/__tests__/tooling-marketplace-routes.test.ts
pnpm --filter api-v2 build
```

Results:

- Schema tests: 11 passed.
- Schema build: passed.
- API tooling tests: 6 passed.
- API build: passed.

## Production-Only Environment

There is no staging. The production Supabase project is the only database.
Every schema write, env flip, and worker deploy is a production action.

## 2026-05-27 Update — Migration applied to production

`supabase/migrations/20260527150000_vnext_primitive_runs.sql` was applied
to the production Supabase project via the cloud Studio SQL editor by
Yuval. The 4 vNext tables (`primitive_runs`, `primitive_artifacts`,
`primitive_events`, `provider_tasks`) and the `touch_primitive_updated_at`
trigger function now exist in production. All tables have RLS enabled
with zero policies — service role only.

## 2026-05-27 Update — Code review findings

See `CODE_REVIEW.html` (this folder). 1 CRITICAL (SSRF) and 4 HIGH issues
in the worker code must be fixed before `VNEXT_PRIMITIVES_ENABLED` is
flipped on in api-v2 prod env. Worker is built but NOT yet ready for the
end-to-end smoke test.

## Not Done

- No fresh primitive worker exists yet.
- No fresh primitive database tables exist yet.
- No fresh primitive queue exists yet.
- No fresh storage namespace has been created yet.
- No actual `gpt-image-2` provider call has been wired for `portrait_gpt2`.
- No production deploy has been done for the primitive work.
- No generation job has been run for this primitive.
