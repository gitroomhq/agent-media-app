// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Request, Response } from 'express';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { JobStatusView } from '../status.js';

type StreamState =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'FALLBACK_ACTIVE'
  | 'FALLBACK_STOPPED';

interface JobStreamDeps {
  readJob: (jobId: string, userId: string) => Promise<JobStatusView | null>;
  subscribe: (args: {
    jobId: string;
    userId: string;
    onUpdate: () => Promise<void> | void;
    onState: (state: StreamState) => void;
  }) => Promise<() => Promise<void> | void>;
  fallbackIntervalMs: number;
  heartbeatMs: number;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);
// Well-formed UUID shape only (8-4-4-4-12 hex) — do NOT enforce RFC
// version/variant nibbles: the nil/max UUID are valid ids and a well-formed
// but missing id must reach 404, not 400. Mirrors routes/status.ts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTerminalStatus(status: string | undefined): boolean {
  return typeof status === 'string' && TERMINAL_STATUSES.has(status);
}

function versionKey(job: JobStatusView): string {
  return [
    job.status ?? '',
    job.updated_at ?? '',
    job.video_url ?? '',
    job.error_message ?? '',
    JSON.stringify(job.progress ?? null),
  ].join('|');
}

function writeEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function subscribeViaSupabase({
  client,
  jobId,
  userId,
  onUpdate,
  onState,
}: {
  client: SupabaseClient;
  jobId: string;
  userId: string;
  onUpdate: () => Promise<void> | void;
  onState: (state: StreamState) => void;
}): Promise<() => Promise<void>> {
  let channel: RealtimeChannel | null = null;
  const channelName = `job-stream:${jobId}:${crypto.randomUUID()}`;
  channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'generation_jobs',
        filter: `id=eq.${jobId}`,
      },
      async (payload) => {
        const row = (payload as { new?: { user_id?: string } }).new;
        if (row?.user_id && row.user_id !== userId) return;
        await onUpdate();
      },
    )
    .subscribe((status) => {
      if (
        status === 'SUBSCRIBED' ||
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        onState(status);
      }
    });

  return async () => {
    if (channel) await client.removeChannel(channel);
  };
}

export function createJobStreamRoute(overrides: Partial<JobStreamDeps> = {}) {
  const defaultReadJob: JobStreamDeps['readJob'] = async (jobId, userId) => {
    const mod = await import('../status.js');
    return mod.fetchUserJobStatus(jobId, userId);
  };

  const defaultSubscribe: JobStreamDeps['subscribe'] = async ({ jobId, userId, onUpdate, onState }) => {
    const mod = await import('../../server.js');
    return subscribeViaSupabase({ client: mod.supabase, jobId, userId, onUpdate, onState });
  };

  const deps: JobStreamDeps = {
    readJob: defaultReadJob,
    subscribe: defaultSubscribe,
    fallbackIntervalMs: 15_000,
    heartbeatMs: 20_000,
    ...overrides,
  };

  return async function jobStreamRoute(req: Request, res: Response): Promise<void> {
    const rawJobId = req.params.jobId;
    const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
    const userId = (req as any).userId as string;
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
      return;
    }
    if (!jobId) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Missing jobId path parameter' },
      });
      return;
    }
    if (!UUID_RE.test(jobId)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid jobId format' },
      });
      return;
    }

    const initial = await deps.readJob(jobId, userId);
    if (!initial) {
      res.status(404).json({
        error: { code: 'VIDEO_NOT_FOUND', message: `Job "${jobId}" not found` },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    let lastKey = '';
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: (() => Promise<void> | void) | null = null;

    const cleanup = async () => {
      if (closed) return;
      closed = true;
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) {
        await unsubscribe();
        unsubscribe = null;
      }
      if (!res.writableEnded) res.end();
    };

    req.on('close', () => {
      void cleanup();
    });

    const sendLatest = async () => {
      if (closed) return;
      const row = await deps.readJob(jobId, userId);
      if (!row) {
        writeEvent(res, 'job.error', {
          code: 'VIDEO_NOT_FOUND',
          message: `Job "${jobId}" not found`,
        });
        await cleanup();
        return;
      }

      const nextKey = versionKey(row);
      if (nextKey !== lastKey) {
        lastKey = nextKey;
        writeEvent(res, 'job.update', row);
      }

      if (isTerminalStatus(row.status)) {
        writeEvent(res, 'job.terminal', { status: row.status, job_id: row.job_id });
        await cleanup();
      }
    };

    const startFallback = () => {
      if (fallbackTimer || closed) return;
      writeEvent(res, 'stream.state', { state: 'FALLBACK_ACTIVE' });
      fallbackTimer = setInterval(() => {
        void sendLatest();
      }, deps.fallbackIntervalMs);
    };

    const stopFallback = () => {
      if (!fallbackTimer) return;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
      writeEvent(res, 'stream.state', { state: 'FALLBACK_STOPPED' });
    };

    heartbeatTimer = setInterval(() => {
      if (!closed) res.write(': keepalive\n\n');
    }, deps.heartbeatMs);

    await sendLatest();
    if (closed) return;

    // Start with fallback active, then disable it when realtime subscribes.
    startFallback();

    try {
      unsubscribe = await deps.subscribe({
        jobId,
        userId,
        onUpdate: async () => {
          await sendLatest();
        },
        onState: (state) => {
          if (closed) return;
          writeEvent(res, 'stream.state', { state });
          if (state === 'SUBSCRIBED') stopFallback();
          if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            startFallback();
          }
        },
      });
    } catch (err) {
      console.error(
        `[v2 jobs stream] realtime subscribe failed for ${jobId}:`,
        err instanceof Error ? err.message : String(err),
      );
      startFallback();
    }
  };
}

export const jobStreamRoute = createJobStreamRoute();
