// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard - Home tab.
 *
 * Shows a welcome line + a grid of the user's most recent
 * `generation_jobs` rows (completed only, newest first, capped at 12).
 * If the user has no generations yet we show an empty-state with a
 * link off to /create.
 *
 * All styling follows the dark palette established in
 * apps/web/app/(app-dark)/dashboard/layout.tsx.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, PlayCircle, Crown, ArrowRight } from 'lucide-react';
import { ClaudeIcon, CursorIcon, AnthropicIcon, OpenAIIcon } from '@/components/brand-icons';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { VideoPlayerModal, type VideoModalSubject } from '@/components/video-player-modal';
import { PublishToSocial } from '@/components/publish-to-social';

interface GenerationJob {
  id: string;
  model_slug: string | null;
  operation: string | null;
  status: string | null;
  prompt: string | null;
  output_media_url: string | null;
  output_thumbnail_url: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface CreditsResp {
  credits?: {
    total?: number;
    monthly_remaining?: number;
    purchased?: number;
  } | null;
  plan?: { tier?: string | null; name?: string | null } | null;
}

export default function DashboardHomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [playing, setPlaying] = useState<VideoModalSubject | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setEmail(user?.email ?? null);

      // Plan tier via the same Supabase edge function /subscribe uses.
      // (Credits live in the sidebar now — the home card surfaces Skills & MCP.)
      invokeFn('credits-check', { method: 'GET' })
        .then(({ data }) => {
          if (cancelled) return;
          const resp = data as CreditsResp | null;
          if (resp?.plan?.tier) setPlanTier(resp.plan.tier);
        })
        .catch(() => {});

      // Merged feed: legacy generation_jobs + vNext primitive_runs +
      // vNext composed skill_runs, all returned in one date-sorted list
      // by the api-v2 route /v1/me/gallery (proxied same-origin).
      try {
        const resp = await fetch('/api/v1/me/gallery?limit=60', { credentials: 'include' });
        if (!resp.ok) {
          if (resp.status !== 401) {
            setError(`gallery ${resp.status}`);
          }
          setJobs([]);
        } else {
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
          };
          if (cancelled) return;
          // Show recent generations of ANY type — videos AND images
          // (portraits/character sheets). Filtering to videos-only made the
          // home read "No generations yet" for users whose recent work is all
          // images (the "everything disappeared" report).
          const MEDIA_RE = /\.(mp4|webm|mov|png|jpe?g|webp|gif)(\?|$)/i;
          const recent = (json.items ?? []).filter(
            (j) => j.media_url && MEDIA_RE.test(j.media_url),
          );
          // Map to the GenerationJob shape the existing UI expects.
          setJobs(
            recent.slice(0, 12).map((j) => ({
              id: j.id,
              model_slug: j.primitive,
              operation: j.primitive,
              status: j.status,
              prompt: j.prompt,
              output_media_url: j.media_url,
              output_thumbnail_url: j.thumbnail_url,
              duration_seconds: j.duration_seconds,
              created_at: j.created_at,
            })) as GenerationJob[],
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setJobs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = (email ?? '').split('@')[0];
  const loading = jobs === null;

  const planLabel = planTier && planTier !== 'free' && planTier !== 'payg'
    ? planTier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Free';
  const onFreePlan = !planTier || planTier === 'free' || planTier === 'payg';

  return (
    <div className="relative mx-auto w-full max-w-6xl px-8 py-10">
      {/* Soft warm glow at the very top — the Huly signature */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 h-64"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.06) 35%, rgba(15,16,21,0) 75%)',
        }}
      />

      {/* Header */}
      <div className="relative flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Home
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
          Welcome back{firstName ? <>, <span style={{ color: 'rgba(255,255,255,0.78)' }}>{firstName}</span></> : null}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Here&rsquo;s what&rsquo;s happening in your workspace.
        </p>
      </div>

      {/* Stat row */}
      <section className="relative mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SkillsMcpCard />
        <StatCard
          label="Automations"
          value="No runs yet"
          valueMuted
          cta={{ label: 'Run your first automation', href: '/jobs' }}
        />
        <StatCard
          label="Your plan"
          value={planLabel}
          pill={onFreePlan ? 'Free' : null}
          accent
          cta={{
            label: onFreePlan ? 'Upgrade plan' : 'Manage plan',
            href: '/dashboard/billing',
            emphasis: true,
          }}
        />
      </section>

      {/* Recent generations */}
      <section className="relative mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Recent generations
          </h2>
          <Link
            href="/dashboard/gallery"
            className="text-xs font-medium transition-opacity hover:opacity-80"
            style={{ color: '#A78BFA' }}
          >
            View all →
          </Link>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : loading ? (
          <LoadingState />
        ) : jobs && jobs.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {jobs.map((job) => (
              <GenerationCard key={job.id} job={job} onOpen={setPlaying} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      <VideoPlayerModal subject={playing} onClose={() => setPlaying(null)} />
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
  // Images (portraits/character sheets) set output_media_url to a PNG and may
  // not populate output_thumbnail_url — fall back to the media URL itself so
  // they render instead of an empty placeholder.
  const looksLikeImage =
    !!job.output_media_url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(job.output_media_url);
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
  function handleClick() {
    if (!isVideo || !job.output_media_url) return;
    onOpen({
      id: job.id,
      url: job.output_media_url,
      label: job.operation ?? job.model_slug ?? null,
      date,
    });
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
      {/* Dedicated click layer for opening the video — a sibling BELOW the
          social icons (z-10), so clicking an icon never opens the video. */}
      {isVideo && job.output_media_url ? (
        <button type="button" aria-label="Open video" onClick={handleClick} className="absolute inset-0 z-[2]" style={{ cursor: 'pointer' }} />
      ) : null}
      {isVideo && job.output_media_url ? (
        <PublishToSocial videoUrl={job.output_media_url} />
      ) : null}
      {isVideo && job.output_media_url ? (
        <video
          ref={videoRef}
          src={job.output_media_url}
          preload="metadata"
          muted
          playsInline
          loop
          className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      ) : thumbImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbImg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#1F202A' }}>
          <Sparkles className="h-6 w-6" style={{ color: 'rgba(255,255,255,0.25)' }} />
        </div>
      )}

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

function LoadingState() {
  return (
    <div
      className="flex h-48 items-center justify-center rounded-2xl"
      style={{ border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading generations…
      </span>
    </div>
  );
}

function EmptyState() {
  return (
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
        No generations yet
      </p>
      <p className="max-w-sm text-center text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
        Generations will land here as soon as your pipeline runs.
      </p>
    </div>
  );
}

// The four agent surfaces, with their brand colours — mirrors the public
// connect guide's client selector so the dashboard feels like the same product.
const SKILL_CLIENTS = [
  { label: 'Claude Code', icon: ClaudeIcon, color: '#D97757' },
  { label: 'Cursor', icon: CursorIcon, color: '#7DD3FC' },
  { label: 'Claude Desktop', icon: AnthropicIcon, color: '#D97757' },
  { label: 'Codex', icon: OpenAIIcon, color: '#10A37F' },
] as const;

/**
 * Skills & MCP home card — a deliberately eye-catching, multi-colour entry
 * point into the connect guide. The whole card is a link to /dashboard/docs.
 */
function SkillsMcpCard() {
  return (
    <Link
      href="/dashboard/docs"
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl p-5 transition-transform hover:-translate-y-0.5"
      style={{
        background:
          'radial-gradient(130% 120% at 0% 0%, rgba(217,119,87,0.20) 0%, rgba(217,119,87,0) 45%), radial-gradient(130% 120% at 100% 0%, rgba(34,211,238,0.18) 0%, rgba(34,211,238,0) 45%), radial-gradient(120% 130% at 50% 120%, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0) 55%), #15161D',
        border: '1px solid rgba(167,139,250,0.30)',
        boxShadow: '0 0 44px rgba(167,139,250,0.14) inset',
        minHeight: 200,
      }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.7)' }}
      >
        Skills &amp; MCP
      </span>

      {/* Brand-coloured client chips */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {SKILL_CLIENTS.map((c) => (
          <span
            key={c.label}
            title={c.label}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
            style={{
              background: `${c.color}1F`,
              boxShadow: `inset 0 0 0 1px ${c.color}66`,
            }}
          >
            <c.icon className="h-4 w-4" style={{ color: c.color }} />
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm font-medium" style={{ color: '#E9E9F0' }}>
        Connect your agent
      </p>
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
        MCP · CLI · Skill — full setup
      </p>

      <span
        className="relative mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold transition-opacity group-hover:opacity-90"
        style={{ color: '#C4B5FD' }}
      >
        Open docs &amp; skills
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function StatCard({
  label,
  value,
  valueMuted,
  sub,
  pill,
  cta,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  valueMuted?: boolean;
  sub?: string;
  pill?: string | null;
  cta: { label: string; href: string; emphasis?: boolean };
  accent?: boolean;
}) {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-3xl p-5 transition-colors"
      style={{
        background: accent
          ? 'radial-gradient(120% 100% at 100% 0%, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.04) 35%, rgba(255,255,255,0) 65%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 60%), #191A22'
          : 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 60%), #191A22',
        border: accent
          ? '1px solid rgba(167,139,250,0.22)'
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: accent ? '0 0 40px rgba(167,139,250,0.12) inset' : undefined,
        minHeight: 200,
      }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {label}
      </span>

      {/* Value block - fixed slot so all three cards align */}
      <div className="mt-5 flex min-h-[60px] flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span
            style={{
              color: valueMuted ? 'rgba(255,255,255,0.55)' : '#E9E9F0',
              fontSize: valueMuted ? '18px' : 'clamp(26px,2.4vw,34px)',
              fontWeight: valueMuted ? 500 : 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {value}
          </span>
          {pill ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              {pill}
            </span>
          ) : null}
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {sub ?? ' '}
        </p>
      </div>

      {/* CTA pinned to bottom */}
      {cta.emphasis ? (
        <div className="relative mt-auto inline-flex pt-5">
          {/* Aurora glow behind the button — orange + purple radial */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-full blur-xl"
            style={{
              background:
                'radial-gradient(60% 100% at 30% 50%, rgba(167,139,250,0.55) 0%, rgba(167,139,250,0) 70%), radial-gradient(60% 100% at 70% 50%, rgba(167,139,250,0.55) 0%, rgba(167,139,250,0) 70%)',
              opacity: 0.85,
            }}
          />
          <Link
            href={cta.href}
            className="relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5"
            style={{
              backgroundColor: '#FFFFFF',
              color: '#0F1015',
              boxShadow:
                '0 8px 24px rgba(167,139,250,0.25), 0 0 0 1px rgba(255,255,255,0.6)',
            }}
          >
            <Crown className="h-3.5 w-3.5" />
            {cta.label}
          </Link>
        </div>
      ) : (
        <Link
          href={cta.href}
          className="mt-auto inline-flex items-center gap-1.5 pt-5 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          {cta.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 text-sm"
      style={{
        border: '1px solid rgba(255,79,79,0.3)',
        backgroundColor: 'rgba(255,79,79,0.08)',
        color: '#FCA5A5',
      }}
    >
      {message}
    </div>
  );
}
