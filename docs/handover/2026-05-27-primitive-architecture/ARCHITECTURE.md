# Target Architecture

## Principle

The next system is not "selfie pipeline v3".

It is a primitive runtime.

Skills are graphs. Graphs are made of primitives. Primitives are small, testable, metered units.

## Fresh Stack Requirement

Everything new should use fresh infrastructure:

- fresh API surface,
- fresh primitive worker service,
- fresh DB tables/schema,
- fresh queues,
- fresh storage namespace,
- fresh operational dashboards,
- explicit migration path from legacy.

The legacy selfie/generation path must not be used as the foundation.

## High-Level Components

### 1. Primitive Contracts

Defined in schema package.

Each primitive has:

- stable id,
- version,
- input schema,
- output schema,
- cost/accounting shape,
- failure model.

First primitive:

`portrait_gpt2`

### 2. Skill Runtime

Executes a graph of primitive steps.

Responsibilities:

- topological ordering,
- dependency outputs,
- step checkpointing,
- retries,
- timeouts,
- SSE/event stream,
- final result aggregation.

Current prototype files:

- `services/api-v2/src/tooling/runtime-graph.ts`
- `services/api-v2/src/tooling/repository.ts`
- `services/api-v2/src/routes/v1/tooling.ts`

These are useful references, but fresh production should isolate the new data plane.

### 3. Fresh Primitive Worker

New service, not `media-worker-v2`.

Suggested name:

`primitive-worker-vnext`

Responsibilities:

- execute one primitive request,
- create provider task,
- upload artifacts,
- return job id/status,
- record provider metadata,
- never know about high-level skills.

First endpoint:

`POST /v1/primitives/portrait_gpt2`

### 4. Fresh Data Model

Suggested table groups:

- `primitive_runs`
- `primitive_run_events`
- `primitive_artifacts`
- `skill_runs`
- `skill_run_steps`
- `skill_packages`
- `skill_installs`
- `provider_tasks`

Do not reuse `generation_jobs` as the core primitive ledger.

### 5. Fresh Storage Namespace

Suggested R2 prefix:

`vnext/primitive-runs/<primitive_run_id>/...`

Example:

`vnext/primitive-runs/prun_123/portrait.png`

### 6. Fresh Queues

Suggested queue names:

- `primitive_dispatch`
- `primitive_callbacks`
- `skill_runtime`

The old selfie queue should remain legacy until intentionally retired.

### 7. Skill Marketplace

Marketplace publishes skill packages that reference primitive ids.

Skill package should include:

- name,
- version,
- graph definition,
- required primitives,
- permissions/capabilities,
- creator/review metadata,
- rollback metadata.

### 8. Skills Library UI

UI comes after runtime stability.

It should show:

- available skills,
- installed version,
- run button,
- live step timeline,
- artifacts per step,
- rollback/install actions.

## Execution Flow

Example future selfie skill:

```text
skill run
  -> portrait_gpt2
  -> character_sheet_gpt2
  -> wireframe_gpt2
  -> seedance_video
  -> subtitles
  -> final artifact
```

Each step owns only its primitive output.

The skill graph owns composition.

## Non-Negotiables

- No hidden provider calls from schema/contracts.
- No primitive runs without cost/accounting fields.
- No user URL fetches without SSRF protection.
- No production deploy without health verification.
- No live generation without explicit operator approval.
- No legacy service mutation unless it is a documented migration/rollback task.
