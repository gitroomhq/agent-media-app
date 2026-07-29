// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * ScheduleEditDrawer — slim edit UI for an existing schedule.
 *
 * Mounted from /jobs. Pre-fills from the schedule, PATCHes /v1/schedules/:id
 * on save. Covers the most-edited fields:
 *   - name
 *   - cadence_hours
 *   - duration + aspect_ratio (job_params)
 *   - prompt_rows (when the schedule was batch) OR brief (when recurring)
 *
 * Caption fields, character source, asset, and Postiz destinations are
 * out of scope here — those are rarely edited and adding them inflates
 * this drawer significantly. The wizard remains the canonical create
 * flow for those.
 */

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EditableSchedule {
  id: string;
  name: string;
  generator_id: string;
  cadence_hours: number;
  job_params: Record<string, unknown>;
  prompt_rows: string[] | null;
}

interface Props {
  open: boolean;
  schedule: EditableSchedule | null;
  onClose: () => void;
  /** Returns null on success (drawer auto-closes) or an error string. */
  onSave: (id: string, patch: Record<string, unknown>) => Promise<string | null>;
}

const CADENCE_PRESETS: Array<{ label: string; hours: number }> = [
  { label: 'Every hour',     hours: 1 },
  { label: 'Every 2 hours',  hours: 2 },
  { label: 'Every 4 hours',  hours: 4 },
  { label: 'Every 6 hours',  hours: 6 },
  { label: 'Every 12 hours', hours: 12 },
  { label: 'Every day',      hours: 24 },
  { label: 'Every week',     hours: 168 },
];

export function ScheduleEditDrawer({ open, schedule, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [cadenceHours, setCadenceHours] = useState(24);
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [brief, setBrief] = useState('');
  const [promptList, setPromptList] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state when a different schedule is opened. Without this
  // re-opening the drawer for schedule B would show schedule A's fields.
  useEffect(() => {
    if (!schedule) return;
    setName(schedule.name);
    setCadenceHours(schedule.cadence_hours);
    const dRaw = Number(schedule.job_params.duration);
    setDuration(dRaw === 15 ? 15 : dRaw === 10 ? 10 : 5);
    const arRaw = String(schedule.job_params.aspect_ratio ?? '9:16');
    setAspectRatio(arRaw === '16:9' ? '16:9' : arRaw === '1:1' ? '1:1' : '9:16');
    setBrief(typeof schedule.job_params.brief === 'string' ? schedule.job_params.brief : '');
    const rows = Array.isArray(schedule.prompt_rows) && schedule.prompt_rows.length > 0
      ? schedule.prompt_rows
      : [''];
    setPromptList(rows);
    setError(null);
  }, [schedule?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !schedule) return null;

  const isBatch = (schedule.prompt_rows?.length ?? 0) > 0;
  const parsedRows = promptList.map((r) => r.trim()).filter((r) => r.length > 0);
  const rowsValid = parsedRows.length > 0 && parsedRows.every((r) => r.length >= 20 && r.length <= 1000);
  const briefValid = brief.trim().length >= 20 && brief.trim().length <= 1000;
  const canSave =
    !submitting &&
    name.trim().length >= 1 && name.trim().length <= 80 &&
    cadenceHours >= 1 && cadenceHours <= 168 &&
    (isBatch ? rowsValid : briefValid);

  async function handleSave() {
    if (!schedule || !canSave) return;
    setSubmitting(true);
    setError(null);
    const patch: Record<string, unknown> = {
      name: name.trim(),
      cadence_hours: cadenceHours,
      job_params: {
        ...schedule.job_params,
        duration,
        aspect_ratio: aspectRatio,
        ...(isBatch ? {} : { brief: brief.trim() }),
      },
    };
    if (isBatch) patch.prompt_rows = parsedRows;
    const err = await onSave(schedule.id, patch);
    if (err) {
      setError(err);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close edit drawer"
        className="flex-1 bg-black/40"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Edit schedule</p>
            <h2 className="text-lg font-semibold text-text">{schedule.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-text-muted hover:bg-card-hover hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Name */}
          <div>
            <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium text-text">Name</label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">{name.length}/80</p>
          </div>

          {/* Cadence */}
          <div>
            <label htmlFor="edit-cadence" className="mb-1.5 block text-sm font-medium text-text">Cadence</label>
            <select
              id="edit-cadence"
              value={cadenceHours}
              onChange={(e) => setCadenceHours(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {CADENCE_PRESETS.map((p) => (
                <option key={p.hours} value={p.hours}>{p.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">Tier limits still apply on save.</p>
          </div>

          {/* Duration */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">Duration</p>
            <div className="grid grid-cols-3 gap-2">
              {[5, 10, 15].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDuration(s as 5 | 10 | 15)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    duration === s
                      ? 'border-accent bg-accent/5 text-text'
                      : 'border-border bg-card text-text hover:bg-zinc-50'
                  }`}
                >
                  {s} sec
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">Aspect ratio</p>
            <div className="grid grid-cols-3 gap-2">
              {(['9:16', '1:1', '16:9'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspectRatio(a)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    aspectRatio === a
                      ? 'border-accent bg-accent/5 text-text'
                      : 'border-border bg-card text-text hover:bg-zinc-50'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Brief OR prompt rows */}
          {isBatch ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">
                Prompts ({parsedRows.length}) — one per row
              </label>
              <div className="space-y-2">
                {promptList.map((row, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-2 w-6 shrink-0 text-right font-mono text-xs text-text-muted">{idx + 1}.</span>
                    <textarea
                      rows={2}
                      value={row}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, 1000);
                        setPromptList((prev) => prev.map((r, i) => (i === idx ? v : r)));
                      }}
                      placeholder="Each prompt is fed verbatim to Seedance text-to-video."
                      spellCheck={false}
                      className="flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                    {promptList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPromptList((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove row ${idx + 1}`}
                        className="mt-1 rounded-md p-1.5 text-text-muted hover:bg-card-hover hover:text-text"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPromptList((prev) => (prev.length >= 500 ? prev : [...prev, '']))}
                disabled={promptList.length >= 500}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
              >
                <span className="text-base leading-none">+</span> Add prompt
              </button>
              <p className="mt-2 text-xs text-text-muted">
                Saving resets the cursor to row 1 — remaining rows fire from the top.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="edit-brief" className="mb-1.5 block text-sm font-medium text-text">Brief</label>
              <textarea
                id="edit-brief"
                rows={6}
                value={brief}
                onChange={(e) => setBrief(e.target.value.slice(0, 1000))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-xs text-text-muted">{brief.length}/1000 · min 20</p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-6 py-3">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave} type="button">
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
            ) : (
              'Save changes'
            )}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
