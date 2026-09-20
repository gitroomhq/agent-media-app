# Recovering generation submissions

For each intended image, video, or audio generation, persist a fresh request identity (prefer a UUID) **before** calling the service. Keep it with the exact submitted inputs.

- MCP: pass `request_id` to `generate_image`, `generate_video`, or `generate_audio`.
- REST: send `Idempotency-Key` on `POST /v2/generate/:kind`.
- Reuse the same identity and inputs after a lost response. The API returns the original job, `replayed: true`, `credits_deducted: 0`, and `original_credits_deducted` from its saved receipt. It does not dispatch again.
- Changed inputs under the same identity return HTTP 409. An intentionally new generation must use a new identity, even if its prompt is identical.
- A fresh identity is generated when absent for backward compatibility, but a retry without the original identity is a new request. MCP responses return `request_id`, including uncertain submission errors. Older clients should preserve it or recover the job from account activity instead of blindly resubmitting.

Request identities are scoped to the account and cover the generation kind and original inputs. Object key ordering does not matter; array order and explicit/default input differences do. The first successful submission pins its model, quote, and inputs. Receipt lookup runs before model selection, reference probing, and concurrency admission. Receipts do not expire with temporary image links: an old retry retrieves the old job, including failed jobs, rather than starting a new one.

The database commits the job, receipt, and credit debit in one transaction. A debit failure rolls back all three. Receipts are service-owned and survive administrative deletion of a job as recovery tombstones. Account deletion removes the account's receipts. Existing job retention and account-deletion restrictions still apply.

New loose image, video, and audio submissions also reserve account capacity inside that transaction. The database serializes distinct submissions for one account and counts active loose jobs, composed skills, and standalone primitives before it inserts or debits. If the shared limit is full, HTTP 429 returns `TOO_MANY_ACTIVE_RENDERS` with `active` and `limit`; wait for a running generation to finish, then retry the same request identity. A replay of an already accepted request returns its receipt without needing another slot.

HTTP 202 with `dispatch_status: unknown` means the job and debit are saved, but the worker acknowledgement was lost or uncertain. Poll the returned job ID. Do not create a new request or assume a refund. The existing stalled-job reconciler handles jobs that never progress; this change does not provide exactly-once execution at external providers or replace worker restart recovery.

An explicit worker rejection preserves the job ID and reports `refund_status: refunded` only after the refund RPC confirms success (or an already-completed refund). Otherwise it reports `unconfirmed`. A failed job and a confirmed refund are separate facts.

The stdio proxy in `@agentmedia/mcp-server` 0.8.1 never automatically replays mutating or unknown tools after transport failure. It reconnects and retries known read-only tools once, and carries one request identity for generation calls. **Installed 0.8.0 binaries must be updated/restarted**; a hosted-server deployment cannot replace local code. The protection here applies to loose generation, not yet every fixed skill or third-party client retry loop.

## Deployment and verification

Apply `20260919180000_generation_request_receipts.sql` and then `20260920130000_atomic_generation_admission.sql` before the API release. The additive migrations leave legacy requests untouched. Deploy the API, then publish/update the stdio package; retain the migrations on application rollback. Updated API submission fails closed if its receipt lookup is unavailable.

API tests cover receipt replay, input conflicts, distinct intents/accounts, atomic debit rollback, atomic last-slot admission, lost commit responses, uncertain dispatch, terminal replay, and refund failure. PGlite executes the real receipt and credit-ledger SQL. CI additionally runs overlapping PostgreSQL 16 transactions using independent connections. Run the latter with a disposable PostgreSQL container via `PGTEST_CONTAINER=<container-id> bash scripts/test-generation-request-postgres.sh`; never use a production database for fixtures.

## Status lookup outages

A successful empty account-scoped job lookup returns 404. Database or network lookup failures return 503 with `STATUS_UNAVAILABLE`, the original `job_id`, and `Retry-After: 5`. Retry the status check for that job; do not submit another generation. MCP preserves this recovery guidance. If a live job stream is already open, it emits `job.error` with the same code and `retry_after_seconds: 5`, then closes; reconnect to the same job after that delay. This is a status-read failure, not evidence the generation failed, disappeared, or was refunded.
