// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, it, expect } from 'vitest';
import {
  executeRuntimeGraph,
  type RuntimeCheckpointStore,
  type RuntimeStepCheckpoint,
} from '../tooling/runtime-graph.js';

class MemoryStore implements RuntimeCheckpointStore {
  private readonly map = new Map<string, RuntimeStepCheckpoint>();

  async get(stepId: string): Promise<RuntimeStepCheckpoint | null> {
    return this.map.get(stepId) ?? null;
  }

  async set(checkpoint: RuntimeStepCheckpoint): Promise<void> {
    this.map.set(checkpoint.stepId, checkpoint);
  }
}

describe('runtime graph', () => {
  it('retries failed step and persists completion checkpoint', async () => {
    const store = new MemoryStore();
    let attempts = 0;
    const result = await executeRuntimeGraph({
      steps: [{ id: 'a', toolId: 'tool.a', maxRetries: 2 }],
      budget: { maxSteps: 5, maxAttemptsPerStep: 3, maxRuntimeMs: 10_000 },
      store,
      runner: {
        async run() {
          attempts += 1;
          if (attempts < 2) throw new Error('flaky');
          return { ok: true };
        },
      },
      context: {
        runId: 'run-1',
        userId: 'user-1',
        authToken: 'token',
        priorOutputs: {},
      },
    });

    expect(result.status).toBe('completed');
    expect(attempts).toBe(2);
    expect(await store.get('a')).toMatchObject({ status: 'completed', attempt: 2 });
  });

  it('skips already-completed checkpoints (idempotent resume)', async () => {
    const store = new MemoryStore();
    await store.set({
      stepId: 'a',
      status: 'completed',
      attempt: 1,
      output: { reused: true },
      updatedAt: new Date().toISOString(),
    });
    let called = 0;
    const result = await executeRuntimeGraph({
      steps: [
        { id: 'a', toolId: 'tool.a' },
        { id: 'b', toolId: 'tool.b', dependsOn: ['a'] },
      ],
      budget: { maxSteps: 5, maxAttemptsPerStep: 2, maxRuntimeMs: 10_000 },
      store,
      runner: {
        async run(toolId) {
          called += 1;
          return { toolId };
        },
      },
      context: {
        runId: 'run-2',
        userId: 'user-1',
        authToken: 'token',
        priorOutputs: {},
      },
    });

    expect(result.status).toBe('completed');
    expect(called).toBe(1);
    expect(result.outputs.a).toEqual({ reused: true });
    expect(result.outputs.b).toEqual({ toolId: 'tool.b' });
  });

  it('fails when budget max steps exceeded', async () => {
    const store = new MemoryStore();
    const result = await executeRuntimeGraph({
      steps: [
        { id: 'a', toolId: 'tool.a' },
        { id: 'b', toolId: 'tool.b' },
      ],
      budget: { maxSteps: 1, maxAttemptsPerStep: 1, maxRuntimeMs: 10_000 },
      store,
      runner: {
        async run() {
          return {};
        },
      },
      context: {
        runId: 'run-3',
        userId: 'user-1',
        authToken: 'token',
        priorOutputs: {},
      },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('RUNTIME_BUDGET_EXCEEDED');
  });
});
