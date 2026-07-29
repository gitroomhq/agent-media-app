# Operating Rules

## Production Safety

Do not mutate existing production generation paths while building vNext primitives.

Legacy services:

- `api-v2`
- `media-worker-v2`
- old `generation_jobs`
- old selfie queue/worker flow

These are production legacy and should only be touched for explicit incident fixes.

## No Live Generation Without Approval

Before any live generation:

1. state the exact project,
2. state the exact primitive/skill,
3. state provider,
4. state command/API call,
5. state expected artifacts,
6. get explicit approval.

## No Provider Flips Without Approval

Do not change:

- `VIDEO_PROVIDER`
- `USE_DURABLE_QUEUE`
- `ORCHESTRATOR_ENGINE`
- provider API keys,
- queue envs,
- worker URLs,

without explicit approval.

## Fresh Stack Rule

New primitive architecture uses:

- fresh services,
- fresh data tables,
- fresh queues,
- fresh storage prefixes,
- fresh worker env vars.

Do not hide vNext inside legacy selfie pipeline.

## Verification Rule

For any claimed fix:

- run tests,
- run build/typecheck when applicable,
- provide command evidence,
- state if not deployed,
- state if not live-verified.

## Documentation Rule

After each primitive milestone, update this handover folder:

- current status,
- changed files,
- tests,
- remaining risks,
- next task.

## Branching Rule

Keep vNext primitive work on its own branch before merge.

Do not mix:

- production incident fixes,
- prompt experiments,
- provider routing changes,
- primitive architecture.

## Review Rule

Every primitive contract needs review for:

- cost/accounting,
- SSRF / user URL risk,
- provider failure semantics,
- accidental production execution,
- generated schema parity,
- runtime graph compatibility.
