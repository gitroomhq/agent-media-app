// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/gallery
 *
 * Full list of `generation_jobs` rows (completed, not deleted),
 * newest first. Same dark cards as the home tab but without the row
 * cap and with a date-grouped layout.
 *
 * Clicking a card jumps to /gallery/<id> which is the existing
 * full-detail view (kept as-is for now to limit churn).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, PlayCircle } from 'lucide-react';
import { VideoPlayerModal, type VideoModalSubject } from '@/components/video-player-modal';
import { PublishToSocial } from '@/components/publish-to-social';

interface GenerationJob {
  id: string;
  model_slug: string | null;
  operation: string | null;
  prompt: string | null;
  output_media_url: string | null;
  output_thumbnail_url: string | null;
  duration_seconds: number | null;
  created_at: string;
}

const PAGE_SIZE = 24;

// ── Gallery tabs ──────────────────────────────────────────────────────────
// All  → every completed video (v2 + legacy mixed).
// Selfies → v2 selfie jobs only.
//
// Character sheets / storyboards / character_create are intentionally
// excluded from both tabs — they're behind-the-scenes assets the user
// never asks for directly, just plumbing for video generation.
type GalleryTab = 'videos' | 'images' | 'all';

const TABS: { id: GalleryTab; label: string }[] = [
  { id: 'videos', label: 'Videos' },
  { id: 'images', label: 'Images' },
  { id: 'all',    label: 'All' },
];

const VIDEO_RE = /\.(mp4|webm|mov)(\?|$|#)/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif)(\?|$|#)/i;

// Behind-the-scenes ops never shown in the gallery (sheets, storyboards,
// character-create artifacts).
const HIDDEN_OPS = ['character_create', 'character_sheet', 'character_storyboard'];

export default function DashboardGalleryPage() {
  // Default to "All" so every generation is visible immediately. Defaulting to
  // "videos" made the page look EMPTY for users whose recent feed is all images
  // (portraits/character sheets) — the "all my work disappeared" report.
  const [tab, setTab] = useState<GalleryTab>('all');
  const [jobs, setJobs] = useState<GenerationJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState<VideoModalSubject | null>(null);

  // Fetch one page via the merged /v1/me/gallery endpoint (legacy
  // generation_jobs + vNext skill_runs + vNext primitive_runs, joined
  // server-side). Returns the filtered videos plus the raw page count
  // so the infinite-scroll sentinel can decide whether to keep going.
  const fetchPage = useCallback(
    async (offset: number): Promise<{ videos: GenerationJob[]; rawCount: number; hasMore: boolean } | null> => {
      // Always pull the full merged feed; filter to video/image client-side
      // so one server page powers every tab.
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        filter: 'all',
      });
      try {
        const resp = await fetch(`/api/v1/me/gallery?${params.toString()}`, { credentials: 'include' });
        if (!resp.ok) {
          if (resp.status !== 401) setError(`gallery ${resp.status}`);
          return null;
        }
        const json = (await resp.json()) as {
          items?: Array<{
            id: string;
            source: string;
            primitive: string | null;
            status: string;
            created_at: string;
            media_url: string | null;
            thumbnail_url: string | null;
            duration_seconds: number | null;
            prompt: string | null;
          }>;
          has_more?: boolean;
        };
        const raw = (json.items ?? []).filter((it) => !HIDDEN_OPS.includes(it.primitive ?? ''));
        const matchesTab = (url: string | null): boolean => {
          if (!url) return false;
          if (tab === 'videos') return VIDEO_RE.test(url);
          if (tab === 'images') return IMAGE_RE.test(url);
          return VIDEO_RE.test(url) || IMAGE_RE.test(url); // all
        };
        const videos = raw
          .filter((j) => matchesTab(j.media_url))
          .map((j) => ({
            id: j.id,
            model_slug: j.primitive,
            operation: j.primitive,
            prompt: j.prompt,
            output_media_url: j.media_url,
            output_thumbnail_url: j.thumbnail_url,
            duration_seconds: j.duration_seconds,
            created_at: j.created_at,
          })) as GenerationJob[];
        return { videos, rawCount: raw.length, hasMore: Boolean(json.has_more) };
      } catch (err) {
        setError((err as Error).message);
        return null;
      }
    },
    [tab],
  );

  // Track raw fetched offset separately from displayed list -
  // client-side filtering can drop rows but we still need to know
  // where the server cursor is for the next page.
  const fetchedRef = useRef(0);

  // Initial page (re-runs when tab changes via fetchPage identity).
  useEffect(() => {
    let cancelled = false;
    // Reset visible state so the user sees the loading spinner during
    // a tab switch and can never see a stale "no more" state across tabs.
    setJobs(null);
    setHasMore(true);
    setError(null);
    fetchedRef.current = 0;
    (async () => {
      const page = await fetchPage(0);
      if (cancelled) return;
      if (!page) {
        setJobs([]);
        setHasMore(false);
        return;
      }
      fetchedRef.current = page.rawCount;
      setJobs(page.videos);
      setHasMore(page.hasMore);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  // Sentinel: when it scrolls into view, fetch the next page.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || jobs === null) return;
    const obs = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        const next = await fetchPage(fetchedRef.current);
        if (!next) {
          setLoadingMore(false);
          setHasMore(false);
          return;
        }
        fetchedRef.current += next.rawCount;
        setJobs((prev) => [...(prev ?? []), ...next.videos]);
        setHasMore(next.hasMore);
        setLoadingMore(false);
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [jobs, hasMore, loadingMore, fetchPage]);

  const loading = jobs === null;

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Gallery
        </p>
        <h1
          className="font-normal"
          style={{
            color: '#E9E9F0',
            fontSize: 'clamp(28px,2.6vw,36px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          All generations
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Every output you&rsquo;ve generated — videos and images — newest first.
        </p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div
        className="mt-6 inline-flex items-center gap-1 rounded-full p-1"
        role="tablist"
        aria-label="Filter generations"
        style={{
          backgroundColor: '#15161D',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className="rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? '#A78BFA' : 'transparent',
                color: active ? '#0F1015' : 'rgba(255,255,255,0.62)',
                fontWeight: active ? 600 : 500,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <section className="mt-10">
        {error ? (
          <div
            className="rounded-2xl px-4 py-3 text-sm"
            style={{
              border: '1px solid rgba(255,79,79,0.3)',
              backgroundColor: 'rgba(255,79,79,0.08)',
              color: '#FCA5A5',
            }}
          >
            {error}
          </div>
        ) : loading ? (
          <div
            className="flex h-48 items-center justify-center rounded-2xl"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </span>
          </div>
        ) : jobs && (jobs.length > 0 || hasMore) ? (
          <>
            {jobs.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {jobs.map((job) => (
                  <GenerationCard key={job.id} job={job} onOpen={setPlaying} />
                ))}
              </div>
            )}
            {/* Keep the sentinel mounted whenever more pages exist — even if THIS
                tab's first page filtered to zero items — so a sparse tab (e.g.
                Videos when the recent feed is all images) auto-loads deeper pages
                instead of showing a false "Nothing here yet". */}
            {hasMore ? (
              <div
                ref={sentinelRef}
                className={jobs.length > 0 ? 'mt-6 flex h-12 items-center justify-center' : 'flex h-48 items-center justify-center'}
              >
                <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more…
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-2xl py-16"
            style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#15161D' }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.25)',
              }}
              aria-hidden
            >
              <Sparkles className="h-5 w-5" style={{ color: '#A78BFA' }} />
            </span>
            <p className="text-base font-medium" style={{ color: '#E9E9F0' }}>
              Nothing here yet
            </p>
            <p className="max-w-sm text-center text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Your completed generations will land in this view.
            </p>
          </div>
        )}
      </section>

      <VideoPlayerModal subject={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}

function LazyMedia({
  videoSrc,
  imgSrc,
  videoRef,
}: {
  videoSrc: string | null;
  imgSrc: string | null;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={wrapperRef} className="absolute inset-0">
      {visible && videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          preload="metadata"
          muted
          playsInline
          loop
          className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      ) : visible && imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: '#1F202A' }}>
          <Sparkles className="h-6 w-6" style={{ color: 'rgba(255,255,255,0.18)' }} />
        </div>
      )}
    </div>
  );
}

function GenerationCard({
  job,
  onOpen,
}: {
  job: GenerationJob;
  onOpen: (s: VideoModalSubject) => void;
}) {
  const isVideo =
    !!job.output_media_url && /\.(mp4|webm|mov)(\?|$)/i.test(job.output_media_url);
  // For image rows (character sheets, storyboards, etc.) prefer the
  // explicit thumbnail when set, but fall back to the media URL itself
  // when it looks like an image. Without this fallback, character_sheet
  // rows render as empty cards because they only set output_media_url
  // (a PNG) and never populate output_thumbnail_url.
  const looksLikeImage = !!job.output_media_url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(job.output_media_url);
  const thumbImg = isVideo
    ? null
    : (job.output_thumbnail_url ?? (looksLikeImage ? job.output_media_url : null));
  const date = new Date(job.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function handleEnter() {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  }
  function handleLeave() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try { v.currentTime = 0; } catch {}
  }
  const openable = isVideo || looksLikeImage;
  function handleClick() {
    if (!job.output_media_url) return;
    if (isVideo) {
      onOpen({
        id: job.id,
        url: job.output_media_url,
        label: job.operation ?? job.model_slug ?? null,
        date,
      });
    } else if (looksLikeImage) {
      window.open(job.output_media_url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="group relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
      style={{
        backgroundColor: '#191A22',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Dedicated click layer (z-2) — a sibling BELOW the social icons (z-10),
          so clicking an icon never opens the media. */}
      {openable ? (
        <button type="button" aria-label="Open" onClick={handleClick} className="absolute inset-0 z-[2]" style={{ cursor: 'pointer' }} />
      ) : null}
      {isVideo && job.output_media_url ? (
        <PublishToSocial videoUrl={job.output_media_url} />
      ) : null}
      <LazyMedia
        videoSrc={isVideo ? job.output_media_url : null}
        imgSrc={!isVideo ? thumbImg : null}
        videoRef={videoRef}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(15,16,21,0) 0%, rgba(15,16,21,0.85) 70%, rgba(15,16,21,0.95) 100%)',
        }}
        aria-hidden
      />
      {isVideo ? (
        <span
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-opacity group-hover:opacity-0"
          style={{ backgroundColor: 'rgba(15,16,21,0.6)' }}
          aria-hidden
        >
          <PlayCircle className="h-4 w-4" style={{ color: '#A78BFA' }} />
        </span>
      ) : null}
      <div className="relative mt-auto px-3 py-3">
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
          {date}
        </span>
      </div>
    </div>
  );
}
