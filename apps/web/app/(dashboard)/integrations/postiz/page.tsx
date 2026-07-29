// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Postiz integration page.
 *
 * Three sections:
 *   1. API key — paste from platform.postiz.com/settings, stored on
 *      profiles.postiz_api_key.
 *   2. Default destinations — checkbox grid of the user's connected
 *      social accounts (fetched from Postiz). Selection persists to
 *      profiles.postiz_default_integrations[].
 *   3. Recent publications — last 25 rows from postiz_publications
 *      with per-(job,integration) status: pending → uploaded →
 *      published, or failed with error_message.
 *
 * The actual fanout happens in the webhook-provider edge function on
 * every job.completed (see supabase/functions/webhook-provider/index.ts).
 * This page is config + monitoring only.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  XCircle,
} from 'lucide-react';
import { PostizLogo } from '@/components/postiz-logo';
import { ScheduleWizardSheet, type ScheduleWizardState } from '@/components/schedule-wizard';
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
}

interface Publication {
  id: string;
  job_id: string;
  integration_id: string;
  postiz_post_id: string | null;
  status: 'pending' | 'uploaded' | 'published' | 'failed';
  error_message: string | null;
  http_status: number | null;
  created_at: string;
  uploaded_at: string | null;
  published_at: string | null;
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

function StatusBadge({ status }: { status: Publication['status'] }) {
  if (status === 'published') {
    return (
      <Badge variant="live" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> Published
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge variant="default" className="gap-1 border-red-300 bg-red-50 text-red-700">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1 border-blue-300 bg-blue-50 text-blue-700">
      <Loader2 className="h-3 w-3 animate-spin" />
      {status === 'pending' ? 'Uploading' : 'Posting'}
    </Badge>
  );
}

export default function PostizIntegrationPage() {
  // Config state
  const [postizApiKey, setPostizApiKey] = useState('');
  const [postizApiKeyHasValue, setPostizApiKeyHasValue] = useState(false);
  const [integrations, setIntegrations] = useState<PostizIntegration[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [savedFlash, setSavedFlash] = useState<'key' | 'selection' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);

  // Publications log
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [pubsLoading, setPubsLoading] = useState(true);

  // Schedules
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  // ── Load schedules ────────────────────────────────────────────────────
  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await fetch('/api/v1/schedules');
      const data = await res.json();
      if (res.ok && Array.isArray(data?.schedules)) {
        setSchedules(data.schedules as Schedule[]);
      }
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  async function handleWizardFinish(state: ScheduleWizardState): Promise<string | null> {
    if (selected.size === 0) {
      return 'Pick at least one destination above before creating a schedule.';
    }
    const body: Record<string, unknown> = {
      name: state.name,
      generator_id: 'character_video',
      cadence_hours: state.cadenceHours,
      next_run_at: state.nextRunAt,
      enabled: true,
      postiz_integration_ids: Array.from(selected),
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
      brief: state.brief,
      caption_mode: state.captionMode,
      ...(state.captionGuidance ? { caption_guidance: state.captionGuidance } : {}),
      ...(state.captionTemplate ? { caption_template: state.captionTemplate } : {}),
      job_params: {
        duration: state.durationSeconds,
        aspect_ratio: '9:16',
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

  // wizardSelectedDestinations is derived after integrationById is defined.
  // See line near the bottom of the file (just before the return).

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

  // Trigger-now feedback: { kind: 'success', jobId, name } so we can
  // render an inline banner with a /jobs link, or { kind: 'error', message }.
  const [triggerStatus, setTriggerStatus] = useState<
    | { kind: 'success'; jobId: string | null; name: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

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
      // Refresh schedule list so next_run_at / last_run_at update.
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

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('postiz_api_key, postiz_default_integrations')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled && profile) {
        setPostizApiKeyHasValue(!!profile.postiz_api_key);
        const defaults = (profile.postiz_default_integrations as string[] | null) ?? [];
        setSelected(new Set(defaults));
      }

      // Recent publications
      const { data: rows } = await supabase
        .from('postiz_publications')
        .select('id, job_id, integration_id, postiz_post_id, status, error_message, http_status, created_at, uploaded_at, published_at')
        .order('created_at', { ascending: false })
        .limit(25);
      if (!cancelled) {
        setPubs((rows ?? []) as unknown as Publication[]);
        setPubsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Postiz integrations (require api key) ──────────────────────────────
  const loadIntegrations = useCallback(async () => {
    if (!postizApiKeyHasValue) return;
    setLoadingIntegrations(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/integrations/postiz/accounts');
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? `Postiz request failed (${res.status})`);
        return;
      }
      setIntegrations(data.integrations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoadingIntegrations(false);
    }
  }, [postizApiKeyHasValue]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  // Realtime — show new publications without a refresh
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('postiz-publications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'postiz_publications' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPubs((prev) => [payload.new as Publication, ...prev].slice(0, 25));
          } else if (payload.eventType === 'UPDATE') {
            const u = payload.new as Publication;
            setPubs((prev) => prev.map((p) => (p.id === u.id ? u : p)));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Save handlers ─────────────────────────────────────────────────────
  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    setError(null);
    try {
      const trimmed = postizApiKey.trim();
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); return; }
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ postiz_api_key: trimmed === '' ? null : trimmed })
        .eq('id', user.id);
      if (upErr) { setError(upErr.message); return; }
      setPostizApiKeyHasValue(trimmed !== '');
      setPostizApiKey('');
      setSavedFlash('key');
      setTimeout(() => setSavedFlash(null), 3000);
      if (trimmed !== '') await loadIntegrations();
      else setIntegrations([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveSelection() {
    setSavingSelection(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); return; }
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ postiz_default_integrations: Array.from(selected) })
        .eq('id', user.id);
      if (upErr) { setError(upErr.message); return; }
      setSavedFlash('selection');
      setTimeout(() => setSavedFlash(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingSelection(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const integrationById = new Map(integrations.map((i) => [i.id, i]));
  const selectedCount = selected.size;
  const enabledIntegrationsCount = integrations.filter((i) => !i.disabled).length;

  // Destinations passed to step 5 review for display.
  const wizardSelectedDestinations = Array.from(selected).map((id) => {
    const i = integrationById.get(id);
    return {
      id,
      identifier: i?.identifier ?? '',
      name: i?.name ?? i?.profile ?? id,
      picture: i?.picture ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <PostizLogo className="h-8 w-auto text-[#121212]" />
          <p className="mt-2 text-sm text-text-muted">
            Auto-publish completed videos to your social accounts.
          </p>
        </div>
        <a
          href="https://platform.postiz.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" /> platform.postiz.com
        </a>
      </div>

      {/* Status banner */}
      <div
        className={`mt-6 flex items-center gap-3 rounded-lg border px-4 py-3 ${
          postizApiKeyHasValue && selectedCount > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        {postizApiKeyHasValue && selectedCount > 0 ? (
          <CheckCircle2 className="h-5 w-5 shrink-0" />
        ) : (
          <SettingsIcon className="h-5 w-5 shrink-0" />
        )}
        <div className="text-sm">
          {!postizApiKeyHasValue && <strong>Auto-publish is OFF.</strong>}
          {postizApiKeyHasValue && selectedCount === 0 && <strong>Auto-publish is OFF. Pick at least one destination below.</strong>}
          {postizApiKeyHasValue && selectedCount > 0 && (
            <>
              <strong>Auto-publish is ON.</strong> Every completed video posts to {selectedCount} destination{selectedCount === 1 ? '' : 's'}.
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Section 1 — API key */}
      <section className="mt-10">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">1. API Key</h2>
        <p className="mt-3 text-sm text-text-muted">
          Get your key from{' '}
          <a href="https://platform.postiz.com/settings" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Postiz settings
          </a>
          . We store it encrypted at rest and never display it back.
        </p>
        <form onSubmit={handleSaveKey} className="mt-4 flex items-center gap-2">
          <input
            type="password"
            value={postizApiKey}
            onChange={(e) => setPostizApiKey(e.target.value)}
            placeholder={postizApiKeyHasValue ? '•••••••• (saved, paste a new key to replace)' : 'paste your Postiz API key'}
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <Button type="submit" disabled={savingKey || (postizApiKey.trim() === '' && !postizApiKeyHasValue)}>
            {savingKey ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : postizApiKeyHasValue && postizApiKey === '' ? 'Clear' : 'Save'}
          </Button>
        </form>
        {savedFlash === 'key' && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-green-700">
            <CheckCheck className="h-4 w-4" /> Saved
          </p>
        )}
      </section>

      {/* Section 2 — Destinations */}
      {postizApiKeyHasValue && (
        <section className="mt-10">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-[#121212]">2. Default Destinations</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadIntegrations()}
              disabled={loadingIntegrations}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loadingIntegrations ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <p className="mt-3 text-sm text-text-muted">
            Pick which connected social accounts to auto-publish to.{' '}
            {integrations.length > 0 && (
              <>
                {selectedCount} of {enabledIntegrationsCount} selected.
              </>
            )}
          </p>

          {loadingIntegrations && (
            <div className="mt-4 flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your Postiz accounts…
            </div>
          )}

          {!loadingIntegrations && integrations.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">
              No connected accounts yet. Connect platforms in your{' '}
              <a href="https://platform.postiz.com/launches" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Postiz launches
              </a>{' '}
              page, then click Refresh above.
            </p>
          )}

          {integrations.length > 0 && (
            <>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {integrations.map((i) => {
                  const checked = selected.has(i.id);
                  return (
                    <label
                      key={i.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                        checked
                          ? 'border-accent bg-accent/5'
                          : 'border-border bg-card hover:bg-zinc-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(i.id)}
                        className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                      />
                      {i.picture && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.picture} alt="" className="h-7 w-7 rounded-full object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">{i.name || i.profile || i.identifier}</p>
                        <p className="truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">{i.identifier}</p>
                      </div>
                      {i.disabled && (
                        <Badge variant="default" className="text-[10px]" title="Postiz reports this integration as disabled. Posts may fail until you re-authorize on Postiz.">
                          disabled on postiz
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={handleSaveSelection} disabled={savingSelection}>
                  {savingSelection ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save selection'}
                </Button>
                {savedFlash === 'selection' && (
                  <p className="flex items-center gap-1.5 text-sm text-green-700">
                    <CheckCheck className="h-4 w-4" /> Saved
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* Schedules + publications now live on /jobs. Pointer below. */}
      {postizApiKeyHasValue && (
        <section className="mt-10 rounded-md border border-border bg-zinc-50 px-4 py-3 text-sm text-text-muted">
          Schedules and recent publications moved to{' '}
          <Link href="/jobs" className="font-medium text-accent hover:underline">Automated Jobs</Link>.
          Once you&rsquo;ve saved destinations above, head there to create your first one.
        </section>
      )}

    </div>
  );
}
