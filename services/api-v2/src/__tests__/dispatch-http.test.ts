// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Real-network tests for `dispatchSelfieToHttpWorker`.
 *
 * No mocking: a tiny Node `http` server runs on a random local port and
 * the helper hits it with the real `fetch` + AbortSignal.timeout flow.
 * Covers the failure modes that previously left selfie jobs in
 * `status=submitted, webhook_checkpoint=none` forever:
 *   - worker returns 5xx
 *   - worker returns 4xx
 *   - connection refused (worker down)
 *   - dispatch times out (worker hung)
 *
 * If any of these throw, the route is expected to mark the job failed
 * and refund credits.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dispatchSelfieToHttpWorker } from '../routes/v2/dispatch-http.js';
import type { SelfieDispatchPayload } from '../orchestrator/temporal/types.js';

const PAYLOAD: SelfieDispatchPayload = {
  job_id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-0000000000aa',
  duration: 10,
  subtitles: true,
  callback_url: 'http://example.test/cb',
};

interface FakeWorkerState {
  status: number;
  body: string;
  stallMs: number;
  lastBody: string | null;
  lastHeaders: http.IncomingHttpHeaders;
  lastPath: string | null;
}

describe('dispatchSelfieToHttpWorker', () => {
  let server: http.Server;
  let baseUrl: string;
  const state: FakeWorkerState = {
    status: 202,
    body: '',
    stallMs: 0,
    lastBody: null,
    lastHeaders: {},
    lastPath: null,
  };

  beforeAll(async () => {
    server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      state.lastHeaders = req.headers;
      state.lastPath = req.url ?? null;
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
      req.on('end', () => {
        state.lastBody = body;
        const send = () => res.writeHead(state.status).end(state.body);
        if (state.stallMs > 0) setTimeout(send, state.stallMs);
        else send();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    state.status = 202;
    state.body = '';
    state.stallMs = 0;
    state.lastBody = null;
    state.lastHeaders = {};
    state.lastPath = null;
  });

  it('resolves and forwards path, secret, and JSON body on 2xx', async () => {
    await expect(
      dispatchSelfieToHttpWorker(baseUrl, 'secret-abc', PAYLOAD),
    ).resolves.toBeUndefined();
    expect(state.lastPath).toBe('/v2/selfie');
    expect(state.lastHeaders['x-worker-secret']).toBe('secret-abc');
    expect(state.lastHeaders['content-type']).toBe('application/json');
    expect(JSON.parse(state.lastBody ?? '')).toMatchObject({
      job_id: PAYLOAD.job_id,
      user_id: PAYLOAD.user_id,
      duration: 10,
      callback_url: PAYLOAD.callback_url,
    });
  });

  it('throws on 5xx with status + body in message (worker error)', async () => {
    state.status = 503;
    state.body = 'worker overloaded';
    await expect(
      dispatchSelfieToHttpWorker(baseUrl, 'secret', PAYLOAD),
    ).rejects.toThrow(/503.*worker overloaded/);
  });

  it('throws on 4xx (worker rejection — bad secret, validation, etc.)', async () => {
    state.status = 401;
    state.body = 'bad secret';
    await expect(
      dispatchSelfieToHttpWorker(baseUrl, 'wrong', PAYLOAD),
    ).rejects.toThrow(/401.*bad secret/);
  });

  it('throws on connection refused (worker down)', async () => {
    // Bind a transient server, capture its port, then close so the port
    // is reliably refused on this host.
    const tmp = http.createServer();
    await new Promise<void>((resolve) => tmp.listen(0, '127.0.0.1', resolve));
    const port = (tmp.address() as AddressInfo).port;
    await new Promise<void>((resolve) => tmp.close(() => resolve()));

    await expect(
      dispatchSelfieToHttpWorker(`http://127.0.0.1:${port}`, 'secret', PAYLOAD),
    ).rejects.toThrow();
  });

  it('throws on timeout (worker hung)', async () => {
    state.status = 202;
    state.stallMs = 200;
    await expect(
      dispatchSelfieToHttpWorker(baseUrl, 'secret', PAYLOAD, 50),
    ).rejects.toThrow();
  });
});
