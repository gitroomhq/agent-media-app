// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Agent durable-loop tasks (Phase 1 — data layer).
 *
 * A "task" is a goal the durable agentTaskWorkflow (Phase 2) will decompose into
 * steps. These routes are the read/create surface; the Temporal workflow itself
 * (Phase 2) writes steps + advances status via the service-role client directly.
 * DORMANT until Phase 2 turns on the loop — nothing creates tasks yet. The signal
 * endpoints (confirm/retry/skip/cancel) + the SSE stream ship WITH the workflow in
 * Phase 2 so they're exercised end-to-end, not as unverifiable stubs.
 *
 * Auth-scoped: service-role client bypasses RLS, so the explicit
 * `.eq('user_id', userId)` on every query is the real guard (RLS = defense-in-depth).
 */

import type { Request, Response } from 'express';
import { supabase } from '../../server.js';

function requireUser(req: Request, res: Response): string | null {
  const userId = (req as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }); return null; }
  return userId;
}
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const TASK_COLS = 'id, chat_id, goal, status, plan, spent_credits, ceiling_credits, auto_confirm_under, step_count, workflow_id, error_message, created_at, updated_at';

// POST /v1/agent/tasks { goal, chat_id?, ceiling_credits?, auto_confirm_under?, plan? }
export async function createTaskRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const body = (req.body ?? {}) as {
    goal?: unknown; chat_id?: unknown; ceiling_credits?: unknown; auto_confirm_under?: unknown; plan?: unknown;
  };
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 4000) : '';
  if (!goal) { res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'goal required' } }); return; }
  const ceiling = Number(body.ceiling_credits);
  const autoUnder = Number(body.auto_confirm_under);

  const { data, error } = await supabase
    .from('agent_tasks')
    .insert({
      user_id: userId,
      goal,
      chat_id: isUuid(body.chat_id) ? body.chat_id : null,
      ceiling_credits: Number.isFinite(ceiling) ? Math.max(0, Math.trunc(ceiling)) : 0,
      auto_confirm_under: Number.isFinite(autoUnder) ? Math.max(0, Math.trunc(autoUnder)) : 0,
      plan: body.plan ?? null,
    })
    .select(TASK_COLS)
    .single();
  if (error || !data) {
    console.error(`[agent tasks create] ${error?.message ?? 'no row'}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create task' } });
    return;
  }
  res.status(201).json({ id: data.id, task: data });
}

// GET /v1/agent/tasks/:id → { task, steps[] }
export async function getTaskRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = req.params.id;
  if (!isUuid(id)) { res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid task id' } }); return; }

  const { data: task, error } = await supabase
    .from('agent_tasks')
    .select(`${TASK_COLS}, archived_at`)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error(`[agent tasks get] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to load task' } });
    return;
  }
  if (!task) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }); return; }

  const { data: steps } = await supabase
    .from('agent_task_steps')
    .select('id, ordinal, title, kind, skill_name, status, skill_run_id, primitive_run_id, run_kind, cost_credits, error_message, created_at')
    .eq('task_id', id)
    .eq('user_id', userId)
    .order('ordinal', { ascending: true });

  res.status(200).json({ task, steps: steps ?? [] });
}

// GET /v1/agent/tasks?status=&limit= → list (newest first)
export async function listTasksRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const rawLimit = Number((req.query as { limit?: string }).limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
  const status = (req.query as { status?: string }).status;

  let q = supabase.from('agent_tasks').select(TASK_COLS).eq('user_id', userId);
  if (status === 'live') q = q.in('status', ['running', 'paused', 'pending_confirmation']);
  else if (status && status !== 'all') q = q.eq('status', status);
  if (status !== 'all') q = q.is('archived_at', null);

  const { data, error } = await q.order('updated_at', { ascending: false }).limit(limit);
  if (error) {
    console.error(`[agent tasks list] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to list tasks' } });
    return;
  }
  res.status(200).json({ tasks: data ?? [] });
}
