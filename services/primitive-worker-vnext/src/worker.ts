// Copyright 2026 agent-media contributors. Apache-2.0 license.

// MUST be first: initialises Sentry before Temporal/activities load.
import './instrument.js';
import * as Sentry from '@sentry/node';
import { NativeConnection, Worker } from '@temporalio/worker';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { createActivities } from './activities/index.js';
import { logger } from './logger.js';
import { installNetHealthWatchdog, wasSelfRecycled } from './net-health.js';

/**
 * Wrap each activity so a thrown error is captured to Sentry with the activity
 * name + run_id + primitive tags, then re-thrown so Temporal still sees the
 * failure and applies its normal retry policy (capture is observe-only).
 */
function withSentryCapture<T extends Record<string, (...args: never[]) => unknown>>(activities: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(activities)) {
    wrapped[name] = async (...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        const input = (args[0] ?? {}) as Record<string, unknown>;
        Sentry.captureException(err, {
          tags: {
            activity: name,
            run_id: (input.runId ?? input.run_id) as string | undefined,
            primitive: input.primitive as string | undefined,
          },
        });
        throw err;
      }
    };
  }
  return wrapped as T;
}

async function run(): Promise<void> {
  const cfg = getConfig();

  const connection = await NativeConnection.connect({
    address: cfg.temporal.address,
    apiKey: cfg.temporal.apiKey,
    tls: cfg.temporal.tlsEnabled
      ? cfg.temporal.tlsServerName
        ? { serverNameOverride: cfg.temporal.tlsServerName }
        : true
      : false,
  });

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const workflowTs = `${moduleDir}/workflows/index.ts`;
  const workflowJs = `${moduleDir}/workflows/index.js`;
  const workflowsPath = existsSync(workflowTs) ? workflowTs : workflowJs;

  const worker = await Worker.create({
    connection,
    namespace: cfg.temporal.namespace,
    taskQueue: cfg.temporal.taskQueue,
    workflowsPath,
    activities: withSentryCapture(createActivities(cfg)),
    // Bug 4 fix: bound concurrent heavy image activities. Unbounded, a burst of
    // 8+ gpt-image jobs each doing Anthropic + a ~2MB OpenAI read + base64 +
    // ~2MB R2 upload saturates the single event loop, delaying in-flight fetch
    // I/O past undici timeouts → direct-fail → api-v2 fallback cascade → 5-9 min
    // runs (and, at the extreme, the worker stops polling new tasks → runs stuck
    // in 'submitted'). Cap so each batch completes fast; Temporal queues the rest.
    maxConcurrentActivityTaskExecutions: 4,
    // #44: on SIGTERM (deploy) give in-flight activities a brief window to
    // finish; anything still running is cancelled cleanly and Temporal retries
    // it on another worker (activities heartbeat + maximumAttempts:3), so a
    // deploy never orphans a render. Kept under the platform stop-grace so we
    // exit cleanly instead of being SIGKILLed mid-cancel.
    shutdownGraceTime: '25s',
  });

  logger.info(
    { namespace: cfg.temporal.namespace, queue: cfg.temporal.taskQueue, simulate: cfg.openai.simulate },
    'worker listening',
  );

  // One-shot boot smoke test: when SENTRY_TEST_ON_BOOT is set, send a tagged
  // event so we can confirm worker→Sentry capture (the worker has no HTTP
  // surface to poke). Remove the env var after verifying so restarts stay quiet.
  if (process.env.SENTRY_TEST_ON_BOOT) {
    Sentry.captureMessage(`SENTRY_WORKER_VERIFY_BOOT ${process.env.SENTRY_TEST_ON_BOOT}`, 'error');
    await Sentry.flush(3000);
    logger.info('sent Sentry boot smoke-test event');
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'draining (graceful; in-flight activities retry on another worker)');
    try {
      await worker.shutdown();
    } catch (err) {
      Sentry.captureException(err, { tags: { phase: 'shutdown' } });
      await Sentry.flush(2000).catch(() => undefined);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  // Self-recycle safety net: if the process ages past a uptime cap, or OpenAI
  // connections start consistently failing (the ~12h HeadersTimeout cliff), drain
  // gracefully so Railway restarts us fresh. worker.shutdown() lets worker.run()
  // return below; run().then(exit 0) then exits the process → Railway reboots it.
  // In-flight activities get the 25s drain + Temporal retry; nothing is orphaned.
  const stopWatchdog = installNetHealthWatchdog((reason) => {
    logger.warn({ reason }, 'net-health watchdog triggered graceful recycle');
    void shutdown(`recycle:${reason}`);
  });

  await worker.run();
  stopWatchdog();
}

run()
  .then(async () => {
    // worker.run() returned => the worker drained. Two cases, distinguished by
    // whether OUR watchdog fired the recycle:
    //  - SELF-RECYCLE (8h uptime cap / OpenAI-failure watchdog): exit NON-ZERO so
    //    Railway's default on-failure restart policy brings up a FRESH process.
    //    A clean exit-0 is treated as "completed" and is NOT restarted — that
    //    wrong assumption (no railway.json to set restartPolicy=ALWAYS) left the
    //    worker dead ~2.5 days. This is the guarantee against the ~12h
    //    HeadersTimeout cliff the watchdog exists to dodge.
    //  - DEPLOY / platform SIGTERM: exit 0 so the new version takes over without
    //    Railway spuriously restarting the old container.
    const selfRecycled = wasSelfRecycled();
    logger.info(
      { selfRecycled },
      selfRecycled
        ? 'worker self-recycled — exiting non-zero to force a fresh restart'
        : 'worker drained on signal — exiting 0',
    );
    await Sentry.flush(3000).catch(() => {});
    process.exit(selfRecycled ? 1 : 0);
  })
  .catch(async (err) => {
    logger.fatal({ err }, 'worker fatal — exiting');
    Sentry.captureException(err, { tags: { phase: 'bootstrap' } });
    await Sentry.flush(3000).catch(() => {});
    process.exit(1);
  });
