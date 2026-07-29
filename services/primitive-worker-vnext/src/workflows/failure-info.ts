// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Extract a stable {code,message} from a workflow-level catch. Temporal wraps an
 * activity's ApplicationFailure as the `cause` of the error the workflow sees, so
 * the real classification (e.g. INSUFFICIENT_CREDITS, EVOLINK_422) lives there.
 * Pure + isolate-safe (no Date/crypto/Node APIs).
 */
export function failureInfo(err: unknown): { code: string; message: string } {
  const cause = (err as { cause?: { type?: string | null; message?: string } } | null)?.cause;
  const code = (cause?.type ?? undefined) || 'FAILED';
  const message = (
    cause?.message || (err instanceof Error ? err.message : String(err))
  ).slice(0, 500);
  return { code, message };
}
