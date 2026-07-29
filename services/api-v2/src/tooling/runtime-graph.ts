// Copyright 2026 agent-media contributors. Apache-2.0 license.

export type RuntimeStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface RuntimeGraphStep {
  id: string;
  toolId: string;
  dependsOn?: string[];
  maxRetries?: number;
  input?: Record<string, unknown>;
}

export interface RuntimeBudget {
  maxSteps: number;
  maxAttemptsPerStep: number;
  maxRuntimeMs: number;
}

export interface RuntimeStepCheckpoint {
  stepId: string;
  status: RuntimeStepStatus;
  attempt: number;
  output?: unknown;
  error?: string;
  updatedAt: string;
}

export interface RuntimeCheckpointStore {
  get(stepId: string): Promise<RuntimeStepCheckpoint | null>;
  set(checkpoint: RuntimeStepCheckpoint): Promise<void>;
}

export interface RuntimeExecutionContext {
  runId: string;
  userId: string;
  authToken: string;
  priorOutputs: Record<string, unknown>;
}

export interface RuntimeToolRunner {
  run(toolId: string, input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown>;
}

export interface RuntimeExecutionEvent {
  type: 'step_started' | 'step_completed' | 'step_failed' | 'run_failed' | 'run_completed';
  runId: string;
  stepId?: string;
  toolId?: string;
  attempt?: number;
  error?: string;
  output?: unknown;
}

export interface RuntimeExecutionHooks {
  onEvent?: (event: RuntimeExecutionEvent) => Promise<void> | void;
}

export interface RuntimeExecutionResult {
  status: 'completed' | 'failed';
  outputs: Record<string, unknown>;
  failedStepId?: string;
  error?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function topoSort(steps: RuntimeGraphStep[]): RuntimeGraphStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const temp = new Set<string>();
  const perm = new Set<string>();
  const out: RuntimeGraphStep[] = [];

  function visit(stepId: string): void {
    if (perm.has(stepId)) return;
    if (temp.has(stepId)) {
      throw new Error(`RUNTIME_GRAPH_CYCLE: detected dependency cycle at "${stepId}"`);
    }
    const step = byId.get(stepId);
    if (!step) throw new Error(`RUNTIME_GRAPH_INVALID: unknown step "${stepId}"`);
    temp.add(stepId);
    for (const dep of step.dependsOn ?? []) visit(dep);
    temp.delete(stepId);
    perm.add(stepId);
    out.push(step);
  }

  for (const step of steps) visit(step.id);
  return out;
}

export async function executeRuntimeGraph(args: {
  steps: RuntimeGraphStep[];
  budget: RuntimeBudget;
  store: RuntimeCheckpointStore;
  runner: RuntimeToolRunner;
  context: RuntimeExecutionContext;
  hooks?: RuntimeExecutionHooks;
}): Promise<RuntimeExecutionResult> {
  const ordered = topoSort(args.steps);
  if (ordered.length > args.budget.maxSteps) {
    return {
      status: 'failed',
      outputs: args.context.priorOutputs,
      error: `RUNTIME_BUDGET_EXCEEDED: graph has ${ordered.length} steps, budget max is ${args.budget.maxSteps}`,
    };
  }

  const startedAt = Date.now();
  const outputs = { ...args.context.priorOutputs };

  for (const step of ordered) {
    if (Date.now() - startedAt > args.budget.maxRuntimeMs) {
      await args.hooks?.onEvent?.({
        type: 'run_failed',
        runId: args.context.runId,
        error: `RUNTIME_TIMEOUT: exceeded ${args.budget.maxRuntimeMs}ms`,
      });
      return {
        status: 'failed',
        outputs,
        failedStepId: step.id,
        error: `RUNTIME_TIMEOUT: exceeded ${args.budget.maxRuntimeMs}ms`,
      };
    }

    const checkpoint = await args.store.get(step.id);
    if (checkpoint?.status === 'completed') {
      outputs[step.id] = checkpoint.output;
      continue;
    }

    const maxRetries = Math.min(
      step.maxRetries ?? args.budget.maxAttemptsPerStep - 1,
      args.budget.maxAttemptsPerStep - 1,
    );
    const maxAttempts = Math.max(1, maxRetries + 1);
    let lastError = '';
    let completed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await args.store.set({
        stepId: step.id,
        status: 'running',
        attempt,
        updatedAt: nowIso(),
      });
      await args.hooks?.onEvent?.({
        type: 'step_started',
        runId: args.context.runId,
        stepId: step.id,
        toolId: step.toolId,
        attempt,
      });

      try {
        const input = { ...(step.input ?? {}), _deps: outputs };
        const output = await args.runner.run(step.toolId, input, {
          ...args.context,
          priorOutputs: outputs,
        });
        await args.store.set({
          stepId: step.id,
          status: 'completed',
          attempt,
          output,
          updatedAt: nowIso(),
        });
        outputs[step.id] = output;
        completed = true;
        await args.hooks?.onEvent?.({
          type: 'step_completed',
          runId: args.context.runId,
          stepId: step.id,
          toolId: step.toolId,
          attempt,
          output,
        });
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await args.store.set({
          stepId: step.id,
          status: 'failed',
          attempt,
          error: lastError,
          updatedAt: nowIso(),
        });
        await args.hooks?.onEvent?.({
          type: 'step_failed',
          runId: args.context.runId,
          stepId: step.id,
          toolId: step.toolId,
          attempt,
          error: lastError,
        });
      }
    }

    if (!completed) {
      await args.hooks?.onEvent?.({
        type: 'run_failed',
        runId: args.context.runId,
        stepId: step.id,
        error: lastError || 'Step failed',
      });
      return {
        status: 'failed',
        outputs,
        failedStepId: step.id,
        error: lastError || 'Step failed',
      };
    }
  }

  await args.hooks?.onEvent?.({
    type: 'run_completed',
    runId: args.context.runId,
    output: outputs,
  });
  return { status: 'completed', outputs };
}
