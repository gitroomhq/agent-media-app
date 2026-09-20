# Account readiness

Before the first generation in a session, call the hosted MCP tool `get_account`.
Older connector catalogs can call `list_models`, which includes the same check.
The authenticated HTTP equivalent is `GET /v1/me/readiness`.

This check reads the caller's monthly and purchased credit buckets. It does not
refill, reserve or spend credits, create an upload session, or change billing.
It introduces no free generation plan.

- `quote_required`: quote the intended inputs and compare the cost to the balance,
  within the user's approved budget, before submitting.
- `needs_credits`: no available credits were found; check billing before generation.
- `not_configured`: the generation worker configuration is missing. Purchasing
  credits will not fix this service issue.
- HTTP 401: reconnect.
- HTTP 503: the balance is unknown, not zero. Retry after five seconds; do not
  ask the user to purchase again merely because this check failed.

A balance snapshot is not a reservation. Provider availability and upload storage
health are not probed. Upload-only requests do not require generation credits.
