// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it } from 'vitest';
import type { ToolingRunEvent } from '../tooling/events.js';
import { publishToolingRunEvent, subscribeToolingRunEvent } from '../tooling/events.js';

class FakeRealtimeChannel {
  public callback: ((payload: unknown) => void) | null = null;
  public config: Record<string, unknown> | null = null;

  on(
    _type: string,
    config: Record<string, unknown>,
    callback: (payload: unknown) => void,
  ): this {
    this.config = config;
    this.callback = callback;
    return this;
  }

  subscribe(): this {
    return this;
  }
}

describe('tooling run events transport', () => {
  it('publishes run events into shared table', async () => {
    let insertTable = '';
    let inserted: Record<string, unknown> | null = null;
    const supabase = {
      from(table: string) {
        insertTable = table;
        return {
          async insert(row: Record<string, unknown>) {
            inserted = row;
            return { error: null };
          },
        };
      },
    };

    await publishToolingRunEvent(supabase as any, {
      runId: 'run-123',
      type: 'step_completed',
      payload: { step_id: 'actor_refs' },
    });

    expect(insertTable).toBe('tooling_run_events');
    expect(inserted).toEqual({
      run_id: 'run-123',
      type: 'step_completed',
      payload: { step_id: 'actor_refs' },
    });
  });

  it('subscribes to inserted run events for a run id', async () => {
    const channel = new FakeRealtimeChannel();
    let removedChannel: unknown = null;
    const seen: ToolingRunEvent[] = [];
    const supabase = {
      channel(name: string) {
        expect(name).toContain('tooling-run-events:run-abc:');
        return channel;
      },
      async removeChannel(ch: unknown) {
        removedChannel = ch;
      },
    };

    const unsubscribe = await subscribeToolingRunEvent(supabase as any, 'run-abc', (event) => {
      seen.push(event);
    });

    expect(channel.config).toMatchObject({
      event: 'INSERT',
      schema: 'public',
      table: 'tooling_run_events',
      filter: 'run_id=eq.run-abc',
    });
    channel.callback?.({
      new: {
        run_id: 'run-abc',
        type: 'run_started',
        payload: { run_id: 'run-abc' },
      },
    });
    expect(seen).toEqual([
      {
        runId: 'run-abc',
        type: 'run_started',
        payload: { run_id: 'run-abc' },
      },
    ]);

    await unsubscribe();
    expect(removedChannel).toBe(channel);
  });
});
