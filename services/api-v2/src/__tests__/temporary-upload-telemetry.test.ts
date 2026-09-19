// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@sentry/node', () => sentry);

it('redacts upload capabilities from errors and HTTP transactions', async () => {
  const rejectionListeners = process.listeners('unhandledRejection');
  const exceptionListeners = process.listeners('uncaughtException');
  vi.stubEnv('SENTRY_DSN', 'https://fixture.invalid/1');
  try {
    await import('../instrument.js');
    const options = sentry.init.mock.calls[0][0];
    const token = 'a'.repeat(64);
    for (const hook of [options.beforeSend, options.beforeSendTransaction]) {
      const event = hook({
        request: {
          url: `https://api.example/image?token=${token}`,
          headers: { authorization: `Upload ${token}` },
        },
        extra: { upload_token: token },
        spans: [{ data: { 'http.url': `https://api.example/upload#session=id&token=${token}` } }],
      });
      expect(JSON.stringify(event)).not.toContain(token);
      expect(event.request.url).toContain('token=[REDACTED]');
    }
  } finally {
    vi.unstubAllEnvs();
    for (const listener of process.listeners('unhandledRejection')) {
      if (!rejectionListeners.includes(listener))
        process.removeListener('unhandledRejection', listener);
    }
    for (const listener of process.listeners('uncaughtException')) {
      if (!exceptionListeners.includes(listener))
        process.removeListener('uncaughtException', listener);
    }
  }
});
