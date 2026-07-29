// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/admin — internal admin panel (dark theme), gated to the
 * allowlist in lib/admin-allowlist.ts (you + Nevo). Replaces the old
 * light-themed /admin. Shows all subscribed users, their creations (legacy
 * generation_jobs + vNext primitive_runs, merged server-side), stats, and
 * lets an admin grant credits / change plan / inspect a user (read-only).
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, Search, Coins, ExternalLink, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isAdminEmail } from '@/lib/admin-allowlist';

interface Job {
  id: string;
  model_slug: string | null;
  operation: string | null;
  status: string | null;
  prompt: string | null;
  output_media_url: string | null;
  credit_cost: number | null;
  created_at: string | null;
}
interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription: { plan_slug: string; status: string; current_period_end: string | null } | null;
  credits: { monthly_credits_remaining: number; purchased_balance: number } | null;
  jobs: Job[];
  computed: { months_subscribed: number; total_credits_used: number; last_creation_at: string | null; total_creations: number };
}

interface Growth {
  signups: { total: number; last_7d: number; last_24h: number };
  onboarding: {
    onboarded: number;
    in_progress: number;
    not_started: number;
    completion_rate: number;
    by_step: Record<string, number>;
    funnel: { step: string; reached: number; pct_of_start: number; drop_from_prev: number; drop_pct: number }[];
    funnel_started: number;
  };
  subscriptions: {
    active_total: number;
    by_plan: Record<string, number>;
    conversion_rate: number;
    conversion_rate_of_onboarded: number;
  };
}

const CARD = { backgroundColor: '#14151F', border: '1px solid rgba(255,255,255,0.06)' } as const;
const PLANS = ['starter', 'creator', 'pro_plus'];

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'credits_used' | 'creations'>('recent');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await createClient().auth.getUser();
      setIsAdmin(isAdminEmail(user?.email));
      setAuthChecked(true);
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      // Users list + growth funnel load in parallel; a metrics hiccup must not
      // block the user table, so growth failure is swallowed (panel just hides).
      const [r, m] = await Promise.all([
        fetch('/api/admin/users', { credentials: 'include' }),
        fetch('/api/admin/metrics', { credentials: 'include' }).catch(() => null),
      ]);
      if (r.status === 403) { setError('Not authorized.'); setUsers([]); return; }
      if (!r.ok) { setError(`users ${r.status}`); setUsers([]); return; }
      const j = await r.json();
      setUsers(j.users ?? []);
      if (m && m.ok) {
        const mj = await m.json().catch(() => null);
        setGrowth(mj?.growth ?? null);
      }
    } catch (e) { setError((e as Error).message); setUsers([]); }
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const stats = useMemo(() => {
    const u = users ?? [];
    return {
      users: u.length,
      creations: u.reduce((s, x) => s + (x.computed?.total_creations ?? 0), 0),
      creditsUsed: u.reduce((s, x) => s + (x.computed?.total_credits_used ?? 0), 0),
      active: u.filter((x) => x.subscription?.status === 'active').length,
    };
  }, [users]);

  const filtered = useMemo(() => {
    let u = [...(users ?? [])];
    const needle = q.trim().toLowerCase();
    if (needle) u = u.filter((x) => (x.email ?? '').toLowerCase().includes(needle) || (x.display_name ?? '').toLowerCase().includes(needle));
    u.sort((a, b) => {
      if (sort === 'credits_used') return (b.computed?.total_credits_used ?? 0) - (a.computed?.total_credits_used ?? 0);
      if (sort === 'creations') return (b.computed?.total_creations ?? 0) - (a.computed?.total_creations ?? 0);
      return (b.computed?.last_creation_at ?? '').localeCompare(a.computed?.last_creation_at ?? '');
    });
    return u;
  }, [users, q, sort]);

  async function giveCredits(u: AdminUser) {
    const raw = window.prompt(`Give credits to ${u.email}\nAmount (1–100000):`, '1000');
    if (!raw) return;
    const amount = parseInt(raw, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) { alert('Amount must be 1–100000'); return; }
    setBusy(u.id);
    try {
      const r = await fetch('/api/admin/add-credits', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: u.id, amount }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(`Failed: ${j.error ?? r.status}`); return; }
      await load();
    } finally { setBusy(null); }
  }

  async function grantPlan(u: AdminUser, plan_slug: string) {
    if (!plan_slug) return;
    setBusy(u.id);
    try {
      const r = await fetch('/api/admin/grant-subscription', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: u.id, plan_slug }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); alert(`Failed: ${j.error ?? r.status}`); return; }
      await load();
    } finally { setBusy(null); }
  }

  if (!authChecked) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-md px-8 py-24 text-center">
        <ShieldAlert className="mx-auto h-8 w-8" style={{ color: '#F87171' }} />
        <h1 className="mt-3 text-lg font-semibold" style={{ color: '#E9E9F0' }}>Not authorized</h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>This area is restricted to agent-media admins.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Internal</p>
      <h1 className="mt-1 font-normal" style={{ color: '#E9E9F0', fontSize: 'clamp(28px,2.6vw,36px)', letterSpacing: '-0.03em' }}>Admin</h1>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Users', value: stats.users },
          { label: 'Active subs', value: stats.active },
          { label: 'Creations', value: stats.creations },
          { label: 'Credits used', value: stats.creditsUsed.toLocaleString() },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl px-4 py-3" style={CARD}>
            <div className="text-2xl font-semibold" style={{ color: '#E9E9F0' }}>{s.value}</div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Growth funnel: signups → onboarding → subscription */}
      {growth ? (() => {
        const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
        const ob = growth.onboarding;
        const obTotal = ob.onboarded + ob.in_progress + ob.not_started || 1;
        const steps = Object.entries(ob.by_step).sort((a, b) => b[1] - a[1]);
        const plans = Object.entries(growth.subscriptions.by_plan).sort((a, b) => b[1] - a[1]);
        const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
          <div>
            <div className="text-xl font-semibold" style={{ color: '#E9E9F0' }}>{value}</div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</div>
            {sub ? <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</div> : null}
          </div>
        );
        const funnel = ob.funnel ?? [];
        return (
          <>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Signups */}
            <div className="rounded-2xl px-4 py-4" style={CARD}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Signups</div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="Total" value={growth.signups.total.toLocaleString()} />
                <Stat label="7 days" value={`+${growth.signups.last_7d.toLocaleString()}`} />
                <Stat label="24 hours" value={`+${growth.signups.last_24h.toLocaleString()}`} />
              </div>
            </div>

            {/* Onboarding funnel */}
            <div className="rounded-2xl px-4 py-4" style={CARD}>
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Onboarding</div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{pct(ob.completion_rate)} completed</div>
              </div>
              {/* Stacked bar */}
              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ width: pct(ob.onboarded / obTotal), background: '#34D399' }} />
                <div style={{ width: pct(ob.in_progress / obTotal), background: '#A78BFA' }} />
                <div style={{ width: pct(ob.not_started / obTotal), background: 'rgba(255,255,255,0.18)' }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="Onboarded" value={ob.onboarded.toLocaleString()} />
                <Stat label="In progress" value={ob.in_progress.toLocaleString()} />
                <Stat label="Not started" value={ob.not_started.toLocaleString()} />
              </div>
              {steps.length ? (
                <div className="mt-3 border-t pt-2 text-[11px]" style={{ borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>Stuck on: </span>
                  {steps.map(([step, n], i) => (
                    <span key={step}>{i ? ', ' : ''}{step} <span style={{ color: 'rgba(255,255,255,0.85)' }}>{n}</span></span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Subscriptions */}
            <div className="rounded-2xl px-4 py-4" style={CARD}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Subscriptions</div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="Active" value={growth.subscriptions.active_total.toLocaleString()} />
                <Stat label="of signups" value={pct(growth.subscriptions.conversion_rate)} sub="conversion" />
                <Stat label="of onboarded" value={pct(growth.subscriptions.conversion_rate_of_onboarded)} sub="conversion" />
              </div>
              {plans.length ? (
                <div className="mt-3 border-t pt-2 text-[11px]" style={{ borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                  {plans.map(([plan, n]) => (
                    <span key={plan} className="mr-3 inline-flex items-center gap-1">
                      <span className="rounded-full px-2 py-0.5" style={{ background: 'rgba(167,139,250,0.12)', color: '#C4B5FD' }}>{plan}</span>
                      <span style={{ color: 'rgba(255,255,255,0.85)' }}>{n}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Step-by-step onboarding funnel (event-log cohort only) */}
          {funnel.length ? (
            <div className="mt-3 rounded-2xl px-4 py-4" style={CARD}>
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Onboarding funnel</div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{ob.funnel_started.toLocaleString()} started · since step-tracking shipped</div>
              </div>
              <div className="mt-3 space-y-1.5">
                {funnel.map((f, i) => {
                  const widthPct = `${(f.pct_of_start * 100).toFixed(1)}%`;
                  const isLast = i === funnel.length - 1;
                  return (
                    <div key={f.step} className="flex items-center gap-3">
                      <div className="w-20 shrink-0 text-[12px] capitalize" style={{ color: 'rgba(255,255,255,0.7)' }}>{f.step}</div>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-md" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: widthPct, background: isLast ? 'rgba(52,211,153,0.5)' : 'rgba(167,139,250,0.4)' }} />
                        <div className="absolute inset-0 flex items-center px-2 text-[11px]" style={{ color: '#E9E9F0' }}>
                          {f.reached.toLocaleString()} <span className="ml-1" style={{ color: 'rgba(255,255,255,0.45)' }}>({(f.pct_of_start * 100).toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="w-24 shrink-0 text-right text-[12px]" style={{ color: i === 0 ? 'rgba(255,255,255,0.3)' : f.drop_pct >= 0.06 ? '#F87171' : 'rgba(255,255,255,0.55)' }}>
                        {i === 0 ? '—' : `−${f.drop_from_prev} (−${(f.drop_pct * 100).toFixed(1)}%)`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          </>
        );
      })() : null}

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.35)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name…" className="h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none" style={{ background: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-xl px-3 text-sm outline-none" style={{ background: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }}>
          <option value="recent">Most recent creation</option>
          <option value="credits_used">Most credits used</option>
          <option value="creations">Most creations</option>
        </select>
      </div>

      {error ? <div className="mt-4 rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', background: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>{error}</div> : null}

      {/* User list */}
      <div className="mt-4 overflow-hidden rounded-2xl" style={CARD}>
        {users === null ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} /></div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>No users.</p>
        ) : (
          <ul>
            {filtered.map((u) => {
              const open = expanded === u.id;
              const left = (u.credits?.monthly_credits_remaining ?? 0) + (u.credits?.purchased_balance ?? 0);
              return (
                <li key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" onClick={() => setExpanded(open ? null : u.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      {open ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} /> : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />}
                      <span className="truncate text-sm" style={{ color: '#E9E9F0' }}>{u.email ?? '(no email)'}</span>
                      {u.subscription ? <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'rgba(167,139,250,0.12)', color: '#C4B5FD' }}>{u.subscription.plan_slug}</span> : null}
                    </button>
                    <div className="flex items-center gap-4 text-[12px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <span title="credits left"><Coins className="mr-1 inline h-3 w-3" />{left.toLocaleString()}</span>
                      <span title="credits used">{u.computed.total_credits_used.toLocaleString()} used</span>
                      <span title="creations">{u.computed.total_creations} gens</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={busy === u.id} onClick={() => giveCredits(u)} className="rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: '#1B1C2A', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }}>{busy === u.id ? '…' : '+ Credits'}</button>
                      <select disabled={busy === u.id} value="" onChange={(e) => grantPlan(u, e.target.value)} className="rounded-lg px-2 py-1.5 text-[12px]" style={{ background: '#1B1C2A', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <option value="">Plan…</option>
                        {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  {open && (
                    <div className="px-4 pb-4">
                      {u.jobs.length === 0 ? (
                        <p className="py-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>No creations yet.</p>
                      ) : (
                        <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                          {u.jobs.map((j) => (
                            <div key={j.id} className="flex items-center gap-3 px-3 py-2 text-[12px]" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)' }}>
                              <span className="w-44 shrink-0 truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{j.model_slug ?? '—'}</span>
                              <span className="flex-1 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{j.prompt ?? ''}</span>
                              <span className="w-16 shrink-0 text-right">{j.credit_cost ?? 0} cr</span>
                              <span className="w-20 shrink-0 text-right" style={{ color: j.status === 'completed' ? '#34D399' : j.status === 'failed' ? '#F87171' : '#A78BFA' }}>{j.status}</span>
                              <span className="w-24 shrink-0 text-right" style={{ color: 'rgba(255,255,255,0.4)' }}>{j.created_at ? new Date(j.created_at).toLocaleDateString() : ''}</span>
                              <span className="w-12 shrink-0 text-right">{j.output_media_url ? <a href={j.output_media_url} target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}><ExternalLink className="inline h-3.5 w-3.5" /></a> : '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
