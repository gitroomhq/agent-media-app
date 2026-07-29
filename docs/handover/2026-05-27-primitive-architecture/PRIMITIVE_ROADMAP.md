# Primitive Roadmap

## Current Position

We are at:

`Primitive Foundation / Task 1 / portrait_gpt2`

This sits before:

- skill marketplace,
- Skills Library UI,
- Temporal/advanced orchestration,
- production migration.

## Phase 0 — Primitive Foundation

Goal:

Define and prove low-level media primitives before composing skills.

### Task 1 — `portrait_gpt2`

Create one realistic portrait with `gpt-image-2`.

Status:

- Contract: done.
- API runtime slot: done.
- Fresh worker implementation: not done.
- Real provider execution: not done.

### Task 2 — `character_sheet_gpt2`

Create a character sheet from a portrait.

Input:

- `portrait_url`
- identity notes
- output aspect/quality

Output:

- `character_sheet_url`
- `job_id`
- `credits_deducted`
- provider metadata

### Task 3 — `wireframe_gpt2`

Create a visual storyboard/wireframe from character sheet + scene/script.

Input:

- `character_sheet_url`
- scene description
- script
- duration
- framing/camera guidance

Output:

- `wireframe_url`
- frame metadata if available
- `credits_deducted`

Important:

Wireframe may contain captions for human review, but downstream video must treat script as source of truth.

### Task 4 — `seedance_video`

Create final video from references + script.

Input:

- `character_sheet_url`
- `wireframe_url`
- exact script
- duration
- provider routing config

Output:

- `video_url`
- provider task id
- `credits_deducted`

Important:

The script must win over any text visible in reference images.

### Task 5 — `subtitles`

Burn captions or prepare subtitle asset.

Input:

- `video_url`
- transcript/script
- style

Output:

- `video_url` or `subtitle_asset_url`
- `credits_deducted`

## Phase 1 — Fresh Primitive Worker

Build `primitive-worker-vnext`.

Minimum endpoints:

- `GET /health`
- `POST /v1/primitives/portrait_gpt2`

Later endpoints:

- `POST /v1/primitives/character_sheet_gpt2`
- `POST /v1/primitives/wireframe_gpt2`
- `POST /v1/primitives/seedance_video`
- `POST /v1/primitives/subtitles`

## Phase 2 — Fresh Data Plane

Add new schema/tables.

Minimum tables:

- `primitive_runs`
- `primitive_artifacts`
- `primitive_events`
- `skill_runs`
- `skill_run_steps`
- `provider_tasks`

## Phase 3 — Skill Runtime

Run custom skill graphs on primitive contracts.

Requirements:

- checkpoints,
- retries,
- idempotency,
- step events,
- artifact visibility.

## Phase 4 — Skill Marketplace

Enable:

- publish,
- review,
- approve,
- install,
- version pinning,
- rollback.

## Phase 5 — Skills Library UI

Enable users to:

- browse skills,
- install skills,
- run skills,
- see step timeline,
- inspect artifacts,
- rollback installed versions.

## Phase 6 — Migration

Only after vNext is proven:

- migrate internal/test users,
- run parallel output comparison,
- migrate controlled user cohorts,
- keep rollback to legacy.
