# Primitive: portrait_gpt2

## Purpose

Create one realistic portrait using `gpt-image-2`.

This is the first primitive in the fresh architecture.

## Provider Verification (2026-05-27)

`gpt-image-2` is a **real** OpenAI model. Verified via
`https://developers.openai.com/api/docs/models/gpt-image-2`:

- Model id: `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`)
- Endpoint: `POST /v1/images/generations`
- Edits endpoint (used when `reference_photo_url` is provided):
  `POST /v1/images/edits`
- Inputs: text, image
- Account tier required: Tier 1+ (rate-limit floor 5 IPM)

The contract name does NOT need to be renamed. Keep `gpt-image-2`.

## Contract

Defined in:

`packages/schema/src/tooling/contracts.ts`

Generated docs:

`docs/v2/tool-contracts.md`

Generated JSON schema:

`generated/v1-tool-contracts.schema.json`

## Input

Fields:

- `description` — required, 8-400 chars.
- `reference_photo_url` — optional, public HTTPS URL only.
- `setting` — optional, 1-200 chars.
- `aspect_ratio` — `1:1` or `9:16`, default `1:1`.
- `realism_target` — `natural`, `commercial`, or `raw_iphone`, default `natural`.

## Output

Fields:

- `job_id`
- `status: submitted`
- `portrait_url`
- `provider: gpt-image-2`
- `credits_deducted`

## Runtime Behavior Today

The API runtime accepts `portrait_gpt2` in tool graphs.

It forwards to:

`POST /v1/primitives/portrait_gpt2`

Only when both env vars are set:

- `VNEXT_PRIMITIVE_WORKER_URL`
- `VNEXT_PRIMITIVE_WORKER_SECRET`

If they are missing, it fails closed:

`portrait_gpt2 primitive worker is not configured`

This prevents accidental provider spend.

## Security

`reference_photo_url` is protected against common SSRF paths.

Rules:

- must be HTTPS,
- blocks private IPv4,
- blocks IPv6 literals,
- blocks IPv4-mapped IPv6,
- blocks `0.0.0.0`.

Important:

The primitive worker must still perform its own SSRF validation. API validation is defense in depth, not the only barrier.

## Runtime Context Headers

The API runtime sends:

- `X-Primitive-Worker-Secret`
- `X-Tooling-Run-Id`
- `X-Tooling-User-Id`

This lets the fresh worker attribute primitive data to the correct run/user.

## Verification

Commands run:

```bash
pnpm --filter @agentmedia/schema test -- src/__tests__/tooling-contracts.test.ts
pnpm --filter @agentmedia/schema build
pnpm --filter api-v2 test -- src/__tests__/tooling-tool-registry.test.ts src/__tests__/tooling-repository.test.ts src/__tests__/tooling-marketplace-routes.test.ts
pnpm --filter api-v2 build
```

Passing result:

- Schema tests: 11 passed.
- API tooling tests: 6 passed.
- Builds: passed.

## Accepted V1 Risk: Per-Day Budget Race

The Activity enforces `DAY_CAP_USD` by summing `actual_credits_usd` over
the user's runs today (UTC). Concurrent submissions can each pass the
check before either has finished, so the cap is not a hard guarantee
under high concurrency — two parallel requests can collectively exceed
it by one primitive run's worth.

This is accepted for V1 because:

- Dev cap is $0.50 per primitive, $20 per day. Worst-case overspend is
  bounded by `(concurrent_requests - 1) * primitive_cost`.
- vNext traffic in V1 is internal / Yuval only.

Long-term fix (Phase 2 hardening): atomic check-and-reserve via a
Postgres advisory lock or a stored procedure that includes `submitted`
and `running` rows by their `estimated_credits_usd`.

## Next Implementation Step

Build `primitive-worker-vnext` with:

- `GET /health`
- `POST /v1/primitives/portrait_gpt2`
- R2 upload under fresh namespace
- DB insert into fresh primitive table
- real `gpt-image-2` call
- explicit credit accounting
- no connection to old `media-worker-v2`
