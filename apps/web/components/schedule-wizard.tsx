// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * ScheduleWizard — slide-over wizard for creating a recurring
 * character_video schedule.
 *
 * Step 1 (this file): Name + Cadence + Duration.
 *   - Cadence picker is "smart": picking sub-daily / daily / weekly
 *     swaps in the right inline time inputs.
 *
 * Subsequent steps will live next to this in follow-up commits:
 *   Step 2 — Character source (actor / sheet URL / from a brief)
 *   Step 3 — Variation brief (the AI rewrites-each-run pattern)
 *   Step 4 — Caption + Postiz destinations
 *   Step 5 — Review + create
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Search, Upload as UploadIcon, User as UserIcon, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { getVar } from '@/components/variable-context';

const TOTAL_STEPS = 6;
// Runtime config (see components/variable-context). Lazy on purpose: a
// module-level const evaluates at import time, before the root layout has
// published window.vars, and would capture '' forever.
const supabaseUrl = () =>
  (getVar('supabaseUrl', process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') ?? '')
    .trim()
    .replace(/\/+$/, '');
const UPLOAD_BUCKET = 'generation-inputs';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

type CharacterMode = 'actor' | 'upload' | 'describe' | 'random' | 'prompts';
export type AssetType = 'product' | 'saas_capture' | 'app_screenshot';

interface AssetOption {
  id: AssetType;
  label: string;
  hint: string;
}

const ASSET_OPTIONS: AssetOption[] = [
  { id: 'product',        label: 'Product photo',  hint: 'Character holds and shows the product to camera.' },
  { id: 'saas_capture',   label: 'SaaS capture',   hint: 'Still frame from your SaaS UI. Character gestures toward it.' },
  { id: 'app_screenshot', label: 'App screenshot', hint: 'Character holds a phone displaying the screenshot.' },
];

interface ActorSummary {
  slug: string;
  name: string;
  gender?: string | null;
  age?: string | null;
  age_range?: string | null;
  nationality?: string | null;
  portrait_url?: string | null;
}

const RANDOM_PRESETS = [
  '30s wellness coach, warm smile',
  'twenty-something tech creator, hoodie, glasses',
  'food blogger in their kitchen, energetic',
  'fitness influencer, athletic, friendly',
  'finance bro in business casual, confident',
  'indie maker founder, casual, relatable',
];

type CadenceMode =
  | 'hourly'
  | 'every-2h'
  | 'every-4h'
  | 'every-6h'
  | 'every-12h'
  | 'daily'
  | 'weekdays'
  | 'weekly';

interface CadenceOption {
  id: CadenceMode;
  label: string;
  hours: number; // hours between fires
  anchorKind: 'minute' | 'time' | 'day-time';
}

const CADENCE_OPTIONS: CadenceOption[] = [
  { id: 'hourly',     label: 'Every hour',          hours: 1,   anchorKind: 'minute' },
  { id: 'every-2h',   label: 'Every 2 hours',       hours: 2,   anchorKind: 'time' },
  { id: 'every-4h',   label: 'Every 4 hours',       hours: 4,   anchorKind: 'time' },
  { id: 'every-6h',   label: 'Every 6 hours',       hours: 6,   anchorKind: 'time' },
  { id: 'every-12h',  label: 'Every 12 hours',      hours: 12,  anchorKind: 'time' },
  { id: 'daily',      label: 'Every day',           hours: 24,  anchorKind: 'time' },
  { id: 'weekdays',   label: 'Every weekday (Mon-Fri)', hours: 24,  anchorKind: 'time' },
  { id: 'weekly',     label: 'Every week',          hours: 168, anchorKind: 'day-time' },
];

const WEEKDAYS = [
  { id: 0, label: 'Sunday', short: 'Sun' },
  { id: 1, label: 'Monday', short: 'Mon' },
  { id: 2, label: 'Tuesday', short: 'Tue' },
  { id: 3, label: 'Wednesday', short: 'Wed' },
  { id: 4, label: 'Thursday', short: 'Thu' },
  { id: 5, label: 'Friday', short: 'Fri' },
  { id: 6, label: 'Saturday', short: 'Sat' },
];

export interface ScheduleWizardState {
  // Step 1 — schedule basics
  name: string;
  cadenceMode: CadenceMode;
  cadenceHours: number;
  /** HH:MM (local 24h) — required for time / day-time anchor kinds. */
  anchorTime: string;
  /** 0–59 — required for minute anchor kind (hourly). */
  anchorMinute: number;
  /** 0=Sun … 6=Sat — required for day-time anchor (weekly). */
  anchorWeekday: number;
  /** Computed next fire time (ISO) — derived from cadence + anchors + browser tz. */
  nextRunAt: string;
  durationSeconds: 5 | 10 | 15;
  aspectRatio: '9:16' | '16:9' | '1:1';

  // Step 2 — character source
  characterMode: CharacterMode;
  /** Set when characterMode === 'actor'. */
  actorSlug: string | null;
  /** Set when characterMode === 'upload' (https URL). */
  referenceImageUrl: string | null;
  /** Set when characterMode === 'describe'. */
  description: string;
  /** Set when characterMode === 'random' — shorter vibe seed for AI. */
  randomVibe: string;
  // Step 2 — optional reference asset that the character can hold / display.
  // Becomes a second image reference into the same gpt-image-2 + Seedance 2.0
  // pipeline; the AI is told which kind of asset it has so the storyboard
  // can pose the character around it.
  assetType: AssetType | null;
  /** Public https URL of the uploaded asset (image only). */
  assetUrl: string | null;

  // Step 3 — recurring brief
  brief: string;
  /** Batch mode: when non-empty, each row is the brief for one tick;
   *  the schedule auto-archives after the last row. `brief` is ignored. */
  promptRows: string[];

  // Step 4 — caption
  captionMode: 'ai' | 'static';
  /** Optional guidance to bias the AI caption (tone, hashtags, length). */
  captionGuidance: string;
  /** Required when captionMode='static'. Supports {{topic}} placeholder. */
  captionTemplate: string;
}

export interface SelectedDestination {
  id: string;
  identifier: string;
  name: string;
  picture?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Fired when the user clicks Create on step 5. Return null on success
   * (wizard auto-closes); return a string error message to display
   * inline on the review card.
   */
  onFinish: (s: ScheduleWizardState) => Promise<string | null> | string | null;
  /** Postiz destinations chosen on the parent page; rendered on step 5 review. */
  selectedDestinations?: SelectedDestination[];
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Compute the first ISO timestamp at or after `now` that matches the
 * cadence + anchor selection, in browser local time.
 */
function computeNextRunAt(
  cadence: CadenceOption,
  anchorTime: string,
  anchorMinute: number,
  anchorWeekday: number,
): string {
  const now = new Date();
  if (cadence.anchorKind === 'minute') {
    const next = new Date(now);
    next.setMinutes(anchorMinute, 0, 0);
    if (next <= now) next.setHours(next.getHours() + 1);
    return next.toISOString();
  }
  const [hh, mm] = (anchorTime || '09:00').split(':').map((n) => Number(n));
  if (cadence.anchorKind === 'time') {
    const next = new Date(now);
    next.setHours(hh, mm, 0, 0);
    while (next <= now) next.setTime(next.getTime() + cadence.hours * 60 * 60 * 1000);
    return next.toISOString();
  }
  // day-time (weekly)
  const next = new Date(now);
  next.setHours(hh, mm, 0, 0);
  const targetDay = anchorWeekday;
  let delta = (targetDay - next.getDay() + 7) % 7;
  if (delta === 0 && next <= now) delta = 7;
  next.setDate(next.getDate() + delta);
  return next.toISOString();
}

export function ScheduleWizardSheet({ open, onClose, onFinish, selectedDestinations = [] }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [cadenceMode, setCadenceMode] = useState<CadenceMode>('daily');
  const [anchorTime, setAnchorTime] = useState('09:00');
  const [anchorMinute, setAnchorMinute] = useState(0);
  const [anchorWeekday, setAnchorWeekday] = useState(1); // Monday
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  // Aspect ratio defaults to 9:16 (social vertical) since most users
  // publish to TikTok / Reels / Shorts. Seedance supports more, but
  // we expose just the three common social shapes to keep the picker simple.
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [submitting, setSubmitting] = useState(false);

  // Step 2 — character
  const [characterMode, setCharacterMode] = useState<CharacterMode>('actor');
  const [actorSlug, setActorSlug] = useState<string | null>(null);
  const [actorSearch, setActorSearch] = useState('');
  const [actors, setActors] = useState<ActorSummary[]>([]);
  const [actorsLoading, setActorsLoading] = useState(false);
  const [actorsError, setActorsError] = useState<string | null>(null);
  /** One-shot guard so a failed/empty fetch doesn't infinite-retry. */
  const actorsAttemptedRef = useRef(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState('');
  const [randomVibe, setRandomVibe] = useState('');

  // Step 2 — optional asset (product / SaaS / app screenshot)
  const [assetType, setAssetType] = useState<AssetType | null>(null);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetFileName, setAssetFileName] = useState<string | null>(null);
  const [assetUploadState, setAssetUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — brief
  const [brief, setBrief] = useState('');
  // Batch mode: one prompt per row, each consumed per tick.
  // promptList holds raw input strings (one per visual row in the UI);
  // empties stay until the user adds content so the textarea position
  // doesn't jump while typing.
  const [batchMode, setBatchMode] = useState(false);
  const [promptList, setPromptList] = useState<string[]>(['']);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ topic: string; beats: string[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBlocked, setPreviewBlocked] = useState<{ message: string; categories?: string[] } | null>(null);

  // Step 4 — caption
  const [captionMode, setCaptionMode] = useState<'ai' | 'static'>('ai');
  const [captionGuidance, setCaptionGuidance] = useState('');
  const [captionTemplate, setCaptionTemplate] = useState('');

  // Step 5 — review + create
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset when reopening so a previous session doesn't leak in.
  useEffect(() => {
    if (open) {
      setStep(1);
      setName('');
      setCadenceMode('daily');
      setAnchorTime('09:00');
      setAnchorMinute(0);
      setAnchorWeekday(1);
      setDuration(5);
      setAspectRatio('9:16');
      setSubmitting(false);
      setCharacterMode('actor');
      setActorSlug(null);
      setActorSearch('');
      setActors([]);
      setActorsError(null);
      actorsAttemptedRef.current = false;
      setReferenceImageUrl('');
      setUploadFileName(null);
      setUploadState('idle');
      setUploadError(null);
      setDragActive(false);
      setDescription('');
      setRandomVibe('');
      setAssetType(null);
      setAssetUrl(null);
      setAssetFileName(null);
      setAssetUploadState('idle');
      setAssetUploadError(null);
      setAssetDragActive(false);
      setBrief('');
      setBatchMode(false);
      setPromptList(['']);
      setPreviewLoading(false);
      setPreviewResult(null);
      setPreviewError(null);
      setPreviewBlocked(null);
      setCaptionMode('ai');
      setCaptionGuidance('');
      setCaptionTemplate('');
      setDisclaimerAccepted(false);
      setSubmitError(null);
    }
  }, [open]);

  async function generatePreview() {
    setPreviewError(null);
    setPreviewBlocked(null);
    setPreviewResult(null);
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/v1/schedules/preview-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: brief.trim(),
          ...(assetType ? { asset_type: assetType } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.code as string | undefined;
        if (code === 'BRIEF_BLOCKED' || code === 'OUTPUT_BLOCKED') {
          setPreviewBlocked({
            message: data?.error?.message ?? 'Blocked by content moderation.',
            categories: Array.isArray(data?.error?.categories) ? data.error.categories : undefined,
          });
        } else {
          setPreviewError(data?.error?.message ?? `Preview failed (${res.status})`);
        }
        return;
      }
      setPreviewResult({
        topic: data.topic as string,
        beats: data.beats as string[],
      });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }

  /**
   * Upload a portrait file to Supabase Storage and set the resulting
   * public URL as referenceImageUrl. Mirrors the flow used in
   * /create/character-video — call the upload-url edge function for a
   * presigned PUT, send the file, derive the public URL.
   */
  async function handleFile(file: File) {
    setUploadError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError('Pick a PNG, JPEG, or WebP image.');
      setUploadState('error');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is 5 MB.`);
      setUploadState('error');
      return;
    }
    setUploadFileName(file.name);
    setUploadState('uploading');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      const { data, error: fnError } = await invokeFn('upload-url', {
        body: { filename: safeName, content_type: file.type },
      });
      if (fnError) throw new Error(fnError.message ?? 'Failed to get upload URL');
      const upUrl = (data as { upload_url?: string; storage_path?: string } | null)?.upload_url;
      const storagePath = (data as { upload_url?: string; storage_path?: string } | null)?.storage_path;
      if (!upUrl || !storagePath) throw new Error('Edge function did not return upload_url');
      const put = await fetch(upUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) {
        const text = await put.text().catch(() => '');
        throw new Error(`Upload failed (HTTP ${put.status})${text ? ': ' + text.slice(0, 200) : ''}`);
      }
      const publicUrl = `${supabaseUrl()}/storage/v1/object/public/${UPLOAD_BUCKET}/${storagePath}`;
      setReferenceImageUrl(publicUrl);
      setUploadState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
    }
  }

  function clearUpload() {
    setReferenceImageUrl('');
    setUploadFileName(null);
    setUploadState('idle');
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Asset upload — same flow as the portrait upload but lands in
  // assetUrl. Image only for now; saas_capture is a still frame.
  async function handleAssetFile(file: File) {
    setAssetUploadError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setAssetUploadError('Pick a PNG, JPEG, or WebP image.');
      setAssetUploadState('error');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setAssetUploadError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is 5 MB.`);
      setAssetUploadState('error');
      return;
    }
    setAssetFileName(file.name);
    setAssetUploadState('uploading');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      const { data, error: fnError } = await invokeFn('upload-url', {
        body: { filename: safeName, content_type: file.type },
      });
      if (fnError) throw new Error(fnError.message ?? 'Failed to get upload URL');
      const upUrl = (data as { upload_url?: string; storage_path?: string } | null)?.upload_url;
      const storagePath = (data as { upload_url?: string; storage_path?: string } | null)?.storage_path;
      if (!upUrl || !storagePath) throw new Error('Edge function did not return upload_url');
      const put = await fetch(upUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) {
        const text = await put.text().catch(() => '');
        throw new Error(`Upload failed (HTTP ${put.status})${text ? ': ' + text.slice(0, 200) : ''}`);
      }
      const publicUrl = `${supabaseUrl()}/storage/v1/object/public/${UPLOAD_BUCKET}/${storagePath}`;
      setAssetUrl(publicUrl);
      setAssetUploadState('done');
    } catch (err) {
      setAssetUploadError(err instanceof Error ? err.message : 'Upload failed');
      setAssetUploadState('error');
    }
  }

  function clearAsset() {
    setAssetUrl(null);
    setAssetFileName(null);
    setAssetUploadState('idle');
    setAssetUploadError(null);
    if (assetFileInputRef.current) assetFileInputRef.current.value = '';
  }

  // Fetch actor list lazily once when the user opens the actor tab.
  // Guarded by a ref so a failed fetch doesn't re-fire on every render.
  useEffect(() => {
    if (!(open && step === 2 && characterMode === 'actor')) return;
    if (actorsAttemptedRef.current) return;
    actorsAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      setActorsLoading(true);
      setActorsError(null);
      try {
        // Use the public dashboard actors proxy (anon-key, RLS-gated public read)
        // rather than /api/v1/actors which requires a Bearer API key.
        const res = await fetch('/api/actors?limit=500');
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Actors fetch failed: HTTP ${res.status}${text ? `. ${text.slice(0, 200)}` : ''}`);
        }
        const data = await res.json();
        const list = Array.isArray(data?.actors) ? data.actors : [];
        if (!cancelled) setActors(list as ActorSummary[]);
      } catch (err) {
        if (!cancelled) setActorsError(err instanceof Error ? err.message : 'Failed to load actors');
      } finally {
        if (!cancelled) setActorsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, step, characterMode]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const cadence = useMemo(() => CADENCE_OPTIONS.find((c) => c.id === cadenceMode)!, [cadenceMode]);

  const nextRunAt = useMemo(
    () => computeNextRunAt(cadence, anchorTime, anchorMinute, anchorWeekday),
    [cadence, anchorTime, anchorMinute, anchorWeekday],
  );

  const tzLabel = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return 'UTC'; }
  }, []);

  const step1Valid = name.trim().length > 0;
  const step2Valid =
    (characterMode === 'actor' && !!actorSlug) ||
    (characterMode === 'upload' && /^https:\/\//i.test(referenceImageUrl.trim())) ||
    (characterMode === 'describe' && description.trim().length >= 3) ||
    (characterMode === 'random' && randomVibe.trim().length >= 1) ||
    characterMode === 'prompts'; // prompts mode has no character at all
  // Asset is its own step now. If a type is picked, the upload must
  // finish before continuing. Picking None is fine. In prompts mode
  // there's no character to hold an asset, so we auto-pass.
  const step3Valid = characterMode === 'prompts' ||
    assetType === null || (!!assetUrl && assetUploadState === 'done');
  const parsedRows = useMemo(
    () => promptList.map((r) => r.trim()).filter((r) => r.length > 0),
    [promptList],
  );
  const rowsValid = parsedRows.length > 0 && parsedRows.every((r) => r.length >= 20 && r.length <= 1000);
  // Prompts mode forces batch — there's no character to host a recurring brief.
  const effectiveBatchMode = characterMode === 'prompts' ? true : batchMode;
  const step4Valid = effectiveBatchMode
    ? rowsValid
    : brief.trim().length >= 20 && brief.trim().length <= 1000;
  const step5Valid =
    captionMode === 'ai' ||
    (captionMode === 'static' && captionTemplate.trim().length >= 1 && captionTemplate.length <= 2000);
  // Step 6 v1 only ships actor + upload paths server-side. Describe /
  // random need deferred sheet generation, gated until that lands.
  // Prompts mode bypasses the character path entirely.
  const characterPathSupported =
    characterMode === 'actor' ||
    characterMode === 'upload' ||
    characterMode === 'prompts';
  const step6Valid = disclaimerAccepted && characterPathSupported;
  const canContinue =
    step === 1 ? step1Valid :
    step === 2 ? step2Valid :
    step === 3 ? step3Valid :
    step === 4 ? step4Valid :
    step === 5 ? step5Valid :
    step6Valid;

  // Human-readable preview line shown below the cadence picker.
  const cadencePreview = useMemo(() => {
    const firstFire = new Date(nextRunAt);
    const fmt = firstFire.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (cadence.id === 'hourly') {
      return `Fires every hour at :${pad2(anchorMinute)}. First run ${fmt}.`;
    }
    if (cadence.id === 'weekdays') {
      return `Fires Mon–Fri at ${anchorTime}. First run ${fmt}.`;
    }
    if (cadence.id === 'weekly') {
      return `Fires every ${WEEKDAYS[anchorWeekday].label} at ${anchorTime}. First run ${fmt}.`;
    }
    return `Fires every ${cadence.hours}h starting ${anchorTime}. First run ${fmt}.`;
  }, [cadence, anchorTime, anchorMinute, anchorWeekday, nextRunAt]);

  // In Use-prompts mode there's no character to hold an asset, so step 3
  // is hidden entirely. The visible-step list collapses 1-2-4-5-6.
  const visibleSteps = characterMode === 'prompts' ? [1, 2, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
  const visibleStepCount = visibleSteps.length;
  const currentVisibleIdx = Math.max(visibleSteps.indexOf(step), 0); // 0-based
  const isLastVisibleStep = currentVisibleIdx === visibleStepCount - 1;
  function gotoNext() {
    const next = visibleSteps[currentVisibleIdx + 1];
    if (next) setStep(next);
  }
  function gotoPrev() {
    const prev = visibleSteps[currentVisibleIdx - 1];
    if (prev) setStep(prev);
  }

  async function handleContinue() {
    if (!canContinue) return;
    if (!isLastVisibleStep) {
      gotoNext();
      return;
    }
    // Final step — actually persist via the parent's onFinish.
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = onFinish({
        name: name.trim(),
        cadenceMode,
        cadenceHours: cadence.hours,
        anchorTime,
        anchorMinute,
        anchorWeekday,
        nextRunAt,
        durationSeconds: duration,
        aspectRatio,
        characterMode,
        actorSlug: characterMode === 'actor' ? actorSlug : null,
        referenceImageUrl: characterMode === 'upload' ? referenceImageUrl.trim() : null,
        description: characterMode === 'describe' ? description.trim() : '',
        randomVibe: characterMode === 'random' ? randomVibe.trim() : '',
        assetType,
        assetUrl,
        brief: effectiveBatchMode ? '' : brief.trim(),
        promptRows: effectiveBatchMode ? parsedRows : [],
        captionMode,
        captionGuidance: captionMode === 'ai' ? captionGuidance.trim() : '',
        captionTemplate: captionMode === 'static' ? captionTemplate.trim() : '',
      });
      const err = result instanceof Promise ? await result : result;
      if (err) {
        setSubmitError(err);
        setSubmitting(false);
        return;
      }
      // Success: parent will close the wizard.
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Create failed');
      setSubmitting(false);
    }
  }

  function handleBack() {
    gotoPrev();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        aria-label="Close"
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Step {currentVisibleIdx + 1} of {visibleStepCount}</p>
            <h2 className="text-lg font-semibold text-text">
              {step === 1 && 'New schedule'}
              {step === 2 && 'Character'}
              {step === 3 && 'Reference asset'}
              {step === 4 && 'Brief'}
              {step === 5 && 'Caption & destinations'}
              {step === 6 && 'Review'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-text-muted hover:bg-card-hover hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Step indicator — reflects only the visible steps (Asset is
            hidden in Use-prompts mode). */}
        <div className="flex items-center gap-1 border-b border-border bg-zinc-50 px-6 py-2">
          {visibleSteps.map((n, i) => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentVisibleIdx ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 1 && (
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="sched-name" className="mb-1.5 block text-sm font-medium text-text">
                Name
              </label>
              <input
                id="sched-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marco morning UGC"
                maxLength={80}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                autoFocus
              />
              <p className="mt-1 text-xs text-text-muted">A short label so you can recognize this schedule later.</p>
            </div>

            {/* Cadence */}
            <div>
              <label htmlFor="sched-cadence" className="mb-1.5 block text-sm font-medium text-text">
                Cadence
              </label>
              <select
                id="sched-cadence"
                value={cadenceMode}
                onChange={(e) => setCadenceMode(e.target.value as CadenceMode)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              >
                {CADENCE_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>

              {/* Inline anchor inputs — what you see depends on cadence */}
              <div className="mt-3 rounded-md border border-border bg-zinc-50 px-4 py-3">
                {cadence.anchorKind === 'minute' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-text">
                    <span>at</span>
                    <span className="font-mono text-text-muted">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={pad2(anchorMinute)}
                      onChange={(e) => setAnchorMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                      className="w-16 rounded-md border border-border bg-white px-2 py-1 text-center font-mono text-sm focus:border-accent focus:outline-none"
                    />
                    <span className="text-text-muted">past every hour</span>
                  </div>
                )}

                {cadence.anchorKind === 'time' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-text">
                    <span>{cadence.id === 'weekdays' ? 'Mon–Fri at' : 'starting at'}</span>
                    <input
                      type="time"
                      value={anchorTime}
                      onChange={(e) => setAnchorTime(e.target.value)}
                      className="rounded-md border border-border bg-white px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
                    />
                    <span className="text-text-muted">{tzLabel}</span>
                  </div>
                )}

                {cadence.anchorKind === 'day-time' && (
                  <div className="space-y-2 text-sm text-text">
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setAnchorWeekday(d.id)}
                          className={`rounded-md px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-colors ${
                            anchorWeekday === d.id
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-white text-text-muted ring-1 ring-border hover:text-text'
                          }`}
                        >
                          {d.short}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>at</span>
                      <input
                        type="time"
                        value={anchorTime}
                        onChange={(e) => setAnchorTime(e.target.value)}
                        className="rounded-md border border-border bg-white px-2 py-1 font-mono text-sm focus:border-accent focus:outline-none"
                      />
                      <span className="text-text-muted">{tzLabel}</span>
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-text-muted">{cadencePreview}</p>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">Duration per run</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { secs: 5,  videoCost: 350,  label: '5 second clip' },
                  { secs: 10, videoCost: 700,  label: '10 second clip' },
                  { secs: 15, videoCost: 1050, label: '15 second clip' },
                ].map((opt) => {
                  // Per-run credit cost (what the user is billed):
                  //   Storyboard: 20 cr ($0.20)
                  //   5s video:   350 cr ($3.50)
                  //   10s video:  700 cr ($7.00)
                  // Character sheet is locked at schedule creation and
                  // reused every run, so it's NOT in the recurring cost.
                  const STORYBOARD_COST = 20;
                  const total = STORYBOARD_COST + opt.videoCost;
                  return (
                    <button
                      key={opt.secs}
                      type="button"
                      onClick={() => setDuration(opt.secs as 5 | 10 | 15)}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        duration === opt.secs
                          ? 'border-accent bg-accent/5 text-text'
                          : 'border-border bg-card text-text hover:bg-zinc-50'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="mt-1 font-mono text-xs font-semibold text-text">{total} credits / run · ${(total / 100).toFixed(2)}</p>
                      <p className="mt-1 font-mono text-[10px] leading-snug text-text-muted">
                        storyboard {STORYBOARD_COST} + video {opt.videoCost}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Each run regenerates the storyboard from a fresh AI script (so videos vary) and renders a 720p Seedance 2.0 clip.
                Character sheet is generated once at schedule creation and reused every run.
              </p>

              {/* Aspect ratio picker. 720p resolution is fixed; only
                  shape varies. Defaults to 9:16 (TikTok/Reels/Shorts). */}
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-text">Aspect ratio</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: '9:16' as const, label: 'Portrait', sub: '9:16 · 720×1280', hint: 'TikTok · Reels · Shorts' },
                    { id: '1:1'  as const, label: 'Square',   sub: '1:1 · 960×960',  hint: 'Feed posts' },
                    { id: '16:9' as const, label: 'Landscape',sub: '16:9 · 1280×720',hint: 'YouTube · X · LinkedIn' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAspectRatio(opt.id)}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        aspectRatio === opt.id
                          ? 'border-accent bg-accent/5 text-text'
                          : 'border-border bg-card text-text hover:bg-zinc-50'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="mt-1 font-mono text-[10px] text-text-muted">{opt.sub}</p>
                      <p className="mt-0.5 text-[10px] text-text-muted">{opt.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly burn estimate based on cadence */}
              {(() => {
                const total = duration === 5 ? 370 : duration === 10 ? 720 : 1070;
                const runsPerMonth = Math.round((30 * 24) / cadence.hours);
                const monthlyCredits = total * runsPerMonth;
                return (
                  <div className="mt-3 rounded-md border border-border bg-zinc-50 px-3 py-2">
                    <p className="text-xs text-text-muted">
                      <span className="font-mono text-text">~{runsPerMonth}</span> runs / month at this cadence ={' '}
                      <span className="font-mono font-semibold text-text">{monthlyCredits.toLocaleString()} credits / month</span>
                      {' '}(<span className="font-mono">~${(monthlyCredits / 100).toFixed(2)}</span>).
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
          )}

          {step === 2 && (() => {
            const filteredActors = actorSearch.trim().length === 0
              ? actors
              : actors.filter((a) => {
                  const q = actorSearch.trim().toLowerCase();
                  return a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
                });
            const tabBtn = (id: CharacterMode, label: string, icon: React.ReactNode, comingSoon = false) => (
              <button
                key={id}
                type="button"
                onClick={() => { if (!comingSoon) setCharacterMode(id); }}
                disabled={comingSoon}
                title={comingSoon ? 'Coming soon. For v1 use Pick actor or Upload.' : undefined}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  characterMode === id && !comingSoon
                    ? 'bg-card text-text shadow-sm ring-1 ring-border'
                    : comingSoon
                      ? 'cursor-not-allowed text-text-muted/60'
                      : 'text-text-muted hover:text-text'
                }`}
              >
                {icon}
                <span>{label}</span>
                {comingSoon && (
                  <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                    Soon
                  </span>
                )}
              </button>
            );
            return (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  {characterMode === 'prompts'
                    ? 'No character — each row in step 4 becomes a self-contained text-to-video prompt. Style, subject, mood, lighting all baked into the row text.'
                    : 'Pick the character that’s locked to this schedule. Once set, every run reuses it. Only the script and storyboard vary.'}
                </p>

                {/* Mode tabs */}
                <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1">
                  {tabBtn('actor',    'Pick actor',  <UserIcon className="h-3.5 w-3.5" />)}
                  {tabBtn('upload',   'Upload',      <UploadIcon className="h-3.5 w-3.5" />)}
                  {tabBtn('prompts',  'Use prompts', <Wand2 className="h-3.5 w-3.5" />)}
                </div>

                {characterMode === 'prompts' && (
                  <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
                    <p className="font-semibold">Use-prompts mode</p>
                    <p className="mt-1">
                      Skips the Asset step. Step 4 will ask for your list of prompts (one per line). Each cron tick consumes one row and posts it. After the last row the schedule auto-archives.
                    </p>
                  </div>
                )}

                {/* Tab content */}
                {characterMode === 'actor' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={actorSearch}
                        onChange={(e) => setActorSearch(e.target.value)}
                        placeholder="Search actors by name or slug…"
                        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                      />
                    </div>

                    {actorsLoading && (
                      <div className="flex items-center gap-2 text-sm text-text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading actors…
                      </div>
                    )}

                    {!actorsLoading && actorsError && (
                      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        <span>{actorsError}</span>
                        <button
                          type="button"
                          onClick={() => { actorsAttemptedRef.current = false; setActorsError(null); }}
                          className="ml-auto text-xs font-semibold underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!actorsLoading && !actorsError && filteredActors.length === 0 && (
                      <p className="text-sm text-text-muted">No actors match. Try the Describe tab to invent one.</p>
                    )}

                    <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                      {filteredActors.map((a) => {
                        const checked = actorSlug === a.slug;
                        return (
                          <button
                            key={a.slug}
                            type="button"
                            onClick={() => setActorSlug(a.slug)}
                            className={`group overflow-hidden rounded-lg border text-left transition-colors ${
                              checked
                                ? 'border-accent ring-2 ring-accent/30'
                                : 'border-border hover:border-accent/50'
                            }`}
                          >
                            <div className="aspect-square w-full overflow-hidden bg-zinc-100">
                              {a.portrait_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={a.portrait_url} alt={a.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-text-muted">
                                  <UserIcon className="h-8 w-8" />
                                </div>
                              )}
                            </div>
                            <div className="px-2.5 py-1.5">
                              <p className="truncate text-xs font-semibold text-text">{a.name}</p>
                              <p className="truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">{a.slug}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {characterMode === 'upload' && (
                  <div className="space-y-3">
                    <p className="text-sm text-text-muted">
                      Drop a portrait, or click to pick. PNG, JPEG, or WebP. Max 5 MB. We&rsquo;ll turn it into the multi-angle character sheet at schedule creation.
                    </p>

                    {!referenceImageUrl && (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragActive(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) void handleFile(f);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                          dragActive
                            ? 'border-accent bg-accent/10'
                            : uploadState === 'uploading'
                              ? 'border-accent bg-accent/5'
                              : 'border-border bg-zinc-50 hover:border-accent/50 hover:bg-accent/5'
                        }`}
                      >
                        {uploadState === 'uploading' ? (
                          <Loader2 className="h-8 w-8 animate-spin text-accent" />
                        ) : (
                          <UploadIcon className="h-8 w-8 text-text-muted" />
                        )}
                        <p className="text-sm font-medium text-text">
                          {uploadState === 'uploading' ? `Uploading ${uploadFileName ?? ''}…` : 'Drop a portrait, or click to pick'}
                        </p>
                        <p className="text-xs text-text-muted">PNG, JPEG, or WebP. Max 5 MB.</p>
                      </div>
                    )}

                    {referenceImageUrl && uploadState === 'done' && (
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={referenceImageUrl} alt="" className="h-20 w-20 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <p className="text-sm font-medium text-text">Uploaded</p>
                          </div>
                          {uploadFileName && (
                            <p className="truncate text-xs text-text-muted">{uploadFileName}</p>
                          )}
                          <p className="truncate font-mono text-[10px] text-text-muted">{referenceImageUrl}</p>
                        </div>
                        <button
                          type="button"
                          onClick={clearUpload}
                          className="rounded-md p-2 text-text-muted hover:bg-zinc-100 hover:text-text"
                          aria-label="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {uploadError && (
                      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{uploadError}</span>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}

                {characterMode === 'describe' && (
                  <div className="space-y-3">
                    <p className="text-sm text-text-muted">
                      Describe the character in 3–400 chars. We paint a portrait first, then turn it into the sheet.
                    </p>
                    <textarea
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 400))}
                      placeholder="e.g. Marco, 35yo Italian chef, white uniform, curly black hair, warm smile, confident posture"
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    <p className="text-xs text-text-muted">{description.length}/400. Costs 35 credits ($0.35) at schedule creation.</p>
                  </div>
                )}

                {characterMode === 'random' && (
                  <div className="space-y-3">
                    <p className="text-sm text-text-muted">
                      Pick a vibe and AI invents the rest (name, look, outfit, demeanor). Best for &ldquo;a generic [niche] creator&rdquo; characters where specifics don&rsquo;t matter.
                    </p>
                    <input
                      type="text"
                      value={randomVibe}
                      onChange={(e) => setRandomVibe(e.target.value.slice(0, 100))}
                      placeholder="e.g. fitness creator, food blogger, indie maker"
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {RANDOM_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRandomVibe(p)}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            randomVibe === p
                              ? 'border-accent bg-accent/5 text-text'
                              : 'border-border text-text-muted hover:text-text'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-text-muted">{randomVibe.length}/100. Costs 35 credits ($0.35) at schedule creation.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {step === 3 && characterMode === 'prompts' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-4 text-sm text-purple-900">
                <p className="font-semibold">Skipped — no asset needed</p>
                <p className="mt-1">
                  In Use-prompts mode there&rsquo;s no character to hold an asset. Continue to step 4 to enter your prompt list.
                </p>
              </div>
            </div>
          )}

          {step === 3 && characterMode !== 'prompts' && (
            <div className="space-y-5">
              <p className="text-sm text-text-muted">
                Pick a reference asset the character can hold or display in every run. Optional — skip to keep a plain character shot. The image becomes a second Seedance reference and the per-run storyboard poses the character around it.
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => {
                    if (assetType !== null) clearAsset();
                    setAssetType(null);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    assetType === null
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-card hover:bg-zinc-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-text">None</p>
                  <p className="mt-1 text-xs text-text-muted">Plain character shot.</p>
                </button>
                {ASSET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (assetType !== opt.id) {
                        clearAsset();
                        setAssetType(opt.id);
                      }
                    }}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      assetType === opt.id
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-card hover:bg-zinc-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-text">{opt.label}</p>
                    <p className="mt-1 text-xs text-text-muted">{opt.hint}</p>
                  </button>
                ))}
              </div>

              {assetType !== null && (
                <div className="space-y-3">
                  {!assetUrl && (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setAssetDragActive(true); }}
                      onDragLeave={() => setAssetDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setAssetDragActive(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) void handleAssetFile(f);
                      }}
                      onClick={() => assetFileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          assetFileInputRef.current?.click();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                        assetDragActive
                          ? 'border-accent bg-accent/10'
                          : assetUploadState === 'uploading'
                            ? 'border-accent bg-accent/5'
                            : 'border-border bg-zinc-50 hover:border-accent/50 hover:bg-accent/5'
                      }`}
                    >
                      {assetUploadState === 'uploading' ? (
                        <Loader2 className="h-8 w-8 animate-spin text-accent" />
                      ) : (
                        <UploadIcon className="h-8 w-8 text-text-muted" />
                      )}
                      <p className="text-sm font-medium text-text">
                        {assetUploadState === 'uploading' ? `Uploading ${assetFileName ?? ''}…` : 'Drop the asset, or click to pick'}
                      </p>
                      <p className="text-xs text-text-muted">PNG, JPEG, or WebP. Max 5 MB.</p>
                    </div>
                  )}

                  {assetUrl && assetUploadState === 'done' && (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetUrl} alt="" className="h-20 w-20 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <p className="text-sm font-medium text-text">Uploaded</p>
                        </div>
                        {assetFileName && (
                          <p className="truncate text-xs text-text-muted">{assetFileName}</p>
                        )}
                        <p className="truncate font-mono text-[10px] text-text-muted">{assetUrl}</p>
                      </div>
                      <button
                        type="button"
                        onClick={clearAsset}
                        className="rounded-md p-2 text-text-muted hover:bg-zinc-100 hover:text-text"
                        aria-label="Remove asset"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {assetUploadError && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{assetUploadError}</span>
                    </div>
                  )}

                  <input
                    ref={assetFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleAssetFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {/* Mode tabs — recurring vs batch-rows.
                  Recurring: one brief, AI varies it each run, forever.
                  Batch: paste N rows, each row is the brief for one tick,
                  schedule auto-archives after the last row.
                  In Use-prompts mode the tabs are hidden — batch is mandatory. */}
              {characterMode !== 'prompts' && (
                <div className="flex gap-2 rounded-lg border border-border bg-card p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setBatchMode(false)}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${!batchMode ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}
                  >
                    Recurring brief
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMode(true)}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${batchMode ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}
                  >
                    Batch · one row per tick
                  </button>
                </div>
              )}

              {!effectiveBatchMode && (
                <p className="text-sm text-text-muted">
                  Describe the recurring video concept in your own words. Cover what stays the same every run (character, setting, tone, behavior) and what should vary between runs (the dish, the question, the topic, etc).
                </p>
              )}
              {effectiveBatchMode && (
                <p className="text-sm text-text-muted">
                  {characterMode === 'prompts'
                    ? 'Paste one prompt per line. Each row goes straight to Seedance text-to-video — style, subject, mood, composition all baked into the row text. One row per cron tick.'
                    : 'Paste one prompt per line. Each cron tick consumes the next row as that run’s brief. After the last row the schedule auto-archives — no manual cleanup.'}
                </p>
              )}

              {!effectiveBatchMode && (
                <div>
                  <label htmlFor="sched-brief" className="mb-1.5 block text-sm font-medium text-text">
                    Series brief
                  </label>
                  <textarea
                    id="sched-brief"
                    rows={7}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value.slice(0, 1000))}
                    placeholder={'e.g. Marco the Italian chef in his sunlit Brooklyn kitchen. Warm, confident vibe, always ends with a taste-test smile. Each run shows a different Italian recipe being made (pasta, bread, risotto, etc.). Mention the dish name in the script.'}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                    <span>{brief.length}/1000 (min 20)</span>
                    <span>On each run, AI sees your last 10 scripts to avoid repeating itself.</span>
                  </div>
                </div>
              )}

              {effectiveBatchMode && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text">
                    Prompts ({parsedRows.length}/500)
                  </label>
                  <div className="space-y-2">
                    {promptList.map((row, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="mt-2 w-6 shrink-0 text-right font-mono text-xs text-text-muted">
                          {idx + 1}.
                        </span>
                        <textarea
                          rows={2}
                          value={row}
                          onChange={(e) => {
                            const v = e.target.value.slice(0, 1000);
                            setPromptList((prev) => prev.map((r, i) => (i === idx ? v : r)));
                          }}
                          placeholder={
                            idx === 0
                              ? 'Handcrafted stylized stop-motion aesthetic. Miniature practical set look, tactile materials, animation on 2s, warm magical lighting…'
                              : 'Add another prompt'
                          }
                          spellCheck={false}
                          className="flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                        />
                        {promptList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPromptList((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label={`Remove prompt ${idx + 1}`}
                            className="mt-1 rounded-md p-1.5 text-text-muted hover:bg-card-hover hover:text-text"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPromptList((prev) => (prev.length >= 500 ? prev : [...prev, '']))}
                      disabled={promptList.length >= 500}
                      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-base leading-none">+</span> Add prompt
                    </button>
                    <span className="text-xs text-text-muted">Tier caps: starter 30 · creator 100 · pro+ 500</span>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {parsedRows.length === 0
                      ? 'Add at least one prompt (each 20–1000 chars).'
                      : rowsValid
                        ? `${parsedRows.length} prompt${parsedRows.length === 1 ? '' : 's'} ready · runs over ${parsedRows.length} tick${parsedRows.length === 1 ? '' : 's'} then archives.`
                        : 'Each prompt must be 20–1000 chars.'}
                  </p>
                </div>
              )}

              {/* Safety callout */}
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-semibold">Content rules</p>
                <p className="mt-1">
                  Briefs are screened for nudity, hate, harassment, real people without consent, copyrighted characters, weapons, drugs, and self-harm. Generated videos go live to your social accounts. You&rsquo;re responsible for what gets posted. Final liability disclaimer on the next step.
                </p>
              </div>

              {/* Preview button — recurring mode only. Batch rows are
                  consumed verbatim so there's nothing to "preview". */}
              {!effectiveBatchMode && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generatePreview}
                    disabled={!step4Valid || previewLoading}
                  >
                    {previewLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating sample…</>
                    ) : previewResult ? (
                      'Try another sample'
                    ) : (
                      'Preview today’s script'
                    )}
                  </Button>
                  <span className="text-xs text-text-muted">No credits spent.</span>
                </div>
              )}

              {/* Preview result */}
              {previewResult && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-mono uppercase tracking-wider text-text-muted">Topic</p>
                  <p className="mt-1 text-sm font-semibold text-text">{previewResult.topic}</p>
                  <p className="mt-3 text-xs font-mono uppercase tracking-wider text-text-muted">Beats</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-text">
                    {previewResult.beats.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-text-muted">
                    This is one example. Each scheduled run produces a different variation following the same brief.
                  </p>
                </div>
              )}

              {/* Preview rejected by moderation */}
              {previewBlocked && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold">Brief blocked</p>
                      <p className="mt-1">{previewBlocked.message}</p>
                      {previewBlocked.categories && previewBlocked.categories.length > 0 && (
                        <p className="mt-1 font-mono text-xs">
                          Flagged: {previewBlocked.categories.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Preview transient error */}
              {previewError && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                What gets posted alongside the video. AI can write a fresh caption every run that matches today&rsquo;s topic, or you can lock a template.
              </p>

              {/* Mode picker */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCaptionMode('ai')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    captionMode === 'ai'
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-card hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4" />
                    <p className="text-sm font-semibold text-text">AI writes each caption</p>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">Fresh per run, matches today&rsquo;s topic. Recommended for variety.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptionMode('static')}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    captionMode === 'static'
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-card hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    <p className="text-sm font-semibold text-text">I&rsquo;ll write it</p>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">Static text, or a template with <span className="font-mono">{`{{topic}}`}</span> placeholder.</p>
                </button>
              </div>

              {/* AI guidance */}
              {captionMode === 'ai' && (
                <div>
                  <label htmlFor="caption-guidance" className="mb-1.5 block text-sm font-medium text-text">
                    Caption guidance (optional)
                  </label>
                  <textarea
                    id="caption-guidance"
                    rows={4}
                    value={captionGuidance}
                    onChange={(e) => setCaptionGuidance(e.target.value.slice(0, 500))}
                    placeholder={'e.g. Always end with a question. Keep it under 200 chars. Always include #italianfood #ai #ugc.'}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                    <span>{captionGuidance.length}/500</span>
                    <span>Bias the AI: tone, length, hashtags, emoji rules.</span>
                  </div>
                </div>
              )}

              {/* Static template */}
              {captionMode === 'static' && (
                <div>
                  <label htmlFor="caption-template" className="mb-1.5 block text-sm font-medium text-text">
                    Caption text
                  </label>
                  <textarea
                    id="caption-template"
                    rows={4}
                    value={captionTemplate}
                    onChange={(e) => setCaptionTemplate(e.target.value.slice(0, 2000))}
                    placeholder={'e.g. Today’s recipe: {{topic}} 🍝\n\n#italianfood #ai #ugc'}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                    <span>{captionTemplate.length}/2000 (min 1)</span>
                    <span>
                      Use <code className="font-mono">{`{{topic}}`}</code> to insert today&rsquo;s topic from the brief.
                    </span>
                  </div>
                </div>
              )}

              {/* Safety note */}
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Captions are screened for the same content rules as the brief. Posts that fail moderation will be skipped and recorded in the schedule&rsquo;s failure count.
              </div>
            </div>
          )}

          {step === 6 && (() => {
            const totalPerRun = duration === 5 ? 370 : duration === 10 ? 720 : 1070;
            // In batch mode the schedule fires exactly N times (one per
            // row) then auto-archives. Reporting "X runs per month" is
            // misleading because past row N nothing happens.
            const runsPerMonth = effectiveBatchMode
              ? parsedRows.length
              : Math.round((30 * 24) / cadence.hours);
            const monthlyCredits = totalPerRun * runsPerMonth;
            const characterDescription = (() => {
              if (characterMode === 'actor') {
                const a = actors.find((x) => x.slug === actorSlug);
                return a ? `${a.name} (${a.slug})` : (actorSlug ?? '—');
              }
              if (characterMode === 'upload') return 'Uploaded portrait';
              if (characterMode === 'describe') return description.trim().slice(0, 120) || '—';
              if (characterMode === 'random') return `Random: ${randomVibe.trim() || '—'}`;
              return '—';
            })();
            const cadenceSummary = (() => {
              if (cadence.id === 'hourly') return `Every hour at :${pad2(anchorMinute)}`;
              if (cadence.id === 'weekdays') return `Mon-Fri at ${anchorTime}`;
              if (cadence.id === 'weekly') return `${WEEKDAYS[anchorWeekday].label} at ${anchorTime}`;
              return `Every ${cadence.hours}h starting ${anchorTime}`;
            })();
            const firstFire = new Date(nextRunAt).toLocaleString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });

            return (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  Review everything, accept the content responsibility, then create the schedule.
                </p>

                {/* Review card */}
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="divide-y divide-border">
                    {/* Schedule */}
                    <div className="px-4 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Schedule</p>
                      <p className="mt-1 text-sm font-semibold text-text">{name.trim() || '—'}</p>
                      <p className="text-xs text-text-muted">
                        {cadenceSummary}. First run {firstFire}. {duration}-second clip.
                      </p>
                    </div>

                    {/* Character */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {characterMode === 'actor' && actorSlug && (() => {
                        const a = actors.find((x) => x.slug === actorSlug);
                        return a?.portrait_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.portrait_url} alt="" className="h-14 w-14 rounded-md object-cover" />
                        ) : null;
                      })()}
                      {characterMode === 'upload' && referenceImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={referenceImageUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Character</p>
                        <p className="mt-1 truncate text-sm text-text">{characterDescription}</p>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          source: {characterMode}
                        </p>
                      </div>
                    </div>

                    {/* Asset */}
                    {assetType && assetUrl && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={assetUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Asset</p>
                          <p className="mt-1 text-sm text-text">
                            {ASSET_OPTIONS.find((o) => o.id === assetType)?.label}
                          </p>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                            type: {assetType}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Brief / batch rows */}
                    <div className="px-4 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {effectiveBatchMode
                          ? `${characterMode === 'prompts' ? 'Use-prompts' : 'Batch'} — ${parsedRows.length} row${parsedRows.length === 1 ? '' : 's'}`
                          : 'Brief'}
                      </p>
                      {effectiveBatchMode ? (
                        <p className="mt-1 text-sm text-text">
                          One row per cron tick. First: <span className="italic text-text-muted">{parsedRows[0]?.slice(0, 140) ?? '—'}{(parsedRows[0]?.length ?? 0) > 140 ? '…' : ''}</span>
                        </p>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                          {brief.trim().slice(0, 280) || '—'}
                          {brief.trim().length > 280 ? '…' : ''}
                        </p>
                      )}
                    </div>

                    {/* Caption */}
                    <div className="px-4 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Caption</p>
                      {captionMode === 'ai' ? (
                        <>
                          <p className="mt-1 text-sm text-text">AI writes a fresh caption each run.</p>
                          {captionGuidance.trim().length > 0 && (
                            <p className="mt-1 text-xs text-text-muted">Guidance: {captionGuidance.trim().slice(0, 200)}</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                          {captionTemplate.trim().slice(0, 280) || '—'}
                          {captionTemplate.trim().length > 280 ? '…' : ''}
                        </p>
                      )}
                    </div>

                    {/* Destinations */}
                    <div className="px-4 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Posts to</p>
                      {selectedDestinations.length === 0 ? (
                        <p className="mt-1 text-sm text-amber-700">No destinations selected. Pick some on the Postiz page first.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-sm text-text">
                          {selectedDestinations.map((d) => (
                            <li key={d.id} className="flex items-center gap-2">
                              {d.picture && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={d.picture} alt="" className="h-5 w-5 rounded-full object-cover" />
                              )}
                              <span>{d.name || d.identifier}</span>
                              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{d.identifier}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Cost */}
                    <div className="bg-zinc-50 px-4 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Estimated cost</p>
                      <p className="mt-1 text-sm text-text">
                        <span className="font-mono font-semibold">{totalPerRun}</span> credits per run
                        {' · '}
                        {effectiveBatchMode ? (
                          <>
                            <span className="font-mono">{runsPerMonth}</span> total run{runsPerMonth === 1 ? '' : 's'}
                            {' · '}
                            <span className="font-mono font-semibold">{monthlyCredits.toLocaleString()} credits total</span>
                            {' '}(<span className="font-mono">~${(monthlyCredits / 100).toFixed(2)}</span>)
                          </>
                        ) : (
                          <>
                            <span className="font-mono">~{runsPerMonth}</span> runs / month
                            {' · '}
                            <span className="font-mono font-semibold">~{monthlyCredits.toLocaleString()} credits / month</span>
                            {' '}(<span className="font-mono">~${(monthlyCredits / 100).toFixed(2)}</span>)
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Unsupported character mode hint */}
                {!characterPathSupported && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-semibold">Character mode &ldquo;{characterMode}&rdquo; not yet supported in the wizard</p>
                    <p className="mt-1">
                      For v1, schedules accept actor and upload modes only. Describe and random need a deferred sheet
                      generation pipeline that we&rsquo;re shipping next. Go back to step 2 and pick an actor or upload
                      a portrait URL.
                    </p>
                  </div>
                )}

                {/* Liability disclaimer */}
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Content responsibility</p>
                  <p className="mt-2 text-xs text-amber-900">
                    Every run posts AI-generated video and text directly to your social accounts via Postiz. The output is
                    machine-generated and may occasionally produce unexpected, off-brand, or inappropriate content even with
                    moderation in place.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-amber-900">
                    <input
                      type="checkbox"
                      checked={disclaimerAccepted}
                      onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400 text-amber-700 focus:ring-amber-400"
                    />
                    <span>
                      I understand AI generates the videos and captions for this schedule, and I&rsquo;m responsible for
                      what gets posted to my social accounts. agent-media and Postiz don&rsquo;t review, approve, or
                      accept liability for content I publish through this schedule. I&rsquo;ll review my brief and the
                      first few runs carefully, and pause the schedule if anything looks off.
                    </span>
                  </label>
                </div>

                {submitError && (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} type="button">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
          <Button onClick={handleContinue} disabled={!canContinue || submitting} type="button">
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Working…</>
            ) : isLastVisibleStep ? (
              'Create schedule'
            ) : (
              'Continue →'
            )}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
