// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/skills/[slug] — focused per-skill page.
 *
 * Left column: form + active run for THIS skill (polled).
 * Right column: MCP / REST / CLI install snippets.
 * Bottom: recent runs of this skill (filtered via /v1/me/gallery).
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { use } from 'react';
import { Loader2, Play, ArrowLeft, ExternalLink, Copy, Check } from 'lucide-react';
import { metaFor } from '../_meta';
import { FORMS, type Field } from '../_forms';

interface SkillEntry {
  slug: string;
  name: string;
  version: string;
  description: string;
  primitive: string;
}

interface RunResult {
  composed: boolean;
  id: string;
  status: string;
  current_step?: string | null;
  steps?: Array<{ primitive: string; status: string; artifacts?: Array<{ url: string }> }>;
  artifacts?: Array<{ url: string }>;
  final_output?: Record<string, unknown> | null;
  error?: { code: string; message: string | null } | null;
}

interface RecentItem {
  id: string;
  source: string;
  primitive: string | null;
  status: string;
  created_at: string;
  media_url: string | null;
  thumbnail_url: string | null;
}

const TERMINAL = new Set(['succeeded', 'completed', 'success', 'failed', 'canceled', 'cancelled']);

export default function SkillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [skill, setSkill] = useState<SkillEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[] | null>(null);
  const [activeRun, setActiveRun] = useState<RunResult | null>(null);

  // Load skill metadata
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/skills', { credentials: 'include' });
        if (!r.ok) { setError(`skills ${r.status}`); return; }
        const j = (await r.json()) as { skills: SkillEntry[] };
        const found = j.skills.find((s) => s.slug === slug);
        if (!found) { setError(`Skill "${slug}" not found`); return; }
        setSkill(found);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [slug]);

  // Load recent runs for this skill
  const reloadRecent = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '10', skill: slug, primitive: slug });
      const r = await fetch(`/api/v1/me/gallery?${params.toString()}`, { credentials: 'include' });
      if (!r.ok) return;
      const j = (await r.json()) as { items?: RecentItem[] };
      // For composed skill, we want the skill-run rows (source=vnext_skill).
      // For primitives, we want primitive-run rows (source=vnext_primitive).
      const filtered = (j.items ?? []).filter((it) => it.primitive === slug);
      setRecent(filtered);
    } catch { /* ignore */ }
  }, [slug]);
  useEffect(() => { void reloadRecent(); }, [reloadRecent]);

  // Poll active run
  useEffect(() => {
    if (!activeRun || TERMINAL.has(activeRun.status)) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const url = activeRun.composed
          ? `/api/v1/skills/runs/${encodeURIComponent(activeRun.id)}`
          : `/api/v1/primitives/runs/${encodeURIComponent(activeRun.id)}`;
        const r = await fetch(url, { credentials: 'include' });
        if (r.ok) {
          const d = (await r.json()) as any;
          const next: RunResult = activeRun.composed
            ? { composed: true, id: d.skill_run_id ?? activeRun.id, status: d.status ?? '?', current_step: d.current_step ?? null, steps: d.steps ?? [], final_output: d.final_output ?? null, error: d.error ?? null }
            : { composed: false, id: d.run_id ?? activeRun.id, status: d.status ?? '?', artifacts: d.artifacts ?? [], error: d.error ?? null };
          setActiveRun(next);
          if (TERMINAL.has(next.status)) {
            void reloadRecent();
            return;
          }
        }
      } catch {}
      setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [activeRun, reloadRecent]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-8 py-10">
        <Link href="/dashboard/skills" className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Skill Center
        </Link>
        <div className="mt-4 rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="mx-auto w-full max-w-4xl px-8 py-10">
        <div className="flex h-48 items-center justify-center rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>
    );
  }

  const meta = metaFor(skill.slug);
  const form = FORMS[skill.slug];

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <Link href="/dashboard/skills" className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <ArrowLeft className="h-3.5 w-3.5" /> Skill Center
      </Link>

      <div className="mt-4 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" style={{ color: '#E9E9F0' }}>{skill.name}</h1>
        <div className="flex items-center gap-3 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>{meta.cost}</span>
          <span>·</span>
          <span>{meta.time}</span>
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{skill.description}</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <RunPanel skill={skill} form={form} activeRun={activeRun} onLaunched={setActiveRun} />
        <InstallPanel skill={skill} />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Recent runs</h2>
        {recent === null ? (
          <div className="mt-3 flex h-24 items-center justify-center rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </div>
        ) : recent.length === 0 ? (
          <div className="mt-3 rounded-2xl p-6 text-center text-sm" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#15161D', color: 'rgba(255,255,255,0.5)' }}>
            No runs yet. Run the skill above to see them here.
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recent.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-4 rounded-xl px-4 py-3" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#15161D' }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{new Date(it.created_at).toLocaleString()}</span>
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{it.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px]" style={{ color: it.status === 'succeeded' ? '#34D399' : it.status === 'failed' ? '#F87171' : '#A78BFA' }}>{it.status}</span>
                  {it.media_url && (
                    <a href={it.media_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline" style={{ color: '#A78BFA' }}>
                      open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunPanel({
  skill,
  form,
  activeRun,
  onLaunched,
}: {
  skill: SkillEntry;
  form?: { fields: Field[]; composed: boolean };
  activeRun: RunResult | null;
  onLaunched: (r: RunResult) => void;
}) {
  const initial = useMemo(() => {
    const o: Record<string, unknown> = {};
    if (!form) return o;
    for (const f of form.fields) {
      if (f.kind === 'select') o[f.name] = f.defaultValue ?? f.options[0];
      else if (f.kind === 'number-select') o[f.name] = f.defaultValue ?? f.options[0];
      else if (f.kind === 'boolean') o[f.name] = f.defaultValue ?? false;
      else o[f.name] = '';
    }
    return o;
  }, [form]);
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitErr(null);
    setSubmitting(true);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'string' && v.trim() === '') continue;
      body[k] = v;
    }
    try {
      const resp = await fetch(`/api/v1/skills/${encodeURIComponent(skill.slug)}/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok) {
        const msg = (data as any)?.error?.message ?? (data as any)?.error ?? `HTTP ${resp.status}`;
        setSubmitErr(typeof msg === 'string' ? msg : JSON.stringify(data));
        return;
      }
      const id = (data.skill_run_id ?? data.run_id) as string | undefined;
      if (!id) { setSubmitErr('no run id returned'); return; }
      onLaunched({ composed: form.composed, id, status: 'submitted' });
    } catch (err) {
      setSubmitErr((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl p-5" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#14151F' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Run</h2>
      {form ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {form.fields.map((f) => (
            <FieldRow key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((p) => ({ ...p, [f.name]: v }))} />
          ))}
          {submitErr && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>
              {submitErr}
            </div>
          )}
          <div className="flex items-center justify-end">
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors" style={{ backgroundColor: submitting ? 'rgba(167,139,250,0.4)' : '#A78BFA', color: '#0F1015' }}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run skill
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          No form configured for this skill. Call <code>POST /v1/skills/{skill.slug}/run</code> directly.
        </p>
      )}

      {activeRun && (
        <Link href={`/dashboard/skills/runs/${encodeURIComponent(activeRun.id)}${activeRun.composed ? '?composed=1' : ''}`} className="mt-3 flex flex-col gap-2 rounded-xl px-4 py-3 transition-colors hover:opacity-90" style={{ border: '1px solid rgba(167,139,250,0.25)', backgroundColor: 'rgba(167,139,250,0.06)' }}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#A78BFA' }}>Active run</span>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{activeRun.id}</span>
          </div>
          <span className="text-sm" style={{ color: '#E9E9F0' }}>{activeRun.status}{activeRun.current_step ? ` · ${activeRun.current_step}` : ''}</span>
          {(activeRun.steps ?? []).map((s, i) => (
            <div key={`${s.primitive}-${i}`} className="flex items-center gap-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.status === 'succeeded' ? '#34D399' : s.status === 'failed' ? '#F87171' : '#A78BFA' }} />
              <span>{s.primitive}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{s.status}</span>
            </div>
          ))}
          <span className="text-[11px] underline" style={{ color: '#A78BFA' }}>open full timeline →</span>
        </Link>
      )}
    </div>
  );
}

function InstallPanel({ skill }: { skill: SkillEntry }) {
  const restSnippet = `curl -X POST https://api.agent-media.ai/v1/skills/${skill.slug}/run \\
  -H "Authorization: Bearer $AGENT_MEDIA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ /* see input schema */ }'`;

  const cliSnippet = `agent-media skills run ${skill.slug} \\
  --input '{ /* see input schema */ }' --wait`;

  const mcpSnippet = JSON.stringify({
    mcpServers: {
      'agent-media': {
        command: 'npx',
        args: ['-y', '-p', '@agentmedia/mcp-server@latest', 'agent-media-mcp'],
        env: { AGENT_MEDIA_API_KEY: '${AGENT_MEDIA_API_KEY}' },
      },
    },
  }, null, 2);

  const ghLink = `https://github.com/gitroomhq/agent-media/blob/main/skills/${skill.slug.replace(/_/g, '-')}/SKILL.md`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl p-5" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#14151F' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Use from anywhere</h2>
      <SnippetBlock title="REST" code={restSnippet} />
      <SnippetBlock title="CLI" code={cliSnippet} />
      <SnippetBlock title="MCP (Claude.ai / Cursor / Claude Code)" code={mcpSnippet} />
      <a href={ghLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline" style={{ color: '#A78BFA' }}>
        full SKILL.md on gitroom <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function SnippetBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>{title}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {}
          }}
          className="inline-flex items-center gap-1 text-[11px]"
          style={{ color: copied ? '#34D399' : 'rgba(255,255,255,0.5)' }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg px-3 py-2 text-[11px]" style={{ backgroundColor: '#0F1015', border: '1px solid rgba(255,255,255,0.06)', color: '#E9E9F0' }}>{code}</pre>
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const inputStyle: React.CSSProperties = { backgroundColor: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%' };
  const labelEl = (
    <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>{field.label}{('required' in field && field.required) ? ' *' : ''}</label>
  );
  if (field.kind === 'text') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        {field.textarea ? (
          <textarea rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} style={inputStyle} />
        ) : (
          <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} style={inputStyle} />
        )}
        {field.help && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{field.help}</span>}
      </div>
    );
  }
  if (field.kind === 'select') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {field.options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
        </select>
        {field.help && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{field.help}</span>}
      </div>
    );
  }
  if (field.kind === 'number-select') {
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <select value={String(value ?? '')} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle}>
          {field.options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
        </select>
      </div>
    );
  }
  if (field.kind === 'image') {
    const dataUrl = typeof value === 'string' ? value : '';
    const onFile = (file: File | null) => {
      if (!file) { onChange(''); return; }
      const reader = new FileReader();
      reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : '');
      reader.readAsDataURL(file);
    };
    return (
      <div className="flex flex-col gap-1">
        {labelEl}
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] ?? null); }}
          className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-3 py-4 text-center"
          style={{ backgroundColor: '#0F1015', border: '1px dashed rgba(255,255,255,0.18)', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}
        >
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          {dataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataUrl} alt="product preview" style={{ maxHeight: 96, borderRadius: 6 }} />
              <span style={{ color: '#34D399' }}>image attached — click to replace</span>
            </>
          ) : (
            <span>drop an image here, or click to choose (PNG/JPEG)</span>
          )}
        </label>
        {dataUrl && (
          <button type="button" onClick={() => onChange('')} className="self-start text-[11px] underline" style={{ color: 'rgba(255,255,255,0.45)' }}>
            remove
          </button>
        )}
        {field.help && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{field.help}</span>}
      </div>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
      <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      {field.label}
    </label>
  );
}
