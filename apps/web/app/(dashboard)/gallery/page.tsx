// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Gallery page — displays completed generation results.
 *
 * Only shows successfully completed jobs with their media previews.
 * Job status tracking (submitted, processing, failed) is CLI-only.
 * Subscribes to Supabase Realtime so new completions appear live.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { analytics } from '@/lib/analytics';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GenerationJob {
  id: string;
  model_slug: string;
  operation: string;
  status: string;
  prompt: string;
  output_media_url: string | null;
  output_thumbnail_url: string | null;
  credit_cost: number;
  duration_seconds: number | null;
  resolution: string | null;
  input_params: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

type FilterTab = 'all' | 'video';

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

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function GalleryPage() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);

  // ── Fetch completed jobs only ──────────────────────────────────────────
  const fetchJobs = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      let query = supabase
        .from('generation_jobs')
        .select(
          'id, model_slug, operation, status, prompt, output_media_url, output_thumbnail_url, credit_cost, duration_seconds, resolution, input_params, created_at, completed_at, deleted_at',
        )
        .eq('status', 'completed');

      if (!showDeleted) {
        query = query.is('deleted_at', null);
      }

      const { data, error: queryError } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (queryError) {
        if (queryError.code === '42P01') {
          setJobs([]);
        } else {
          throw queryError;
        }
      } else {
        setJobs((data ?? []) as GenerationJob[]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load gallery';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showDeleted]);

  useEffect(() => {
    analytics.init();
    analytics.trackEvent('gallery_viewed');
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ── Subscribe to Realtime for new completions ──────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('gallery-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_jobs',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as GenerationJob;
            if (newJob.status !== 'completed') return;
            if (!showDeleted && newJob.deleted_at) return;
            setJobs((prev) => [newJob, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as GenerationJob;
            if (updated.status !== 'completed') {
              // Job is no longer completed (unlikely) — remove it
              setJobs((prev) => prev.filter((j) => j.id !== updated.id));
              return;
            }
            if (!showDeleted && updated.deleted_at) {
              setJobs((prev) => prev.filter((j) => j.id !== updated.id));
            } else {
              // Job just completed — add or update
              setJobs((prev) => {
                const exists = prev.some((j) => j.id === updated.id);
                if (exists) {
                  return prev.map((j) => (j.id === updated.id ? updated : j));
                }
                return [updated, ...prev];
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string };
            setJobs((prev) => prev.filter((j) => j.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showDeleted]);

  // ── Delete / Restore handlers ──────────────────────────────────────────
  async function handleDelete(jobId: string) {
    if (!confirm('Delete this item?')) return;
    try {
      const { error: fnError } = await invokeFn('gallery-delete', { body: { jobId } });
      if (fnError) throw fnError;
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      analytics.trackEvent('media_deleted', { job_id: jobId });
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  async function handleRestore(jobId: string) {
    try {
      const { error: fnError } = await invokeFn('gallery-delete', { body: { jobId, restore: true } });
      if (fnError) throw fnError;
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, deleted_at: null } : j)),
      );
    } catch (err) {
      console.error('Failed to restore:', err);
    }
  }

  // ── Filter jobs ─────────────────────────────────────────────────────────
  const filteredJobs = jobs.filter((job) => {
    const modelType = MODEL_TYPES[job.model_slug] ?? 'video';
    switch (activeTab) {
      case 'video':
        return modelType === 'video';
      default:
        return true;
    }
  });

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: jobs.length },
    {
      key: 'video',
      label: 'Videos',
      count: jobs.filter((j) => (MODEL_TYPES[j.model_slug] ?? 'video') === 'video').length,
    },
  ];

  // ── Loading State ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-text">Gallery</h1>
        <p className="mt-2 text-sm text-text-muted">
          Your generated videos
        </p>
        <div className="mt-12 flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-4 text-sm text-text-muted">
            Loading gallery...
          </p>
        </div>
      </div>
    );
  }

  // ── Error State ─────────────────────────────────────────────────────────
  if (error && jobs.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-text">Gallery</h1>
        <p className="mt-2 text-sm text-text-muted">
          Your generated videos
        </p>
        <div className="mt-12 flex flex-col items-center justify-center py-20">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
            <AlertCircle className="mx-auto h-8 w-8 text-danger" />
          </div>
          <p className="mt-4 text-sm text-danger">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => fetchJobs()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Gallery</h1>
          <p className="mt-2 text-sm text-text-muted">
            Your generated videos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchJobs(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-2 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mt-8 flex items-center gap-3">
        <div className="flex flex-1 gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setVisibleCount(12); }}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-4 py-2 text-sm transition-colors ${
                activeTab === tab.key
                  ? 'bg-accent-dim text-accent'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`text-[10px] ${
                    activeTab === tab.key ? 'text-accent/70' : 'text-text-muted/60'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Show deleted toggle */}
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-accent"
          />
          <span className="text-[10px] text-text-muted">
            Show deleted
          </span>
        </label>
      </div>

      {/* Gallery grid */}
      {filteredJobs.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center py-20">
          <div className="rounded-lg border border-border bg-card p-5">
            <Film className="h-10 w-10 text-text-muted" />
          </div>
          <h2 className="mt-6 text-lg font-semibold text-text">
            {activeTab === 'all'
              ? 'Your gallery is empty'
              : `No ${activeTab}s yet`}
          </h2>
          <p className="mt-2 max-w-sm text-center text-sm text-text-muted">
            {activeTab === 'all'
              ? 'Generate your first video or image from the CLI to see it appear here in real time.'
              : `Generate a ${activeTab} from the CLI and it will show up here.`}
          </p>
          {activeTab === 'all' && (
            <>
              <div className="mt-6 w-full max-w-md overflow-hidden rounded-lg border border-border bg-background">
                <div className="space-y-2 px-4 py-3">
                  <p className="font-mono text-sm text-text-muted">
                    <span className="text-text">$ agent-media generate video -p &apos;your prompt&apos; --sync</span>
                  </p>
                  <p className="font-mono text-sm text-text-muted">
                    <span className="text-text">$ agent-media generate video -p &apos;cinematic shot&apos; --wait --download</span>
                  </p>
                </div>
              </div>
              <Link
                href="/docs"
                className="mt-5 inline-flex items-center gap-2 text-sm text-[#121212] transition-colors hover:text-[#121212]/70"
              >
                <BookOpen className="h-3.5 w-3.5" />
                View all commands in docs
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
        <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {filteredJobs.slice(0, visibleCount).map((job) => {
            const modelType = MODEL_TYPES[job.model_slug] ?? 'video';

            return (
              <div
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (job.output_media_url) {
                    window.open(job.output_media_url, '_blank');
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && job.output_media_url) {
                    window.open(job.output_media_url, '_blank');
                  }
                }}
                className={`group relative flex flex-col overflow-hidden rounded-lg border border-border transition-all hover:border-border-bright/30 cursor-pointer ${job.deleted_at ? 'opacity-50 grayscale' : ''}`}
              >
                {/* Media preview — first frame only, no autoPlay */}
                <div className="relative aspect-[9/16] w-full bg-background">
                  {job.output_media_url ? (
                    modelType === 'video' ? (
                      <video
                        src={`${job.output_media_url}#t=0.5`}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover pointer-events-none"
                        poster={job.output_thumbnail_url ?? undefined}
                      />
                    ) : (
                      <img
                        src={job.output_thumbnail_url ?? job.output_media_url}
                        alt={job.prompt}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : job.output_thumbnail_url ? (
                    <img
                      src={job.output_thumbnail_url}
                      alt={job.prompt}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Terminal className="h-8 w-8 text-text-muted" />
                    </div>
                  )}

                  {/* Play icon overlay for videos */}
                  {modelType === 'video' && job.output_media_url && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                        <Film className="h-5 w-5" />
                      </div>
                    </div>
                  )}

                  {/* Action buttons on hover */}
                  <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {job.output_media_url && (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            analytics.trackEvent('media_downloaded', { job_id: job.id, model: job.model_slug });
                            window.open(job.output_media_url!, '_blank');
                          }
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          analytics.trackEvent('media_downloaded', { job_id: job.id, model: job.model_slug });
                          window.open(job.output_media_url!, '_blank');
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/80 text-text-muted backdrop-blur-sm transition-colors hover:text-accent"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </span>
                    )}

                    {job.deleted_at ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRestore(job.id);
                          }
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRestore(job.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/80 text-text-muted backdrop-blur-sm transition-colors hover:text-accent"
                        title="Restore"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(job.id);
                          }
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(job.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/80 text-text-muted backdrop-blur-sm transition-colors hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Card body */}
                <div className="flex flex-1 flex-col p-4">
                  <p className="line-clamp-2 font-mono text-sm text-text">
                    {job.prompt}
                  </p>

                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2">
                    <div className="space-y-1 font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-text-muted">model</span>
                        <span className="text-cyan">{job.model_slug}</span>
                      </div>
                      {job.resolution && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">resolution</span>
                          <span className="text-text">{job.resolution}</span>
                        </div>
                      )}
                      {job.input_params?.aspect_ratio != null && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">aspect</span>
                          <span className="text-text">{String(job.input_params.aspect_ratio)}</span>
                        </div>
                      )}
                      {job.duration_seconds !== null && (
                        <div className="flex justify-between">
                          <span className="text-text-muted">duration</span>
                          <span className="text-text">
                            {formatDuration(job.duration_seconds)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-text-muted">cost</span>
                        <span className="text-accent">
                          {job.credit_cost} credits
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-text-muted">
                      {formatTimeAgo(job.created_at)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={modelType === 'video' ? 'video' : 'image'}
                      >
                        {modelType === 'video' ? (
                          <Film className="mr-1 h-2.5 w-2.5" />
                        ) : (
                          <ImageIcon className="mr-1 h-2.5 w-2.5" />
                        )}
                        {modelType.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-[10px] text-text-muted">
                        {job.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Load More */}
        {visibleCount < filteredJobs.length && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + 12)}
            >
              Load More ({filteredJobs.length - visibleCount} remaining)
            </Button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
