// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { NativeConnection, Worker } from '@temporalio/worker';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTemporalActivities } from './activities.js';
import { getTemporalConfig } from './config.js';

async function run(): Promise<void> {
  const cfg = getTemporalConfig();
  const workerV2Url = process.env.WORKER_V2_URL?.trim();
  const workerSecret = process.env.WORKER_SECRET?.trim();

  if (!workerV2Url || !workerSecret) {
    throw new Error('WORKER_V2_URL and WORKER_SECRET are required for temporal worker');
  }

  const connection = await NativeConnection.connect({
    address: cfg.address,
    apiKey: cfg.apiKey,
    tls: cfg.tlsEnabled
      ? (cfg.tlsServerName ? { serverNameOverride: cfg.tlsServerName } : true)
      : false,
  });

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const workflowTsPath = `${moduleDir}/workflows.ts`;
  const workflowJsPath = `${moduleDir}/workflows.js`;
  const workflowsPath = existsSync(workflowTsPath)
    ? workflowTsPath
    : workflowJsPath;

  const worker = await Worker.create({
    connection,
    namespace: cfg.namespace,
    taskQueue: cfg.taskQueue,
    workflowsPath,
    activities: createTemporalActivities({
      workerV2Url,
      workerSecret,
    }),
  });

  console.log(
    `[temporal-worker] listening namespace=${cfg.namespace} queue=${cfg.taskQueue}`,
  );

  const shutdown = async () => {
    console.log('[temporal-worker] shutdown signal received');
    await worker.shutdown();
  };
  process.once('SIGTERM', () => {
    void shutdown();
  });
  process.once('SIGINT', () => {
    void shutdown();
  });

  await worker.run();
}

run().catch((err) => {
  console.error('[temporal-worker] fatal:', err);
  process.exit(1);
});
