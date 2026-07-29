// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { pollV2 } from '../src/v2/lib.ts';

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

describe('pollV2 stream-first behavior', () => {
  it('returns terminal status from SSE without polling', async () => {
    const { server, baseUrl } = await startServer((req, res) => {
      if (req.url === '/v2/jobs/job-1/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('event: job.update\n');
        res.write('data: {"status":"submitted","job_id":"job-1"}\n\n');
        setTimeout(() => {
          res.write('event: job.update\n');
          res.write('data: {"status":"completed","job_id":"job-1","video_url":"https://cdn.example/video.mp4"}\n\n');
          res.end();
        }, 15);
        return;
      }
      res.writeHead(404).end();
    });

    let polls = 0;
    const api = {
      baseUrl,
      getJob: async () => {
        polls += 1;
        return { status: 'completed', video_url: 'https://poll.example/video.mp4' };
      },
      apiKey: 'k_test',
      anonKey: 'anon_test',
    };

    const out = await pollV2(api, 'job-1', { timeoutMs: 2_000, intervalMs: 25 });
    assert.equal(out.status, 'completed');
    assert.equal(out.video_url, 'https://cdn.example/video.mp4');
    assert.equal(polls, 0);

    await new Promise((resolve) => server.close(resolve));
  });

  it('falls back to polling when SSE endpoint is unavailable', async () => {
    const { server, baseUrl } = await startServer((req, res) => {
      if (req.url === '/v2/jobs/job-2/stream') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no stream' }));
        return;
      }
      res.writeHead(404).end();
    });

    let polls = 0;
    const api = {
      baseUrl,
      getJob: async () => {
        polls += 1;
        if (polls < 3) return { status: 'processing' };
        return { status: 'completed', video_url: 'https://poll.example/video.mp4' };
      },
      apiKey: 'k_test',
      anonKey: 'anon_test',
    };

    const out = await pollV2(api, 'job-2', { timeoutMs: 2_000, intervalMs: 25 });
    assert.equal(out.status, 'completed');
    assert.equal(out.video_url, 'https://poll.example/video.mp4');
    assert.ok(polls >= 3, `expected >=3 polls, got ${polls}`);

    await new Promise((resolve) => server.close(resolve));
  });
});
