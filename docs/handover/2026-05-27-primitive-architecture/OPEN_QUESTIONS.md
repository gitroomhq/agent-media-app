# Open Questions for Previous Engineer

Date: 2026-05-27

These are gaps in the handover that block confident next steps. Please answer freeform; partial answers are fine.

## Scope & Repo

1. What's the immediate next action you intended — build `primitive-worker-vnext`, plan it, commit the uncommitted `portrait_gpt2` changes, or just hand off?
2. The uncommitted work appears to be sitting on branch `codex/selfie-pipeline-docs` inside `~/Projects/videoagent`. The handover refers to `~/Projects/agent-media`. Are these the same repo (different worktree/clone), or two different checkouts? Which one is canonical?
3. Should the vNext primitive work move to a fresh branch (e.g. `vnext/primitive-foundation`) before any commit?
4. The "bad session" backup branch (`backup/damage-<timestamp>`) — keep it for forensics, or safe to delete once handover is committed?

## Worker Service (`primitive-worker-vnext`)

5. Where should it live — same monorepo as `media-worker-v2`, or a brand new repo?
6. Language/runtime — Node/TypeScript (matches existing workers) or Python (schema package has a Python SDK)?
7. Deploy target — Railway (matches legacy), Vercel Fluid Compute, or other?
8. Auth from API → worker: just the shared `X-Primitive-Worker-Secret` header, or do you want mTLS / signed callbacks / per-request signing?
9. Does the worker call back to the API on completion (webhook), or does the API poll, or is it synchronous request/response for the first primitive?

## Provider

10. Is `gpt-image-2` a real model with an existing API key, or a placeholder? (The current OpenAI image model is `gpt-image-1`.) If placeholder, what should the contract name actually be?
11. For portraits, is `reference_photo_url` used as an input image to the model, or only as text-described context?
12. Provider failure semantics — retry inside the worker, or surface to skill runtime and let it decide?

## Data Plane

13. Fresh Postgres instance, or fresh tables in the existing Postgres?
14. Fresh R2 bucket, or `vnext/` prefix inside the existing bucket?
15. Does vNext reuse existing users / auth / credit-ledger tables, or are `skill_runs` and credits fully separate?
16. Schema migrations — Prisma, Drizzle, raw SQL? Where do the new migrations go?

## Skill Runtime

17. `services/api-v2/src/tooling/runtime-graph.ts` exists as a prototype. Is it intended as the vNext skill runtime, or a throwaway reference?
18. Orchestrator choice — bespoke runtime, Temporal, Vercel Workflow DevKit, something else?
19. SSE/event stream for step progress — required for first primitive, or deferred to Phase 3?
20. Idempotency keys — defined by API, worker, or caller?

## Operational

21. Who's authorized to approve live generation — just Yuval, or others on the team too?
22. Spend gate — do you want a hard budget cap enforced in code (per primitive / per run / per day)?
23. Observability — where do primitive logs/metrics go (Railway logs, Grafana, Datadog, custom dashboard)?
24. Credit accounting — fixed cost per primitive, or computed from provider usage?

## Marketplace / UI (later phases)

25. First audience for Skills Library UI — internal only, or external users from day one?
26. Skill package format — JSON, YAML, TypeScript? Stored where (R2, DB, separate registry)?
27. Review/approval workflow for marketplace publish — manual gate, automated checks, or both?

## Timeline

28. Is there a deadline on Phases 1–3, or open-ended until quality is right?
29. Are you the only engineer on vNext, or is this a team effort?

## Anything Else

30. Anything you'd flag that isn't in the 8 handover docs but the next engineer will trip over?
