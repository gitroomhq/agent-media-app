// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Link2,
  Loader2,
  Megaphone,
  Search,
  Sparkles,
  Subtitles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeFn } from '@/lib/supabase/fn-proxy';

type WizardStep = 'product' | 'screenshots' | 'script' | 'actor' | 'style' | 'review';
type ScriptMode = 'generate' | 'write';

type ScreenshotItem = {
  id: string;
  url: string;
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
  { id: 'product', title: 'Product', short: 'Product' },
  { id: 'screenshots', title: 'Screenshots', short: 'Screens' },
  { id: 'script', title: 'Script', short: 'Script' },
  { id: 'actor', title: 'Actor', short: 'Actor' },
  { id: 'style', title: 'Style', short: 'Style' },
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
] as const;
const TONES = ['energetic', 'calm', 'confident', 'dramatic'] as const;
const MUSIC = ['', 'chill', 'energetic', 'corporate', 'dramatic', 'upbeat'] as const;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function composeScriptPrompt(input: {
  saasName: string;
  productUrl: string;
  talkingPoints: string;
  angle: string;
  screenshots: ScreenshotItem[];
}) {
  return [
    `Write a first-person SaaS review script for ${input.saasName.trim()}.`,
    input.productUrl.trim() ? `Product URL: ${input.productUrl.trim()}` : '',
    input.talkingPoints.trim() ? `Positioning and talking points: ${input.talkingPoints.trim()}` : '',
    input.angle.trim() ? `Review angle: ${input.angle.trim()}` : '',
    input.screenshots.length > 0 ? `Use ${input.screenshots.length} product screenshot(s) as walkthrough B-roll context.` : '',
    'Keep it direct, credible, and timed for a short UGC review.',
  ].filter(Boolean).join('\n');
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

export default function SaasReviewPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep].id;

  const [saasName, setSaasName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [talkingPoints, setTalkingPoints] = useState('');
  const [angle] = useState('honest walkthrough');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState('');

  const [scriptMode, setScriptMode] = useState<ScriptMode>('generate');
  const [script, setScript] = useState('');
  const [extraScriptPrompt, setExtraScriptPrompt] = useState('');

  const [actors, setActors] = useState<Actor[]>([]);
  const [actorsLoading, setActorsLoading] = useState(true);
  const [actorSearch, setActorSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(10);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>('9:16');
  const [subtitleStyle, setSubtitleStyle] = useState('hormozi');
  const [tone, setTone] = useState<(typeof TONES)[number]>('confident');
  const [music, setMusic] = useState<(typeof MUSIC)[number]>('corporate');
  const [cta, setCta] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const generatedPrompt = useMemo(() => {
    const base = composeScriptPrompt({ saasName, productUrl, talkingPoints, angle, screenshots });
    return extraScriptPrompt.trim() ? `${base}\n\nExtra script direction: ${extraScriptPrompt.trim()}` : base;
  }, [angle, extraScriptPrompt, productUrl, saasName, screenshots, talkingPoints]);

  const stepIsValid = useMemo(() => {
    if (step === 'product') {
      return saasName.trim().length >= 2 && (!productUrl.trim() || isValidHttpUrl(productUrl.trim()));
    }
    if (step === 'screenshots') {
      return screenshots.length > 0 || (productUrl.trim().length > 0 && isValidHttpUrl(productUrl.trim()));
    }
    if (step === 'script') {
      return scriptMode === 'generate' ? generatedPrompt.trim().length >= 20 : script.trim().length >= 50;
    }
    if (step === 'actor') return Boolean(selectedActor);
    return true;
  }, [generatedPrompt, productUrl, saasName, screenshots.length, script, scriptMode, selectedActor, step]);

  const canSubmit = Boolean(selectedActor && stepIsValid && !submitting);
  const estimatedCost = duration * 30 + (scriptMode === 'generate' ? 5 : 0);

  function addScreenshotUrl() {
    const url = screenshotUrl.trim();
    if (!isValidHttpUrl(url) || screenshots.length >= 3) return;
    setScreenshots((prev) => [...prev, { id: uid(), url }]);
    setScreenshotUrl('');
  }

  function updateScreenshot(id: string, updates: Partial<ScreenshotItem>) {
    setScreenshots((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  async function handleScreenshotUpload(file: File) {
    if (screenshots.length >= 3) return;
    const id = uid();
    setScreenshots((prev) => [...prev, { id, url: '', uploading: true, error: null }]);
    try {
      const url = await uploadGenerationImage(file);
      updateScreenshot(id, { url });
    } catch (err) {
      updateScreenshot(id, { error: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      updateScreenshot(id, { uploading: false });
    }
  }

  function goNext() {
    if (!stepIsValid) return;
    setCurrentStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  async function handleSubmit() {
    if (!canSubmit || !selectedActor) return;
    setSubmitting(true);
    setSubmitError(null);

    const cleanScreenshots = screenshots.map((item) => item.url).filter(Boolean);
    const payload: Record<string, unknown> = {
      template: 'saas-review',
      actor_slug: selectedActor.slug,
      target_duration: duration,
      style: subtitleStyle,
      tone,
      aspect_ratio: aspectRatio,
      allow_broll: cleanScreenshots.length > 0,
      broll_images: cleanScreenshots,
    };

    if (productUrl.trim()) payload.product_url = productUrl.trim();
    if (music) payload.music = music;
    if (cta.trim()) payload.cta = cta.trim();

    if (scriptMode === 'generate') {
      payload.generate_script = true;
      payload.script_prompt = generatedPrompt;
    } else {
      payload.script = script.trim();
    }

    try {
      const { data, error } = await invokeFn('ugc-video', { body: payload });
      if (error) throw new Error(error.message ?? 'Failed to create SaaS Review');
      if (data?.job_id) router.push(`/gallery/${data.job_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create SaaS Review');
      setSubmitting(false);
    }
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
          SaaS Review
        </span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Create SaaS Review</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Turn a SaaS URL and product screenshots into a creator-style review with B-roll and subtitles.
        </p>
      </div>

      <div className="mb-5 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2">
        <div className="grid min-w-[760px] grid-cols-6 gap-2">
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
          {step === 'product' && (
            <section>
              <StepHeader step={1} title="Add SaaS context">
                Start with the product name, URL, and the positioning the actor should understand.
              </StepHeader>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">SaaS name</label>
                  <input
                    value={saasName}
                    onChange={(event) => setSaasName(event.target.value)}
                    placeholder="Linear, Postiz, Notion..."
                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none transition-colors focus:border-gray-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Product URL</label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                      value={productUrl}
                      onChange={(event) => setProductUrl(event.target.value)}
                      placeholder="https://example.com"
                      className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                  </div>
                  {productUrl.trim() && !isValidHttpUrl(productUrl.trim()) && (
                    <p className="mt-1 text-xs text-red-600">Enter a valid http or https URL.</p>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Positioning / talking points</label>
                  <textarea
                    value={talkingPoints}
                    onChange={(event) => setTalkingPoints(event.target.value)}
                    rows={5}
                    placeholder="Who it is for, what problem it solves, key feature, objection, pricing angle, or proof point."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                  />
                </div>
              </div>
            </section>
          )}

          {step === 'screenshots' && (
            <section>
              <StepHeader step={2} title="Add screenshots">
                Upload or paste 1-3 screenshots for B-roll. A valid product URL can also be enough for script context.
              </StepHeader>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <div className="flex gap-2">
                    <input
                      value={screenshotUrl}
                      onChange={(event) => setScreenshotUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addScreenshotUrl();
                        }
                      }}
                      placeholder="Paste screenshot URL"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                    <Button type="button" variant="outline" onClick={addScreenshotUrl} disabled={!isValidHttpUrl(screenshotUrl.trim()) || screenshots.length >= 3}>
                      Add
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Require either a valid product URL or at least one screenshot before continuing.</p>
                </div>
                <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 text-sm font-semibold text-gray-600 hover:border-gray-500" aria-disabled={screenshots.length >= 3}>
                  <ImagePlus className="h-4 w-4" />
                  Upload image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    disabled={screenshots.length >= 3}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleScreenshotUpload(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {screenshots.map((item) => (
                  <div key={item.id} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    {item.uploading ? (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-950" />
                      </div>
                    ) : item.url ? (
                      <img src={item.url} alt="SaaS screenshot" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-red-600">
                        {item.error ?? 'Upload failed'}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setScreenshots((prev) => prev.filter((screenshot) => screenshot.id !== item.id))}
                      className="absolute right-2 top-2 rounded-full bg-black p-1 text-white"
                      aria-label="Remove screenshot"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {screenshots.length === 0 && (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center text-sm text-gray-500 sm:col-span-3">
                    Screenshots appear here.
                  </div>
                )}
              </div>
            </section>
          )}

          {step === 'script' && (
            <section>
              <StepHeader step={3} title="Choose script mode">
                Let AI write from the SaaS context, or paste the exact line for the actor.
              </StepHeader>
              <div className="mb-4 flex flex-wrap gap-2">
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
                <button
                  type="button"
                  onClick={() => setScriptMode('write')}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    scriptMode === 'write' ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                  }`}
                >
                  Exact script
                </button>
              </div>
              {scriptMode === 'generate' ? (
                <div>
                  <textarea
                    value={extraScriptPrompt}
                    onChange={(event) => setExtraScriptPrompt(event.target.value)}
                    rows={5}
                    placeholder="Optional extra script direction: compare against spreadsheets, focus on speed, mention pricing, avoid hype..."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                  />
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-600">
                    <div className="mb-1 font-semibold text-gray-950">Generated prompt preview</div>
                    <pre className="whitespace-pre-wrap font-sans">{generatedPrompt}</pre>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    rows={7}
                    placeholder="Write the exact words for the actor. Minimum 50 characters."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                  />
                  <p className="mt-2 text-xs text-gray-500">{wordCount(script)} words</p>
                </div>
              )}
            </section>
          )}

          {step === 'actor' && (
            <section>
              <StepHeader step={4} title="Pick actor">
                Choose the creator who will deliver the review.
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
              <StepHeader step={5} title="Style the output">
                Choose the format, subtitles, duration, tone, music, and optional CTA.
              </StepHeader>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500">Subtitle style</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
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
                      placeholder="Try it free, Book a demo..."
                      className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 'review' && (
            <section>
              <StepHeader step={6} title="Review and create">
                Confirm the SaaS Review setup before the video job starts.
              </StepHeader>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <div className="font-semibold text-gray-950">Summary</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <span>SaaS: {saasName}</span>
                  <span>Actor: {selectedActor?.name ?? 'Not selected'}</span>
                  <span>URL: {productUrl || 'Not provided'}</span>
                  <span>Screenshots: {screenshots.length}</span>
                  <span>Script: {scriptMode === 'generate' ? 'AI generated' : `${wordCount(script)} words`}</span>
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
                    Create SaaS Review
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
              ) : screenshots[0]?.url ? (
                <img src={screenshots[0].url} alt="SaaS screenshot" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
                  Actor or screenshot preview appears here.
                </div>
              )}
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                  <Megaphone className="h-4 w-4" />
                  {saasName || 'SaaS Review'}
                </div>
                <div className="line-clamp-2 text-xs text-gray-500">{productUrl || talkingPoints || 'Product context preview'}</div>
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
