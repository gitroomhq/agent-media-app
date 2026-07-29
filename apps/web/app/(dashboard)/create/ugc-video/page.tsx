// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  Search,
  Sparkles,
  Subtitles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeFn } from '@/lib/supabase/fn-proxy';

type WizardStep = 'script' | 'scenes' | 'actor' | 'style' | 'review';
type SceneType = 'talking_head' | 'broll';
type ScriptMode = 'write' | 'generate';

type Scene = {
  id: string;
  type: SceneType;
  text: string;
  visual_prompt: string;
  image?: string;
  uploading?: boolean;
  error?: string | null;
};

type Actor = {
  id: string;
  name: string;
  slug: string;
  portrait_url: string | null;
  gender?: string | null;
  age?: string | number | null;
  age_range?: string | null;
  actor_type?: string | null;
  nationality?: string | null;
};

const STEPS: Array<{ id: WizardStep; title: string; short: string }> = [
  { id: 'script', title: 'Script source', short: 'Script' },
  { id: 'scenes', title: 'Scenes', short: 'Scenes' },
  { id: 'actor', title: 'Actor', short: 'Actor' },
  { id: 'style', title: 'Style & output', short: 'Style' },
  { id: 'review', title: 'Review', short: 'Review' },
];

const DURATIONS = [5, 10, 15] as const;
const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;
const SUBTITLE_STYLES = [
  { value: 'hormozi', label: 'Hormozi' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold' },
  { value: 'clean', label: 'Clean' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'karaoke', label: 'Karaoke' },
] as const;
const TONES = ['energetic', 'calm', 'confident', 'dramatic'] as const;
const MUSIC = ['', 'chill', 'energetic', 'corporate', 'dramatic', 'upbeat'] as const;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateDuration(script: string): (typeof DURATIONS)[number] {
  const words = wordCount(script);
  if (words <= 13) return 5;
  if (words <= 25) return 10;
  return 15;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function splitScriptIntoScenes(script: string): Scene[] {
  const sentences = script.match(/[^.!?]+[.!?]+/g) ?? [script];
  const grouped: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (current && next.length > 150) {
      grouped.push(current.trim());
      current = sentence.trim();
    } else {
      current = next;
    }
  }
  if (current.trim()) grouped.push(current.trim());

  return grouped.slice(0, 5).map((text) => ({
    id: uid(),
    type: 'talking_head',
    text,
    visual_prompt: '',
  }));
}

async function uploadGenerationImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
    throw new Error('Upload a PNG, JPEG, or WebP image');
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Image must be smaller than 50 MB');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const { data, error } = await invokeFn('upload-url', {
    body: { filename: safeName, content_type: file.type },
  });
  if (error) throw new Error(error.message ?? 'Failed to create upload URL');

  const uploadUrl = data?.upload_url;
  const storagePath = data?.storage_path;
  if (!uploadUrl || !storagePath) throw new Error('Upload URL response was missing fields');

  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);

  const signedResp = await fetch('/api/v1/generation-input-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storage_path: storagePath }),
  });
  const signedData = await signedResp.json();
  if (!signedResp.ok || !signedData?.signed_url) {
    throw new Error(signedData?.error?.message ?? 'Failed to sign uploaded image');
  }

  return signedData.signed_url;
}

function StepHeader({ step, title, children }: { step: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs text-white">
          {step}
        </span>
        <span>{title}</span>
      </div>
      {children && <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{children}</p>}
    </div>
  );
}

function UgcVideoWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep].id;

  const [scriptMode, setScriptMode] = useState<ScriptMode>('write');
  const [script, setScript] = useState('');
  const [scriptPrompt, setScriptPrompt] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);

  const [actors, setActors] = useState<Actor[]>([]);
  const [actorsLoading, setActorsLoading] = useState(true);
  const [actorSearch, setActorSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(10);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>('9:16');
  const [subtitleStyle, setSubtitleStyle] = useState('hormozi');
  const [tone, setTone] = useState<(typeof TONES)[number]>('energetic');
  const [music, setMusic] = useState<(typeof MUSIC)[number]>('');
  const [cta, setCta] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('template') === 'saas-review') {
      router.replace('/create/saas-review');
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (scriptMode === 'write' && script.trim().length >= 20) {
      setDuration(estimateDuration(script));
    }
  }, [script, scriptMode]);

  useEffect(() => {
    let cancelled = false;
    setActorsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/actors?limit=200');
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.actors) ? data.actors : [];
        setActors(list.filter((actor: Actor) => isNonEmptyString(actor.portrait_url)));
      } finally {
        if (!cancelled) setActorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredActors = useMemo(() => {
    const q = actorSearch.trim().toLowerCase();
    return actors
      .filter((actor) => {
        if (genderFilter !== 'all' && String(actor.gender ?? '').toLowerCase() !== genderFilter) return false;
        if (!q) return true;
        return [
          actor.name,
          actor.slug,
          actor.gender,
          actor.age,
          actor.age_range,
          actor.actor_type,
          actor.nationality,
        ].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .slice(0, 24);
  }, [actors, actorSearch, genderFilter]);

  const stepIsValid = useMemo(() => {
    if (step === 'script') {
      return scriptMode === 'generate'
        ? scriptPrompt.trim().length >= 10
        : script.trim().length >= 50;
    }
    if (step === 'scenes') {
      if (scriptMode === 'generate' && scenes.length === 0) return true;
      return scenes.length > 0 && scenes.every((scene) => scene.text.trim().length >= 3 && !scene.uploading);
    }
    if (step === 'actor') return Boolean(selectedActor);
    return true;
  }, [scenes, script, scriptMode, scriptPrompt, selectedActor, step]);

  const canSubmit = Boolean(selectedActor && !submitting && stepIsValid);
  const estimatedCost = duration * 30 + (scriptMode === 'generate' ? 5 : 0);
  const activeScript = scriptMode === 'generate' ? scriptPrompt : script;

  function updateScene(id: string, updates: Partial<Scene>) {
    setScenes((prev) => prev.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene)));
  }

  function addScene(type: SceneType = 'talking_head') {
    if (scenes.length >= 5) return;
    setScenes((prev) => [...prev, { id: uid(), type, text: '', visual_prompt: '' }]);
  }

  async function handleSceneImageUpload(sceneId: string, file: File) {
    updateScene(sceneId, { uploading: true, error: null });
    try {
      const url = await uploadGenerationImage(file);
      updateScene(sceneId, { image: url });
    } catch (err) {
      updateScene(sceneId, { error: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      updateScene(sceneId, { uploading: false });
    }
  }

  function goNext() {
    if (!stepIsValid) return;
    if (step === 'script' && scriptMode === 'write' && scenes.length === 0) {
      setScenes(splitScriptIntoScenes(script));
    }
    setCurrentStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  async function handleSubmit() {
    if (!canSubmit || !selectedActor) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload: Record<string, unknown> = {
      template: 'monologue',
      actor_slug: selectedActor.slug,
      target_duration: duration,
      style: subtitleStyle,
      tone,
      aspect_ratio: aspectRatio,
    };

    if (scriptMode === 'generate') {
      payload.generate_script = true;
      payload.script_prompt = scriptPrompt.trim();
    } else {
      payload.script = script.trim();
    }

    const validScenes = scenes.filter((scene) => scene.text.trim().length > 0);
    if (validScenes.length > 0) {
      payload.scenes_input = validScenes.map((scene) => ({
        type: scene.type,
        text: scene.text.trim(),
        ...(scene.visual_prompt.trim() ? { visual_prompt: scene.visual_prompt.trim() } : {}),
        ...(scene.image ? { image: scene.image } : {}),
      }));
      payload.allow_broll = validScenes.some((scene) => scene.type === 'broll');
    }
    if (music) payload.music = music;
    if (cta.trim()) payload.cta = cta.trim();

    try {
      const { data, error } = await invokeFn('ugc-video', { body: payload });
      if (error) throw new Error(error.message ?? 'Failed to create video');
      if (data?.job_id) router.push(`/gallery/${data.job_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create video');
      setSubmitting(false);
    }
  }

  if (searchParams.get('template') === 'saas-review') {
    return null;
  }

  return (
    <div className="mx-auto max-w-[1220px] px-4 py-5 sm:px-6 lg:py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <button
          onClick={() => router.push('/create')}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Create
        </button>
        <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
          UGC Video
        </span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Create UGC Video</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Build a generic creator video from a script, optional scene direction, actor, and output style.
        </p>
      </div>

      <div className="mb-5 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2">
        <div className="grid min-w-[680px] grid-cols-5 gap-2">
          {STEPS.map((item, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (index <= currentStep || stepIsValid) setCurrentStep(index);
                }}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                  active ? 'bg-black text-white' : done ? 'bg-gray-100 text-gray-950' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active ? 'bg-white text-black' : done ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="text-sm font-semibold">{item.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          {step === 'script' && (
            <section>
              <StepHeader step={1} title="Choose script source">
                Write the exact spoken script, or give AI a short prompt and let the backend generate a timed creator script.
              </StepHeader>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setScriptMode('write')}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    scriptMode === 'write' ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                  }`}
                >
                  Write script
                </button>
                <button
                  type="button"
                  onClick={() => setScriptMode('generate')}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    scriptMode === 'generate' ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  AI generate
                </button>
              </div>

              {scriptMode === 'write' ? (
                <div>
                  <textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    rows={7}
                    placeholder="Write the exact words for the creator. Minimum 50 characters. Keep it tight: around 12 words for 5s, 25 words for 10s, 37 words for 15s."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{wordCount(script)} words</span>
                    {script.trim().length >= 20 && <span>Estimated duration: {estimateDuration(script)}s</span>}
                  </div>
                </div>
              ) : (
                <textarea
                  value={scriptPrompt}
                  onChange={(event) => setScriptPrompt(event.target.value)}
                  rows={6}
                  placeholder="Describe the video angle, audience, hook, offer, and what the creator should say."
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                />
              )}
            </section>
          )}

          {step === 'scenes' && (
            <section>
              <StepHeader step={2} title="Shape scenes">
                Split the video into talking-head and optional B-roll beats. Leave this empty only when AI is generating the script.
              </StepHeader>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">{scenes.length} of 5 scenes</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => addScene('talking_head')} disabled={scenes.length >= 5}>
                    <User className="mr-2 h-4 w-4" />
                    Talking head
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addScene('broll')} disabled={scenes.length >= 5}>
                    <Film className="mr-2 h-4 w-4" />
                    B-roll
                  </Button>
                </div>
              </div>

              {scenes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  {scriptMode === 'generate'
                    ? 'AI will write and split the scene structure from your prompt.'
                    : 'No scenes yet. Add a scene or go back and write a longer script.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {scenes.map((scene, index) => (
                    <div key={scene.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">Scene {index + 1}</span>
                          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
                            {(['talking_head', 'broll'] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => updateScene(scene.id, { type })}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  scene.type === type ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-950'
                                }`}
                              >
                                {type === 'talking_head' ? 'Talking' : 'B-roll'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setScenes((prev) => prev.filter((item) => item.id !== scene.id))}
                          className="rounded-full p-1 text-gray-500 hover:bg-white hover:text-red-600"
                          aria-label="Remove scene"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        value={scene.text}
                        onChange={(event) => updateScene(scene.id, { text: event.target.value })}
                        rows={2}
                        placeholder="Narration for this scene"
                        className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                      />
                      {scene.type === 'broll' && (
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                          <input
                            value={scene.visual_prompt}
                            onChange={(event) => updateScene(scene.id, { visual_prompt: event.target.value })}
                            placeholder="Visual direction for B-roll"
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                          />
                          {scene.image ? (
                            <div className="relative h-20 overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <img src={scene.image} alt="B-roll" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => updateScene(scene.id, { image: undefined })}
                                className="absolute right-1 top-1 rounded-full bg-black p-1 text-white"
                                aria-label="Remove B-roll image"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 text-xs font-semibold text-gray-600 hover:border-gray-500">
                              {scene.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                              Upload image
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                className="hidden"
                                disabled={scene.uploading}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) handleSceneImageUpload(scene.id, file);
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                      {scene.error && <p className="mt-2 text-xs text-red-600">{scene.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {step === 'actor' && (
            <section>
              <StepHeader step={3} title="Pick actor">
                Choose a creator. Filters are available for quick gender or style narrowing.
              </StepHeader>
              <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    value={actorSearch}
                    onChange={(event) => setActorSearch(event.target.value)}
                    placeholder="Search name, country, style..."
                    className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none transition-colors focus:border-gray-950"
                  />
                </div>
                <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
                  {(['all', 'female', 'male'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGenderFilter(value)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                        genderFilter === value ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-950'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              {actorsLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading actors...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {filteredActors.map((actor) => (
                    <button
                      key={actor.id}
                      type="button"
                      onClick={() => setSelectedActor(actor)}
                      className={`overflow-hidden rounded-xl border bg-white text-left transition-all ${
                        selectedActor?.id === actor.id ? 'border-gray-950 ring-2 ring-gray-950/20' : 'border-gray-200 hover:border-gray-500'
                      }`}
                    >
                      <div className="relative aspect-[3/4] bg-gray-100">
                        {actor.portrait_url && <img src={actor.portrait_url} alt={actor.name} className="h-full w-full object-cover" loading="lazy" />}
                        {selectedActor?.id === actor.id && (
                          <span className="absolute right-2 top-2 rounded-full bg-black p-1 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-sm font-semibold text-gray-950">{actor.name}</div>
                        <div className="truncate text-xs text-gray-500">{actor.slug}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {step === 'style' && (
            <section>
              <StepHeader step={4} title="Set output style">
                Choose subtitle styling, format, tone, music, duration, and optional CTA.
              </StepHeader>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500">Subtitle style</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                    {SUBTITLE_STYLES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setSubtitleStyle(item.value)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          subtitleStyle === item.value ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-gray-500">Duration</label>
                    <div className="flex gap-2">
                      {DURATIONS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setDuration(item)}
                          className={`h-10 min-w-16 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                            duration === item ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                          }`}
                        >
                          {item}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-gray-500">Aspect ratio</label>
                    <div className="flex flex-wrap gap-2">
                      {ASPECT_RATIOS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAspectRatio(item)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                            aspectRatio === item ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Tone</label>
                      <select
                        value={tone}
                        onChange={(event) => setTone(event.target.value as (typeof TONES)[number])}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-950"
                      >
                        {TONES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Music</label>
                      <select
                        value={music}
                        onChange={(event) => setMusic(event.target.value as (typeof MUSIC)[number])}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-950"
                      >
                        {MUSIC.map((item) => <option key={item || 'none'} value={item}>{item || 'none'}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">CTA</label>
                    <input
                      value={cta}
                      onChange={(event) => setCta(event.target.value)}
                      placeholder="Follow for more, Try it free..."
                      className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 'review' && (
            <section>
              <StepHeader step={5} title="Review and create">
                Confirm the final setup before the video job starts.
              </StepHeader>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <div className="font-semibold text-gray-950">Summary</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <span>Script: {scriptMode === 'generate' ? 'AI generated' : `${wordCount(script)} words`}</span>
                  <span>Scenes: {scenes.length || 'AI split'}</span>
                  <span>Actor: {selectedActor?.name ?? 'Not selected'}</span>
                  <span>Duration: {duration}s</span>
                  <span>Aspect: {aspectRatio}</span>
                  <span>Subtitles: {subtitleStyle}</span>
                </div>
              </div>
              {submitError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {submitError}
                </div>
              )}
            </section>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep((value) => Math.max(value - 1, 0))}
              disabled={currentStep === 0 || submitting}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {currentStep < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext} disabled={!stepIsValid || submitting}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create UGC
                    <Sparkles className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </main>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="aspect-[9/16] bg-gray-100">
              {selectedActor?.portrait_url ? (
                <img src={selectedActor.portrait_url} alt={selectedActor.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
                  Actor preview appears here.
                </div>
              )}
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="text-sm font-semibold text-gray-950">{selectedActor?.name ?? 'No actor selected'}</div>
                <div className="line-clamp-2 text-xs text-gray-500">{activeScript || 'Script preview'}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="font-semibold text-gray-950">{duration}s</div>
                  <div className="text-gray-500">Duration</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="font-semibold text-gray-950">~{estimatedCost}</div>
                  <div className="text-gray-500">Credits</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600">
                  <Subtitles className="h-3 w-3" />
                  {subtitleStyle}
                </span>
                <span className="rounded-full border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600">{aspectRatio}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function UgcVideoPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1220px] px-4 py-5 sm:px-6 lg:py-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
            Loading UGC wizard...
          </div>
        </div>
      }
    >
      <UgcVideoWizard />
    </Suspense>
  );
}
