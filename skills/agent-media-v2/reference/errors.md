<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# Common errors + fixes

## CLI

| Error | Fix |
|---|---|
| `ERR_MODULE_NOT_FOUND: @agentmedia/schema` | You're on an old CLI. Run `npm install -g agent-media-cli@latest`. |
| `Not authenticated. Run agent-media login first.` | API key missing. Run `agent-media login`. |
| `LOGIN_TIMEOUT` | Browser didn't complete OAuth in time. Re-run `agent-media login`. |
| `DEPRECATED v1 command: agent-media ugc` | You called a legacy command. Switch to `agent-media selfie`. |

## API

| Code | Meaning | Fix |
|---|---|---|
| `VALIDATION_ERROR` | Input body failed schema. Check the `issues` array in the response. | Adjust args to match the input schema. |
| `UNAUTHORIZED` | Bearer token missing or invalid. | Re-run `agent-media login`. |
| `INSUFFICIENT_CREDITS` | Not enough credits on the account. | Run `agent-media subscribe` to top up. |
| `WORKER_NOT_CONFIGURED` | Server-side misconfig — should not normally occur. | Ping support. |
| `DATABASE_ERROR` | Server insert failed (often missing models row). | Ping support, report the job request. |
