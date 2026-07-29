// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { Connection, Client } from '@temporalio/client';
import { getTemporalConfig } from './config.js';
import { withTimeout, TimeoutError } from './timeout.js';

let temporalClientPromise: Promise<Client> | null = null;

/**
 * Lazy singleton Temporal client with poison-promise protection.
 * If connection bootstrap fails or times out, reset so a later request can
 * retry — otherwise a stuck connect would permanently break the engine
 * branch for the lifetime of the process.
 */
export async function getTemporalClient(): Promise<Client> {
  if (temporalClientPromise) return temporalClientPromise;

  const cfg = getTemporalConfig();
  temporalClientPromise = withTimeout(
    (async () => {
      const connection = await Connection.connect({
        address: cfg.address,
        apiKey: cfg.apiKey,
        tls: cfg.tlsEnabled
          ? (cfg.tlsServerName ? { serverNameOverride: cfg.tlsServerName } : true)
          : false,
      });
      return new Client({
        connection,
        namespace: cfg.namespace,
      });
    })(),
    cfg.connectTimeoutMs,
    'temporal.connect',
  );

  try {
    return await temporalClientPromise;
  } catch (err) {
    temporalClientPromise = null;
    throw err;
  }
}

export { TimeoutError };
