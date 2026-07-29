// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Live subscription to a single generation_jobs row.
 *
 *   const { job, status, phase, resultUrl, errorMessage, loading } =
 *     useGenerationJob(jobId);
 *
 * Mirrors the gallery/[id] pattern at apps/web/app/(dashboard)/gallery/[id]/
 * page.tsx:178-244 — initial fetch via supabase-js (RLS-scoped to the
 * caller), then a Realtime channel filtered by id for UPDATE events,
 * plus a 15s poll fallback in case Realtime drops.
 *
 * Replaces the old useJobStatus polling hook for the Content Machine
 * wizard. RLS on generation_jobs scopes the read to user_id = auth.uid()
 * so we don't need a server proxy.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type JobStatus = 'submitted' | 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';

export interface GenerationJobRow {
  id: string;
  operation: string;
  status: JobStatus;
  output_media_url: string | null;
  error_message: string | null;
  error_code: string | null;
  progress_detail: { phase?: string; at?: string } | null;
  input_params: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface UseGenerationJobResult {
  job: GenerationJobRow | null;
  status: JobStatus;
  phase: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  loading: boolean;
}

const TERMINAL: JobStatus[] = ['completed', 'failed'];

export function useGenerationJob(jobId: string | null): UseGenerationJobResult {
  const [job, setJob] = useState<GenerationJobRow | null>(null);
  const [loading, setLoading] = useState<boolean>(!!jobId);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      return undefined;
    }

    aliveRef.current = true;
    setLoading(true);
    const supabase = createClient();

    // ── Initial fetch ──────────────────────────────────────────
    (async () => {
      const { data } = await supabase
        .from('generation_jobs')
        .select('id, operation, status, output_media_url, error_message, error_code, progress_detail, input_params, created_at, updated_at')
        .eq('id', jobId)
        .maybeSingle();
      if (!aliveRef.current) return;
      if (data) setJob(data as GenerationJobRow);
      setLoading(false);
    })();

    // ── Realtime subscription ──────────────────────────────────
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'generation_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          if (!aliveRef.current) return;
          setJob(payload.new as GenerationJobRow);
        },
      )
      .subscribe();

    // ── Poll fallback (15s) — covers Realtime drops ────────────
    const poll = setInterval(async () => {
      if (!aliveRef.current) return;
      // If we know terminal already, stop wasting cycles.
      if (job?.status && TERMINAL.includes(job.status)) return;
      const { data } = await supabase
        .from('generation_jobs')
        .select('id, operation, status, output_media_url, error_message, error_code, progress_detail, input_params, created_at, updated_at')
        .eq('id', jobId)
        .maybeSingle();
      if (!aliveRef.current) return;
      if (data) setJob(data as GenerationJobRow);
    }, 15_000);

    return () => {
      aliveRef.current = false;
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    job,
    status: job?.status ?? 'unknown',
    phase: job?.progress_detail?.phase ?? null,
    resultUrl: job?.output_media_url ?? null,
    errorMessage: job?.error_message ?? null,
    errorCode: job?.error_code ?? null,
    loading,
  };
}
