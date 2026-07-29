// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * SchedulesPanel — Schedules list + Recent publications + Create wizard.
 *
 * Originally lived on /integrations/postiz; moved to /jobs so the dashboard
 * has one place to see everything automated. Self-contained: loads schedules,
 * publications, integration metadata, and the user's saved default
 * destinations from their profile. The Postiz page now only owns the API
 * key + destination picker (the source of those defaults).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { ScheduleWizardSheet, type ScheduleWizardState } from '@/components/schedule-wizard';
import { ScheduleEditDrawer, type EditableSchedule } from '@/components/schedule-edit-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface PostizIntegration {
  id: string;
  name: string;
  identifier: string;
  picture: string | null;
  disabled: boolean;
  profile: string | null;
}

interface Schedule {
  id: string;
  name: string;
  generator_id: string;
  job_params: Record<string, unknown>;
  caption_template: string | null;
  cadence_hours: number;
  postiz_integration_ids: string[];
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  failure_count: number;
  archived_at: string | null;
  created_at: string;
  // Batch-row mode: null/empty when recurring.
  prompt_rows: string[] | null;
  prompt_cursor: number;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface SchedulesPanelProps {
  /** Fired right after a Run-now trigger returns 202 with a job_id, so the
   *  parent can optimistically prepend the new run to its list instead of
   *  waiting for the realtime INSERT event to arrive. */
  onJobTriggered?: (jobId: string, scheduleName: string) => void;
}

export function SchedulesPanel({ onJobTriggered }: SchedulesPanelProps = {}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [integrations, setIntegrations] = useState<PostizIntegration[]>([]);
  const [savedDefaults, setSavedDefaults] = useState<string[]>([]);
  const [postizConfigured, setPostizConfigured] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<EditableSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [triggerStatus, setTriggerStatus] = useState<
    | { kind: 'success'; jobId: string | null; name: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await fetch('/api/v1/schedules');
      const data = await res.json();
      if (res.ok) setSchedules(data.schedules ?? []);
    } catch { /* ignore */ }
    finally { setSchedulesLoading(false); }
  }, []);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // Load saved API-key state + default destinations + publications + integrations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('postiz_api_key, postiz_default_integrations')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const hasKey = !!profile?.postiz_api_key;
      setPostizConfigured(hasKey);
      setSavedDefaults(Array.isArray(profile?.postiz_default_integrations) ? profile!.postiz_default_integrations : []);

      if (hasKey) {
        try {
          const res = await fetch('/api/v1/integrations/postiz/accounts');
          if (res.ok) {
            const json = await res.json();
            if (!cancelled) setIntegrations(json.integrations ?? []);
          }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const integrationById = new Map(integrations.map((i) => [i.id, i]));

  const wizardSelectedDestinations = savedDefaults.map((id) => {
    const i = integrationById.get(id);
    return {
      id,
      identifier: i?.identifier ?? '',
      name: i?.name ?? i?.profile ?? id,
      picture: i?.picture ?? null,
    };
  });

  async function handleWizardFinish(state: ScheduleWizardState): Promise<string | null> {
    if (savedDefaults.length === 0) {
      return 'Set default destinations on the Postiz page first.';
    }
    const isPromptsMode = state.characterMode === 'prompts';
    const body: Record<string, unknown> = {
      name: state.name,
      // Pure prompts mode → text_to_video (no character, no sheet, no asset).
      // Anything else → character_video (the original recurring pipeline).
      generator_id: isPromptsMode ? 'text_to_video' : 'character_video',
      cadence_hours: state.cadenceHours,
      next_run_at: state.nextRunAt,
      enabled: true,
      postiz_integration_ids: savedDefaults,
      // character_source + asset are only meaningful for character_video.
      ...(isPromptsMode
        ? {}
        : {
            character_source: {
              mode: state.characterMode,
              ...(state.actorSlug ? { actor_slug: state.actorSlug } : {}),
              ...(state.referenceImageUrl ? { reference_image_url: state.referenceImageUrl } : {}),
              ...(state.description ? { description: state.description } : {}),
              ...(state.randomVibe ? { random_vibe: state.randomVibe } : {}),
            },
            ...(state.assetType && state.assetUrl
              ? { asset_type: state.assetType, asset_url: state.assetUrl }
              : {}),
          }),
      // Batch mode: send prompt_rows and omit the single brief. The runner
      // takes rows[cursor] as that tick's brief and auto-archives when done.
      ...(state.promptRows.length > 0
        ? { prompt_rows: state.promptRows }
        : { brief: state.brief }),
      caption_mode: state.captionMode,
      ...(state.captionGuidance ? { caption_guidance: state.captionGuidance } : {}),
      ...(state.captionTemplate ? { caption_template: state.captionTemplate } : {}),
      job_params: {
        duration: state.durationSeconds,
        aspect_ratio: state.aspectRatio,
        generate_audio: true,
      },
    };
    try {
      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return data?.error?.message ?? `Create failed (${res.status})`;
      setSchedules((prev) => [data.schedule as Schedule, ...prev]);
      setWizardOpen(false);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Create failed';
    }
  }

  async function handleEditSave(id: string, patch: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch(`/api/v1/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return data?.error?.message ?? `Edit failed (${res.status})`;
      setSchedules((prev) => prev.map((p) => (p.id === id ? (data.schedule as Schedule) : p)));
      setEditingSchedule(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Edit failed';
    }
  }

  async function handleToggleSchedule(s: Schedule) {
    const res = await fetch(`/api/v1/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (res.ok) {
      const data = await res.json();
      setSchedules((prev) => prev.map((p) => (p.id === s.id ? (data.schedule as Schedule) : p)));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.message ?? `Toggle failed (${res.status})`);
    }
  }

  async function handleTriggerSchedule(s: Schedule) {
    setTriggerStatus(null);
    setTriggeringId(s.id);
    try {
      const res = await fetch(`/api/v1/schedules/${s.id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTriggerStatus({ kind: 'error', message: data?.error?.message ?? `Trigger failed (${res.status})` });
        return;
      }
      setTriggerStatus({ kind: 'success', jobId: data?.job_id ?? null, name: s.name });
      // Tell the parent (jobs page) so it can prepend the new run row
      // immediately, without waiting for the realtime INSERT to arrive.
      if (data?.job_id && typeof data.job_id === 'string' && onJobTriggered) {
        onJobTriggered(data.job_id, s.name);
      }
      void loadSchedules();
    } catch (err) {
      setTriggerStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Trigger failed' });
    } finally {
      setTriggeringId(null);
    }
  }

  async function handleDeleteSchedule(s: Schedule) {
    if (!confirm(`Delete schedule "${s.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/v1/schedules/${s.id}`, { method: 'DELETE' });
    if (res.status === 204) {
      setSchedules((prev) => prev.filter((p) => p.id !== s.id));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error?.message ?? `Delete failed (${res.status})`);
    }
  }

  return (
    <div className="space-y-10">
      {/* Schedules header + New */}
      <section>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-base font-semibold text-text">Schedules</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Recurring auto-publish runs. Each tick generates a fresh video from the same brief and posts it to your
              {' '}
              <Link href="/integrations/postiz" className="text-accent hover:underline">Postiz destinations</Link>.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setWizardOpen(true)}
            disabled={!postizConfigured || savedDefaults.length === 0}
            title={
              !postizConfigured
                ? 'Connect Postiz first on /integrations/postiz'
                : savedDefaults.length === 0
                  ? 'Pick default destinations on /integrations/postiz first'
                  : undefined
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New schedule
          </Button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto rounded p-1 text-text-muted hover:text-text"
              aria-label="Dismiss"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        {triggerStatus && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              triggerStatus.kind === 'success'
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {triggerStatus.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            )}
            {triggerStatus.kind === 'success' ? (
              <span>
                Started a run for <span className="font-medium">{triggerStatus.name}</span>. It will show below in seconds.
              </span>
            ) : (
              <span>{triggerStatus.message}</span>
            )}
            <button
              type="button"
              onClick={() => setTriggerStatus(null)}
              className="ml-auto rounded p-1 text-text-muted hover:text-text"
              aria-label="Dismiss"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {schedulesLoading && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!schedulesLoading && schedules.length === 0 && (
            <p className="text-sm text-text-muted">
              No schedules yet.{' '}
              {!postizConfigured && (
                <>
                  Connect <Link href="/integrations/postiz" className="text-accent hover:underline">Postiz</Link> first,
                  then click &ldquo;New schedule&rdquo;.
                </>
              )}
              {postizConfigured && savedDefaults.length === 0 && (
                <>
                  Pick default destinations on{' '}
                  <Link href="/integrations/postiz" className="text-accent hover:underline">/integrations/postiz</Link>,
                  then click &ldquo;New schedule&rdquo;.
                </>
              )}
              {postizConfigured && savedDefaults.length > 0 && <>Click &ldquo;New schedule&rdquo; to create one.</>}
            </p>
          )}
          {schedules.map((s) => {
            const totalIntegrations = s.postiz_integration_ids.length;
            const knownLabels = s.postiz_integration_ids
              .map((id) => integrationById.get(id)?.identifier)
              .filter((x): x is string => Boolean(x));
            return (
              <div key={s.id} className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text">{s.name}</span>
                    {s.enabled ? (
                      <Badge variant="live" className="gap-1 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px]">Paused</Badge>
                    )}
                    <Badge variant="default" className="gap-1 font-mono text-[10px] uppercase">
                      <Clock className="h-3 w-3" /> every {s.cadence_hours}h
                    </Badge>
                    {totalIntegrations > 0 && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        → {knownLabels.length === totalIntegrations ? knownLabels.join(', ') : `${totalIntegrations} destinations`}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    <span className="font-medium text-text">Next run </span>
                    {new Date(s.next_run_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {s.last_run_at && (
                      <> · last ran {relativeTime(s.last_run_at)}</>
                    )}
                    {s.failure_count > 0 && (
                      <> · <span className="text-red-700">{s.failure_count} consecutive failure{s.failure_count === 1 ? '' : 's'}</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTriggerSchedule(s)}
                    disabled={triggeringId === s.id}
                    title="Force-run this schedule immediately"
                  >
                    {triggeringId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">Run now</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleToggleSchedule(s)}>
                    {s.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSchedule({
                      id: s.id,
                      name: s.name,
                      generator_id: s.generator_id,
                      cadence_hours: s.cadence_hours,
                      job_params: s.job_params,
                      prompt_rows: s.prompt_rows,
                    })}
                    title="Edit this schedule"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteSchedule(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ScheduleWizardSheet
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onFinish={handleWizardFinish}
        selectedDestinations={wizardSelectedDestinations}
      />

      <ScheduleEditDrawer
        open={editingSchedule !== null}
        schedule={editingSchedule}
        onClose={() => setEditingSchedule(null)}
        onSave={handleEditSave}
      />
    </div>
  );
}
