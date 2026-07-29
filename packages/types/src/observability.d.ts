/**
 * Observability and monitoring types for the agent-media platform.
 *
 * Covers circuit breaker health tracking, alert management, credit
 * reconciliation, and system health summaries. These types are consumed
 * by Edge Functions, the CLI, and the admin dashboard.
 */
/**
 * Possible states of a provider circuit breaker.
 *
 * - `closed`    -- healthy, requests flow normally
 * - `open`      -- tripped, all requests are rejected immediately
 * - `half_open` -- recovery probe, one request allowed through to test
 */
export type CircuitState = 'closed' | 'open' | 'half_open';
/**
 * Health record for a single upstream AI provider.
 *
 * Tracks circuit breaker state, failure counts, lifetime counters,
 * and latency metrics. Maps to the `provider_health` database table.
 */
export interface ProviderHealth {
    /** Unique record identifier (UUID). */
    id: string;
    /** Provider identifier matching provider_configs.provider_slug (e.g., 'kie-ai'). */
    providerSlug: string;
    /** Current circuit breaker state. */
    circuitState: CircuitState;
    /** Number of failures recorded within the current rolling window. */
    failureCount: number;
    /** Number of failures required to trip the breaker from closed to open. */
    failureThreshold: number;
    /** Duration of the rolling failure window in seconds. */
    failureWindowSeconds: number;
    /** Seconds to wait in open state before transitioning to half_open. */
    recoveryTimeoutSeconds: number;
    /** Total number of requests routed to this provider (all time). */
    totalRequests: number;
    /** Total number of failed requests (all time). */
    totalFailures: number;
    /** Total number of successful requests (all time). */
    totalSuccesses: number;
    /** Exponential moving average of provider response latency in milliseconds. */
    avgLatencyMs: number | null;
    /** Approximate 99th percentile latency in milliseconds. */
    p99LatencyMs: number | null;
    /** When the circuit breaker was last tripped to open state (ISO 8601). */
    openedAt: string | null;
    /** Start of the current rolling failure window (ISO 8601). */
    failureWindowStart: string | null;
    /** When the most recent failure occurred (ISO 8601). */
    lastFailureAt: string | null;
    /** When the most recent success occurred (ISO 8601). */
    lastSuccessAt: string | null;
    /** Record creation timestamp (ISO 8601). */
    createdAt: string;
    /** Record last-update timestamp (ISO 8601). */
    updatedAt: string;
}
/**
 * Categories of automated alerts supported by the observability system.
 */
export type AlertType = 'error_rate' | 'webhook_failure' | 'credit_discrepancy' | 'provider_latency' | 'circuit_breaker_open';
/**
 * Severity levels for fired alerts.
 *
 * - `info`     -- informational, no immediate action required
 * - `warning`  -- degraded performance, investigate soon
 * - `critical` -- service-impacting issue, immediate action required
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';
/**
 * Configurable threshold for a single alert type.
 *
 * Maps to the `alert_thresholds` database table. Operators tune these
 * values to control alert sensitivity without code changes.
 */
export interface AlertThreshold {
    /** Unique record identifier (UUID). */
    id: string;
    /** The alert category this threshold applies to. */
    alertType: AlertType;
    /** Numeric threshold that triggers the alert (interpretation is alert-type-specific). */
    thresholdValue: number;
    /** Evaluation window in minutes over which the metric is computed. */
    windowMinutes: number;
    /** Minimum minutes between consecutive firings of the same alert type. */
    cooldownMinutes: number;
    /** Whether this alert is actively being evaluated. */
    isEnabled: boolean;
    /** Record creation timestamp (ISO 8601). */
    createdAt: string;
    /** Record last-update timestamp (ISO 8601). */
    updatedAt: string;
}
/**
 * A single fired alert event.
 *
 * Immutable once created. Maps to the `alert_events` database table.
 */
export interface AlertEvent {
    /** Unique event identifier (UUID). */
    id: string;
    /** The alert category that fired. */
    alertType: AlertType;
    /** Severity of the alert. */
    severity: AlertSeverity;
    /** Human-readable description of what triggered the alert. */
    message: string;
    /** Alert-specific payload (metrics snapshot, affected resources, etc.). */
    details: Record<string, unknown>;
    /** Whether the alert has been reviewed by an operator. */
    acknowledged: boolean;
    /** When the alert was acknowledged (ISO 8601), if applicable. */
    acknowledgedAt: string | null;
    /** User ID of the operator who acknowledged the alert, if applicable. */
    acknowledgedBy: string | null;
    /** When the alert was fired (ISO 8601). */
    createdAt: string;
}
/**
 * A single entry in the credit reconciliation audit log.
 *
 * Created by the `reconcile_credits()` stored procedure when a
 * discrepancy is detected between the credit_transactions ledger
 * and the user_credits balances table.
 */
export interface CreditReconciliationEntry {
    /** Unique record identifier (UUID). */
    id: string;
    /** The user whose credits were reconciled. */
    userId: string;
    /** Expected plan credits computed from the transaction ledger. */
    expectedPlanCredits: number;
    /** Expected purchased credits computed from the transaction ledger. */
    expectedPurchasedCredits: number;
    /** Actual plan credits read from user_credits. */
    actualPlanCredits: number;
    /** Actual purchased credits read from user_credits. */
    actualPurchasedCredits: number;
    /** Difference: expected - actual plan credits (zero = no drift). */
    planCreditDiscrepancy: number;
    /** Difference: expected - actual purchased credits (zero = no drift). */
    purchasedCreditDiscrepancy: number;
    /** Whether the discrepancy has been reviewed and resolved. */
    isReconciled: boolean;
    /** When the reconciliation entry was created (ISO 8601). */
    createdAt: string;
}
/**
 * Aggregated system health summary for the admin dashboard.
 *
 * This is a computed view (not a database table) assembled by the
 * system-health Edge Function from multiple source tables.
 */
export interface SystemHealthSummary {
    /** Overall system status derived from provider health and alert state. */
    status: 'healthy' | 'degraded' | 'critical';
    /** Health records for all configured providers. */
    providers: ProviderHealth[];
    /** Count of unacknowledged alerts grouped by severity. */
    alertCounts: {
        info: number;
        warning: number;
        critical: number;
    };
    /** Most recent unacknowledged alert events (up to 10). */
    recentAlerts: AlertEvent[];
    /** Latest credit reconciliation results. */
    reconciliation: {
        /** When the last reconciliation ran (ISO 8601). */
        lastRunAt: string | null;
        /** Number of users with unresolved discrepancies. */
        unresolvedCount: number;
    };
    /** ISO 8601 timestamp when this summary was generated. */
    generatedAt: string;
}
//# sourceMappingURL=observability.d.ts.map