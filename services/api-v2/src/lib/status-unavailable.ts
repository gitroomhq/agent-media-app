// Copyright 2026 agent-media contributors. Apache-2.0 license.
export const STATUS_RETRY_SECONDS = 5;
export function statusUnavailable(jobId: string) {
  return {
    code: 'STATUS_UNAVAILABLE',
    message: 'Job status is temporarily unavailable. Retry this same job after a short wait. Do not submit another generation.',
    job_id: jobId,
    retry_after_seconds: STATUS_RETRY_SECONDS,
  };
}
