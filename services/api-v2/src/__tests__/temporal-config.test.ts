import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOrchestratorEngine,
  getTemporalConfig,
  getReconcilerConfig,
} from '../orchestrator/temporal/config.js';

const ENV_KEYS = [
  'ORCHESTRATOR_ENGINE',
  'TEMPORAL_ADDRESS',
  'TEMPORAL_NAMESPACE',
  'TEMPORAL_API_KEY',
  'TEMPORAL_TLS',
  'TEMPORAL_TLS_SERVER_NAME',
  'TEMPORAL_SELFIE_TASK_QUEUE',
  'TEMPORAL_CONNECT_TIMEOUT_MS',
  'TEMPORAL_START_TIMEOUT_MS',
  'TEMPORAL_WORKFLOW_EXECUTION_TIMEOUT_MS',
  'ORCHESTRATOR_RECONCILER_ENABLED',
  'ORCHESTRATOR_RECONCILER_INTERVAL_MS',
  'ORCHESTRATOR_RECONCILER_THRESHOLD_MINUTES',
  'ORCHESTRATOR_RECONCILER_PROCESSING_THRESHOLD_MINUTES',
] as const;

const originalEnv = new Map<string, string | undefined>();

describe('temporal config', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults orchestrator engine to http', () => {
    expect(getOrchestratorEngine()).toBe('http');
  });

  it('recognizes temporal orchestrator engine', () => {
    process.env.ORCHESTRATOR_ENGINE = 'temporal';
    expect(getOrchestratorEngine()).toBe('temporal');
  });

  it('requires temporal address and namespace', () => {
    process.env.ORCHESTRATOR_ENGINE = 'temporal';
    expect(() => getTemporalConfig()).toThrow(/TEMPORAL_ADDRESS/);

    process.env.TEMPORAL_ADDRESS = 'example.tmprl.cloud:7233';
    expect(() => getTemporalConfig()).toThrow(/TEMPORAL_NAMESPACE/);
  });

  it('uses default task queue when not provided', () => {
    process.env.TEMPORAL_ADDRESS = 'example.tmprl.cloud:7233';
    process.env.TEMPORAL_NAMESPACE = 'agent-media.test';
    const cfg = getTemporalConfig();
    expect(cfg.taskQueue).toBe('selfie-v1');
  });

  it('returns optional temporal settings when provided', () => {
    process.env.TEMPORAL_ADDRESS = 'example.tmprl.cloud:7233';
    process.env.TEMPORAL_NAMESPACE = 'agent-media.test';
    process.env.TEMPORAL_API_KEY = 'abc';
    process.env.TEMPORAL_TLS_SERVER_NAME = 'example.tmprl.cloud';
    process.env.TEMPORAL_SELFIE_TASK_QUEUE = 'selfie-custom';

    const cfg = getTemporalConfig();
    expect(cfg).toMatchObject({
      address: 'example.tmprl.cloud:7233',
      namespace: 'agent-media.test',
      apiKey: 'abc',
      tlsEnabled: true,
      tlsServerName: 'example.tmprl.cloud',
      taskQueue: 'selfie-custom',
    });
  });

  it('allows disabling temporal tls for local dev', () => {
    process.env.TEMPORAL_ADDRESS = 'localhost:7233';
    process.env.TEMPORAL_NAMESPACE = 'default';
    process.env.TEMPORAL_TLS = 'false';
    const cfg = getTemporalConfig();
    expect(cfg.tlsEnabled).toBe(false);
  });

  it('exposes safe default timeouts for connect/start/workflow', () => {
    process.env.TEMPORAL_ADDRESS = 'localhost:7233';
    process.env.TEMPORAL_NAMESPACE = 'default';
    const cfg = getTemporalConfig();
    expect(cfg.connectTimeoutMs).toBe(10_000);
    expect(cfg.startTimeoutMs).toBe(10_000);
    expect(cfg.workflowExecutionTimeoutMs).toBe(20 * 60_000);
  });

  it('honors env overrides for timeouts and ignores garbage values', () => {
    process.env.TEMPORAL_ADDRESS = 'localhost:7233';
    process.env.TEMPORAL_NAMESPACE = 'default';
    process.env.TEMPORAL_CONNECT_TIMEOUT_MS = '5000';
    process.env.TEMPORAL_START_TIMEOUT_MS = 'not-a-number';
    process.env.TEMPORAL_WORKFLOW_EXECUTION_TIMEOUT_MS = '-7';

    const cfg = getTemporalConfig();
    expect(cfg.connectTimeoutMs).toBe(5000);
    expect(cfg.startTimeoutMs).toBe(10_000); // garbage → fallback
    expect(cfg.workflowExecutionTimeoutMs).toBe(20 * 60_000); // negative → fallback
  });

  it('reconciler defaults: off for http engine, on for temporal engine', () => {
    expect(getReconcilerConfig().enabled).toBe(false);
    process.env.ORCHESTRATOR_ENGINE = 'temporal';
    expect(getReconcilerConfig().enabled).toBe(true);
  });

  it('reconciler respects explicit enable/disable overrides', () => {
    process.env.ORCHESTRATOR_ENGINE = 'temporal';
    process.env.ORCHESTRATOR_RECONCILER_ENABLED = 'false';
    expect(getReconcilerConfig().enabled).toBe(false);

    process.env.ORCHESTRATOR_ENGINE = 'http';
    process.env.ORCHESTRATOR_RECONCILER_ENABLED = 'true';
    expect(getReconcilerConfig().enabled).toBe(true);
  });

  it('reconciler defaults: 60s interval, 5-min submit threshold, 20-min processing threshold', () => {
    const cfg = getReconcilerConfig();
    expect(cfg.intervalMs).toBe(60_000);
    expect(cfg.thresholdMinutes).toBe(5);
    expect(cfg.processingThresholdMinutes).toBe(20);
  });

  it('reconciler honors interval and threshold env overrides', () => {
    process.env.ORCHESTRATOR_RECONCILER_INTERVAL_MS = '15000';
    process.env.ORCHESTRATOR_RECONCILER_THRESHOLD_MINUTES = '3';
    process.env.ORCHESTRATOR_RECONCILER_PROCESSING_THRESHOLD_MINUTES = '18';
    const cfg = getReconcilerConfig();
    expect(cfg.intervalMs).toBe(15_000);
    expect(cfg.thresholdMinutes).toBe(3);
    expect(cfg.processingThresholdMinutes).toBe(18);
  });
});
