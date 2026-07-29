// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  Loader2,
  Shuffle,
  Check,
  Video as VideoIcon,
  Image as ImageIcon,
} from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { getVar } from '@/components/variable-context';

interface Actor {
  slug: string;
  name: string;
  portrait_url: string | null;
  gender?: string;
  age?: number;
  nationality?: string;
}

const DURATIONS = [15, 20] as const;
const WORDS_PER_SECOND = 3;
const MAX_RECORDING_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;      // 5 MB
const MAX_RECORDING_SECONDS = 10;
const RECORDING_MIME = ['video/mp4', 'video/quicktime'];
const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
// Runtime config (see components/variable-context). Lazy on purpose: a
// module-level const evaluates before the root layout publishes window.vars.
const supabaseUrl = () =>
  (getVar('supabaseUrl', process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') ?? '')
    .trim()
    .replace(/\/+$/, '');
const UPLOAD_BUCKET = 'generation-inputs';

type AssetMode = 'recording' | 'image';

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export default function LaptopUgcPage() {
  const router = useRouter();

  const [assetMode, setAssetMode] = useState<AssetMode>('recording');
  const [assetUrl, setAssetUrl] = useState('');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [script, setScript] = useState('');
  const [duration, setDuration] = useState<15 | 20>(20);
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

  // ── Load actors ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingActors(true);
    (async () => {
      try {
        const res = await fetch('/api/actors?limit=200');
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.actors) ? data.actors : [];
        setActors(list);
      } catch {
        // ignore — random selection still works
      } finally {
        if (!cancelled) setLoadingActors(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset asset when switching modes
  useEffect(() => {
    setAssetUrl('');
    setUploadError(null);
    setUploadState('idle');
  }, [assetMode]);

  const words = wordCount(script);
  const maxWords = duration * WORDS_PER_SECOND;
  const wordsOver = words > maxWords;
  const scriptTooShort = script.trim().length < 5;

  const canSubmit =
    assetUrl.length > 0 &&
    uploadState !== 'uploading' &&
    uploadState !== 'error' &&
    !scriptTooShort &&
    !wordsOver &&
    !submitting;

  // ── Upload handler (handles both video and image) ───────────────────
  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    const allowedMime = assetMode === 'recording' ? RECORDING_MIME : IMAGE_MIME;
    const maxBytes = assetMode === 'recording' ? MAX_RECORDING_BYTES : MAX_IMAGE_BYTES;

    if (!allowedMime.includes(file.type)) {
      setUploadError(
        assetMode === 'recording'
          ? 'File must be mp4 or mov'
          : 'File must be png, jpeg, or webp',
      );
      return;
    }
    if (file.size > maxBytes) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      const limitMb = maxBytes / 1024 / 1024;
      setUploadError(
        assetMode === 'recording'
          ? `File is ${sizeMb} MB. Max ${limitMb} MB. Compress with: ffmpeg -i in.mp4 -crf 28 -preset fast -t 10 out.mp4`
          : `File is ${sizeMb} MB. Max ${limitMb} MB.`,
      );
      return;
    }

    // Client-side duration check for video
    if (assetMode === 'recording') {
      const duration = await new Promise<number>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => resolve(0);
        video.src = URL.createObjectURL(file);
      });
      if (duration > MAX_RECORDING_SECONDS + 0.5) {
        setUploadError(`Recording is ${duration.toFixed(1)}s. Max ${MAX_RECORDING_SECONDS}s.`);
        return;
      }
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

      const url = `${supabaseUrl()}/storage/v1/object/public/${UPLOAD_BUCKET}/${storagePath}`;
      setAssetUrl(url);
      setUploadState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
    }
  }, [assetMode]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        script: script.trim(),
        duration,
        subtitle_style: subtitleStyle,
      };
      if (assetMode === 'recording') {
        body.app_screen_recording_url = assetUrl;
      } else {
        body.app_screen_image_url = assetUrl;
      }
      if (selectedActor) body.actor_slug = selectedActor.slug;

      const resp = await fetch('/api/v1/laptop-ugc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error?.message ?? `Request failed (${resp.status})`);
      }
      router.push(`/jobs/${data.job_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submit failed');
      setSubmitting(false);
    }
  }

  const filteredActors = actors.filter((a) => {
    if (genderFilter !== 'all' && a.gender !== genderFilter) return false;
    if (actorSearch && !`${a.slug} ${a.name}`.toLowerCase().includes(actorSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/create" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> All generators
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Laptop UGC</h1>
      <p className="mt-1 text-sm text-gray-600">
        3-scene ad: actor holds laptop showing your app, scrolls, then talks to camera. Native lip-synced audio.
      </p>

      <div className="mt-8 space-y-6">
        {/* Asset mode toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">App content</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssetMode('recording')}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer ${
                assetMode === 'recording' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center gap-2 font-medium"><VideoIcon className="h-4 w-4" /> Screen recording</div>
              <div className="mt-1 text-xs text-gray-600">mp4/mov, max 10 MB, max 10s</div>
            </button>
            <button
              type="button"
              onClick={() => setAssetMode('image')}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer ${
                assetMode === 'image' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center gap-2 font-medium"><ImageIcon className="h-4 w-4" /> Static screenshot</div>
              <div className="mt-1 text-xs text-gray-600">png/jpeg/webp, max 5 MB</div>
            </button>
          </div>
        </div>

        {/* Asset upload */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={assetMode === 'recording' ? RECORDING_MIME.join(',') : IMAGE_MIME.join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === 'uploading'}
            className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 py-8 text-center text-gray-600 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            {uploadState === 'uploading' ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Uploading…</span>
            ) : uploadState === 'done' ? (
              <span className="inline-flex items-center gap-2 text-emerald-700"><Check className="h-5 w-5" /> Uploaded — replace?</span>
            ) : (
              <span className="inline-flex items-center gap-2"><Upload className="h-5 w-5" /> Upload {assetMode === 'recording' ? 'screen recording' : 'screenshot'}</span>
            )}
          </button>
          {uploadError && <div className="text-sm text-red-600">{uploadError}</div>}
        </div>

        {/* Script */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-900">Script</label>
            <span className={`text-xs ${wordsOver ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              {words}/{maxWords} words
            </span>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={4}
            placeholder={`"Found this AI tool that ships UGC ads in 2 minutes. So easy — run it from CLI or Claude Code. It's agent-media."`}
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-500">Auto-split at sentence boundary between two face shots.</p>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">Duration</label>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors cursor-pointer ${
                  duration === d ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* Subtitles */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">Subtitles</label>
          <div className="flex gap-2">
            {(['hormozi', 'none'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubtitleStyle(s)}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors cursor-pointer ${
                  subtitleStyle === s ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                {s === 'hormozi' ? 'Hormozi (word-by-word)' : 'None'}
              </button>
            ))}
          </div>
        </div>

        {/* Actor */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-900">Actor</label>
          <button
            type="button"
            onClick={() => setActorPickerOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-400 cursor-pointer"
          >
            <span className="inline-flex items-center gap-3">
              {selectedActor ? (
                <>
                  {selectedActor.portrait_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedActor.portrait_url} alt={selectedActor.name} className="h-8 w-8 rounded-full object-cover" />
                  )}
                  <span className="font-medium">{selectedActor.name}</span>
                  <span className="text-xs text-gray-500">{selectedActor.slug}</span>
                </>
              ) : (
                <>
                  <Shuffle className="h-4 w-4" />
                  <span className="font-medium">Random actor</span>
                </>
              )}
            </span>
            <span className="text-xs text-gray-500">{actorPickerOpen ? 'Close' : 'Change'}</span>
          </button>
          {actorPickerOpen && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-2 flex gap-2">
                <input
                  value={actorSearch}
                  onChange={(e) => setActorSearch(e.target.value)}
                  placeholder="Search actors…"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                />
                {(['all', 'female', 'male'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenderFilter(g)}
                    className={`rounded-md border px-3 py-1.5 text-xs cursor-pointer ${
                      genderFilter === g ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setSelectedActor(null); setActorPickerOpen(false); }}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs hover:border-gray-400 cursor-pointer"
                >
                  Random
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {loadingActors ? (
                  <div className="py-8 text-center text-sm text-gray-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {filteredActors.slice(0, 60).map((a) => (
                      <button
                        key={a.slug}
                        type="button"
                        onClick={() => { setSelectedActor(a); setActorPickerOpen(false); }}
                        className="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-left hover:border-gray-900 cursor-pointer"
                      >
                        {a.portrait_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.portrait_url} alt={a.name} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{a.name}</div>
                          <div className="truncate text-xs text-gray-500">{a.slug}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="space-y-2 pt-4">
          {submitError && <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{submitError}</div>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</span>
            ) : (
              'Generate Laptop UGC'
            )}
          </button>
          <p className="text-center text-xs text-gray-500">First job per actor takes ~3 min longer for pose pre-generation.</p>
        </div>
      </div>
    </div>
  );
}
