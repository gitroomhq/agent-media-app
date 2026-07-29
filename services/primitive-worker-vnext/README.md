# primitive-worker-vnext

Fresh Temporal worker for vNext primitives. NOT a replacement for
legacy `media-worker-v2` — runs alongside on its own task queue.

## Task queue

`primitive-vnext-v1`

## Primitives implemented

- `portrait_gpt2` — single realistic portrait via OpenAI `gpt-image-2`.

## Local run

```bash
# 1. Make sure .env.vnext.local has TEMPORAL_*, OPENAI_API_KEY, R2_*, SUPABASE_*.
# 2. Apply the migration (see supabase/migrations/*_vnext_primitive_*.sql).
# 3. Start the worker:
pnpm --filter primitive-worker-vnext dev
```

## Cost guardrails

Three caps enforced in code before any provider call:

- `PRIMITIVE_CAP_USD` (default 0.50)
- `RUN_CAP_USD` (default 5.00)
- `DAY_CAP_USD` (default 20.00)

Exceeding any cap rejects the Activity with a non-retryable failure.

## Simulate mode

Set `SIMULATE_OPENAI=true` to skip the real OpenAI call and return a
placeholder PNG. Used for the first end-to-end smoke test, before
the human-approved live-spend gate.
