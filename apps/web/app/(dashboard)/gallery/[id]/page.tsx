// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Job detail page — shows the generation result for a single job.
 *
 * Displays a compact status header, media preview, and primary actions.
 * Subscribes to Supabase Realtime for live updates on this job.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GenerationJob {
  id: string;
  user_id: string;
  model_slug: string;
  operation: string;
  status: 'submitted' | 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  negative_prompt: string | null;
  output_media_url: string | null;
  output_thumbnail_url: string | null;
  credit_cost: number;
  provider_cost_usd: number | null;
  error_message: string | null;
  duration_seconds: number | null;
  resolution: string | null;
  input_params: Record<string, unknown> | null;
  webhook_checkpoint: string | null;
  provider_job_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
}

// ── Static Model Type Map ─────────────────────────────────────────────────────

const MODEL_TYPES: Record<string, 'video' | 'image'> = {
  kling3: 'video',
  veo3: 'video',
  sora2: 'video',
  seedance1: 'video',
  'flux2-pro': 'image',
  'flux2-flex': 'image',
  'grok-image': 'image',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function processingElapsed(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

// ── Status Display ────────────────────────────────────────────────────────────

function statusConfig(status: string) {
  switch (status) {
    case 'completed':
      return {
        label: 'COMPLETED',
        color: 'text-accent',
        bgColor: 'border-accent/30 bg-accent/5',
        icon: CheckCircle2,
        terminal: '[OK]',
      };
    case 'processing':
      return {
        label: 'PROCESSING',
        color: 'text-warning',
        bgColor: 'border-warning/30 bg-warning/5',
        icon: Loader2,
        terminal: '[..]',
      };
    case 'submitted':
    case 'queued':
      return {
        label: status === 'submitted' ? 'SUBMITTED' : 'QUEUED',
        color: 'text-cyan',
        bgColor: 'border-cyan/30 bg-cyan/5',
        icon: Clock,
        terminal: '[--]',
      };
    case 'failed':
      return {
        label: 'FAILED',
        color: 'text-danger',
        bgColor: 'border-danger/30 bg-danger/5',
        icon: XCircle,
        terminal: '[!!]',
      };
    default:
      return {
        label: status.toUpperCase(),
        color: 'text-text-muted',
        bgColor: 'border-border bg-card',
        icon: Terminal,
        terminal: '[??]',
      };
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const [job, setJob] = useState<GenerationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cliCopied, setCliCopied] = useState(false);

  // ── Fetch job ──────────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (queryError) {
        if (queryError.code === 'PGRST116') {
          setError('Job not found.');
        } else {
          throw queryError;
        }
      } else {
        setJob(data as GenerationJob);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load job';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // ── Subscribe to Realtime updates for this job ─────────────────────────
  useEffect(() => {
    const supabase = createClient();

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
          setJob(payload.new as GenerationJob);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  // ── Polling fallback — calls poll-provider to check status on provider ──
  // Polls every 5s while the job is active. The edge function checks
  // the provider API directly and downloads media when ready.
  useEffect(() => {
    if (!job) return;
    const isActive = ['submitted', 'queued', 'processing'].includes(job.status);
    if (!isActive) return;

    const interval = setInterval(async () => {
      try {
        const { data, error: fnError } = await invokeFn('poll-provider', { body: { jobId } });
        const supabase = createClient();

        if (fnError) {
          console.warn('poll-provider error:', fnError);
          return;
        }

        // If the server reports a terminal state, re-fetch the full job
        if (data?.status === 'completed' || data?.status === 'failed') {
          const { data: fresh } = await supabase
            .from('generation_jobs')
            .select('*')
            .eq('id', jobId)
            .single();
          if (fresh) setJob(fresh as GenerationJob);
        } else if (data?.status === 'processing' && job.status !== 'processing') {
          // Moved to processing — re-fetch for updated timestamps
          const { data: fresh } = await supabase
            .from('generation_jobs')
            .select('*')
            .eq('id', jobId)
            .single();
          if (fresh) setJob(fresh as GenerationJob);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [job?.status, jobId]);

  // ── Timer to update processing elapsed times ───────────────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!job) return;
    const isActive = ['submitted', 'queued', 'processing'].includes(job.status);
    if (!isActive) return;

    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [job]);

  // ── Copy job ID ────────────────────────────────────────────────────────
  function handleCopyId() {
    navigator.clipboard.writeText(jobId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Delete / Restore handlers ──────────────────────────────────────────
  async function handleDelete() {
    if (!confirm('Delete this job?')) return;
    try {
      const { error: fnError } = await invokeFn('gallery-delete', { body: { jobId } });
      if (fnError) throw fnError;
      // Optimistic update
      setJob((prev) =>
        prev ? { ...prev, deleted_at: new Date().toISOString() } : prev,
      );
    } catch (err) {
      console.error('Failed to delete job:', err);
    }
  }

  async function handleRestore() {
    try {
      const { error: fnError } = await invokeFn('gallery-delete', { body: { jobId, restore: true } });
      if (fnError) throw fnError;
      // Optimistic update
      setJob((prev) => (prev ? { ...prev, deleted_at: null } : prev));
    } catch (err) {
      console.error('Failed to restore job:', err);
    }
  }

  // ── Build CLI command for "Generate Similar" ──────────────────────────────
  function generateSimilarCliCommand(): string {
    if (!job) return 'agent-media generate';
    const parts = ['agent-media generate', job.model_slug];
    parts.push('-p', `"${job.prompt}"`);
    if (job.input_params?.aspect_ratio) parts.push('--aspect-ratio', String(job.input_params.aspect_ratio));
    if (job.duration_seconds !== null) parts.push('--duration', String(job.duration_seconds));
    if (job.input_params?.seed != null) parts.push('--seed', String(job.input_params.seed));
    return parts.join(' ');
  }

  function copyCliCommand() {
    navigator.clipboard.writeText(generateSimilarCliCommand());
    setCliCopied(true);
    setTimeout(() => setCliCopied(false), 2000);
  }

  // ── Loading State ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <Link
          href="/gallery"
          className="inline-flex items-center gap-2 font-mono text-sm text-text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Gallery
        </Link>
        <div className="mt-12 flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-4 font-mono text-sm text-text-muted">
            Loading job details...
          </p>
        </div>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────────
  if (error || !job) {
    return (
      <div>
        <Link
          href="/gallery"
          className="inline-flex items-center gap-2 font-mono text-sm text-text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Gallery
        </Link>
        <div className="mt-12 flex flex-col items-center justify-center py-20">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
            <AlertCircle className="mx-auto h-8 w-8 text-danger" />
          </div>
          <p className="mt-4 font-mono text-sm text-danger">
            {error ?? 'Job not found.'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => fetchJob()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const sc = statusConfig(job.status);
  const StatusIcon = sc.icon;
  const modelType = MODEL_TYPES[job.model_slug] ?? 'video';
  const isActive = ['submitted', 'queued', 'processing'].includes(job.status);

  return (
    <div>
      {/* Back link */}
      <Link
        href="/gallery"
        className="inline-flex items-center gap-2 font-mono text-sm text-text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Gallery
      </Link>

      {/* ── Deleted Banner ──────────────────────────────────────────── */}
      {job.deleted_at && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <span className="font-mono text-sm text-warning">
            This job was deleted.
          </span>
          <Button variant="secondary" size="sm" onClick={handleRestore}>
            <RotateCcw className="mr-2 h-3 w-3" />
            Restore
          </Button>
        </div>
      )}

      {/* ── Terminal Header ───────────────────────────────────────────── */}
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-text">
                Job Detail
              </h1>
              <div
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sc.bgColor} ${sc.color}`}
              >
                <StatusIcon
                  className={`h-3 w-3 ${isActive ? 'animate-spin' : ''}`}
                />
                {sc.label}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-sm text-text-muted">
                {jobId}
              </span>
              <button
                onClick={handleCopyId}
                className="text-text-muted transition-colors hover:text-accent"
                title="Copy Job ID"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={modelType === 'video' ? 'video' : 'image'}>
              {modelType === 'video' ? (
                <Film className="mr-1 h-2.5 w-2.5" />
              ) : (
                <ImageIcon className="mr-1 h-2.5 w-2.5" />
              )}
              {modelType.toUpperCase()}
            </Badge>
            <span className="font-mono text-xs text-text-muted">
              {job.model_slug}
            </span>
            {job.deleted_at ? (
              <Button variant="secondary" size="sm" onClick={handleRestore}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Restore
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                <Trash2 className="mr-2 h-3 w-3" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Media Preview ────────────────────────────────────────────── */}
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          Media Preview
        </h2>

        <div className="mt-6">
          {job.status === 'completed' && job.output_media_url ? (
            <div>
              {modelType === 'video' ? (
                <video
                  src={job.output_media_url}
                  controls
                  preload="metadata"
                  playsInline
                  className="mx-auto max-h-[70vh] max-w-sm rounded-lg border border-border bg-background"
                  poster={job.output_thumbnail_url ?? undefined}
                />
              ) : (
                <img
                  src={job.output_media_url}
                  alt={job.prompt}
                  className="mx-auto max-h-[70vh] max-w-lg rounded-lg border border-border bg-background object-contain"
                />
              )}

              {/* Download & Generate Similar buttons */}
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={job.output_media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button size="sm">
                    <Download className="mr-2 h-3 w-3" />
                    Download
                  </Button>
                </a>
                <Button variant="secondary" size="sm" onClick={copyCliCommand}>
                  <Copy className="mr-2 h-3 w-3" />
                  {cliCopied ? 'Copied CLI Command!' : 'Copy CLI Command'}
                </Button>
              </div>
            </div>
          ) : isActive ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background py-16">
              <Loader2 className="h-10 w-10 animate-spin text-warning" />
              <p className="mt-4 font-mono text-sm text-warning">
                Generating...
              </p>
              <p className="mt-1 font-mono text-xs text-text-muted">
                {processingElapsed(job.created_at)} elapsed
              </p>
              <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-border">
                <div
                  className="h-1 animate-pulse rounded-full bg-warning"
                  style={{ width: '60%' }}
                />
              </div>
            </div>
          ) : job.status === 'failed' ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-danger/30 bg-danger/5 py-16">
              <XCircle className="h-10 w-10 text-danger" />
              <p className="mt-4 font-mono text-sm text-danger">
                Generation Failed
              </p>
              {job.error_message && (
                <p className="mt-2 max-w-md text-center font-mono text-xs text-danger/80">
                  {job.error_message}
                </p>
              )}
              {job.credit_cost > 0 && (
                <p className="mt-3 font-mono text-[10px] text-text-muted">
                  Credits charged: {job.credit_cost} (refund pending)
                </p>
              )}
              <Button variant="secondary" size="sm" className="mt-4" onClick={copyCliCommand}>
                <Copy className="mr-2 h-3 w-3" />
                {cliCopied ? 'Copied CLI Command!' : 'Copy CLI Command to Retry'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background py-16">
              <Terminal className="h-10 w-10 text-text-muted" />
              <p className="mt-4 font-mono text-sm text-text-muted">
                No preview available
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
