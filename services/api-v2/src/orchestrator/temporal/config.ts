// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Runtime engine selector.
 * - http: legacy direct dispatch to media-worker-v2
 * - temporal: durable workflow dispatch
 */
export type OrchestratorEngine = 'http' | 'temporal';

export interface TemporalConfig {
  address: string;
  namespace: string;
  apiKey?: string;
  tlsEnabled: boolean;
  tlsServerName?: string;
  taskQueue: string;
  /** Hard ceiling for `Connection.connect()` to keep HTTP requests from hanging. */
  connectTimeoutMs: number;
  /** Hard ceiling for `workflow.start()` request itself (RPC, not workflow runtime). */
  startTimeoutMs: number;
  /** End-to-end workflow timeout set on Temporal so a workflow with no
   *  worker / failing activity is reaped server-side instead of dangling. */
  workflowExecutionTimeoutMs: number;
}

export interface ReconcilerConfig {
  enabled: boolean;
  /** How often to call `recover_stuck_jobs` from inside api-v2. */
  intervalMs: number;
  /** Threshold (minutes) for stale submitted dispatch handoffs. */
  thresholdMinutes: number;
  /** Threshold (minutes) passed to `recover_stuck_jobs(p_timeout_minutes)`. */
  processingThresholdMinutes: number;
}

export function getOrchestratorEngine(): OrchestratorEngine {
  const raw = (process.env.ORCHESTRATOR_ENGINE ?? 'http').toLowerCase().trim();
  return raw === 'temporal' ? 'temporal' : 'http';
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getTemporalConfig(): TemporalConfig {
  const address = process.env.TEMPORAL_ADDRESS?.trim();
  const namespace = process.env.TEMPORAL_NAMESPACE?.trim();
  const taskQueue = process.env.TEMPORAL_SELFIE_TASK_QUEUE?.trim() || 'selfie-v1';
  const tlsEnabled = (process.env.TEMPORAL_TLS ?? 'true').toLowerCase() !== 'false';

  if (!address) {
    throw new Error('TEMPORAL_ADDRESS is required when ORCHESTRATOR_ENGINE=temporal');
  }
  if (!namespace) {
    throw new Error('TEMPORAL_NAMESPACE is required when ORCHESTRATOR_ENGINE=temporal');
  }

  return {
    address,
    namespace,
    apiKey: process.env.TEMPORAL_API_KEY?.trim() || undefined,
    tlsEnabled,
    tlsServerName: process.env.TEMPORAL_TLS_SERVER_NAME?.trim() || undefined,
    taskQueue,
    connectTimeoutMs: readPositiveInt('TEMPORAL_CONNECT_TIMEOUT_MS', 10_000),
    startTimeoutMs: readPositiveInt('TEMPORAL_START_TIMEOUT_MS', 10_000),
    workflowExecutionTimeoutMs: readPositiveInt(
      'TEMPORAL_WORKFLOW_EXECUTION_TIMEOUT_MS',
      20 * 60_000,
    ),
  };
}

/**
 * Reconciler defaults are deliberately conservative:
 *   - Enabled by default in the temporal engine (where stuck-submitted is
 *     the failure mode we're protecting against).
 *   - 60s interval — tighter than the pg_cron 5-min cadence so a Temporal
 *     handoff failure resolves within ~6 minutes instead of ~60.
 *   - 5-minute threshold so a normal Temporal dispatch + activity retry
 *     window (~2 minutes worst-case) is not falsely flagged.
 *   - 20-minute processing threshold so long selfie pipelines are not
 *     misclassified as stuck while still in progress.
 */
export function getReconcilerConfig(): ReconcilerConfig {
  const rawEnabled = process.env.ORCHESTRATOR_RECONCILER_ENABLED?.toLowerCase().trim();
  const defaultEnabled = getOrchestratorEngine() === 'temporal';
  const enabled = rawEnabled === undefined || rawEnabled === ''
    ? defaultEnabled
    : !(rawEnabled === 'false' || rawEnabled === '0' || rawEnabled === 'no');
  return {
    enabled,
    intervalMs: readPositiveInt('ORCHESTRATOR_RECONCILER_INTERVAL_MS', 60_000),
    thresholdMinutes: readPositiveInt('ORCHESTRATOR_RECONCILER_THRESHOLD_MINUTES', 5),
    processingThresholdMinutes: readPositiveInt(
      'ORCHESTRATOR_RECONCILER_PROCESSING_THRESHOLD_MINUTES',
      20,
    ),
  };
}
