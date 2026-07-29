// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/jobs — every run the user has triggered across all skills,
 * regardless of status or output type. Unlike the Gallery (media browser),
 * this is the operational log: skill, status, when, credits, + links to the
 * produced asset and the full run detail/timeline.
 *
 * Data: /v1/me/gallery?filter=all (already merges legacy + vNext skill_runs +
 * standalone primitive_runs, all statuses).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, ArrowRight } from 'lucide-react';

interface JobItem {
  id: string;
  source: 'legacy' | 'vnext_primitive' | 'vnext_skill';
  primitive: string | null;
  status: string;
  created_at: string;
  finished_at: string | null;
  media_url: string | null;
  duration_seconds: number | null;
  prompt: string | null;
  credits_deducted: number;
}

const PRETTY: Record<string, string> = {
  portrait_gpt2: 'Portrait',
  character_sheet_gpt2: 'Character Sheet',
  simple_selfie: 'Simple Selfie',
  subtitles_v2: 'Subtitles',
  wireframe_gpt2: 'Wireframe',
  lip_sync: 'Lip Sync',
  make_ugc_video: 'UGC Video',
  make_ugc: 'Agent-Media UGC Video',
  make_podcast: 'Podcast',
};

function prettyName(p: string | null): string {
  if (!p) return '—';
  return PRETTY[p] ?? p;
}

function statusColor(s: string): { bg: string; fg: string; border: string } {
  switch (s) {
    case 'succeeded':
    case 'completed':
    case 'success':
      return { bg: 'rgba(52,211,153,0.12)', fg: '#34D399', border: 'rgba(52,211,153,0.4)' };
    case 'failed':
    case 'error':
    case 'canceled':
    case 'cancelled':
      return { bg: 'rgba(248,113,113,0.12)', fg: '#FCA5A5', border: 'rgba(248,113,113,0.4)' };
    default:
      return { bg: 'rgba(251,191,36,0.12)', fg: '#FCD34D', border: 'rgba(251,191,36,0.4)' };
  }
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/me/gallery?filter=all&limit=100', { credentials: 'include' });
        if (!r.ok) {
          setError(`jobs ${r.status}`);
          setJobs([]);
          return;
        }
        const j = (await r.json()) as { items?: JobItem[] };
        setJobs(j.items ?? []);
      } catch (e) {
        setError((e as Error).message);
        setJobs([]);
      }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Jobs
        </p>
        <h1 className="font-normal" style={{ color: '#E9E9F0', fontSize: 'clamp(28px,2.6vw,36px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          Every run &amp; its result
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          All jobs you&apos;ve run across every skill — status, credits, the produced asset, and a link to the full run timeline.
        </p>
      </div>

      <section className="mt-8">
        {error ? (
          <div className="rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>
            {error}
          </div>
        ) : jobs === null ? (
          <div className="flex h-48 items-center justify-center rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading jobs…
            </span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl px-5 py-10 text-center text-sm" style={{ border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            No jobs yet. Run a skill from the <Link href="/dashboard/skills" className="underline" style={{ color: '#A78BFA' }}>Skill Center</Link> to see it here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-3 text-left font-medium">Skill</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">When</th>
                  <th className="px-4 py-3 text-right font-medium">Credits</th>
                  <th className="px-4 py-3 text-left font-medium">Result</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const sc = statusColor(j.status);
                  const isVideo = j.media_url ? /\.(mp4|webm|mov)(\?|$|#)/i.test(j.media_url) : false;
                  return (
                    <tr key={`${j.source}-${j.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-3" style={{ color: '#E9E9F0' }}>
                        <span className="font-medium">{prettyName(j.primitive)}</span>
                        {j.prompt ? (
                          <span className="ml-2 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {j.prompt.length > 48 ? j.prompt.slice(0, 48) + '…' : j.prompt}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.fg, border: `1px solid ${sc.border}` }}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{fmtDate(j.created_at)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{j.credits_deducted || '—'}</td>
                      <td className="px-4 py-3">
                        {j.media_url ? (
                          <a href={j.media_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5" style={{ color: '#A78BFA' }}>
                            {isVideo ? 'Video' : 'Image'} <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/skills/runs/${encodeURIComponent(j.id)}`} className="inline-flex items-center gap-1 text-xs transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.55)' }}>
                          Details <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
