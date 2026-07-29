// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Loader2, Check, Upload, Sparkles, Users, PenSquare, Download, ExternalLink } from 'lucide-react';
import { useGenerationJob, type GenerationJobRow, type JobStatus } from '@/lib/hooks/use-generation-job';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { getVar } from '@/components/variable-context';
import {
  phaseLabel,
  SHEET_EXPECTED_SECONDS,
  STORYBOARD_EXPECTED_SECONDS,
  VIDEO_EXPECTED_SECONDS,
  type Operation,
} from '@/lib/wizard/phases';

interface Actor {
  slug: string;
  name: string;
  portrait_url: string | null;
}

type Step = 'sheet' | 'storyboard' | 'video' | 'done';
type SheetMode = 'describe' | 'upload' | 'pick';

// Runtime config (see components/variable-context). Lazy on purpose: a
// module-level const evaluates before the root layout publishes window.vars.
const supabaseUrl = () =>
  (getVar('supabaseUrl', process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') ?? '')
    .trim()
    .replace(/\/+$/, '');
const UPLOAD_BUCKET = 'generation-inputs';

const DEFAULT_BEATS = [
  'Waves hello to the camera, smiling.',
  'Holds up the product and points to it with a thumbs up.',
  'Takes a sip / tries it, eyes wide with delight.',
  'Laughs and gives a thumbs up.',
  'Waves goodbye with both hands.',
];

const TERMINAL: JobStatus[] = ['completed', 'failed'];

export default function ContentMachinePage() {
  // useSearchParams() requires a Suspense boundary above it for prod
  // prerendering. Wizard logic lives in ContentMachineWizard below.
  return (
    <Suspense fallback={null}>
      <ContentMachineWizard />
    </Suspense>
  );
}

function ContentMachineWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('session');
  const reuseSheetFromUrl = searchParams.get('reuse_sheet');
  const characterIdFromUrl = searchParams.get('character_id');

  // ── Form inputs (only relevant pre-submit) ──
  const [sheetMode, setSheetMode] = useState<SheetMode>('describe');
  const [actors, setActors] = useState<Actor[]>([]);
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);
  const [description, setDescription] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Job ids — source of truth lives in URL (?session=) + DB ──
  const [sheetJobId, setSheetJobId] = useState<string | null>(null);
  const [storyboardJobId, setStoryboardJobId] = useState<string | null>(null);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);

  // ── Storyboard step inputs ──
  const [beats, setBeats] = useState<string[]>(DEFAULT_BEATS);
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  // ── Video step inputs ──
  const [duration, setDuration] = useState<5 | 10>(10);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Storyboard step — script-vs-beats toggle + AI suggestions
  const [storyboardMode, setStoryboardMode] = useState<'beats' | 'script'>('beats');
  const [script, setScript] = useState<string>('');
  const [suggestions, setSuggestions] = useState<{ title: string; beats: string[] }[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // Live job rows via Realtime + initial fetch.
  const sheet = useGenerationJob(sheetJobId);
  const storyboard = useGenerationJob(storyboardJobId);
  const video = useGenerationJob(videoJobId);

  // When the user clicked "Reuse character" from the library, the sheet
  // step is skipped — sheetUrl comes from ?reuse_sheet directly instead
  // of from a generation_jobs row. No credits charged, no new sheet job.
  const [reusedSheetUrl, setReusedSheetUrl] = useState<string | null>(null);
  const sheetUrl = reusedSheetUrl ?? sheet.resultUrl;
  const storyboardUrl = storyboard.resultUrl;
  const videoUrl = video.resultUrl;

  // Compute current step from job state. Pure function — no extra state.
  const step: Step = (() => {
    if (videoUrl) return 'done';
    if (videoJobId) return 'video';
    if (storyboardUrl) return 'video';
    if (storyboardJobId) return 'storyboard';
    if (sheetUrl) return 'storyboard';
    if (sheetJobId) return 'sheet';
    return 'sheet';
  })();

  // ── Hydrate from URL (?session=...) on first mount ──────────
  // One-shot: subsequent re-renders triggered by router.replace() must
  // NOT re-fetch and clobber the job_ids we just set optimistically.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    // Reuse via character_id (preferred) — fetch the character and use
    // its sheet URL. Skips step 1.
    if (!sessionIdFromUrl && characterIdFromUrl) {
      hydratedRef.current = true;
      void (async () => {
        try {
          const res = await fetch('/api/dashboard/characters', { cache: 'no-store' });
          if (!res.ok) return;
          const json = await res.json() as { characters?: Array<{ id: string; character_sheet_url: string }> };
          const ch = (json.characters ?? []).find((c) => c.id === characterIdFromUrl);
          if (ch) setReusedSheetUrl(ch.character_sheet_url);
        } catch { /* ignore */ }
      })();
      return;
    }
    // Reuse-character (legacy via sheet URL) path.
    if (!sessionIdFromUrl && reuseSheetFromUrl) {
      hydratedRef.current = true;
      setReusedSheetUrl(reuseSheetFromUrl);
      return;
    }
    if (!sessionIdFromUrl) {
      hydratedRef.current = true;
      return;
    }
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/wizard-session/${sessionIdFromUrl}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json() as {
          sheet?: GenerationJobRow | null;
          storyboard?: GenerationJobRow | null;
          video?: GenerationJobRow | null;
        };
        if (cancelled) return;
        if (data.sheet?.id) {
          setSheetJobId(data.sheet.id);
          // Restore step-1 input fields so the source-preview tile shows
          // what was actually submitted (description / actor / upload).
          const ip = (data.sheet.input_params ?? {}) as {
            description?: string;
            actor_slug?: string;
            reference_image_url?: string;
          };
          if (ip.actor_slug) {
            setSheetMode('pick');
            // We can't re-fetch the actor portrait here without an
            // extra round trip, but the wizard's progress card falls
            // back to the description tile if no portrait URL is set.
            setSelectedActor({ slug: ip.actor_slug, name: ip.actor_slug, portrait_url: null });
          } else if (ip.reference_image_url) {
            setSheetMode('upload');
            setUploadedUrl(ip.reference_image_url);
          } else {
            setSheetMode('describe');
          }
          if (ip.description) setDescription(ip.description);
        }
        if (data.storyboard?.id) {
          setStoryboardJobId(data.storyboard.id);
          const ip = (data.storyboard.input_params ?? {}) as { beats?: string[]; ratio?: string };
          if (Array.isArray(ip.beats)) setBeats(ip.beats);
          if (ip.ratio === '9:16' || ip.ratio === '16:9' || ip.ratio === '1:1') setAspect(ip.ratio);
        }
        if (data.video?.id) {
          setVideoJobId(data.video.id);
          const ip = (data.video.input_params ?? {}) as { duration?: number; aspect_ratio?: string };
          if (ip.duration === 5 || ip.duration === 10) setDuration(ip.duration);
          if (ip.aspect_ratio === '9:16' || ip.aspect_ratio === '16:9' || ip.aspect_ratio === '1:1') {
            setAspect(ip.aspect_ratio);
          }
        }
      } catch {
        // network blip — UI shows the empty-form state, user can re-submit
      }
    })();
    return () => { cancelled = true; };
  }, [sessionIdFromUrl, reuseSheetFromUrl, characterIdFromUrl]);

  // No auto-advance: each step has its own input form (beats / script /
  // duration). The user explicitly clicks "Generate Storyboard" / "Render
  // Video" — otherwise we'd skip past the inputs and submit defaults.

  // Surface failed-job error messages.
  useEffect(() => {
    if (sheet.status === 'failed') setError(sheet.errorMessage ?? 'Sheet generation failed');
    else if (storyboard.status === 'failed') setError(storyboard.errorMessage ?? 'Storyboard generation failed');
    else if (video.status === 'failed') setError(video.errorMessage ?? 'Video generation failed');
  }, [sheet.status, sheet.errorMessage, storyboard.status, storyboard.errorMessage, video.status, video.errorMessage]);

  // Load actors only when picker mode is selected.
  useEffect(() => {
    if (sheetMode !== 'pick' || actors.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/actors?limit=200');
        const data = await res.json();
        if (cancelled) return;
        const list: Actor[] = Array.isArray(data?.actors) ? data.actors : [];
        setActors(list);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [sheetMode, actors.length]);

  function getOrMintSessionId(): string {
    if (sessionIdFromUrl) return sessionIdFromUrl;
    const sid = crypto.randomUUID();
    // Replace URL without scrolling. router.replace re-renders; the
    // hydrated guard above prevents the refetch race.
    router.replace(`${pathname}?session=${sid}`);
    return sid;
  }

  function handleStartOver() {
    if (!confirm('Start a new generation? Any in-flight job continues server-side and credits stay charged.')) return;
    hydratedRef.current = true; // skip rehydrate from new URL
    setSheetJobId(null);
    setStoryboardJobId(null);
    setVideoJobId(null);
    setBeats(DEFAULT_BEATS);
    setAspect('9:16');
    setDuration(10);
    setDescription('');
    setUploadedUrl('');
    setSelectedActor(null);
    setError(null);
    router.replace(pathname);
  }

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
      const { data, error: fnError } = await invokeFn('upload-url', {
        body: { filename: safeName, content_type: file.type },
      });
      if (fnError) throw new Error(fnError.message ?? 'Failed to get upload URL');
      const uploadUrl: string | undefined = data?.upload_url;
      const storagePath: string | undefined = data?.storage_path;
      if (!uploadUrl || !storagePath) throw new Error('Edge function did not return upload_url');

      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      const publicUrl = `${supabaseUrl()}/storage/v1/object/public/${UPLOAD_BUCKET}/${storagePath}`;
      setUploadedUrl(publicUrl);
      setUploadState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
    }
  }, []);

  async function submitSheet() {
    setError(null);
    let payload: Record<string, unknown> = {};
    if (sheetMode === 'describe') {
      if (description.trim().length < 3) {
        setError('Describe the character (≥3 chars).');
        return;
      }
      payload = { description: description.trim() };
    } else if (sheetMode === 'upload') {
      if (!uploadedUrl) {
        setError('Upload a portrait image first.');
        return;
      }
      payload = { reference_image_url: uploadedUrl, ...(description.trim() ? { description: description.trim() } : {}) };
    } else if (sheetMode === 'pick') {
      if (!selectedActor) {
        setError('Pick an actor.');
        return;
      }
      payload = { actor_slug: selectedActor.slug, ...(description.trim() ? { description: description.trim() } : {}) };
    }
    const sid = getOrMintSessionId();
    payload.session_id = sid;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/character/sheet-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? 'Submit failed');
        return;
      }
      setSheetJobId(json.job_id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function suggestBeats() {
    setError(null);
    setSuggestions([]);
    setSuggesting(true);
    try {
      const res = await fetch('/api/v1/character/storyboard-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(description ? { character_description: description } : {}),
          ...(selectedActor ? { actor_slug: selectedActor.slug } : {}),
          n_panels: 5,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? 'Suggest failed');
        return;
      }
      const opts = Array.isArray(json?.options) ? json.options : [];
      setSuggestions(opts.slice(0, 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSuggesting(false);
    }
  }

  async function submitStoryboard() {
    setError(null);
    if (!sheetUrl) return;

    // Script mode: send the raw script — gpt-image-2 splits it into
    // panels itself. Beats mode: send the explicit list.
    const sid = getOrMintSessionId();
    const body: Record<string, unknown> = {
      character_sheet_url: sheetUrl,
      ratio: aspect,
      session_id: sid,
    };
    if (storyboardMode === 'script') {
      const trimmed = script.trim();
      if (trimmed.length < 10) {
        setError('Write a script of at least 10 characters.');
        return;
      }
      body.script = trimmed;
    } else {
      const beatsToSend = beats.filter((b) => b.trim().length >= 3);
      if (beatsToSend.length < 3 || beatsToSend.length > 10) {
        setError('Need 3–10 beats with at least 3 characters each.');
        return;
      }
      body.beats = beatsToSend;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/character/storyboard-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? 'Submit failed');
        return;
      }
      setStoryboardJobId(json.job_id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVideo() {
    setError(null);
    if (!sheetUrl || !storyboardUrl) return;
    const sid = getOrMintSessionId();
    setSubmitting(true);
    // Compose action_prompt from whatever the user wrote upstream.
    // Without this, Seedance only sees the storyboard collage and picks
    // the location arbitrarily — was rendering people in the wrong room.
    const sceneText = storyboardMode === 'script'
      ? script.trim()
      : beats.map((b) => b.trim()).filter((b) => b.length >= 3).join('. ');
    const charText = description.trim();
    const actionPrompt = [
      charText ? `Character: ${charText}.` : '',
      sceneText ? `Action: ${sceneText}` : '',
    ].filter(Boolean).join(' ').trim();
    try {
      const res = await fetch('/api/v1/generate/character_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_sheet_url: sheetUrl,
          storyboard_url: storyboardUrl,
          ...(actionPrompt ? { action_prompt: actionPrompt } : {}),
          duration,
          aspect_ratio: aspect,
          generate_audio: true,
          session_id: sid,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? 'Submit failed');
        return;
      }
      setVideoJobId(json.job_id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const sheetActive = !!sheetJobId && !TERMINAL.includes(sheet.status);
  const storyboardActive = !!storyboardJobId && !TERMINAL.includes(storyboard.status);
  const videoActive = !!videoJobId && !TERMINAL.includes(video.status);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/create" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6">
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-3xl font-semibold">Content Machine</h1>
        {(sheetJobId || storyboardJobId || videoJobId) && (
          <button
            type="button"
            onClick={handleStartOver}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
          >
            Start over
          </button>
        )}
      </div>
      <p className="text-zinc-600 mb-8">
        Describe, upload, or pick a character → we design the sheet → plan the storyboard with dialogue → render a 16:9 video. Post-ready in three steps.
      </p>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-8 text-sm">
        <StepBadge n={1} label="Character" active={step === 'sheet'} done={!!sheetUrl} working={sheetActive} />
        <div className={`h-px flex-1 transition-colors ${sheetUrl ? 'bg-green-300' : 'bg-zinc-200'}`} />
        <StepBadge n={2} label="Storyboard" active={step === 'storyboard'} done={!!storyboardUrl} working={storyboardActive} />
        <div className={`h-px flex-1 transition-colors ${storyboardUrl ? 'bg-green-300' : 'bg-zinc-200'}`} />
        <StepBadge n={3} label="Video" active={step === 'video' || step === 'done'} done={!!videoUrl} working={videoActive} />
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4 text-red-900 text-sm">{error}</div>
      )}

      {/* ── Step 1: Sheet — input form ── */}
      {step === 'sheet' && !sheetJobId && (
        <section className="space-y-6">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-100 p-1">
            <ModeTab active={sheetMode === 'describe'} onClick={() => setSheetMode('describe')} icon={<PenSquare className="size-4" />} label="Describe" />
            <ModeTab active={sheetMode === 'upload'} onClick={() => setSheetMode('upload')} icon={<Upload className="size-4" />} label="Upload" />
            <ModeTab active={sheetMode === 'pick'} onClick={() => setSheetMode('pick')} icon={<Users className="size-4" />} label="Pick actor" />
          </div>

          {sheetMode === 'describe' && (
            <div>
              <label className="block text-sm font-medium mb-2">Describe a character (≤100 chars)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 100))}
                placeholder="e.g. 30yo wellness coach, curly dark hair, warm smile, tropical"
                rows={3}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <p className="mt-1 text-xs text-zinc-500">{description.length}/100 — we&apos;ll paint the portrait, then build the multi-angle sheet.</p>
            </div>
          )}

          {sheetMode === 'upload' && (
            <div>
              <label className="block text-sm font-medium mb-2">Upload your character portrait</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
                className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-200 p-8 text-center hover:border-violet-400 transition-colors"
              >
                {uploadedUrl ? (
                  <div className="flex items-center justify-center gap-4">
                    <Image src={uploadedUrl} alt="uploaded" width={120} height={120} className="rounded-md object-cover ring-1 ring-zinc-200" unoptimized />
                    <div className="text-left">
                      <p className="text-sm font-medium text-zinc-900">Portrait uploaded</p>
                      <p className="text-xs text-zinc-500">Click to replace</p>
                    </div>
                  </div>
                ) : uploadState === 'uploading' ? (
                  <p className="inline-flex items-center gap-2 text-sm text-zinc-600"><Loader2 className="size-4 animate-spin" /> Uploading…</p>
                ) : (
                  <div className="text-zinc-500">
                    <Upload className="mx-auto mb-2 size-6" />
                    <p className="text-sm font-medium">Click or drop a portrait</p>
                    <p className="mt-1 text-xs">PNG, JPEG, WebP · up to 10 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
              />
              {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
              <div className="mt-3">
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 100))}
                  placeholder="Optional: vibe / role (e.g. cheerful tropical wellness coach)"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
            </div>
          )}

          {sheetMode === 'pick' && (
            <div>
              <label className="block text-sm font-medium mb-2">Pick an actor</label>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-auto rounded-lg border border-zinc-200 p-2 bg-white">
                {actors.map((a) => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => setSelectedActor(a)}
                    className={`relative aspect-square rounded-md overflow-hidden ring-2 ${selectedActor?.slug === a.slug ? 'ring-violet-500' : 'ring-transparent'}`}
                  >
                    {a.portrait_url && (
                      <Image src={a.portrait_url} alt={a.name} fill className="object-cover" sizes="120px" unoptimized />
                    )}
                    <span className="absolute inset-x-0 bottom-0 text-[10px] bg-black/60 text-white px-1 py-0.5 truncate">{a.name}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 100))}
                  placeholder="Optional: vibe / role"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
            </div>
          )}

          <button
            onClick={submitSheet}
            disabled={submitting || (sheetMode === 'pick' && !selectedActor) || (sheetMode === 'upload' && !uploadedUrl) || (sheetMode === 'describe' && description.trim().length < 3)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-zinc-800 transition-colors"
          >
            <span className="inline-flex items-center gap-2"><Sparkles className="size-4" /> Generate Sheet</span>
          </button>
        </section>
      )}

      {/* ── Step 1: Sheet — generating ── */}
      {step === 'sheet' && sheetJobId && (
        <JobProgressCard
          job={sheet.job}
          operation="character_sheet"
          expectedSeconds={SHEET_EXPECTED_SECONDS}
          sourcePreview={sheetMode === 'pick' ? selectedActor?.portrait_url ?? null : sheetMode === 'upload' ? uploadedUrl : null}
          sourceText={sheetMode === 'describe' ? description : null}
          sourceLabel={sheetMode === 'pick' ? 'Selected actor' : sheetMode === 'upload' ? 'Uploaded portrait' : 'Description'}
        />
      )}

      {/* ── Step 2: Storyboard ── */}
      {step === 'storyboard' && sheetUrl && !storyboardJobId && (
        <section className="space-y-5">
          <ArtifactStrip artifacts={[{ label: 'Character Sheet', url: sheetUrl, kind: 'image' }]} />
          <p className="text-sm text-zinc-600">Sheet ready. Write a script, list action beats, or let AI suggest one.</p>

          {/* Mode tabs + AI suggest */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1">
              <ModeTab active={storyboardMode === 'beats'} onClick={() => setStoryboardMode('beats')} icon={<PenSquare className="size-4" />} label="Beats" />
              <ModeTab active={storyboardMode === 'script'} onClick={() => setStoryboardMode('script')} icon={<PenSquare className="size-4" />} label="Script" />
            </div>
            <button
              type="button"
              onClick={suggestBeats}
              disabled={suggesting}
              className="ml-auto inline-flex items-center gap-2 rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {suggesting ? <><Loader2 className="size-4 animate-spin" /> Thinking…</> : <><Sparkles className="size-4" /> Suggest with AI</>}
            </button>
          </div>

          {/* AI suggestions panel */}
          {suggestions.length > 0 && (
            <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Pick a suggestion</p>
              {suggestions.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setBeats(opt.beats);
                    setStoryboardMode('beats');
                    setSuggestions([]);
                  }}
                  className="block w-full rounded-lg bg-white p-3 text-left text-sm ring-1 ring-zinc-200 hover:ring-violet-400 transition-shadow"
                >
                  <p className="font-semibold text-zinc-900 mb-1">{opt.title}</p>
                  <ol className="list-decimal list-inside text-zinc-600 space-y-0.5">
                    {opt.beats.map((b, j) => (<li key={j}>{b}</li>))}
                  </ol>
                </button>
              ))}
              <button type="button" onClick={() => setSuggestions([])} className="text-xs text-zinc-500 hover:text-zinc-900">Dismiss</button>
            </div>
          )}

          {/* Editor */}
          {storyboardMode === 'beats' ? (
            <div className="space-y-2">
              {beats.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-6 text-right">{i + 1}.</span>
                  <input
                    value={b}
                    onChange={(e) => setBeats((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    className="flex-1 rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    maxLength={200}
                  />
                  {beats.length > 3 && (
                    <button type="button" onClick={() => setBeats((prev) => prev.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-600 text-sm">×</button>
                  )}
                </div>
              ))}
              {beats.length < 10 && (
                <button type="button" onClick={() => setBeats((prev) => [...prev, ''])} className="text-xs text-zinc-500 hover:text-zinc-900">+ Add beat</button>
              )}
            </div>
          ) : (
            <div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value.slice(0, 1500))}
                placeholder={'Paste or write your script here.\n\nTip: separate beats with blank lines or full stops. We split it into 3–10 panels.\n\ne.g.\nMaria walks into her sunlit kitchen, smiling at the camera.\nShe pulls a fresh loaf of bread out of the oven, steam rising.\nShe slices it and takes a bite, eyes wide with delight.\nShe gives a thumbs up — "Nothing beats homemade."\nShe waves goodbye.'}
                rows={9}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono leading-relaxed"
              />
              <p className="mt-1 text-xs text-zinc-500">{script.length}/1500 — the model splits the script into 4–6 panels and writes spoken lines for each.</p>
            </div>
          )}

          <div className="flex items-center gap-3 text-sm">
            <span>Aspect:</span>
            {(['9:16', '16:9', '1:1'] as const).map((r) => (
              <button key={r} type="button" onClick={() => setAspect(r)} className={`rounded-md border px-3 py-1 ${aspect === r ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200'}`}>{r}</button>
            ))}
          </div>
          <button
            onClick={submitStoryboard}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-zinc-800 transition-colors"
          >
            Generate Storyboard
          </button>
        </section>
      )}

      {step === 'storyboard' && storyboardJobId && (
        <JobProgressCard
          job={storyboard.job}
          operation="character_storyboard"
          expectedSeconds={STORYBOARD_EXPECTED_SECONDS}
          sourcePreview={sheetUrl}
          sourceLabel="Character sheet"
        />
      )}

      {/* ── Step 3: Video ── */}
      {step === 'video' && sheetUrl && storyboardUrl && !videoJobId && (
        <section className="space-y-5">
          <ArtifactStrip
            artifacts={[
              { label: 'Character Sheet', url: sheetUrl, kind: 'image' },
              { label: 'Storyboard', url: storyboardUrl, kind: 'image' },
            ]}
          />
          <p className="text-sm text-zinc-600">Sheet + storyboard ready. Pick duration and render.</p>
          <div className="flex items-center gap-3 text-sm">
            <span>Duration:</span>
            {([5, 10] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-md border px-3 py-1 ${duration === d ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200'}`}>{d}s</button>
            ))}
          </div>
          <button
            onClick={submitVideo}
            disabled={submitting}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-violet-700 transition-colors"
          >
            <span className="inline-flex items-center gap-2"><Sparkles className="size-4" /> Render Video</span>
          </button>
        </section>
      )}

      {step === 'video' && videoJobId && !videoUrl && (
        <JobProgressCard
          job={video.job}
          operation="character_video"
          expectedSeconds={VIDEO_EXPECTED_SECONDS}
          sourcePreview={storyboardUrl}
          sourceLabel="Storyboard"
        />
      )}

      {/* ── Done — production-style result frame ── */}
      {step === 'done' && videoUrl && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="size-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Video ready</h2>
              <p className="text-sm text-zinc-500">All three artifacts available below — preview, download, or copy URLs.</p>
            </div>
          </div>

          {/* Hero video player */}
          <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-zinc-200 shadow-xl">
            <video src={videoUrl} controls autoPlay loop className="w-full aspect-video bg-black" />
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={videoUrl}
              download
              className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              <Download className="size-4" /> Download Video
            </a>
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <ExternalLink className="size-4" /> Open in new tab
            </a>
          </div>

          {/* All three artifacts in one strip */}
          <div className="border-t border-zinc-200 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Production Trail</p>
            <ArtifactStrip
              artifacts={[
                { label: 'Character Sheet', url: sheetUrl ?? '', kind: 'image' },
                { label: 'Storyboard', url: storyboardUrl ?? '', kind: 'image' },
                { label: 'Final Video', url: videoUrl, kind: 'video' },
              ]}
              large
            />
          </div>
        </section>
      )}

    </div>
  );
}

/**
 * Production-style strip of generated artifacts. Each tile shows a
 * larger preview (image thumb or looping muted video), a label, and
 * Download + Open buttons so the user can grab any step's output.
 */
function ArtifactStrip({
  artifacts,
  large,
}: {
  artifacts: { label: string; url: string; kind: 'image' | 'video' }[];
  large?: boolean;
}) {
  const items = artifacts.filter((a) => a.url);
  if (items.length === 0) return null;
  const tileSize = large ? 'w-56 h-56 sm:w-64 sm:h-64' : 'w-40 h-40 sm:w-48 sm:h-48';
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <div key={a.url} className="overflow-hidden rounded-xl ring-1 ring-zinc-200 bg-white shadow-sm">
          <div className={`relative ${tileSize} mx-auto bg-zinc-50`}>
            {a.kind === 'video' ? (
              <video src={a.url} muted autoPlay loop playsInline className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <Image src={a.url} alt={a.label} fill className="object-cover" sizes="256px" unoptimized />
            )}
          </div>
          <div className="px-3 py-2 border-t border-zinc-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{a.label}</p>
            <div className="flex gap-2">
              <a
                href={a.url}
                download
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
              >
                <Download className="size-3" /> Download
              </a>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                <ExternalLink className="size-3" /> Open
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepBadge({ n, label, active, done, working }: { n: number; label: string; active: boolean; done: boolean; working?: boolean }) {
  // Active and currently working (in-flight generation): pulse amber so
  // the user can see at a glance which step the engine is on.
  const ring = done
    ? 'bg-green-500 border-green-500 text-white'
    : working
      ? 'border-amber-500 text-amber-700 bg-amber-50 animate-pulse ring-4 ring-amber-200'
      : active
        ? 'border-zinc-900 text-zinc-900'
        : 'border-zinc-300 text-zinc-400';
  const labelColor = done ? 'text-zinc-900' : working ? 'text-amber-700 font-semibold' : active ? 'text-zinc-900' : 'text-zinc-400';
  return (
    <div className="flex items-center gap-2">
      <div className={`size-7 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors ${ring}`}>
        {done ? <Check className="size-4" /> : n}
      </div>
      <span className={`font-medium ${labelColor}`}>{label}</span>
    </div>
  );
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-white text-zinc-900 shadow' : 'text-zinc-600 hover:text-zinc-900'}`}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Live progress card driven by a generation_jobs row. Phase + ETA come
 * from the row's progress_detail.phase + created_at — no client-side
 * timers, so a refresh shows the same state instantly.
 */
const OPERATION_TITLE: Record<Operation, string> = {
  character_sheet: 'Character Sheet',
  character_storyboard: 'Storyboard',
  character_video: 'Video',
};

function JobProgressCard({
  job,
  operation,
  expectedSeconds,
  sourcePreview,
  sourceText,
  sourceLabel,
}: {
  job: GenerationJobRow | null;
  operation: Operation;
  expectedSeconds: number;
  sourcePreview: string | null;
  sourceText?: string | null;
  sourceLabel: string;
}) {
  // Tick to refresh elapsed-time display once per second.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const startedAt = job?.created_at ? Date.parse(job.created_at) : Date.now();
  const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const ratio = Math.min(1, elapsed / expectedSeconds);
  const pct = Math.min(95, Math.round(ratio * 90));
  const eta = Math.max(0, expectedSeconds - elapsed);
  const phase = job?.progress_detail?.phase ?? null;
  const phaseLine = phaseLabel(operation, phase, job?.status);
  const title = OPERATION_TITLE[operation];

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-50 via-white to-pink-50 p-6">
      <div className="flex items-start gap-5">
        <div className="shrink-0">
          {sourcePreview ? (
            <div className="flex flex-col items-center gap-1.5">
              <Image
                src={sourcePreview}
                alt={sourceLabel}
                width={120}
                height={120}
                className="rounded-xl object-cover ring-1 ring-zinc-200 shadow"
                unoptimized
              />
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{sourceLabel}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex size-[120px] items-center justify-center rounded-xl bg-white ring-1 ring-zinc-200 p-3 shadow">
                <p className="text-xs text-zinc-700 leading-snug line-clamp-5">{sourceText || '—'}</p>
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{sourceLabel}</p>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-xl font-bold text-zinc-900 truncate">Generating {title}</h3>
            <p className="text-xs font-mono text-zinc-500 whitespace-nowrap">~{eta}s remaining</p>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="size-4 shrink-0 animate-spin text-violet-600" />
            <p className="font-medium text-zinc-700 truncate">{phaseLine}…</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {pct}% · this usually takes 2–5 minutes. Refresh-safe — your session is bookmarked in the URL.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-lg bg-gradient-to-br from-zinc-100 to-zinc-200 animate-pulse"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
