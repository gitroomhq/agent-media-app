/**
 * Webhook lifecycle types for the agent-media platform.
 *
 * These types cover the full webhook processing pipeline: incoming
 * provider payloads, checkpoint-based idempotent state tracking,
 * parsed webhook events, and dead-letter entries for failed deliveries.
 */
/**
 * Ordered checkpoint states for the webhook state machine.
 *
 * Each generation job progresses through these checkpoints as webhook
 * callbacks arrive from the provider. The ordering enforces idempotency:
 * a checkpoint can only advance forward (except 'failed', which can
 * override any state).
 *
 * Ordering: none(0) → received(1) → processing(2) → media_received(3) → completed(4) | failed(5)
 */
export type WebhookCheckpoint = 'none' | 'received' | 'processing' | 'media_received' | 'completed' | 'failed';
/**
 * Numeric ordering of webhook checkpoints for idempotent comparison.
 * Used by the `update_job_checkpoint` stored procedure.
 */
export declare const WEBHOOK_CHECKPOINT_ORDER: Record<WebhookCheckpoint, number>;
/**
 * Normalized payload received from a provider webhook callback.
 *
 * Each provider adapter is responsible for mapping its raw webhook
 * format into this common structure before the webhook handler
 * processes it.
 */
export interface WebhookPayload {
    /** Provider identifier (e.g., 'kie', 'fal', 'replicate'). */
    provider_slug: string;
    /** Provider-assigned job identifier. Maps to generation_jobs.provider_job_id. */
    provider_job_id: string;
    /** Current job status as reported by the provider. */
    status: string;
    /** URL of the generated media file (present on completion). */
    media_url?: string;
    /** URL of the generated thumbnail image (present on completion). */
    thumbnail_url?: string;
    /** Error message from the provider (present on failure). */
    error?: string;
    /** Provider-specific metadata not captured by other fields. */
    metadata?: Record<string, unknown>;
}
/**
 * A fully parsed and validated webhook event, ready for processing.
 *
 * Created after the raw HTTP request has been verified (signature check)
 * and the payload has been normalized into {@link WebhookPayload}.
 */
export interface WebhookEvent {
    /** Unique event identifier (generated server-side). */
    id: string;
    /** Normalized payload from the provider. */
    payload: WebhookPayload;
    /** The target checkpoint this event should advance the job to. */
    checkpoint: WebhookCheckpoint;
    /** ISO 8601 timestamp when the event was received. */
    receivedAt: string;
    /** Raw request headers for audit/debugging purposes. */
    headers?: Record<string, string>;
}
/**
 * A dead-letter webhook entry for payloads that failed processing.
 *
 * Matches the `dead_letter_webhooks` table schema. Entries are retried
 * on a schedule via pg_cron until `max_retries` is exhausted, at which
 * point the status transitions to 'exhausted'.
 */
export interface DeadLetterEntry {
    /** Unique identifier (UUID). */
    id: string;
    /** Provider that sent the original webhook. */
    provider_slug: string;
    /** The raw webhook payload that failed processing. */
    payload: Record<string, unknown>;
    /** Human-readable error message describing the failure. */
    error_message: string | null;
    /** Number of retry attempts made so far. */
    retry_count: number;
    /** Maximum number of retries before marking as exhausted. */
    max_retries: number;
    /** ISO 8601 timestamp of the next scheduled retry attempt. */
    next_retry_at: string | null;
    /** Current processing status of the dead-letter entry. */
    status: 'pending' | 'retrying' | 'exhausted' | 'resolved';
    /** ISO 8601 timestamp when the entry was created. */
    created_at: string;
    /** ISO 8601 timestamp when the entry was last updated. */
    updated_at: string | null;
}
//# sourceMappingURL=webhook.d.ts.map