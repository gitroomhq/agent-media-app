// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RuntimeCheckpointStore, RuntimeStepCheckpoint } from './runtime-graph.js';

export type ToolingRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ToolingRunRow {
  id: string;
  user_id: string;
  status: ToolingRunStatus;
  graph: unknown;
  budget: unknown;
  context: unknown;
  result: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class ToolingRunStore implements RuntimeCheckpointStore {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly runId: string,
  ) {}

  async get(stepId: string): Promise<RuntimeStepCheckpoint | null> {
    const { data, error } = await this.supabase
      .from('tooling_run_steps')
      .select('step_id, status, attempt, output, error_message, updated_at')
      .eq('run_id', this.runId)
      .eq('step_id', stepId)
      .order('attempt', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      stepId: data.step_id as string,
      status: data.status as RuntimeStepCheckpoint['status'],
      attempt: data.attempt as number,
      output: data.output,
      error: (data.error_message as string | null) ?? undefined,
      updatedAt: data.updated_at as string,
    };
  }

  async set(checkpoint: RuntimeStepCheckpoint): Promise<void> {
    const { error } = await this.supabase.from('tooling_run_steps').insert({
      run_id: this.runId,
      step_id: checkpoint.stepId,
      status: checkpoint.status,
      attempt: checkpoint.attempt,
      output: checkpoint.output ?? null,
      error_message: checkpoint.error ?? null,
    });
    if (error) throw new Error(`failed to persist step checkpoint: ${error.message}`);
  }
}

export async function createToolingRun(
  supabase: SupabaseClient,
  row: Pick<ToolingRunRow, 'id' | 'user_id' | 'graph' | 'budget' | 'context'>,
): Promise<void> {
  const { error } = await supabase.from('tooling_runs').insert({
    id: row.id,
    user_id: row.user_id,
    status: 'queued',
    graph: row.graph,
    budget: row.budget,
    context: row.context,
  });
  if (error) throw new Error(`failed to create tooling run: ${error.message}`);
}

export async function updateToolingRunStatus(
  supabase: SupabaseClient,
  runId: string,
  status: ToolingRunStatus,
  patch: { result?: unknown; error_message?: string | null } = {},
): Promise<void> {
  const { error } = await supabase
    .from('tooling_runs')
    .update({
      status,
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.error_message !== undefined ? { error_message: patch.error_message } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
  if (error) throw new Error(`failed to update tooling run: ${error.message}`);
}

export async function getToolingRun(
  supabase: SupabaseClient,
  runId: string,
  userId: string,
): Promise<ToolingRunRow | null> {
  const { data, error } = await supabase
    .from('tooling_runs')
    .select('id,user_id,status,graph,budget,context,result,error_message,created_at,updated_at')
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ToolingRunRow;
}

export async function listToolingRunSteps(
  supabase: SupabaseClient,
  runId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await supabase
    .from('tooling_run_steps')
    .select('step_id,status,attempt,output,error_message,created_at,updated_at')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function createMarketplacePackage(
  supabase: SupabaseClient,
  args: {
    creatorId: string;
    name: string;
    version: string;
    skillJson: Record<string, unknown>;
    reviewState: 'pending' | 'approved' | 'rejected';
    approvedCreator: boolean;
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('tooling_skill_packages')
    .insert({
      creator_id: args.creatorId,
      name: args.name,
      version: args.version,
      skill_json: args.skillJson,
      review_state: args.reviewState,
      approved_creator: args.approvedCreator,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`failed to publish package: ${error?.message ?? 'unknown'}`);
  return { id: data.id as string };
}

export async function listMarketplacePackages(
  supabase: SupabaseClient,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await supabase
    .from('tooling_skill_packages')
    .select('id,name,version,review_state,approved_creator,created_at')
    .eq('review_state', 'approved')
    .eq('approved_creator', true)
    .order('created_at', { ascending: false });
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function installMarketplacePackage(
  supabase: SupabaseClient,
  args: { userId: string; packageId: string; versionPin: string },
): Promise<{ installId: string }> {
  const { data, error } = await supabase
    .from('tooling_skill_installs')
    .insert({
      user_id: args.userId,
      package_id: args.packageId,
      pinned_version: args.versionPin,
      status: 'installed',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`failed to install package: ${error?.message ?? 'unknown'}`);
  return { installId: data.id as string };
}

export async function rollbackMarketplaceInstall(
  supabase: SupabaseClient,
  args: { userId: string; packageName: string },
): Promise<{ rolledBackInstallId: string | null; restoredInstallId: string | null }> {
  const { data: installs, error: listErr } = await supabase
    .from('tooling_skill_installs')
    .select('id,package_id,status,created_at,tooling_skill_packages!inner(name,version)')
    .eq('user_id', args.userId)
    .eq('tooling_skill_packages.name', args.packageName)
    .eq('status', 'installed')
    .order('created_at', { ascending: false })
    .limit(2);
  if (listErr) throw new Error(`failed to list installs: ${listErr.message}`);
  const rows = installs ?? [];
  if (rows.length === 0) return { rolledBackInstallId: null, restoredInstallId: null };
  const current = rows[0] as any;
  const previous = rows[1] as any;

  const { error: markErr } = await supabase
    .from('tooling_skill_installs')
    .update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() })
    .eq('id', current.id);
  if (markErr) throw new Error(`failed to rollback install: ${markErr.message}`);

  return {
    rolledBackInstallId: current.id as string,
    restoredInstallId: (previous?.id as string | undefined) ?? null,
  };
}
