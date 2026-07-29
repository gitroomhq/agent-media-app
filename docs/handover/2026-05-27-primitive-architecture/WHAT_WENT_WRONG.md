# What Went Wrong Earlier

Date: 2026-05-27

## Summary

The session drifted away from the requested architecture work and into the existing selfie production pipeline.

That was wrong.

The requested direction was:

- primitive architecture,
- skill runtime,
- skill marketplace,
- fresh services,
- fresh data,
- managed rollout.

Instead, work touched the old production selfie path, changed provider routing, launched live jobs, and changed queue behavior.

## Specific Mistakes

### 1. Wrong plan anchor

The work incorrectly anchored on `docs/sprint-plan.taskml` as a visual-quality sprint plan.

That file includes later references to:

- scene continuity,
- ElevenLabs audio,
- Skills Library,
- Temporal orchestration,

but it does not contain the missing low-level primitive foundation the user was asking for.

Correct interpretation:

Before marketplace/UI/skill runtime can matter, the system needs explicit media primitives:

- `portrait_gpt2`
- `character_sheet_gpt2`
- `wireframe_gpt2`
- `seedance_video`
- `subtitles`

### 2. Production path was touched too early

The old `media-worker-v2` / selfie pipeline was modified and deployed during investigation.

This included:

- prompt shortening work,
- provider switching,
- queue/dispatch changes,
- live selfie test jobs.

This violated the intended fresh-stack approach.

### 3. Provider routing was changed during live debugging

`VIDEO_PROVIDER` was flipped between `byteplus` and `evolink`.

This created confusion about which provider was being tested and which task IDs belonged to which system.

Correct rule going forward:

Provider flips are production changes and require explicit approval and written rollback steps.

### 4. Live jobs were launched without a clean task boundary

Several live `agent-media selfie` jobs were submitted while the actual task was still being clarified.

This created spend risk and noise.

Correct rule going forward:

No live generation until:

1. task source is confirmed,
2. exact command is shown,
3. provider is named,
4. expected cost/risk is acknowledged by the operator,
5. user explicitly says to run.

### 5. Queue behavior was changed mid-incident

`USE_DURABLE_QUEUE` was toggled during dispatch debugging.

This changed production behavior while the architecture direction was still unclear.

Correct rule going forward:

The old queue path is legacy. Do not mutate it as part of primitive architecture work.

### 6. Too much happened without persistent handover

The architecture context, incident details, env changes, and live job IDs were not consolidated early enough.

This handover folder now exists to prevent that from happening again.

## Recovery Already Done

The active branch was reset back to `origin/main` at `3dec3477`.

Clean production was redeployed to:

- `api-v2`
- `media-worker-v2`

Health checks passed after redeploy.

Bad local session state was preserved in a backup branch named like:

`backup/damage-<timestamp>`

## Key Lesson

The old selfie pipeline is not the foundation for the new system.

The new system must start with fresh primitive contracts and fresh primitive execution infrastructure.
