// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { PortraitGpt2ToolInputSchema, CharacterSheetGpt2ToolInputSchema } from '@agentmedia/schema';
import { supabase } from '../../server.js';
import { getTemporalClient } from '../../orchestrator/temporal/client.js';
import { getTemporalConfig } from '../../orchestrator/temporal/config.js';
import { withTimeout } from '../../orchestrator/temporal/timeout.js';

/**
 * Task queue for the vNext primitive worker. Intentionally separate from
 * the legacy selfie-v1 queue so the two runtimes can coexist.
 */
function getPrimitiveTaskQueue(): string {
  return process.env.TEMPORAL_PRIMITIVE_TASK_QUEUE?.trim() || 'primitive-vnext-v1';
}

/**
 * `true` when the vNext primitive surface should be exposed.
 * Defaults closed; flip on per environment via env var.
 */
export function isPrimitivesRouteEnabled(): boolean {
  const raw = process.env.VNEXT_PRIMITIVES_ENABLED?.toLowerCase().trim();
  return raw === 'true' || raw === '1';
}

interface PortraitGpt2ActivityInputShape {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  input: unknown;
}

export async function portraitGpt2PrimitiveRoute(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const parsed = PortraitGpt2ToolInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_input',
      detail: parsed.error.flatten(),
    });
    return;
  }

  const idempotencyKey = readIdempotencyKey(req);

  // Idempotency-Key handling: if the caller has used this key for
  // portrait_gpt2 before, return the existing run instead of starting
  // a new workflow (and re-charging the user). Without this, the
  // partial unique on (user_id, primitive_id, idempotency_key) would
  // raise a hard error on the second call.
  if (idempotencyKey) {
    const { data: existing, error: existingErr } = await supabase
      .from('primitive_runs')
      .select('id, status')
      .eq('user_id', userId)
      .eq('primitive_id', 'portrait_gpt2')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingErr) {
      res.status(500).json({
        error: 'idempotency_lookup_failed',
        detail: existingErr.message,
      });
      return;
    }
    if (existing) {
      res.status(202).json({
        run_id: existing.id,
        workflow_id: `portrait_gpt2-${existing.id}`,
        status: existing.status,
        primitive: 'portrait_gpt2',
        idempotent_replay: true,
      });
      return;
    }
  }

  const primitiveRunId = randomUUID();
  const workflowId = `portrait_gpt2-${primitiveRunId}`;

  const activityInput: PortraitGpt2ActivityInputShape = {
    primitive_run_id: primitiveRunId,
    user_id: userId,
    idempotency_key: idempotencyKey ?? undefined,
    input: parsed.data,
  };

  let cfg: ReturnType<typeof getTemporalConfig>;
  try {
    cfg = getTemporalConfig();
  } catch (err) {
    res.status(503).json({
      error: 'temporal_unconfigured',
      detail: errorMessage(err),
    });
    return;
  }

  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.start('portraitGpt2Workflow', {
        workflowId,
        taskQueue: getPrimitiveTaskQueue(),
        workflowExecutionTimeout: cfg.workflowExecutionTimeoutMs,
        workflowRunTimeout: cfg.workflowExecutionTimeoutMs,
        args: [activityInput],
      }),
      cfg.startTimeoutMs,
      'temporal.workflow.start.portrait_gpt2',
    );
  } catch (err) {
    res.status(502).json({
      error: 'temporal_dispatch_failed',
      detail: errorMessage(err),
    });
    return;
  }

  res.status(202).json({
    run_id: primitiveRunId,
    workflow_id: workflowId,
    status: 'submitted',
    primitive: 'portrait_gpt2',
  });
}

export async function characterSheetGpt2PrimitiveRoute(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const parsed = CharacterSheetGpt2ToolInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', detail: parsed.error.flatten() });
    return;
  }

  const idempotencyKey = readIdempotencyKey(req);
  if (idempotencyKey) {
    const { data: existing, error: existingErr } = await supabase
      .from('primitive_runs')
      .select('id, status')
      .eq('user_id', userId)
      .eq('primitive_id', 'character_sheet_gpt2')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingErr) {
      res.status(500).json({ error: 'idempotency_lookup_failed', detail: existingErr.message });
      return;
    }
    if (existing) {
      res.status(202).json({
        run_id: existing.id,
        workflow_id: `character_sheet_gpt2-${existing.id}`,
        status: existing.status,
        primitive: 'character_sheet_gpt2',
        idempotent_replay: true,
      });
      return;
    }
  }

  const primitiveRunId = randomUUID();
  const workflowId = `character_sheet_gpt2-${primitiveRunId}`;
  const activityInput: PortraitGpt2ActivityInputShape = {
    primitive_run_id: primitiveRunId,
    user_id: userId,
    idempotency_key: idempotencyKey ?? undefined,
    input: parsed.data,
  };

  let cfg: ReturnType<typeof getTemporalConfig>;
  try {
    cfg = getTemporalConfig();
  } catch (err) {
    res.status(503).json({ error: 'temporal_unconfigured', detail: errorMessage(err) });
    return;
  }
  try {
    const client = await getTemporalClient();
    await withTimeout(
      client.workflow.start('characterSheetGpt2Workflow', {
        workflowId,
        taskQueue: getPrimitiveTaskQueue(),
        workflowExecutionTimeout: cfg.workflowExecutionTimeoutMs,
        workflowRunTimeout: cfg.workflowExecutionTimeoutMs,
        args: [activityInput],
      }),
      cfg.startTimeoutMs,
      'temporal.workflow.start.character_sheet_gpt2',
    );
  } catch (err) {
    res.status(502).json({ error: 'temporal_dispatch_failed', detail: errorMessage(err) });
    return;
  }

  res.status(202).json({
    run_id: primitiveRunId,
    workflow_id: workflowId,
    status: 'submitted',
    primitive: 'character_sheet_gpt2',
  });
}

/**
 * GET /v1/primitives/runs/:run_id — status + artifacts for a single
 * primitive run. Auth-scoped to the calling user.
 */
export async function getPrimitiveRunRoute(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const runId = String(req.params.run_id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
    res.status(400).json({ error: 'invalid_run_id' });
    return;
  }
  const { data, error } = await supabase
    .from('primitive_runs')
    .select(
      'id, user_id, primitive_id, status, credits_deducted, error_code, error_message, started_at, finished_at, created_at, primitive_artifacts(id, kind, url, bytes, mime, metadata, created_at)',
    )
    .eq('id', runId)
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: 'lookup_failed', detail: error.message });
    return;
  }
  if (!data || data.user_id !== userId) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json({
    run_id: data.id,
    primitive: data.primitive_id,
    status: data.status,
    // Only expose the user-facing CREDIT cost — never our provider USD cost.
    credits: Number(data.credits_deducted ?? 0),
    error: data.error_code ? { code: data.error_code, message: data.error_message } : null,
    started_at: data.started_at,
    finished_at: data.finished_at,
    created_at: data.created_at,
    artifacts: data.primitive_artifacts ?? [],
  });
}

function readIdempotencyKey(req: Request): string | null {
  const raw = req.header('idempotency-key') ?? req.header('Idempotency-Key');
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  return trimmed;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
