// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Search,
  Sparkles,
  Subtitles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeFn } from '@/lib/supabase/fn-proxy';

type ProductTemplate =
  | 'product-in-hand'
  | 'mirror-selfie'
  | 'bathroom-reaction'
  | 'kitchen-counter'
  | 'car-selfie'
  | 'couch-review'
  | 'expert-interview'
  | 'product-closeup';

type ActingStyle =
  | 'raw-selfie'
  | 'shocked'
  | 'angry'
  | 'excited'
  | 'dramatic'
  | 'weird-hook'
  | 'casual-demo'
  | 'honest-review';

type Actor = {
  id: string;
  slug: string;
  name: string;
  portrait_url: string | null;
  gender?: string | null;
  age?: string | null;
  nationality?: string | null;
};

type ActorVariant = {
  id: string;
  image_url: string | null;
  position?: string | null;
  framing?: string | null;
  outfit?: string | null;
  background?: string | null;
  expression?: string | null;
};

const TEMPLATES: Array<{ value: ProductTemplate; label: string; detail: string }> = [
  { value: 'product-in-hand', label: 'Product in hand', detail: 'Creator holds the product close to camera.' },
  { value: 'mirror-selfie', label: 'Mirror selfie', detail: 'Raw phone mirror shot with the product visible.' },
  { value: 'bathroom-reaction', label: 'Vanity reaction', detail: 'Expressive reaction in a bright indoor routine setup.' },
  { value: 'kitchen-counter', label: 'Kitchen counter', detail: 'Natural home demo near a counter.' },
  { value: 'car-selfie', label: 'Car selfie', detail: 'Parked-car creator shot.' },
  { value: 'couch-review', label: 'Couch review', detail: 'Warm casual review at home.' },
  { value: 'expert-interview', label: 'Expert interview', detail: 'Authority style with product present.' },
  { value: 'product-closeup', label: 'Product closeup', detail: 'Product large in foreground, actor behind.' },
];

const ACTING_STYLES: Array<{ value: ActingStyle; label: string }> = [
  { value: 'raw-selfie', label: 'Raw selfie' },
  { value: 'shocked', label: 'Shocked' },
  { value: 'angry', label: 'Angry hook' },
  { value: 'excited', label: 'Excited' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'weird-hook', label: 'Weird hook' },
  { value: 'casual-demo', label: 'Casual demo' },
  { value: 'honest-review', label: 'Honest review' },
];

const DURATIONS = [5, 10, 15] as const;
const CREDITS_PER_SECOND = 30;
const PRODUCT_ACTING_FRAME_CREDITS = 50;
const SCRIPT_GENERATION_CREDITS = 5;

const STEPS = [
  { title: 'Scenario', short: 'Scenario' },
  { title: 'Product', short: 'Product' },
  { title: 'Actor', short: 'Actor' },
  { title: 'Style', short: 'Style' },
  { title: 'Script', short: 'Script' },
] as const;

const GENDER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
] as const;

type GenderFilter = (typeof GENDER_FILTERS)[number]['value'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function StepHeader({ step, title, children }: { step: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-[11px] text-white">
          {step}
        </span>
        <span>{title}</span>
      </div>
      {children && <p className="mt-2 max-w-2xl text-xs leading-5 text-gray-600 sm:text-sm">{children}</p>}
    </div>
  );
}

export default function ProductActingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<ProductTemplate>('product-in-hand');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productPreviewUrl, setProductPreviewUrl] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [script, setScript] = useState('');
  const [actingStyle, setActingStyle] = useState<ActingStyle>('raw-selfie');
  const [visualStyle, setVisualStyle] = useState('');
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(5);
  const [subtitles, setSubtitles] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [actors, setActors] = useState<Actor[]>([]);
  const [actorsLoading, setActorsLoading] = useState(true);
  const [actorSearch, setActorSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [actorPickerOpen, setActorPickerOpen] = useState(false);
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);
  const [variants, setVariants] = useState<ActorVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedActor) {
      setVariants([]);
      setSelectedVariantId(null);
      return;
    }

    let cancelled = false;
    setVariantsLoading(true);
    setSelectedVariantId(null);
    (async () => {
      try {
        const res = await fetch(`/api/actors/${selectedActor.id}/variants`);
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.variants) ? data.variants : [];
        setVariants(list.filter((variant: ActorVariant) => isNonEmptyString(variant.image_url)));
      } catch {
        if (!cancelled) setVariants([]);
      } finally {
        if (!cancelled) setVariantsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedActor]);

  useEffect(() => {
    if (!actorPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActorPickerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [actorPickerOpen]);

  useEffect(() => {
    if (!stepError) return;
    const hasCurrentStepRequirement =
      (currentStep === 1 && productImageUrl && !uploading)
      || (currentStep === 2 && selectedActor)
      || (currentStep === 4 && (script.trim().length >= 5 || productDescription.trim().length >= 5));
    if (hasCurrentStepRequirement) setStepError(null);
  }, [currentStep, productDescription, productImageUrl, script, selectedActor, stepError, uploading]);

  const filteredActors = useMemo(() => {
    const q = actorSearch.trim().toLowerCase();
    return actors
      .filter((actor) => {
        if (genderFilter !== 'all' && actor.gender?.toLowerCase() !== genderFilter) return false;
        if (!q) return true;
        return [
          actor.name,
          actor.slug,
          actor.gender,
          actor.age,
          actor.nationality,
        ].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .slice(0, 30);
  }, [actors, actorSearch, genderFilter]);

  const actorCounts = useMemo(() => ({
    all: actors.length,
    female: actors.filter((actor) => actor.gender?.toLowerCase() === 'female').length,
    male: actors.filter((actor) => actor.gender?.toLowerCase() === 'male').length,
  }), [actors]);

  const selectedActorImage = useMemo(() => {
    const variant = variants.find((item) => item.id === selectedVariantId);
    return variant?.image_url ?? selectedActor?.portrait_url ?? '';
  }, [selectedActor, selectedVariantId, variants]);

  const selectedVariant = useMemo(
    () => variants.find((item) => item.id === selectedVariantId) ?? null,
    [selectedVariantId, variants],
  );

  const estimatedCost = duration * CREDITS_PER_SECOND
    + PRODUCT_ACTING_FRAME_CREDITS
    + (script.trim() ? 0 : SCRIPT_GENERATION_CREDITS);

  const canSubmit = Boolean(
    productImageUrl &&
    selectedActor &&
    !uploading &&
    !submitting &&
    (script.trim().length >= 5 || productDescription.trim().length >= 5),
  );

  function getStepError(stepIndex: number) {
    if (stepIndex === 1) {
      if (uploading) return 'Wait for the product upload to finish before continuing.';
      if (!productImageUrl) return 'Upload a product image before continuing.';
    }
    if (stepIndex === 2 && !selectedActor) return 'Pick an actor before continuing.';
    if (stepIndex === 4 && script.trim().length < 5 && productDescription.trim().length < 5) {
      return 'Add an exact script or describe the product before creating.';
    }
    return null;
  }

  function getFirstBlockingStep(targetStep: number) {
    for (let stepIndex = 0; stepIndex < targetStep; stepIndex += 1) {
      if (getStepError(stepIndex)) return stepIndex;
    }
    return null;
  }

  function goToStep(stepIndex: number) {
    if (stepIndex <= currentStep) {
      setStepError(null);
      setCurrentStep(stepIndex);
      return;
    }

    const blockingStep = getFirstBlockingStep(stepIndex);
    if (blockingStep !== null) {
      setCurrentStep(blockingStep);
      setStepError(getStepError(blockingStep));
      return;
    }

    setStepError(null);
    setCurrentStep(stepIndex);
  }

  function goNext() {
    const error = getStepError(currentStep);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setCurrentStep((step) => Math.min(step + 1, STEPS.length - 1));
  }

  async function handleProductUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    setProductImageUrl('');
    setProductPreviewUrl(URL.createObjectURL(file));

    try {
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

      setProductImageUrl(signedData.signed_url);
      setStepError(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setProductImageUrl('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit() {
    const blockingStep = getFirstBlockingStep(STEPS.length);
    if (blockingStep !== null) {
      setCurrentStep(blockingStep);
      setStepError(getStepError(blockingStep));
      return;
    }
    if (!canSubmit || !selectedActor) return;
    setSubmitting(true);
    setSubmitError(null);
    setStepError(null);

    try {
      const payload: Record<string, unknown> = {
        product_image_url: productImageUrl,
        actor_slug: selectedActor.slug,
        template,
        acting_style: actingStyle,
        duration,
        subtitles,
        subtitle_style: subtitles ? 'hormozi' : 'none',
      };
      if (selectedVariantId) payload.actor_variant_id = selectedVariantId;
      if (productName.trim()) payload.product_name = productName.trim();
      if (productDescription.trim()) payload.product_description = productDescription.trim();
      if (script.trim()) payload.script = script.trim();
      if (visualStyle.trim()) payload.visual_style = visualStyle.trim();

      const resp = await fetch('/api/v1/product-acting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message ?? data?.error_description ?? `Request failed: ${resp.status}`);
      if (data.job_id) router.push(`/gallery/${data.job_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1160px] px-3 py-4 sm:px-6 lg:py-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => router.push('/create')}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Create
        </button>
        <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
          Product UGC
        </span>
      </div>

      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">
          Product Acting UGC
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Build a product-in-hand creator video in five focused steps.
        </p>
      </div>

      <details className="mb-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900">
        <summary className="cursor-pointer select-none font-medium">
          Heads-up: content safety rules (so your job isn&apos;t blocked)
        </summary>
        <div className="mt-2 space-y-1 leading-relaxed">
          <p>The image provider auto-rejects requests with:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>Real person photos, photorealistic faces, celebrity likenesses</li>
            <li>Copyrighted content (logos, brand marks, IP characters)</li>
            <li>Adult, violent, political, or religiously sensitive content</li>
            <li>Body-transformation, weight-loss, medical-result imagery</li>
            <li>Suggestive / underwear / lingerie / cleavage-focused poses</li>
          </ul>
          <p className="pt-1">If your job comes back &quot;CONTENT_POLICY_BLOCKED&quot;, adjust the prompt or product image and resubmit. Credits are refunded automatically.</p>
        </div>
      </details>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-1.5">
        <div className="grid grid-cols-5 gap-1">
          {STEPS.map((step, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            return (
              <button
                key={step.title}
                type="button"
                aria-label={step.title}
                onClick={() => goToStep(index)}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-left transition-colors sm:justify-start sm:px-3 ${
                  active
                    ? 'bg-black text-white'
                    : done
                      ? 'bg-gray-100 text-gray-950'
                      : index > currentStep && getFirstBlockingStep(index) !== null
                        ? 'cursor-not-allowed text-gray-400 hover:bg-gray-50'
                        : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  active ? 'bg-white text-black' : done ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {done ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="hidden truncate text-xs font-semibold sm:block">{step.short}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
          {currentStep === 0 && (
            <section>
              <StepHeader step={1} title="Pick scenario">
                Choose the real-world UGC framing before adding product and actor details.
              </StepHeader>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {TEMPLATES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTemplate(item.value)}
                    className={`min-h-[88px] rounded-lg border p-3 text-left transition-all sm:min-h-[108px] ${
                      template === item.value
                        ? 'border-gray-950 bg-gray-950 text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-950 hover:border-gray-400'
                    }`}
                  >
                    <span className="block text-xs font-semibold sm:text-sm">{item.label}</span>
                    <span className={`mt-1.5 block text-[11px] leading-4 sm:text-xs sm:leading-5 ${template === item.value ? 'text-white/70' : 'text-gray-600'}`}>
                      {item.detail}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {currentStep === 1 && (
            <section>
              <StepHeader step={2} title="Upload product">
                Add a clean product image and the minimum context needed for the actor and script.
              </StepHeader>
              <div className="grid gap-4 md:grid-cols-[220px,minmax(0,1fr)]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 md:aspect-[4/5]">
                  {productPreviewUrl ? (
                    <>
                      <img src={productPreviewUrl} alt="Uploaded product" className="h-full w-full object-cover" />
                      <button
                        onClick={() => {
                          setProductPreviewUrl('');
                          setProductImageUrl('');
                        }}
                        className="absolute right-2 top-2 rounded-full bg-black p-1 text-white"
                        aria-label="Remove product image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-600 hover:text-gray-950"
                    >
                      <Upload className="h-6 w-6" />
                      Upload product image
                    </button>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-950" />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleProductUpload(file);
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                    {productPreviewUrl ? 'Replace image' : 'Choose image'}
                  </Button>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Product name</label>
                    <input
                      value={productName}
                      onChange={(event) => setProductName(event.target.value)}
                      placeholder="Rose perfume, protein jar, mobile app card..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">About the product</label>
                    <textarea
                      value={productDescription}
                      onChange={(event) => setProductDescription(event.target.value)}
                      rows={5}
                      placeholder="What it does, who it is for, main benefit, objection, hook, or offer."
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                  </div>
                  {uploadError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {uploadError}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {currentStep === 2 && (
            <section>
              <StepHeader step={3} title="Pick actor">
                Open the actor library, choose a creator, then select the best look or variant.
              </StepHeader>
              <button
                type="button"
                onClick={() => setActorPickerOpen(true)}
                className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:border-gray-400 hover:bg-white sm:flex-row sm:items-center"
              >
                <div className="flex w-full min-w-0 gap-3 sm:items-center">
                  <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {selectedActorImage ? (
                      <img src={selectedActorImage} alt={selectedActor?.name ?? 'Selected actor'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Actor</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <p className="text-sm font-semibold text-gray-950">
                      {selectedActor ? selectedActor.name : 'Choose actor'}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-gray-600">
                      {selectedActor
                        ? `${selectedActor.slug}${selectedVariant ? ` · ${selectedVariant.expression ?? selectedVariant.outfit ?? 'custom look'}` : ' · default look'}`
                        : 'Search actors and choose a face, age, style, and reference look.'}
                    </p>
                    {selectedActor && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-gray-600">
                        {[selectedActor.gender, selectedActor.age, selectedActor.nationality].filter(Boolean).map((item) => (
                          <span key={String(item)} className="rounded-full border border-gray-200 bg-white px-2 py-1">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className="w-full shrink-0 rounded-full bg-black px-4 py-2 text-center text-sm font-semibold text-white sm:w-auto">
                  {selectedActor ? 'Change actor' : 'Pick actor'}
                </span>
              </button>
            </section>
          )}

          {currentStep === 3 && (
            <section>
              <StepHeader step={4} title="Customize style">
                Pick the acting energy, duration, subtitles, and any extra camera or pose direction.
              </StepHeader>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-500">Acting</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                    {ACTING_STYLES.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => setActingStyle(item.value)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          actingStyle === item.value
                            ? 'border-gray-950 bg-gray-950 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
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
                          onClick={() => setDuration(item)}
                          className={`h-10 min-w-16 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                            duration === item
                              ? 'border-gray-950 bg-gray-950 text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                          }`}
                        >
                          {item}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-gray-500">Subtitles</label>
                    <button
                      onClick={() => setSubtitles((value) => !value)}
                      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                        subtitles
                          ? 'border-gray-950 bg-gray-950 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <Subtitles className="h-4 w-4" />
                      {subtitles ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Extra visual direction</label>
                    <input
                      value={visualStyle}
                      onChange={(event) => setVisualStyle(event.target.value)}
                      placeholder="Full body, standing, messy counter, strong reaction..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {currentStep === 4 && (
            <section>
              <StepHeader step={5} title="Text / about product">
                Write the exact line, or leave it empty and the system will generate a short script from the product context.
              </StepHeader>
              <textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                rows={5}
                placeholder="Optional exact words for the actor. Example: I did not expect this perfume to smell this expensive."
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-gray-950"
              />
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <div className="font-semibold text-gray-950">Review before creating</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <span>Scenario: {TEMPLATES.find((item) => item.value === template)?.label}</span>
                  <span>Actor: {selectedActor?.name ?? 'Not selected'}</span>
                  <span>Acting: {ACTING_STYLES.find((item) => item.value === actingStyle)?.label}</span>
                  <span>Subtitles: {subtitles ? 'On' : 'Off'}</span>
                </div>
              </div>
              {submitError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {submitError}
                </div>
              )}
            </section>
          )}

          {stepError && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {stepError}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStepError(null);
                setCurrentStep((step) => Math.max(step - 1, 0));
              }}
              disabled={currentStep === 0 || submitting}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext} disabled={submitting}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Product UGC
                    <Sparkles className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </main>

        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="aspect-[9/16] bg-gray-100">
              {selectedActorImage ? (
                <img src={selectedActorImage} alt="Selected actor" className="h-full w-full object-cover" />
              ) : productPreviewUrl ? (
                <img src={productPreviewUrl} alt="Selected product" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-500">
                  Product and actor preview appears here.
                </div>
              )}
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="text-sm font-semibold text-gray-950">{(selectedActor?.name ?? productName) || 'No preview selected'}</div>
                <div className="text-xs text-gray-500">{TEMPLATES.find((item) => item.value === template)?.label}</div>
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
            </div>
          </div>
        </aside>
      </div>

      {actorPickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pick actor"
        >
          <div className="flex h-full flex-col overflow-hidden bg-white sm:mx-auto sm:max-w-5xl sm:rounded-xl sm:shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-950">Pick actor</h3>
                <p className="mt-0.5 hidden text-sm text-gray-600 sm:block">Search, select an actor, then choose the best look for this product.</p>
              </div>
              <button
                type="button"
                onClick={() => setActorPickerOpen(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-950"
                aria-label="Close actor picker"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex min-h-0 flex-col border-gray-200 lg:border-r">
                <div className="border-b border-gray-200 p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        autoFocus
                        value={actorSearch}
                        onChange={(event) => setActorSearch(event.target.value)}
                        placeholder="Search name, age, country..."
                        className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm outline-none transition-colors focus:border-gray-950"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 text-xs sm:w-[240px]">
                      {GENDER_FILTERS.map((filter) => (
                        <button
                          key={filter.value}
                          type="button"
                          onClick={() => setGenderFilter(filter.value)}
                          className={`rounded-md px-2 py-1.5 font-semibold transition-colors ${
                            genderFilter === filter.value
                              ? 'bg-white text-gray-950 shadow-sm'
                              : 'text-gray-600 hover:text-gray-950'
                          }`}
                        >
                          <span>{filter.label}</span>
                          <span className="ml-1 text-[10px] text-gray-400">
                            {actorCounts[filter.value]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                  {actorsLoading ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading actors...
                    </div>
                  ) : filteredActors.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                      No actors found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                        {filteredActors.map((actor) => (
                        <button
                          key={actor.id}
                          type="button"
                          onClick={() => {
                            setSelectedActor(actor);
                            setStepError(null);
                          }}
                          className={`group flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all sm:block sm:p-0 ${
                            selectedActor?.id === actor.id
                              ? 'border-gray-950 ring-2 ring-gray-950/20'
                              : 'border-gray-200 hover:border-gray-500'
                          }`}
                        >
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-auto sm:w-auto sm:rounded-none sm:aspect-square">
                            {actor.portrait_url && (
                              <img src={actor.portrait_url} alt={actor.name} className="h-full w-full object-cover" loading="lazy" />
                            )}
                            {selectedActor?.id === actor.id && (
                              <span className="absolute right-2 top-2 rounded-full bg-black p-1 text-white">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 p-1 sm:p-1.5">
                            <div className="truncate text-xs font-semibold text-gray-950">{actor.name}</div>
                            <div className="truncate text-xs text-gray-500">
                              {[actor.gender, actor.age, actor.nationality].filter(Boolean).join(' · ') || actor.slug}
                            </div>
                          </div>
                        </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden min-h-0 flex-col bg-gray-50 lg:flex">
                <div className="border-b border-gray-200 p-4 sm:p-5">
                  <p className="text-sm font-semibold text-gray-950">Selected actor</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {selectedActor ? `${selectedActor.name} · ${selectedActor.slug}` : 'Pick an actor to choose a look.'}
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                  {selectedActor ? (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <div className="aspect-[4/5] bg-gray-100">
                          {selectedActorImage && (
                            <img src={selectedActorImage} alt={selectedActor.name} className="h-full w-full object-cover" />
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-950">Looks</p>
                          {variantsLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVariantId(null);
                              setStepError(null);
                            }}
                            className={`overflow-hidden rounded-lg border bg-white text-left ${
                              selectedVariantId === null ? 'border-gray-950 ring-2 ring-gray-950/20' : 'border-gray-200'
                            }`}
                          >
                            <div className="aspect-[3/4] bg-gray-100">
                              {selectedActor.portrait_url && (
                                <img src={selectedActor.portrait_url} alt={selectedActor.name} className="h-full w-full object-cover" loading="lazy" />
                              )}
                            </div>
                            <div className="truncate px-2 py-1 text-xs font-medium text-gray-700">Default</div>
                          </button>
                          {variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => {
                                setSelectedVariantId(variant.id);
                                setStepError(null);
                              }}
                              className={`overflow-hidden rounded-lg border bg-white text-left ${
                                selectedVariantId === variant.id ? 'border-gray-950 ring-2 ring-gray-950/20' : 'border-gray-200'
                              }`}
                            >
                              <div className="aspect-[3/4] bg-gray-100">
                                {variant.image_url && (
                                  <img src={variant.image_url} alt="Actor variant" className="h-full w-full object-cover" loading="lazy" />
                                )}
                              </div>
                              <div className="truncate px-2 py-1 text-xs font-medium text-gray-700">
                                {variant.expression ?? variant.outfit ?? 'Look'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 text-center text-sm text-gray-500">
                      Choose an actor from the library.
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 bg-white p-4 sm:p-5">
                  <Button
                    type="button"
                    onClick={() => setActorPickerOpen(false)}
                    disabled={!selectedActor}
                    className="w-full"
                  >
                    Use actor
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-gray-200 bg-white p-3 lg:hidden">
              <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {selectedActorImage ? (
                  <img src={selectedActorImage} alt={selectedActor?.name ?? 'Selected actor'} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-950">
                  {selectedActor?.name ?? 'No actor selected'}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {selectedActor ? selectedActor.slug : 'Choose an actor above'}
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setActorPickerOpen(false)}
                disabled={!selectedActor}
                className="shrink-0"
              >
                Use
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
