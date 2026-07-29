// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  V1_MANDATORY_TOOL_CONTRACTS,
  generateV1ToolContractSchemas,
} from '@agentmedia/schema';
import { supabase } from '../../server.js';
import {
  type RuntimeBudget,
  type RuntimeGraphStep,
  executeRuntimeGraph,
} from '../../tooling/runtime-graph.js';
import { mandatoryToolRunner } from '../../tooling/tool-registry.js';
import {
  ToolingRunStore,
  createMarketplacePackage,
  createToolingRun,
  getToolingRun,
  installMarketplacePackage,
  listMarketplacePackages,
  listToolingRunSteps,
  rollbackMarketplaceInstall,
  updateToolingRunStatus,
} from '../../tooling/repository.js';
import { publishToolingRunEvent, subscribeToolingRunEvent } from '../../tooling/events.js';

const ToolingRunBudgetSchema = z.object({
  maxSteps: z.number().int().min(1).max(30).default(12),
  maxAttemptsPerStep: z.number().int().min(1).max(5).default(3),
  maxRuntimeMs: z.number().int().min(5_000).max(30 * 60_000).default(5 * 60_000),
});

const ToolingRunRequestSchema = z.object({
  context: z.record(z.unknown()).default({}),
  graph: z
    .array(
      z.object({
        id: z.string().min(1),
        toolId: z.enum(['actor_refs', 'scene_continuity', 'elevenlabs_audio', 'portrait_gpt2', 'selfie', 'subtitles']),
        dependsOn: z.array(z.string().min(1)).optional(),
        maxRetries: z.number().int().min(0).max(4).optional(),
        input: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .optional(),
  budget: ToolingRunBudgetSchema.default({
    maxSteps: 12,
    maxAttemptsPerStep: 3,
    maxRuntimeMs: 5 * 60_000,
  }),
});

const PublishSkillSchema = z.object({
  name: z.string().min(2).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)'),
  skill_json: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    entrypoint: z.string().min(1),
    tools: z.array(z.string().min(1)).min(1),
  }),
});

const InstallSkillSchema = z.object({
  package_id: z.string().uuid(),
  version_pin: z.string().regex(/^\d+\.\d+\.\d+$/, 'version pin must be semver'),
});

const RollbackSchema = z.object({
  package_name: z.string().min(2),
});

function parseApprovedCreators(): Set<string> {
  const raw = process.env.TOOLING_MARKETPLACE_APPROVED_CREATORS ?? '';
  return new Set(
    raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

function writeSse(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildDefaultMandatoryGraph(context: Record<string, unknown>): RuntimeGraphStep[] {
  const steps: RuntimeGraphStep[] = [
    {
      id: 'actor_refs',
      toolId: 'actor_refs',
      input: (context.actor_refs_input as Record<string, unknown> | undefined) ?? {},
    },
    {
      id: 'scene_continuity',
      toolId: 'scene_continuity',
      dependsOn: ['actor_refs'],
      input: (context.scene_continuity_input as Record<string, unknown> | undefined) ?? {},
    },
    {
      id: 'elevenlabs_audio',
      toolId: 'elevenlabs_audio',
      dependsOn: ['scene_continuity'],
      input: (context.elevenlabs_audio_input as Record<string, unknown> | undefined) ?? {},
    },
    {
      id: 'selfie',
      toolId: 'selfie',
      dependsOn: ['actor_refs', 'scene_continuity', 'elevenlabs_audio'],
      input: (context.selfie_input as Record<string, unknown> | undefined) ?? {},
    },
    {
      id: 'subtitles',
      toolId: 'subtitles',
      dependsOn: ['selfie'],
      input: (context.subtitles_input as Record<string, unknown> | undefined) ?? {},
    },
  ];
  return steps;
}

async function executeRunAsync(args: {
  runId: string;
  userId: string;
  authToken: string;
  graph: RuntimeGraphStep[];
  budget: RuntimeBudget;
  context: Record<string, unknown>;
}): Promise<void> {
  await updateToolingRunStatus(supabase, args.runId, 'running');
  void publishToolingRunEvent(supabase, {
    runId: args.runId,
    type: 'run_started',
    payload: { run_id: args.runId },
  }).catch(() => {});

  const store = new ToolingRunStore(supabase, args.runId);
  const result = await executeRuntimeGraph({
    steps: args.graph,
    budget: args.budget,
    store,
    runner: mandatoryToolRunner,
    context: {
      runId: args.runId,
      userId: args.userId,
      authToken: args.authToken,
      priorOutputs: args.context,
    },
    hooks: {
      onEvent: async (event) => {
        void publishToolingRunEvent(supabase, {
          runId: args.runId,
          type: event.type,
          payload: {
            step_id: event.stepId,
            tool_id: event.toolId,
            attempt: event.attempt,
            error: event.error,
            output: event.output,
          },
        }).catch(() => {});
      },
    },
  });

  if (result.status === 'completed') {
    await updateToolingRunStatus(supabase, args.runId, 'completed', {
      result: result.outputs,
      error_message: null,
    });
    void publishToolingRunEvent(supabase, {
      runId: args.runId,
      type: 'run_completed',
      payload: { outputs: result.outputs },
    }).catch(() => {});
    return;
  }

  await updateToolingRunStatus(supabase, args.runId, 'failed', {
    result: result.outputs,
    error_message: result.error ?? 'Run failed',
  });
  void publishToolingRunEvent(supabase, {
    runId: args.runId,
    type: 'run_failed',
    payload: { error: result.error ?? 'Run failed', failed_step_id: result.failedStepId },
  }).catch(() => {});
}

export async function toolingContractsRoute(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    version: 'v1',
    tools: Object.values(V1_MANDATORY_TOOL_CONTRACTS).map((t) => ({
      id: t.id,
      version: t.version,
      summary: t.summary,
    })),
    schemas: generateV1ToolContractSchemas(),
  });
}

export async function createToolingRunRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  const authToken = (req as any).authToken as string | undefined;
  if (!userId || !authToken) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const parsed = ToolingRunRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid request',
        issues: parsed.error.issues,
      },
    });
    return;
  }

  const runId = crypto.randomUUID();
  const body = parsed.data;
  const graph = body.graph ?? buildDefaultMandatoryGraph(body.context);
  const budget = body.budget;
  await createToolingRun(supabase, {
    id: runId,
    user_id: userId,
    graph,
    budget,
    context: body.context,
  });

  void executeRunAsync({
    runId,
    userId,
    authToken,
    graph,
    budget,
    context: body.context,
  }).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    await updateToolingRunStatus(supabase, runId, 'failed', { error_message: message });
    void publishToolingRunEvent(supabase, { runId, type: 'run_failed', payload: { error: message } }).catch(() => {});
  });

  res.status(202).json({
    run_id: runId,
    status: 'queued',
  });
}

export async function toolingRunStatusRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const rawRunId = req.params.runId;
  const runId = Array.isArray(rawRunId) ? rawRunId[0] : rawRunId;
  if (!runId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing runId path parameter' } });
    return;
  }
  const run = await getToolingRun(supabase, runId, userId);
  if (!run) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `Run ${runId} not found` } });
    return;
  }
  const steps = await listToolingRunSteps(supabase, runId);
  res.status(200).json({ run, steps });
}

export async function toolingRunStreamRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const rawRunId = req.params.runId;
  const runId = Array.isArray(rawRunId) ? rawRunId[0] : rawRunId;
  if (!runId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing runId path parameter' } });
    return;
  }
  const run = await getToolingRun(supabase, runId, userId);
  if (!run) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `Run ${runId} not found` } });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  writeSse(res, 'run.state', { status: run.status });
  const initialSteps = await listToolingRunSteps(supabase, runId);
  writeSse(res, 'run.steps', { steps: initialSteps });

  let closed = false;
  let unsubscribe: (() => Promise<void>) | null = null;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (poller) clearInterval(poller);
    if (unsubscribe) {
      void unsubscribe();
      unsubscribe = null;
    }
    if (!res.writableEnded) res.end();
  };

  req.on('close', cleanup);

  let lastDigest = JSON.stringify({ status: run.status, steps: initialSteps.length });
  const poller = setInterval(async () => {
    if (closed) return;
    const nextRun = await getToolingRun(supabase, runId, userId);
    const nextSteps = await listToolingRunSteps(supabase, runId);
    if (!nextRun) return;
    const digest = JSON.stringify({
      status: nextRun.status,
      steps: nextSteps.length,
      updated_at: nextRun.updated_at,
    });
    if (digest !== lastDigest) {
      lastDigest = digest;
      writeSse(res, 'run.state', { status: nextRun.status, error_message: nextRun.error_message });
      writeSse(res, 'run.steps', { steps: nextSteps });
      if (nextRun.status === 'completed' || nextRun.status === 'failed') cleanup();
    }
  }, 12_000);

  try {
    unsubscribe = await subscribeToolingRunEvent(supabase, runId, (event) => {
      if (closed) return;
      writeSse(res, 'run.event', event);
    });
  } catch {
    // Keep stream alive with polling fallback even if realtime event subscription fails.
  }
}

export async function publishMarketplaceSkillRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const parsed = PublishSkillSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload', issues: parsed.error.issues } });
    return;
  }

  const allowlist = parseApprovedCreators();
  const approvedCreator = allowlist.has(userId);
  const reviewState = approvedCreator ? 'approved' : 'pending';
  const row = await createMarketplacePackage(supabase, {
    creatorId: userId,
    name: parsed.data.name,
    version: parsed.data.version,
    skillJson: parsed.data.skill_json,
    reviewState,
    approvedCreator,
  });
  res.status(201).json({
    package_id: row.id,
    review_state: reviewState,
    approved_creator: approvedCreator,
  });
}

export async function listMarketplaceSkillsRoute(_req: Request, res: Response): Promise<void> {
  const rows = await listMarketplacePackages(supabase);
  res.status(200).json({ packages: rows });
}

export async function installMarketplaceSkillRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const parsed = InstallSkillSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload', issues: parsed.error.issues } });
    return;
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from('tooling_skill_packages')
    .select('id,version,review_state,approved_creator')
    .eq('id', parsed.data.package_id)
    .maybeSingle();
  if (pkgErr || !pkg) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
    return;
  }
  if (pkg.review_state !== 'approved' || !pkg.approved_creator) {
    res.status(403).json({ error: { code: 'REVIEW_REQUIRED', message: 'Package is not approved for installation' } });
    return;
  }
  if (pkg.version !== parsed.data.version_pin) {
    res.status(409).json({ error: { code: 'VERSION_MISMATCH', message: `Requested ${parsed.data.version_pin}, latest approved is ${pkg.version}` } });
    return;
  }

  const row = await installMarketplacePackage(supabase, {
    userId,
    packageId: parsed.data.package_id,
    versionPin: parsed.data.version_pin,
  });
  res.status(201).json({
    install_id: row.installId,
    package_id: parsed.data.package_id,
    pinned_version: parsed.data.version_pin,
    status: 'installed',
  });
}

export async function rollbackMarketplaceSkillRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const parsed = RollbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payload', issues: parsed.error.issues } });
    return;
  }
  const rollback = await rollbackMarketplaceInstall(supabase, {
    userId,
    packageName: parsed.data.package_name,
  });
  res.status(200).json({
    package_name: parsed.data.package_name,
    rolled_back_install_id: rollback.rolledBackInstallId,
    restored_install_id: rollback.restoredInstallId,
  });
}
