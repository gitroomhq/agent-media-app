// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/skills — Skill Center library (Full v2).
 *
 * Grid of skill cards. Each card → /dashboard/skills/<slug> for the
 * focused form + MCP setup + recent runs.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { metaFor } from './_meta';
// Icons intentionally not used on cards — they didn't add signal.

interface SkillEntry {
  slug: string;
  name: string;
  version: string;
  description: string;
  primitive: string;
}

export default function SkillCenterPage() {
  const [skills, setSkills] = useState<SkillEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/skills', { credentials: 'include' });
        if (!r.ok) {
          setError(`skills ${r.status}`);
          setSkills([]);
          return;
        }
        const j = (await r.json()) as { skills?: SkillEntry[] };
        setSkills(j.skills ?? []);
      } catch (e) {
        setError((e as Error).message);
        setSkills([]);
      }
    })();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Skill Center
        </p>
        <h1 className="font-normal" style={{ color: '#E9E9F0', fontSize: 'clamp(28px,2.6vw,36px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          Run any agent-media skill
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Run any agent-media skill end-to-end. The same skills are exposed via REST at <code>POST /v1/skills/&lt;slug&gt;/run</code> and via MCP at <code>POST /mcp</code>. Click a card to run it or to copy the MCP install snippet.
        </p>
      </div>

      <section className="mt-10">
        {error ? (
          <div className="rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>
            {error}
          </div>
        ) : skills === null ? (
          <div className="flex h-48 items-center justify-center rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading skills…
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => {
              const meta = metaFor(s.slug);
              return (
                <Link
                  key={s.slug}
                  href={`/dashboard/skills/${encodeURIComponent(s.slug)}`}
                  className="group flex flex-col gap-3 rounded-2xl p-5 transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#14151F' }}
                >
                  <span className="text-base font-semibold" style={{ color: '#E9E9F0' }}>{s.name}</span>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {s.description.length > 160 ? s.description.slice(0, 160) + '…' : s.description}
                  </p>
                  <div className="mt-auto flex items-center justify-between text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <span>{meta.cost} · {meta.time}</span>
                    <span className="inline-flex items-center gap-1 transition-colors group-hover:text-white" style={{ color: '#A78BFA' }}>
                      Run <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
