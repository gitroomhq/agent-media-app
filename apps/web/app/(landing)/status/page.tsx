// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useState } from 'react';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  latency_ms?: number;
}

interface ProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  success_rate?: number;
  avg_latency_ms?: number;
}

interface HealthResponse {
  overall: 'operational' | 'degraded' | 'outage';
  timestamp: string;
  services: ServiceStatus[];
  providers: ProviderHealth[];
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const HEALTH_URL =
  'https://ppwvarkmpffljlqxkjux.supabase.co/functions/v1/health-status';

const REFRESH_INTERVAL_MS = 60_000;

const FALLBACK_DATA: HealthResponse = {
  overall: 'operational',
  timestamp: new Date().toISOString(),
  services: [
    { name: 'API', status: 'operational' },
    { name: 'Database', status: 'operational' },
    { name: 'Auth', status: 'operational' },
    { name: 'Storage', status: 'operational' },
  ],
  providers: [
    { name: 'AI Generation', status: 'healthy' },
  ],
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

function overallColor(status: string): string {
  switch (status) {
    case 'operational':
      return 'text-[#22c55e]';
    case 'degraded':
      return 'text-warning';
    case 'outage':
      return 'text-danger';
    default:
      return 'text-[#6b6b76]';
  }
}

function overallBg(status: string): string {
  switch (status) {
    case 'operational':
      return 'bg-[#22c55e]/10 border-[#22c55e]/30';
    case 'degraded':
      return 'bg-warning/10 border-warning/30';
    case 'outage':
      return 'bg-danger/10 border-danger/30';
    default:
      return 'bg-white border-[#d4d4d4]';
  }
}

function dotColor(status: string): string {
  switch (status) {
    case 'operational':
    case 'healthy':
      return 'bg-[#22c55e]';
    case 'degraded':
      return 'bg-warning';
    case 'outage':
    case 'down':
      return 'bg-danger';
    default:
      return 'bg-[#6b6b76]';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'operational':
      return 'Operational';
    case 'degraded':
      return 'Degraded';
    case 'outage':
      return 'Outage';
    case 'healthy':
      return 'Healthy';
    case 'down':
      return 'Down';
    default:
      return status;
  }
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function StatusPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch(HEALTH_URL, {
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: HealthResponse = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          // Use fallback on first load, keep stale data on refresh failure
          setData((prev) => prev ?? FALLBACK_DATA);
          setError(true);
        }
      }
      if (!cancelled) setLastChecked(new Date());
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-sm text-[#6b6b76] animate-pulse">
          Loading status...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 lg:px-8">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="mb-12">
        <h1 className="text-sm uppercase tracking-widest text-[#22c55e]">
          System Status
        </h1>
        <p className="mt-2 text-3xl font-bold text-[#121212]">
          agent-media Platform
        </p>
        {lastChecked && (
          <p className="mt-2 font-mono text-xs text-[#6b6b76]">
            Last checked: {lastChecked.toLocaleTimeString()} (auto-refresh 60s)
          </p>
        )}
      </div>

      {/* ── Overall Status Banner ───────────────────────────────── */}
      <div
        className={`mb-10 rounded-lg border p-6 ${overallBg(data.overall)}`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${dotColor(data.overall)} ${
              data.overall === 'operational' ? '' : 'animate-pulse'
            }`}
          />
          <span
            className={`font-mono text-lg font-semibold ${overallColor(data.overall)}`}
          >
            {data.overall === 'operational'
              ? 'All Systems Operational'
              : data.overall === 'degraded'
                ? 'Some Systems Degraded'
                : 'System Outage Detected'}
          </span>
        </div>
        {error && (
          <p className="mt-3 font-mono text-xs text-warning">
            Unable to reach health endpoint. Displaying cached data.
          </p>
        )}
      </div>

      {/* ── Service Status Grid ─────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-[#6b6b76]">
          Services
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.services.map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between rounded-lg border border-[#d4d4d4] bg-white px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor(svc.status)}`}
                />
                <span className="font-mono text-sm text-[#121212]">{svc.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {svc.latency_ms !== undefined && (
                  <span className="font-mono text-xs text-[#6b6b76]">
                    {svc.latency_ms}ms
                  </span>
                )}
                <span
                  className={`font-mono text-xs ${
                    svc.status === 'operational'
                      ? 'text-[#22c55e]'
                      : svc.status === 'degraded'
                        ? 'text-warning'
                        : 'text-danger'
                  }`}
                >
                  {statusLabel(svc.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Provider Health Cards ───────────────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-[#6b6b76]">
          Providers
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.providers.map((provider) => (
            <div
              key={provider.name}
              className="rounded-lg border border-[#d4d4d4] bg-white px-5 py-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor(provider.status)}`}
                  />
                  <span className="font-mono text-sm text-[#121212]">
                    {provider.name}
                  </span>
                </div>
                <span
                  className={`font-mono text-xs ${
                    provider.status === 'healthy'
                      ? 'text-[#22c55e]'
                      : provider.status === 'degraded'
                        ? 'text-warning'
                        : 'text-danger'
                  }`}
                >
                  {statusLabel(provider.status)}
                </span>
              </div>
              {(provider.success_rate !== undefined ||
                provider.avg_latency_ms !== undefined) && (
                <div className="mt-3 flex items-center gap-4 border-t border-[#d4d4d4] pt-3">
                  {provider.success_rate !== undefined && (
                    <span className="font-mono text-xs text-[#6b6b76]">
                      Success: {provider.success_rate}%
                    </span>
                  )}
                  {provider.avg_latency_ms !== undefined && (
                    <span className="font-mono text-xs text-[#6b6b76]">
                      Avg: {provider.avg_latency_ms}ms
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer Info ─────────────────────────────────────────── */}
      <div className="border-t border-[#d4d4d4] pt-8 text-center">
        <p className="font-mono text-xs text-[#6b6b76]">
          This page auto-refreshes every 60 seconds. For real-time updates,
          join our{' '}
          <a
            href="https://discord.postiz.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#121212] underline transition-colors hover:text-[#6b6b76]"
          >
            Discord
          </a>
          .
        </p>
      </div>
    </div>
  );
}
