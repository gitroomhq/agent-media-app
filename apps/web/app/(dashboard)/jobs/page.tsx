// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Jobs page — live monitor for AUTOMATED runs only.
 *
 * "Automated" = jobs created by a schedule / cron (rows where
 * input_params.schedule_id is set). Manual jobs from the API,
 * wizard, or CLI do NOT show here — they land in /gallery instead.
 *
 * Filter tabs: All / Running / Completed / Failed.
 * Each row shows status pill, operation chip, prompt excerpt, output
 * thumbnail, progress (from progress_detail), credit cost, time, with
 * Cancel / Download / Retry actions where applicable.
 *
 * Realtime subscription so status flips land without a refresh.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SchedulesPanel } from '@/components/schedules-panel';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface GenerationJob {
  id: string;
  model_slug: string | null;
  operation: string;
  status: string;
  prompt: string | null;
  output_media_url: string | null;
  output_thumbnail_url: string | null;
  credit_cost: number | null;
  duration_seconds: number | null;
  resolution: string | null;
  input_params: Record<string, unknown> | null;
  progress_detail: Record<string, unknown> | null;
  error_message: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
}

type FilterTab = 'all' | 'running' | 'completed' | 'failed';

const RUNNING_STATUSES = new Set(['submitted', 'pending', 'processing']);
const TERMINAL_FAILED_STATUSES = new Set(['failed', 'canceled']);

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function operationLabel(op: string): string {
  const map: Record<string, string> = {
    ugc_video: 'UGC Video',
    saas_review: 'SaaS Review',
    show_your_app: 'Show Your App',
    product_acting_ugc: 'Product Acting',
    laptop_ugc: 'Laptop UGC',
    subtitle: 'Subtitle',
    character_sheet: 'Character Sheet',
    character_storyboard: 'Storyboard',
    character_video: 'Character Video',
  };
  return map[op] ?? op;
}

function StatusPill({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <Badge variant="live" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </Badge>
    );
  }
  if (TERMINAL_FAILED_STATUSES.has(status)) {
    return (
      <Badge variant="default" className="gap-1 border-red-300 bg-red-50 text-red-700">
        <XCircle className="h-3 w-3" />
        {status === 'canceled' ? 'Canceled' : 'Failed'}
      </Badge>
    );
  }
  if (RUNNING_STATUSES.has(status)) {
    return (
      <Badge variant="default" className="gap-1 border-blue-300 bg-blue-50 text-blue-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === 'submitted' || status === 'pending' ? 'Queued' : 'Running'}
      </Badge>
    );
  }
  return <Badge variant="default">{status}</Badge>;
}

function progressLine(job: GenerationJob): string | null {
  if (!RUNNING_STATUSES.has(job.status)) return null;
  const pd = job.progress_detail ?? {};
  const stage = typeof pd.stage === 'string' ? pd.stage : null;
  const phase = typeof pd.phase === 'string' ? pd.phase : null;
  const message = typeof pd.message === 'string' ? pd.message : null;
  const pct = typeof pd.progress_pct === 'number' ? pd.progress_pct : null;
  const parts: string[] = [];
  if (stage || phase) parts.push((stage ?? phase) as string);
  if (pct !== null) parts.push(`${pct}%`);
  if (message) parts.push(message);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function inFlightFor(job: GenerationJob): string {
  const start = new Date(job.created_at).getTime();
  const elapsedSec = Math.floor((Date.now() - start) / 1000);
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return `${m}m ${s}s`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  // Set of job_ids that have at least one failed postiz_publication.
  // A job can be `completed` (video rendered) but the auto-publish failed
  // — those should surface in the Failed tab too, not just in Recent
  // publications above.
  const [jobsWithFailedPub, setJobsWithFailedPub] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const fetchJobs = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('generation_jobs')
        .select(
          'id, model_slug, operation, status, prompt, output_media_url, ' +
            'output_thumbnail_url, credit_cost, duration_seconds, resolution, ' +
            'input_params, progress_detail, error_message, error_code, ' +
            'created_at, updated_at, completed_at, deleted_at',
        )
        .is('deleted_at', null)
        // Automated runs only — manual API/wizard/CLI jobs land in /gallery.
        .not('input_params->>schedule_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (queryError) {
        if (queryError.code === '42P01') {
          setJobs([]);
        } else {
          throw queryError;
        }
      } else {
        const list = (data ?? []) as unknown as GenerationJob[];
        setJobs(list);
        // Pull failed publications for these jobs to flag rows in the
        // Failed tab even when the underlying video status is "completed".
        if (list.length > 0) {
          const jobIds = list.map((j) => j.id);
          const { data: pubs } = await supabase
            .from('postiz_publications')
            .select('job_id')
            .in('job_id', jobIds)
            .eq('status', 'failed');
          const failed = new Set<string>();
          for (const p of (pubs ?? [])) {
            const jid = (p as { job_id?: string }).job_id;
            if (jid) failed.add(jid);
          }
          setJobsWithFailedPub(failed);
        } else {
          setJobsWithFailedPub(new Set());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Realtime — only AUTOMATED rows (input_params.schedule_id set).
  // Realtime delivers every UPDATE on generation_jobs that RLS lets us
  // see, so we filter at the handler.
  useEffect(() => {
    const supabase = createClient();
    const isAutomated = (j: GenerationJob): boolean =>
      !!(j.input_params && typeof (j.input_params as Record<string, unknown>).schedule_id === 'string');
    const channel = supabase
      .channel('jobs-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'generation_jobs' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const j = payload.new as GenerationJob;
            if (j.deleted_at || !isAutomated(j)) return;
            setJobs((prev) => [j, ...prev.filter((p) => p.id !== j.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const j = payload.new as GenerationJob;
            if (!isAutomated(j)) return;
            setJobs((prev) => {
              if (j.deleted_at) return prev.filter((p) => p.id !== j.id);
              const idx = prev.findIndex((p) => p.id === j.id);
              if (idx === -1) return [j, ...prev];
              const next = [...prev];
              next[idx] = j;
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string };
            setJobs((prev) => prev.filter((p) => p.id !== old.id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Live tick so "in-flight for Xm Ys" updates without a status flip
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // A job counts as "failed" if EITHER:
  //   - the video generation itself failed/canceled (TERMINAL_FAILED_STATUSES), or
  //   - the video completed but auto-publish to at least one destination failed.
  // Both surface in the Failed tab so the user sees one place to find broken runs.
  const isFailed = useCallback(
    (j: GenerationJob): boolean =>
      TERMINAL_FAILED_STATUSES.has(j.status) || jobsWithFailedPub.has(j.id),
    [jobsWithFailedPub],
  );

  const counts = useMemo(() => {
    const c = { all: jobs.length, running: 0, completed: 0, failed: 0 };
    for (const j of jobs) {
      if (RUNNING_STATUSES.has(j.status)) c.running += 1;
      else if (j.status === 'completed' && !jobsWithFailedPub.has(j.id)) c.completed += 1;
      if (isFailed(j)) c.failed += 1;
    }
    return c;
  }, [jobs, jobsWithFailedPub, isFailed]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return jobs;
    if (activeTab === 'running') return jobs.filter((j) => RUNNING_STATUSES.has(j.status));
    if (activeTab === 'completed') return jobs.filter((j) => j.status === 'completed' && !jobsWithFailedPub.has(j.id));
    return jobs.filter(isFailed);
  }, [activeTab, jobs, jobsWithFailedPub, isFailed]);

  async function handleCancel(jobId: string) {
    if (!confirm('Cancel this job? Credits will be refunded if the worker hasn\'t already started rendering.')) return;
    setCancelingId(jobId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Not authenticated');
        return;
      }
      // Omit cookies: this route uses Authorization Bearer only, and the
      // Supabase auth cookie bloat was tripping Node's 16KB header limit
      // (returning HTTP 431 before our handler even ran).
      const res = await fetch(`/api/v1/videos/${jobId}/cancel`, {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message ?? `Cancel failed (${res.status})`);
      }
    } finally {
      setCancelingId(null);
    }
  }

  // Confirmation modal state. Native confirm() is ugly + blocks the
  // event loop; this is a tiny inline alternative.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Soft-delete via UPDATE deleted_at. RLS on generation_jobs allows
  // UPDATE for the row owner but NOT DELETE — a hard DELETE returns
  // no rows + no error, looks like nothing happened. Soft-delete is
  // already the schema convention (fetchJobs filters on deleted_at IS NULL).
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('generation_jobs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', pendingDelete.id);
      if (error) {
        setError(`Delete failed: ${error.message}`);
        return;
      }
      setJobs((prev) => prev.filter((j) => j.id !== pendingDelete.id));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete(jobId: string, label: string) {
    setPendingDelete({ id: jobId, label });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Automated Jobs</h1>
          <p className="mt-1 text-sm text-text-muted">
            Live monitor for runs created by your schedules. Manual API and wizard jobs land in{' '}
            <Link href="/gallery" className="text-accent hover:underline">Gallery</Link>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchJobs(true)} disabled={refreshing}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Schedules + Recent publications + Create wizard */}
      <div className="mt-8">
        <SchedulesPanel
          onJobTriggered={async (jobId, _name) => {
            // Optimistically pull the freshly-inserted row so the Runs
            // section updates in the same tick as the Run-now click —
            // not on the realtime delay. Idempotent: if the row is
            // already in jobs (realtime got there first), we replace.
            try {
              const supabase = createClient();
              const { data } = await supabase
                .from('generation_jobs')
                .select(
                  'id, model_slug, operation, status, prompt, output_media_url, ' +
                    'output_thumbnail_url, credit_cost, duration_seconds, resolution, ' +
                    'input_params, progress_detail, error_message, error_code, ' +
                    'created_at, updated_at, completed_at, deleted_at',
                )
                .eq('id', jobId)
                .maybeSingle();
              if (data) {
                setJobs((prev) => {
                  const next = prev.filter((p) => p.id !== jobId);
                  return [data as unknown as GenerationJob, ...next];
                });
              }
            } catch { /* realtime will catch up */ }
          }}
        />
      </div>

      <div className="mt-10 mb-4 border-b border-border pb-3">
        <h2 className="text-base font-semibold text-text">Runs</h2>
        <p className="mt-0.5 text-xs text-text-muted">Every scheduled run, newest first.</p>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {([
          { id: 'all', label: 'All', n: counts.all },
          { id: 'running', label: 'Running', n: counts.running },
          { id: 'completed', label: 'Completed', n: counts.completed },
          { id: 'failed', label: 'Failed', n: counts.failed },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
              activeTab === t.id
                ? 'bg-accent text-accent-foreground'
                : 'bg-card text-text-muted ring-1 ring-border hover:text-text'
            }`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 text-xs ${activeTab === t.id ? 'bg-white/20' : 'bg-zinc-100'}`}>
              {t.n}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Job list */}
      <div className="mt-6 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading jobs…
          </div>
        )}

        {!loading && filtered.length === 0 && jobs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
            <Terminal className="mx-auto h-8 w-8 text-text-muted" />
            <p className="mt-3 text-sm font-semibold text-text">No automated runs yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Schedules create jobs that show up here. Create one above.
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Manual jobs (API, wizard, CLI) appear in{' '}
              <Link href="/gallery" className="text-accent hover:underline">
                Gallery
              </Link>{' '}
              instead.
            </p>
          </div>
        )}

        {!loading && filtered.length === 0 && jobs.length > 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center">
            <p className="text-sm text-text-muted">
              No runs match the <span className="font-semibold text-text">{activeTab}</span> filter.{' '}
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className="text-accent hover:underline"
              >
                Show all
              </button>
            </p>
          </div>
        )}

        {filtered.map((job) => {
          const op = operationLabel(job.operation);
          const progress = progressLine(job);
          const inflightLabel = RUNNING_STATUSES.has(job.status) ? `running for ${inFlightFor(job)}` : null;
          const promptExcerpt = job.prompt ? job.prompt.slice(0, 140) : '(no prompt)';
          const isVideo = job.output_media_url?.endsWith('.mp4');
          const isImage = job.output_media_url && !isVideo;

          return (
            <div
              key={job.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
            >
              {/* Thumbnail — for completed video runs, render the actual
                  video with controls so the user can play the result
                  inline. Pre-recorded poster_url (if any) wins; otherwise
                  preload='metadata' makes the browser show the first frame. */}
              <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-md bg-zinc-100 ring-1 ring-border sm:h-20 sm:w-28">
                {isVideo && job.output_media_url ? (
                  // Inline preview — controls let the user scrub without
                  // leaving the page. muted+playsInline so autoplay-policy
                  // doesn't block the first-frame snapshot.
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={job.output_media_url}
                    poster={job.output_thumbnail_url ?? undefined}
                    preload="metadata"
                    controls
                    muted
                    playsInline
                    className="h-full w-full bg-black object-cover"
                  />
                ) : job.output_thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={job.output_thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : isImage && job.output_media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={job.output_media_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {RUNNING_STATUSES.has(job.status) ? (
                      <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                    ) : TERMINAL_FAILED_STATUSES.has(job.status) ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-text-muted" />
                    )}
                  </div>
                )}
              </div>

              {/* Center info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={job.status} />
                  {jobsWithFailedPub.has(job.id) && (
                    <Badge variant="default" className="gap-1 border-red-300 bg-red-50 text-red-700">
                      <XCircle className="h-3 w-3" /> Publish failed
                    </Badge>
                  )}
                  <Badge variant="default" className="font-mono text-[10px] uppercase tracking-wider">
                    {op}
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {relativeTime(job.created_at)}
                    {inflightLabel ? <> · {inflightLabel}</> : null}
                  </span>
                  {job.credit_cost ? (
                    <span className="text-xs text-text-muted">· {job.credit_cost} cr</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm text-text" title={job.prompt ?? ''}>
                  {promptExcerpt}
                </p>
                {progress && (
                  <p className="mt-0.5 truncate text-xs text-blue-700">{progress}</p>
                )}
                {job.status === 'failed' && job.error_message && (
                  <p className="mt-0.5 truncate text-xs text-red-700">
                    {job.error_code ? `[${job.error_code}] ` : ''}{job.error_message}
                  </p>
                )}

                {/* Intermediate artifacts: clickable thumbnails only — no
                    text chips. Hover for the label via title attribute. */}
                {(() => {
                  const ip = (job.input_params as Record<string, unknown> | undefined) ?? {};
                  const charSheet = typeof ip.character_sheet_url === 'string' ? ip.character_sheet_url : null;
                  const storyboard = typeof ip.storyboard_url === 'string' ? ip.storyboard_url : null;
                  const assetUrl = typeof ip.asset_url === 'string' ? ip.asset_url : null;
                  const assetType = typeof ip.asset_type === 'string' ? ip.asset_type : null;
                  const runTopic = typeof ip.run_topic === 'string' ? ip.run_topic : null;
                  if (!charSheet && !storyboard && !assetUrl && !runTopic) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {runTopic && (
                        <span
                          className="truncate text-xs text-text-muted"
                          title={runTopic}
                        >
                          {runTopic.slice(0, 60)}
                        </span>
                      )}
                      {[
                        charSheet && { href: charSheet, label: 'Character reference' },
                        storyboard && { href: storyboard, label: 'Per-run storyboard' },
                        assetUrl && { href: assetUrl, label: `Asset · ${assetType ?? 'reference'}` },
                      ]
                        .filter((x): x is { href: string; label: string } => !!x)
                        .map((thumb) => (
                          <a
                            key={thumb.href}
                            href={thumb.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={thumb.label}
                            className="block h-7 w-7 overflow-hidden rounded ring-1 ring-border transition-shadow hover:ring-accent"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumb.href} alt="" className="h-full w-full object-cover" />
                          </a>
                        ))}
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                {RUNNING_STATUSES.has(job.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancel(job.id)}
                    disabled={cancelingId === job.id}
                  >
                    {cancelingId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Cancel</span>
                  </Button>
                )}
                {job.status === 'completed' && job.output_media_url && (
                  <>
                    <a
                      href={job.output_media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-text ring-1 ring-border hover:bg-zinc-50"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                    <Link
                      href={`/gallery/${job.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-text ring-1 ring-border hover:bg-zinc-50"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </>
                )}
                {TERMINAL_FAILED_STATUSES.has(job.status) && (
                  <Link
                    href={`/create?retry=${job.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-text ring-1 ring-border hover:bg-zinc-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </Link>
                )}
                {!RUNNING_STATUSES.has(job.status) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(job.id, job.prompt?.slice(0, 60) || job.id.slice(0, 8))}
                    className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-text-muted ring-1 ring-border hover:bg-zinc-50 hover:text-text"
                    title="Remove from list"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm-delete modal — replaces the ugly native confirm(). */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !deleting && setPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-4 w-4 text-red-700" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-text">Delete this run?</h3>
                <p className="mt-1 text-sm text-text-muted">
                  Removes this run from the list. The generated video stays in your gallery.
                </p>
                <p className="mt-2 truncate font-mono text-xs text-text-muted" title={pendingDelete.label}>
                  {pendingDelete.label}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-text ring-1 ring-border hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
