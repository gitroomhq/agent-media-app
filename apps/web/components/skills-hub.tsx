// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Public Skills & CLI hub — rendered at /skills, /mcp and /cli (each with a
 * different default tab). Hero connect guide (MCP/CLI/Skill) + the live skills
 * grid + a REST snippet.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { ConnectGuide } from '@/components/connect-guide';

interface SkillEntry { slug: string; name: string; version: string; description: string; primitive: string }

const COST_BY_SLUG: Record<string, { cost: string; time: string }> = {
  make_ugc: { cost: 'from ~155 credits', time: '6–25 min' },
  // The primitives below are internal to make_ugc now; kept for direct-slug use.
  // Portrait is free; a character sheet is free inside a video (35 standalone).
  make_portrait: { cost: 'Free', time: '~60s' },
  make_character_sheet: { cost: '35 credits (free in a video)', time: '~90s' },
  make_wireframe: { cost: '35 credits', time: '~90s' },
  make_simple_selfie: { cost: '140–420 credits', time: '4–7 min' },
  make_product_in_hands: { cost: '140–420 credits', time: '4–7 min' },
  make_lip_sync: { cost: '140–420 credits', time: '~7 min' },
  make_subtitles: { cost: '15 credits', time: '~20s' },
  make_ugc_video: { cost: '~155–435 credits', time: '6–10 min' },
  make_podcast: { cost: '~280–1400 credits', time: '8–30 min' },
};

export function SkillsHub({
  initialTab = 'skill',
  initialClient = 'claude-code',
  internal = false,
}: {
  initialTab?: 'mcp' | 'cli' | 'skill';
  initialClient?: 'claude-code' | 'cursor' | 'claude-desktop' | 'codex';
  /** Rendered inside the logged-in dashboard: don't push public /mcp URLs,
   *  and reword the run CTA (the user is already signed in). */
  internal?: boolean;
}) {
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/public/skills');
        if (!r.ok) { setError(`skills ${r.status}`); setSkills([]); return; }
        const j = (await r.json()) as { skills?: SkillEntry[] };
        setSkills(j.skills ?? []);
      } catch (e) { setError((e as Error).message); setSkills([]); }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
      <ConnectGuide initialTab={initialTab} initialClient={initialClient} routePaths={!internal} />

      <div className="mt-8 flex justify-center">
        <Link href="/dashboard/skills" className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90" style={{ background: '#A78BFA', borderRadius: 8 }}>
          {internal ? 'Browse & run skills' : 'Sign in & run in the dashboard'} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold text-white">Available skills</h2>
        <p className="mt-1 mb-6 text-sm text-white/55">
          Each is callable from MCP, the CLI, the skill, or the REST API — same skills, one Bearer token.
        </p>
        {error ? (
          <div className="px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 12 }}>{error}</div>
        ) : skills === null ? (
          <div className="flex h-48 items-center justify-center" style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }}>
            <span className="inline-flex items-center gap-2 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => {
              const meta = COST_BY_SLUG[s.slug] ?? { cost: '—', time: '—' };
              return (
                <Link key={s.slug} href="/dashboard/skills" className="group flex flex-col gap-3 p-5 transition-colors"
                  style={{ background: '#17171D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
                  <h3 className="text-lg font-semibold text-white">{s.name}</h3>
                  <p className="text-sm text-white/65">{s.description.length > 160 ? s.description.slice(0, 160) + '…' : s.description}</p>
                  <div className="mt-auto flex items-center justify-between text-[12px] text-white/50">
                    <span>{meta.cost} · {meta.time}</span>
                    <span className="inline-flex items-center gap-1 text-violet-300 transition-colors group-hover:text-white">Run <ArrowRight className="h-3.5 w-3.5" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-16 p-8" style={{ background: '#121218', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <h2 className="text-2xl font-semibold text-white">Prefer raw HTTP?</h2>
        <p className="mt-2 text-sm text-white/60">Every skill is also a REST endpoint — same Bearer token. Poll <code className="text-white/80">GET /v1/skills/runs/&lt;id&gt;</code> for the result.</p>
        <div className="mt-6 max-w-2xl">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">REST</span>
          <pre className="mt-2 overflow-x-auto px-3 py-2.5 text-[12px] text-white/85 font-mono" style={{ background: '#08080B', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8 }}>{`curl -X POST \\
  https://api.agent-media.ai/v1/skills/make_ugc/run \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "script": "...", "person": "a friendly woman" }'`}</pre>
        </div>
      </section>
    </div>
  );
}
