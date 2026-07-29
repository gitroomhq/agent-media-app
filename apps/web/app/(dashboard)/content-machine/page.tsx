// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles, Play, Download, RefreshCw, Loader2, ImageIcon, Film,
  Users as UsersIcon, Clapperboard, Activity, RotateCcw, ExternalLink, FileText, Upload,
} from 'lucide-react';

interface Character {
  id: string;
  name: string;
  source_kind: 'actor' | 'upload' | 'description';
  actor_slug: string | null;
  source_image_url: string | null;
  description: string | null;
  character_sheet_url: string;
  thumbnail_url: string | null;
  created_at: string;
  video_count: number;
}

interface JobLite {
  id: string;
  operation: 'character_sheet' | 'character_storyboard' | 'character_video';
  status: string;
  output_media_url: string | null;
  prompt: string | null;
  created_at: string;
  updated_at: string;
  input_params: Record<string, unknown> | null;
}

interface SessionGroup {
  session_id: string | null;
  created_at: string;
  sheet: JobLite | null;
  storyboard: JobLite | null;
  video: JobLite | null;
}

type Tab = 'characters' | 'videos' | 'all';

export default function ContentMachineLibraryPage() {
  const [tab, setTab] = useState<Tab>('characters');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [sessions, setSessions] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch('/api/dashboard/characters', { cache: 'no-store' }),
        fetch('/api/dashboard/content-machine/sessions', { cache: 'no-store' }),
      ]);
      const cJson = await cRes.json();
      const sJson = await sRes.json();
      if (!cRes.ok) {
        setError(cJson?.error?.message ?? 'Failed to load characters');
      } else {
        setCharacters(cJson.characters ?? []);
      }
      if (sRes.ok) setSessions(sJson.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const completedVideos = useMemo(
    () => sessions.filter((s) => s.video?.status === 'completed' && s.video.output_media_url),
    [sessions],
  );

  const characterById = useMemo(() => {
    const m = new Map<string, Character>();
    for (const c of characters) m.set(c.id, c);
    return m;
  }, [characters]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Sparkles className="size-7 text-violet-500" />
            Content Machine
          </h1>
          <p className="mt-1 text-zinc-600 max-w-2xl">
            Reusable characters and the videos you&apos;ve made with them.
          </p>
        </div>
        <Link
          href="/create/character-video"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_22px_rgba(168,85,247,0.55)] hover:shadow-[0_0_28px_rgba(168,85,247,0.75)] hover:scale-[1.02] transition-all"
        >
          <Sparkles className="size-4" /> New Video
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
        <Stat label="Characters" value={characters.length} />
        <Stat label="Videos" value={completedVideos.length} />
        <Stat label="Sessions" value={sessions.length} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-6 overflow-x-auto">
        <TabButton active={tab === 'characters'} onClick={() => setTab('characters')} icon={<UsersIcon className="size-4" />} label="Characters" badge={characters.length} />
        <TabButton active={tab === 'videos'} onClick={() => setTab('videos')} icon={<Clapperboard className="size-4" />} label="Videos" badge={completedVideos.length} />
        <TabButton active={tab === 'all'} onClick={() => setTab('all')} icon={<Activity className="size-4" />} label="All Activity" badge={sessions.length} />
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4 text-red-900 text-sm">
          {error} <button onClick={load} className="underline ml-2">Retry</button>
        </div>
      )}

      {/* Tab content */}
      {tab === 'characters' && (
        <CharactersTab loading={loading} characters={characters} />
      )}
      {tab === 'videos' && (
        <VideosTab loading={loading} sessions={completedVideos} characterById={characterById} />
      )}
      {tab === 'all' && (
        <AllTab loading={loading} sessions={sessions} characterById={characterById} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900 leading-tight">{value}</p>
    </div>
  );
}

function TabButton({
  active, onClick, icon, label, badge,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-violet-600 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'
      }`}
    >
      {icon}
      {label}
      {badge > 0 && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-violet-100 text-violet-700' : 'bg-zinc-100 text-zinc-600'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Characters tab ─────────────────────────────────────────────
function CharactersTab({ loading, characters }: { loading: boolean; characters: Character[] }) {
  if (loading) return <LoadingRow />;
  if (characters.length === 0) {
    return (
      <EmptyState
        title="No characters yet"
        body="Create a character once, reuse it for unlimited videos."
        cta={
          <Link href="/create/character-video" className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700">
            <Sparkles className="size-4" /> Create your first character
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {characters.map((c) => <CharacterCard key={c.id} character={c} />)}
    </div>
  );
}

function CharacterCard({ character }: { character: Character }) {
  const date = new Date(character.created_at).toLocaleDateString();
  const sourceBadge = character.source_kind === 'actor'
    ? { icon: <UsersIcon className="size-3" />, text: character.actor_slug ?? 'Actor' }
    : character.source_kind === 'upload'
      ? { icon: <Upload className="size-3" />, text: 'Upload' }
      : { icon: <FileText className="size-3" />, text: 'Custom' };
  return (
    <Link
      href={`/create/character-video?character_id=${character.id}`}
      className="group relative block overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 hover:ring-violet-400 hover:shadow-[0_0_18px_rgba(168,85,247,0.25)] transition-all"
    >
      {/* Square portrait — sheet thumbnail */}
      <div className="relative aspect-square bg-zinc-50">
        <Image
          src={character.thumbnail_url ?? character.character_sheet_url}
          alt={character.name}
          fill
          sizes="(max-width: 640px) 50vw, 240px"
          className="object-cover"
          unoptimized
        />
        {/* Source badge bottom-left */}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-zinc-700 ring-1 ring-zinc-200">
          {sourceBadge.icon} {sourceBadge.text}
        </span>
        {/* Video count top-right */}
        {character.video_count > 0 && (
          <span className="absolute top-2 right-2 rounded-full bg-zinc-900/80 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-white">
            {character.video_count} video{character.video_count !== 1 ? 's' : ''}
          </span>
        )}
        {/* Use overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs font-bold text-white inline-flex items-center gap-1.5">
            <Play className="size-3 fill-white" /> Use for new video
          </p>
        </div>
      </div>
      <div className="px-3 py-2 border-t border-zinc-100">
        <p className="text-sm font-semibold text-zinc-900 line-clamp-1">{character.name}</p>
        <p className="text-[10px] text-zinc-400 mt-0.5">{date}</p>
      </div>
    </Link>
  );
}

// ─── Videos tab ─────────────────────────────────────────────────
function VideosTab({
  loading, sessions, characterById,
}: { loading: boolean; sessions: SessionGroup[]; characterById: Map<string, Character> }) {
  if (loading) return <LoadingRow />;
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No videos yet"
        body="Render your first 16:9 video — pick a character and write a script."
        cta={
          <Link href="/create/character-video" className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700">
            <Sparkles className="size-4" /> Create video
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((s) => (
        <VideoCard key={s.session_id ?? s.video!.id} session={s} characterById={characterById} />
      ))}
    </div>
  );
}

function VideoCard({ session, characterById }: { session: SessionGroup; characterById: Map<string, Character> }) {
  if (!session.video?.output_media_url) return null;
  const charId = (session.video.input_params as { character_id?: string } | null)?.character_id ?? null;
  const character = charId ? characterById.get(charId) : null;
  const date = new Date(session.video.created_at).toLocaleDateString();
  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 hover:ring-violet-300 hover:shadow-md transition-all">
      <div className="relative aspect-video bg-black group">
        <video
          src={session.video.output_media_url}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <a
          href={session.video.output_media_url}
          download
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Download className="size-3" /> Save
        </a>
      </div>
      <div className="px-3 py-2.5 border-t border-zinc-100">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">{date}</p>
          {character && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700">
              <Image
                src={character.thumbnail_url ?? character.character_sheet_url}
                alt={character.name}
                width={16}
                height={16}
                className="rounded-full ring-1 ring-zinc-200 object-cover size-4"
                unoptimized
              />
              {character.name.slice(0, 24)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── All Activity tab ────────────────────────────────────────────
function AllTab({
  loading, sessions, characterById,
}: { loading: boolean; sessions: SessionGroup[]; characterById: Map<string, Character> }) {
  if (loading) return <LoadingRow />;
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        body="Every wizard run shows up here — sheets, storyboards, videos."
        cta={null}
      />
    );
  }
  return (
    <div className="space-y-3">
      {sessions.map((s) => <SessionRow key={s.session_id ?? s.created_at} session={s} characterById={characterById} />)}
    </div>
  );
}

function SessionRow({ session, characterById }: { session: SessionGroup; characterById: Map<string, Character> }) {
  const charId = ((session.video ?? session.storyboard ?? session.sheet)?.input_params as { character_id?: string } | null)?.character_id ?? null;
  const character = charId ? characterById.get(charId) : null;
  const date = new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const sessionHref = session.session_id ? `/create/character-video?session=${session.session_id}` : '/create/character-video';
  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
      <div className="flex flex-col sm:flex-row">
        <ArtifactSlot job={session.sheet} kind="image" label="Sheet" emptyText={null} />
        <ArtifactSlot
          job={session.storyboard}
          kind="image"
          label="Storyboard"
          emptyCta={session.sheet?.output_media_url && !session.storyboard?.output_media_url ? sessionHref : null}
          emptyCtaLabel="Create Storyboard"
          emptyText={null}
        />
        <ArtifactSlot
          job={session.video}
          kind="video"
          label="Video"
          emptyCta={session.storyboard?.output_media_url && !session.video?.output_media_url ? sessionHref : null}
          emptyCtaLabel="Render Video"
          emptyText={null}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-2.5 bg-zinc-50">
        <div className="flex items-center gap-2 min-w-0">
          {character && (
            <Image
              src={character.thumbnail_url ?? character.character_sheet_url}
              alt={character.name}
              width={20}
              height={20}
              className="rounded-full ring-1 ring-zinc-200 object-cover size-5 shrink-0"
              unoptimized
            />
          )}
          <p className="text-xs text-zinc-700 truncate">
            {character?.name ?? 'Untitled'} <span className="text-zinc-400">· {date}</span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={sessionHref} className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800">
            Open
          </Link>
          {character && (
            <Link
              href={`/create/character-video?character_id=${character.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
            >
              <RefreshCw className="size-3" /> Reuse
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtifactSlot({
  job, kind, label, emptyCta, emptyCtaLabel, emptyText,
}: {
  job: JobLite | null;
  kind: 'image' | 'video';
  label: string;
  emptyCta?: string | null;
  emptyCtaLabel?: string | null;
  emptyText: string | null;
}) {
  const url = job?.output_media_url;
  const status = job?.status;
  const inFlight = status === 'submitted' || status === 'processing' || status === 'queued';
  const failed = status === 'failed';
  return (
    <div className="flex-1 min-w-0">
      <div className="relative h-40 sm:h-44 bg-zinc-50 ring-1 ring-zinc-100">
        {url ? (
          kind === 'video' ? (
            <video src={url} muted autoPlay loop playsInline className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Image src={url} alt={label} fill className="object-cover" sizes="240px" unoptimized />
          )
        ) : emptyCta && emptyCtaLabel ? (
          <Link href={emptyCta} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-violet-50/40 text-violet-700 hover:bg-violet-100/60 transition-colors border border-dashed border-violet-300 m-1 rounded-lg">
            <Sparkles className="size-5" />
            <span className="text-xs font-semibold">{emptyCtaLabel}</span>
          </Link>
        ) : inFlight ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-violet-500 border border-dashed border-violet-200 m-1 rounded-lg animate-pulse">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Generating…</span>
          </div>
        ) : failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-amber-700 border border-dashed border-amber-200 bg-amber-50 m-1 rounded-lg">
            <RotateCcw className="size-5" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Try again</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-300">
            {kind === 'video' ? <Film className="size-6" /> : <ImageIcon className="size-6" />}
            {emptyText && <span className="ml-2 text-xs text-zinc-400">{emptyText}</span>}
          </div>
        )}
        <span className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-white backdrop-blur">
          {label}
        </span>
        {url && kind === 'video' && (
          <a href={url} download className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] text-white backdrop-blur">
            <Download className="size-3" />
          </a>
        )}
        {url && kind === 'image' && (
          <a href={url} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] text-white backdrop-blur">
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500 py-12 justify-center">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-12 text-center">
      <div className="mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-full bg-violet-50 ring-1 ring-violet-100">
        <Sparkles className="size-7 text-violet-500" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 mb-6 text-sm text-zinc-500 max-w-md mx-auto">{body}</p>
      {cta}
    </div>
  );
}
