// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  Upload,
  Link as LinkIcon,
  Loader2,
  Shuffle,
  Check,
} from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';

interface Actor {
  slug: string;
  name: string;
  portrait_url: string | null;
  gender?: string;
  age?: number;
  nationality?: string;
}

const DURATIONS = [5, 10, 15] as const;
const WORDS_PER_SECOND = 3;
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const UPLOAD_BUCKET = 'generation-inputs';

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export default function ShowYourAppPage() {
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────────────
  const [appScreenshotUrl, setAppScreenshotUrl] = useState('');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [screenshotDimensions, setScreenshotDimensions] = useState<{ w: number; h: number } | null>(null);

  const [script, setScript] = useState('');
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [subtitleStyle, setSubtitleStyle] = useState<'hormozi' | 'none'>('hormozi');

  const [selectedActor, setSelectedActor] = useState<Actor | null>(null); // null = random
  const [actorPickerOpen, setActorPickerOpen] = useState(false);
  const [actors, setActors] = useState<Actor[]>([]);
  const [actorSearch, setActorSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [loadingActors, setLoadingActors] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load actors (show_your_app preset pool) ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingActors(true);
    (async () => {
      try {
        const res = await fetch('/api/actors?preset=show_your_app&limit=200');
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.actors) ? data.actors : [];
        setActors(list);
      } catch {
        // ignore; random selection still works
      } finally {
        if (!cancelled) setLoadingActors(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Validation ───────────────────────────────────────────────────────
  const words = wordCount(script);
  const maxWords = duration * WORDS_PER_SECOND;
  const wordsOver = words > maxWords;
  const scriptTooShort = script.trim().length < 5;

  const canSubmit =
    appScreenshotUrl.length > 0 &&
    uploadState !== 'uploading' &&
    uploadState !== 'error' &&
    !scriptTooShort &&
    !wordsOver &&
    !submitting;

  // ── Upload screenshot ────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('File must be an image (PNG, JPEG, or WebP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is larger than 10 MB.');
      return;
    }
    setUploadState('uploading');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      const { data, error } = await invokeFn('upload-url', {
        body: { filename: safeName, content_type: file.type },
      });
      if (error) throw new Error(error.message ?? 'Failed to get upload URL');
      const uploadUrl: string | undefined = data?.upload_url;
      const storagePath: string | undefined = data?.storage_path;
      if (!uploadUrl || !storagePath) {
        throw new Error(data?.error_description ?? 'Edge function did not return upload_url');
      }

      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) {
        const errBody = await put.text().catch(() => '');
        throw new Error(`Upload failed (${put.status}): ${errBody.slice(0, 200)}`);
      }

      const url = `${SUPABASE_URL}/storage/v1/object/public/${UPLOAD_BUCKET}/${storagePath}`;
      setAppScreenshotUrl(url);

      // Client-side vertical check
      const img = new Image();
      img.onload = () => {
        setScreenshotDimensions({ w: img.naturalWidth, h: img.naturalHeight });
        if (img.naturalHeight <= img.naturalWidth) {
          setUploadError(`Image is not vertical (${img.naturalWidth}×${img.naturalHeight}). App screenshots must be taller than wide.`);
          setUploadState('error');
        } else {
          setUploadState('done');
        }
      };
      img.onerror = () => { setUploadState('done'); };
      img.src = url;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
    }
  }, []);

  const handleUrlPaste = useCallback(async (url: string) => {
    setAppScreenshotUrl(url);
    setUploadError(null);
    setScreenshotDimensions(null);
    if (!url) { setUploadState('idle'); return; }
    setUploadState('uploading');
    const img = new Image();
    img.onload = () => {
      setScreenshotDimensions({ w: img.naturalWidth, h: img.naturalHeight });
      if (img.naturalHeight <= img.naturalWidth) {
        setUploadError(`Image is not vertical (${img.naturalWidth}×${img.naturalHeight}). Must be portrait.`);
        setUploadState('error');
      } else {
        setUploadState('done');
      }
    };
    img.onerror = () => {
      setUploadError('Could not load image from this URL. Check that it\'s publicly accessible.');
      setUploadState('error');
    };
    img.src = url;
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        app_screenshot_url: appScreenshotUrl,
        script: script.trim(),
        duration,
        subtitle_style: subtitleStyle,
      };
      if (selectedActor) body.actor_slug = selectedActor.slug;

      const resp = await fetch('/api/v1/show-your-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message ?? `Request failed: ${resp.status}`);
      if (data.job_id) {
        router.push(`/gallery/${data.job_id}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
      setSubmitting(false);
    }
  }

  // ── Filtered actors for picker ───────────────────────────────────────
  const GENDER_SYNONYMS: Record<string, string> = {
    woman: 'female', women: 'female', girl: 'female', lady: 'female', she: 'female',
    man: 'male', men: 'male', guy: 'male', boy: 'male', he: 'male',
  };
  const visibleActors = actors.filter((a) => {
    if (genderFilter !== 'all' && a.gender?.toLowerCase() !== genderFilter) return false;
    if (!actorSearch) return true;
    const raw = actorSearch.toLowerCase().trim();
    const q = GENDER_SYNONYMS[raw] ?? raw;
    return (
      a.name.toLowerCase().includes(q) ||
      a.slug.toLowerCase().includes(q) ||
      (a.gender?.toLowerCase() ?? '').includes(q) ||
      (a.nationality?.toLowerCase() ?? '').includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-6 lg:py-10">
      {/* Header */}
      <div className="mb-8">
        <Link href="/create" className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Show Your App</h1>
            <span className="rounded bg-black px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
          </div>
          <p className="mt-2 text-gray-600">An AI actor holds a phone showing your app. Hormozi subs burned in. One API call.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Left: form ───────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* App screenshot */}
          <section>
            <label className="mb-2 block text-sm font-semibold text-gray-900">App screenshot</label>
            <p className="mb-3 text-xs text-gray-500">Vertical (portrait) PNG, JPEG, or WebP. Must be taller than wide.</p>
            <Dropzone
              state={uploadState}
              error={uploadError}
              appScreenshotUrl={appScreenshotUrl}
              dimensions={screenshotDimensions}
              onFile={handleFile}
              onUrl={handleUrlPaste}
              onBrowse={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </section>

          {/* Script */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-900">Script</label>
              <span className={`text-xs ${wordsOver ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                {words} / {maxWords} words
              </span>
            </div>
            <p className="mb-3 text-xs text-gray-500">What the actor reads. Max {WORDS_PER_SECOND} words/sec × duration.</p>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="You really need to try this app. It generates UGC videos in seconds."
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            {wordsOver && (
              <p className="mt-1.5 text-xs font-medium text-red-600">Script exceeds word cap. Shorten it or increase duration below.</p>
            )}
          </section>

          {/* Duration + subtitle style */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">Duration</label>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      duration === d
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">Subtitles</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubtitleStyle('hormozi')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    subtitleStyle === 'hormozi'
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                  }`}
                >
                  On
                </button>
                <button
                  type="button"
                  onClick={() => setSubtitleStyle('none')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    subtitleStyle === 'none'
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Off
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">Hormozi-style, word-by-word. More styles soon.</p>
            </div>
          </section>
        </div>

        {/* ── Right: actor picker + submit ──────────────────────────── */}
        <aside className="space-y-4">
          <section>
            <label className="mb-2 block text-sm font-semibold text-gray-900">Actor</label>
            <button
              type="button"
              onClick={() => setActorPickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-300 bg-white p-3 text-left transition-colors hover:border-gray-900"
            >
              {selectedActor?.portrait_url ? (
                  <img src={selectedActor.portrait_url} alt={selectedActor.name} className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-amber-100">
                  <Shuffle className="h-5 w-5 text-orange-700" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {selectedActor?.name ?? 'Random'}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {selectedActor
                    ? [selectedActor.gender, selectedActor.age, selectedActor.nationality].filter(Boolean).join(' · ')
                    : 'Pick a random actor from our pool'}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          </section>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Generate video'}
          </button>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{submitError}</div>
          )}
        </aside>
      </div>

      {/* ── Actor picker modal ────────────────────────────────────── */}
      {actorPickerOpen && (
        <ActorPicker
          actors={actors}
          visible={visibleActors}
          loading={loadingActors}
          search={actorSearch}
          onSearch={setActorSearch}
          genderFilter={genderFilter}
          onGenderFilter={setGenderFilter}
          selectedSlug={selectedActor?.slug ?? null}
          onPick={(a) => { setSelectedActor(a); setActorPickerOpen(false); }}
          onPickRandom={() => { setSelectedActor(null); setActorPickerOpen(false); }}
          onClose={() => setActorPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Dropzone sub-component ─────────────────────────────────────────────

function Dropzone({
  state,
  error,
  appScreenshotUrl,
  dimensions,
  onFile,
  onUrl,
  onBrowse,
}: {
  state: 'idle' | 'uploading' | 'done' | 'error';
  error: string | null;
  appScreenshotUrl: string;
  dimensions: { w: number; h: number } | null;
  onFile: (f: File) => void;
  onUrl: (u: string) => void;
  onBrowse: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');

  return (
    <div>
      {/* Tabs */}
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-gray-100 p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'upload' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
        >
          <LinkIcon className="h-3.5 w-3.5" /> URL
        </button>
      </div>

      {mode === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragging(false);
            const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
          }}
          onClick={onBrowse}
          className={`group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            state === 'error' ? 'border-red-300 bg-red-50' :
            state === 'done' ? 'border-emerald-300 bg-emerald-50' :
            dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          {state === 'uploading' ? (
            <><Loader2 className="mb-2 h-6 w-6 animate-spin text-gray-500" /><span className="text-sm text-gray-600">Uploading…</span></>
          ) : state === 'done' && appScreenshotUrl ? (
            <>
              <img src={appScreenshotUrl} alt="" className="h-28 w-auto rounded-md object-contain shadow-sm" />
              <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Uploaded{dimensions ? ` · ${dimensions.w}×${dimensions.h}` : ''}
              </div>
            </>
          ) : (
            <>
              <Upload className="mb-2 h-6 w-6 text-gray-400" />
              <span className="text-sm font-medium text-gray-900">Drop an image or click to browse</span>
              <span className="mt-1 text-xs text-gray-500">Vertical PNG / JPEG / WebP · up to 10 MB</span>
            </>
          )}
        </div>
      )}

      {mode === 'url' && (
        <input
          type="url"
          value={appScreenshotUrl}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="https://cdn.example.com/my-app.png"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

// ── Actor picker modal ─────────────────────────────────────────────────

function ActorPicker({
  actors,
  visible,
  loading,
  search,
  onSearch,
  genderFilter,
  onGenderFilter,
  selectedSlug,
  onPick,
  onPickRandom,
  onClose,
}: {
  actors: Actor[];
  visible: Actor[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  genderFilter: 'all' | 'female' | 'male';
  onGenderFilter: (g: 'all' | 'female' | 'male') => void;
  selectedSlug: string | null;
  onPick: (a: Actor) => void;
  onPickRandom: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Choose an actor</h2>
            <p className="text-xs text-gray-500">
              {visible.length} of {actors.length} · defaults to random
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1 text-xs">
              {(['all', 'female', 'male'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onGenderFilter(g)}
                  className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                    genderFilter === g ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {g === 'all' ? 'Any' : g}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search name / country…"
              className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <button
              type="button"
              onClick={onPickRandom}
              className={`group relative flex aspect-[3/4] flex-col items-center justify-center rounded-xl ring-2 transition-all ${
                selectedSlug === null
                  ? 'bg-gradient-to-br from-orange-50 to-amber-100 ring-gray-900'
                  : 'bg-gradient-to-br from-orange-50 to-amber-50 ring-transparent hover:ring-gray-300'
              }`}
            >
              <Shuffle className="h-10 w-10 text-orange-700" />
              <span className="mt-2 text-sm font-semibold text-gray-900">Random</span>
              <span className="text-[10px] text-gray-500">Recommended</span>
              {selectedSlug === null && (
                <span className="absolute right-2 top-2 rounded-full bg-gray-900 p-1"><Check className="h-3 w-3 text-white" /></span>
              )}
            </button>
            {loading && actors.length === 0 && Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-gray-100" />
            ))}
            {visible.map((a) => (
              <button
                key={a.slug}
                type="button"
                onClick={() => onPick(a)}
                className={`group relative flex aspect-[3/4] flex-col overflow-hidden rounded-xl ring-2 transition-all ${
                  selectedSlug === a.slug ? 'ring-gray-900' : 'ring-transparent hover:ring-gray-300'
                }`}
              >
                {a.portrait_url ? (
                      <img src={a.portrait_url} alt={a.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-400">{a.name}</div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <div className="text-xs font-semibold text-white">{a.name}</div>
                  <div className="text-[10px] text-white/70">
                    {[a.gender, a.age].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {selectedSlug === a.slug && (
                  <span className="absolute right-2 top-2 rounded-full bg-gray-900 p-1"><Check className="h-3 w-3 text-white" /></span>
                )}
              </button>
            ))}
            {!loading && visible.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-gray-500">No actors match your search.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
