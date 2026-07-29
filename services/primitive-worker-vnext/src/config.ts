// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Env-driven config for primitive-worker-vnext.
 *
 * Mirrors the pattern in services/api-v2/src/orchestrator/temporal/config.ts
 * so credentials can be reused / lifted later.
 */

export interface TemporalConnConfig {
  address: string;
  namespace: string;
  apiKey?: string;
  tlsEnabled: boolean;
  tlsServerName?: string;
  taskQueue: string;
}

export interface CostCaps {
  /** Max USD per single primitive Activity. */
  primitiveUsd: number;
  /** Max USD per skill run (sum of primitives in the same run). */
  runUsd: number;
  /** Max USD per UTC day, summed across all primitive runs. */
  dayUsd: number;
}

export interface WorkerConfig {
  temporal: TemporalConnConfig;
  anthropic: {
    apiKey: string;
    model: string;
  };
  openai: {
    apiKey: string;
    imageModel: string;
    simulate: boolean;
    /** api-v2 internal base URL the worker proxies gpt-image calls through. */
    imageProxyUrl: string;
    /** Shared secret sent as x-internal-secret to the proxy endpoint. */
    imageProxySecret: string;
  };
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string;
  };
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  caps: CostCaps;
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig(): WorkerConfig {
  const simulate = (process.env.SIMULATE_OPENAI ?? 'false').toLowerCase().trim() === 'true';
  return {
    temporal: {
      address: required('TEMPORAL_ADDRESS'),
      namespace: required('TEMPORAL_NAMESPACE'),
      apiKey: optional('TEMPORAL_API_KEY'),
      tlsEnabled: (process.env.TEMPORAL_TLS ?? 'true').toLowerCase() !== 'false',
      tlsServerName: optional('TEMPORAL_TLS_SERVER_NAME'),
      taskQueue: optional('TEMPORAL_PRIMITIVE_TASK_QUEUE') ?? 'primitive-vnext-v1',
    },
    anthropic: {
      apiKey: simulate ? (optional('ANTHROPIC_API_KEY') ?? 'simulate') : required('ANTHROPIC_API_KEY'),
      model: optional('ANTHROPIC_PORTRAIT_PROMPT_MODEL') ?? 'claude-haiku-4-5',
    },
    openai: {
      // In simulate mode the key is not required — keep an empty placeholder
      // so type stays string and the activity short-circuits before any call.
      apiKey: simulate ? (optional('OPENAI_API_KEY') ?? 'simulate') : required('OPENAI_API_KEY'),
      imageModel: optional('OPENAI_IMAGE_MODEL') ?? 'gpt-image-2',
      simulate,
      // The worker's own egress to api.openai.com is broken (persistent
      // HeadersTimeout from this container). gpt-image calls are proxied through
      // api-v2's healthy egress over Railway's private network.
      imageProxyUrl:
        optional('API_V2_INTERNAL_URL') ?? 'http://api-v2.railway.internal:3001',
      imageProxySecret: simulate
        ? (optional('INTERNAL_API_SECRET') ?? 'simulate')
        : required('INTERNAL_API_SECRET'),
    },
    r2: {
      accountId: required('R2_ACCOUNT_ID'),
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      bucket: optional('R2_BUCKET') ?? 'agent-media-outputs',
      publicUrl: optional('R2_PUBLIC_URL') ?? 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev',
    },
    supabase: {
      url: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    },
    caps: {
      primitiveUsd: readNumber('PRIMITIVE_CAP_USD', 0.5),
      runUsd: readNumber('RUN_CAP_USD', 5),
      dayUsd: readNumber('DAY_CAP_USD', 20),
    },
  };
}
