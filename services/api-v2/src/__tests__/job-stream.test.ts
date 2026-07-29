// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createJobStreamRoute } from '../routes/v2/job-stream.js';
import type { JobStatusView } from '../routes/status.js';

interface SseEvent {
  event: string;
  data: unknown;
}

const JOB_ID = '11111111-1111-4111-8111-111111111111';

async function readSseEvents(url: string, maxEvents: number): Promise<SseEvent[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`stream failed: ${resp.status}`);
  if (!resp.body) throw new Error('missing stream body');

  const events: SseEvent[] = [];
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const flush = () => {
    if (!dataLines.length) {
      eventName = 'message';
      return;
    }
    const raw = dataLines.join('\n');
    dataLines = [];
    const parsed = JSON.parse(raw);
    events.push({ event: eventName, data: parsed });
    eventName = 'message';
  };

  while (events.length < maxEvents) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const i = buffer.indexOf('\n');
      if (i < 0) break;
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      if (!line) {
        flush();
        if (events.length >= maxEvents) return events;
        continue;
      }
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }

  return events;
}

function baseJob(status: string): JobStatusView {
  return {
    job_id: JOB_ID,
    operation: 'selfie',
    status,
    progress: null,
    video_url: status === 'completed' ? 'https://cdn.example/video.mp4' : null,
    result_url: status === 'completed' ? 'https://cdn.example/video.mp4' : null,
    character_sheet_url: null,
    storyboard_url: null,
    reference_image_url: null,
    portrait_url: null,
    sheet_url: null,
    wireframe_url: null,
    seedance_prompt: null,
    seedance_full_prompt: null,
    character_id: null,
    error_message: status === 'failed' ? 'failed' : null,
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: new Date().toISOString(),
  };
}

describe('job stream route', () => {
  it('emits realtime updates and closes on terminal state', async () => {
    let current = baseJob('submitted');
    const hooks: { onUpdate?: () => Promise<void> | void } = {};
    const route = createJobStreamRoute({
      readJob: async () => current,
      subscribe: async (args) => {
        hooks.onUpdate = args.onUpdate;
        args.onState('SUBSCRIBED');
        return () => {};
      },
      fallbackIntervalMs: 5_000,
      heartbeatMs: 5_000,
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).userId = 'user-1';
      next();
    });
    app.get('/v2/jobs/:jobId/stream', route);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}/v2/jobs/${JOB_ID}/stream`;

    const reading = readSseEvents(url, 8);
    await new Promise((r) => setTimeout(r, 25));
    current = { ...baseJob('processing'), updated_at: new Date().toISOString() };
    if (hooks.onUpdate) await hooks.onUpdate();
    await new Promise((r) => setTimeout(r, 25));
    current = { ...baseJob('completed'), updated_at: new Date().toISOString() };
    if (hooks.onUpdate) await hooks.onUpdate();

    const events = await reading;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const updateStatuses = events
      .filter((e) => e.event === 'job.update')
      .map((e) => (e.data as { status?: string }).status);
    expect(updateStatuses).toContain('submitted');
    expect(updateStatuses).toContain('processing');
    expect(updateStatuses).toContain('completed');
    expect(events.some((e) => e.event === 'job.terminal')).toBe(true);
  });

  it('falls back to polling when realtime subscription fails', async () => {
    let reads = 0;
    const route = createJobStreamRoute({
      readJob: async () => {
        reads += 1;
        if (reads < 3) return { ...baseJob('submitted'), updated_at: `2026-05-26T10:00:0${reads}.000Z` };
        return { ...baseJob('completed'), updated_at: '2026-05-26T10:00:03.000Z' };
      },
      subscribe: async () => {
        throw new Error('realtime down');
      },
      fallbackIntervalMs: 40,
      heartbeatMs: 500,
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as any).userId = 'user-1';
      next();
    });
    app.get('/v2/jobs/:jobId/stream', route);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}/v2/jobs/${JOB_ID}/stream`;

    const events = await readSseEvents(url, 4);
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const states = events
      .filter((e) => e.event === 'stream.state')
      .map((e) => (e.data as { state?: string }).state);
    expect(states).toContain('FALLBACK_ACTIVE');
    const terminalUpdate = events.find(
      (e) =>
        e.event === 'job.update' &&
        (e.data as { status?: string }).status === 'completed',
    );
    expect(terminalUpdate).toBeTruthy();
    expect((terminalUpdate!.data as { status?: string }).status).toBe('completed');
  });
});
