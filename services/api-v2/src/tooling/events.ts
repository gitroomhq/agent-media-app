// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface ToolingRunEvent {
  runId: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function publishToolingRunEvent(
  supabase: SupabaseClient,
  event: ToolingRunEvent,
): Promise<void> {
  const { error } = await supabase.from('tooling_run_events').insert({
    run_id: event.runId,
    type: event.type,
    payload: event.payload,
  });
  if (error) throw new Error(`failed to publish tooling run event: ${error.message}`);
}

export async function subscribeToolingRunEvent(
  supabase: SupabaseClient,
  runId: string,
  listener: (event: ToolingRunEvent) => void,
): Promise<() => Promise<void>> {
  const channelName = `tooling-run-events:${runId}:${crypto.randomUUID()}`;
  let channel: RealtimeChannel | null = null;
  channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'tooling_run_events',
        filter: `run_id=eq.${runId}`,
      },
      (payload) => {
        const row = (payload as { new?: Record<string, unknown> }).new;
        if (!row) return;
        listener({
          runId: (row.run_id as string) ?? runId,
          type: (row.type as string) ?? 'unknown',
          payload: (row.payload as Record<string, unknown>) ?? {},
        });
      },
    )
    .subscribe();

  return async () => {
    if (channel) await supabase.removeChannel(channel);
    channel = null;
  };
}
