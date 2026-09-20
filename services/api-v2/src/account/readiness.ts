// Copyright 2026 agent-media contributors. Apache-2.0 license.
export const ACCOUNT_READINESS_GUIDANCE = 'Before the first generation, call get_account to confirm this connection and read available credits. If get_account is absent from a cached tool catalog, list_models includes the same account check. Then call quote with the intended inputs and compare the quoted credits to the available balance before submitting. A public model catalog or an upload alone does not prove credit readiness. If the balance check is unavailable, retry it; do not assume zero credits or ask the user to pay again. A balance snapshot does not reserve credits or guarantee provider availability. Upload-only requests do not need generation credits.';
export const getAccountTool = {
  name: 'get_account',
  description: 'Check this authenticated connection, available generation credits, and whether generation/upload services are configured. Free and read-only: does not create an upload session, generate media, refill credits or change billing. Call before the first generation; then quote the intended inputs and compare the cost with the balance. A positive balance is not a guarantee of sufficient funds for a specific request or provider availability.',
  inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  annotations: { title: 'Check Account Readiness', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
