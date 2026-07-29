// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/skills/runs/[id] — single run timeline.
 *
 * Polls /v1/skills/runs/:id (composed) or /v1/primitives/runs/:id
 * (standalone) every 4s until terminal. Renders step-by-step status,
 * embedded video player for the final artifact, and the original
 * input + cost.
 */

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';

interface Artifact { url: string; kind?: string; mime?: string | null; bytes?: number }
interface StepEntry { primitive_run_id?: string; primitive: string; status: string; started_at?: string | null; finished_at?: string | null; error?: { code: string; message: string | null } | null; artifacts?: Artifact[] }
interface RunBody {
  // skill-run flavor
  skill_run_id?: string;
  skill?: string;
  current_step?: string | null;
  steps?: StepEntry[];
  final_output?: Record<string, unknown> | null;
  // primitive-run flavor
  run_id?: string;
  primitive?: string;
  artifacts?: Artifact[];
  // shared
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  error?: { code: string; message: string | null } | null;
}

const TERMINAL = new Set(['succeeded', 'completed', 'success', 'failed', 'canceled', 'cancelled']);

export default function RunTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const forcedComposed = search?.get('composed') === '1';
  const [body, setBody] = useState<RunBody | null>(null);
  const [composed, setComposed] = useState<boolean>(forcedComposed);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    const fetchOnce = async () => {
      try {
        let resp = await fetch(`/api/v1/primitives/runs/${encodeURIComponent(id)}`, { credentials: 'include' });
        let didCompose = false;
        if (!resp.ok || forcedComposed) {
          resp = await fetch(`/api/v1/skills/runs/${encodeURIComponent(id)}`, { credentials: 'include' });
          didCompose = true;
        }
        if (!resp.ok) {
          setError(`run ${resp.status}`);
          return false;
        }
        const data = (await resp.json()) as RunBody;
        setComposed(didCompose);
        setBody(data);
        return TERMINAL.has(data.status);
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    };
    let cancelled = false;
    const loop = async () => {
      const done = await fetchOnce();
      if (cancelled || done || stopped.current) return;
      setTimeout(loop, 4000);
    };
    void loop();
    return () => { cancelled = true; stopped.current = true; };
  }, [id, forcedComposed]);

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <Link href="/dashboard/skills" className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <ArrowLeft className="h-3.5 w-3.5" /> Skill Center
      </Link>

      {error && (
        <div className="mt-4 rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      {!body && !error && (
        <div className="mt-4 flex h-48 items-center justify-center rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} />
        </div>
      )}

      {body && <RunBodyView body={body} composed={composed} id={id} />}
    </div>
  );
}

function RunBodyView({ body, composed, id }: { body: RunBody; composed: boolean; id: string }) {
  const terminal = TERMINAL.has(body.status);
  const finalUrl = pickFinalUrl(body);
  const isVideo = finalUrl ? /\.(mp4|webm|mov)(\?|$)/i.test(finalUrl) : false;
  const startedAt = body.started_at ?? body.created_at ?? null;
  const finishedAt = body.finished_at ?? null;
  const elapsedSec = startedAt && finishedAt ? Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000) : null;

  return (
    <>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: '#E9E9F0' }}>{body.skill ?? body.primitive ?? 'Run'}</h1>
          <p className="mt-1 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Run id: <code>{id}</code>
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#14151F' }}>
          {!terminal && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} />}
          <span style={{ color: body.status === 'succeeded' ? '#34D399' : body.status === 'failed' ? '#F87171' : '#A78BFA' }}>{body.status}</span>
        </div>
      </div>

      {body.error && (
        <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>
          <strong>{body.error.code}</strong>: {body.error.message}
        </div>
      )}

      {composed && body.steps && body.steps.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Timeline</h2>
          <ol className="mt-3 flex flex-col gap-2">
            {body.steps.map((s, i) => {
              const dur = s.started_at && s.finished_at ? Math.max(1, Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 1000)) : null;
              return (
                <li key={`${s.primitive}-${i}`} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#15161D' }}>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: s.status === 'succeeded' ? '#34D399' : s.status === 'failed' ? '#F87171' : '#A78BFA' }} />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium" style={{ color: '#E9E9F0' }}>{s.primitive}</span>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.status}{dur != null ? ` · ${dur}s` : ''}</span>
                    </div>
                  </div>
                  {(s.artifacts ?? []).map((a, ai) => (
                    <a key={ai} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline" style={{ color: '#A78BFA' }}>
                      open <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {finalUrl && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Final {isVideo ? 'video' : 'artifact'}</h2>
          <div className="mt-3 overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0F1015' }}>
            {isVideo ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={finalUrl} controls className="w-full" style={{ maxHeight: 720 }} />
            ) : (
              <img src={finalUrl} alt="output" className="w-full" />
            )}
          </div>
          <a href={finalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline" style={{ color: '#A78BFA' }}>
            open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </section>
      )}

      {elapsedSec != null && (
        <p className="mt-6 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Total wall time: {Math.floor(elapsedSec / 60)}m {elapsedSec % 60}s
        </p>
      )}
    </>
  );
}

function pickFinalUrl(body: RunBody): string | null {
  const out = body.final_output as Record<string, unknown> | undefined;
  if (out && typeof out.video_url === 'string') return out.video_url;
  if (body.artifacts && body.artifacts[0]) return body.artifacts[0].url ?? null;
  if (body.steps && body.steps.length > 0) {
    const last = body.steps[body.steps.length - 1];
    return last.artifacts?.[0]?.url ?? null;
  }
  return null;
}
