// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/billing - dark billing page.
 *
 * Sections, top to bottom:
 *   1. Add credits  - pick a one-off USD pack, hands off to Stripe.
 *                     "Purchased credits never expire" lives here.
 *   2. Side panel   - account balance + low-balance alert + current
 *                     plan summary.
 *   3. Choose plan  - 3 subscription tiers, current one is locked.
 *   4. Payment history table.
 *   5. Danger zone  - cancel subscription with type-to-confirm.
 *
 * All API calls go through the Supabase `invokeFn` proxy:
 *   - credits-check    -> current balance + plan tier
 *   - billing-history  -> payment_history rows
 *   - checkout         -> Stripe Checkout URL (credit pack OR plan)
 *   - cancel-subscription
 *
 * Same edge functions the legacy /billing page uses, just a new
 * presentation matching the dark dashboard.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Crown, Loader2, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';

interface CreditPack {
  amountUsd: number;
  credits: number;
  highlight?: boolean;
}

const CREDIT_PACKS: CreditPack[] = [
  { amountUsd: 50,   credits: 5000 },
  { amountUsd: 100,  credits: 10000, highlight: true },
  { amountUsd: 300,  credits: 30000 },
  { amountUsd: 1000, credits: 100000 },
  { amountUsd: 2000, credits: 200000 },
];

interface Plan {
  tier: string;
  name: string;
  priceMonthly: number;
  credits: number;
  features: string[];
}

const PLANS: Plan[] = [
  {
    tier: 'starter',
    name: 'Creator',
    priceMonthly: 39,
    credits: 3900,
    features: ['3,900 credits / month', 'Up to 10s videos'],
  },
  {
    tier: 'creator',
    name: 'Pro',
    priceMonthly: 69,
    credits: 6900,
    features: ['6,900 credits / month', 'Up to 15s videos', 'Priority queue'],
  },
  {
    tier: 'pro_plus',
    name: 'Pro Plus',
    priceMonthly: 129,
    credits: 12900,
    features: [
      '12,900 credits / month',
      'Up to 15s videos',
      'Early access to new tools',
    ],
  },
];

interface CreditsResp {
  credits?: { total?: number; monthly_remaining?: number; purchased?: number } | null;
  plan?: { tier?: string | null; name?: string | null } | null;
}

interface HistoryRow {
  description: string | null;
  credits: number | null;
  amount_paid: number | null;
  date: string;
  invoice_url?: string | null;
}

interface HistoryResp {
  invoices?: HistoryRow[];
}

export default function BillingPage() {
  const [credits, setCredits] = useState<CreditsResp['credits']>(null);
  const [planTier, setPlanTier] = useState<string | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoThreshold, setAutoThreshold] = useState(1000);
  const [autoAmountUsd, setAutoAmountUsd] = useState(50);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<number>(100);
  const [buying, setBuying] = useState(false);
  const [changingTier, setChangingTier] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelInput, setCancelInput] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [creditsR, historyR, autoR] = await Promise.all([
        invokeFn('credits-check', { method: 'GET' }),
        invokeFn('billing-history', { method: 'GET' }).catch(() => ({ data: null, error: null })),
        invokeFn('auto-topup', { method: 'GET' }).catch(() => ({ data: null, error: null })),
      ]);
      const c = creditsR.data as CreditsResp | null;
      setCredits(c?.credits ?? null);
      setPlanTier(c?.plan?.tier ?? null);
      const h = historyR.data as HistoryResp | null;
      setHistory(h?.invoices ?? []);
      const a = autoR.data as
        | { enabled?: boolean; threshold_credits?: number; pack_slug?: string }
        | null;
      if (a) {
        setAutoEnabled(!!a.enabled);
        if (typeof a.threshold_credits === 'number') setAutoThreshold(a.threshold_credits);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleBuyCredits() {
    if (buying) return;
    setBuying(true);
    setError(null);
    try {
      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;
      const { data, error: fnError } = await invokeFn('checkout', {
        body: { amount_cents: selectedPack * 100, ...(dubId ? { dub_id: dubId } : {}) },
      });
      if (fnError) {
        type FnData = { error_description?: string; error?: string };
        const d = data as FnData | null;
        throw new Error(d?.error_description ?? fnError.message ?? 'Checkout failed');
      }
      const d = data as { checkout_url?: string; error?: string; error_description?: string } | null;
      if (d?.error) throw new Error(d.error_description ?? d.error);
      if (d?.checkout_url) {
        window.location.href = d.checkout_url;
        return;
      }
      throw new Error('Checkout URL missing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBuying(false);
    }
  }

  async function handleChangePlan(tier: string) {
    if (changingTier) return;
    setChangingTier(tier);
    setError(null);
    try {
      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;
      const { data, error: fnError } = await invokeFn('checkout', {
        body: { plan_tier: tier, ...(dubId ? { dub_id: dubId } : {}) },
      });
      if (fnError) {
        type FnData = { error_description?: string; error?: string };
        const d = data as FnData | null;
        throw new Error(d?.error_description ?? fnError.message ?? 'Checkout failed');
      }
      const d = data as { checkout_url?: string; upgraded?: boolean; error?: string; error_description?: string } | null;
      if (d?.error) throw new Error(d.error_description ?? d.error);
      if (d?.checkout_url) {
        window.location.href = d.checkout_url;
        return;
      }
      if (d?.upgraded) {
        fetchAll();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan change failed');
    } finally {
      setChangingTier(null);
    }
  }

  async function handleCancelSubscription() {
    if (canceling) return;
    if (cancelInput.trim().toUpperCase() !== 'CANCEL') {
      setCancelError('Type CANCEL exactly to confirm.');
      return;
    }
    setCanceling(true);
    setCancelError(null);
    setError(null);
    try {
      // Hit the proxy with a 25s ceiling. Stripe occasionally takes a
      // few seconds; anything past that is a hung edge function.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      let resp: Response;
      try {
        resp = await fetch('/api/fn/cancel-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const text = await resp.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        // Non-JSON body, fall through with the raw text.
      }
      if (!resp.ok) {
        const desc = typeof body.error_description === 'string'
          ? body.error_description
          : typeof body.error === 'string'
            ? body.error
            : text || `HTTP ${resp.status}`;
        throw new Error(desc);
      }
      if (typeof body.error === 'string') {
        const desc = typeof body.error_description === 'string'
          ? body.error_description
          : body.error;
        throw new Error(desc);
      }
      // Success - keep UI optimistic; refresh in the background.
      setCancelSuccess(true);
      setCancelInput('');
      // Don't await - if /credits-check is slow we still want to show
      // success immediately.
      fetchAll().catch(() => {});
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to cancel';
      // AbortError -> our timeout fired.
      if (message === 'The operation was aborted.' || message.toLowerCase().includes('abort')) {
        setCancelError('Request timed out. Try again in a moment.');
      } else {
        setCancelError(message);
      }
    } finally {
      setCanceling(false);
    }
  }

  const currentPlan = PLANS.find((p) => p.tier === planTier);
  const isPaid = !!currentPlan;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading billing…
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Billing
        </p>
        <h1
          className="font-normal"
          style={{
            color: '#E9E9F0',
            fontSize: 'clamp(28px,2.6vw,36px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Manage your plan and credits
        </h1>
      </header>

      {error ? (
        <div
          className="mt-6 rounded-2xl px-4 py-3 text-sm"
          style={{
            border: '1px solid rgba(255,79,79,0.3)',
            backgroundColor: 'rgba(255,79,79,0.08)',
            color: '#FCA5A5',
          }}
        >
          {error}
        </div>
      ) : null}

      {/* ── Add credits + side panel ───────────────────────────────── */}
      <section className="mt-10 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* LEFT - credit packs */}
        <div
          className="rounded-3xl p-6"
          style={{ backgroundColor: '#191A22', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <h2 className="text-base font-semibold" style={{ color: '#E9E9F0' }}>
            Add credits
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Top up your account. Purchased credits never expire.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CREDIT_PACKS.map((pack) => {
              const selected = selectedPack === pack.amountUsd;
              return (
                <button
                  key={pack.amountUsd}
                  type="button"
                  onClick={() => setSelectedPack(pack.amountUsd)}
                  className="relative flex flex-col items-center gap-1 rounded-2xl py-5 transition-all"
                  style={{
                    backgroundColor: selected ? 'rgba(167,139,250,0.08)' : '#0F1015',
                    border: selected
                      ? '1px solid rgba(167,139,250,0.55)'
                      : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: selected
                      ? '0 0 0 3px rgba(167,139,250,0.12)'
                      : undefined,
                  }}
                >
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: '#A78BFA' }}
                    >
                      <Check className="h-3 w-3 text-black" />
                    </span>
                  ) : null}
                  <span
                    className="text-xl font-bold"
                    style={{ color: '#E9E9F0', letterSpacing: '-0.02em' }}
                  >
                    ${pack.amountUsd}
                  </span>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {pack.credits.toLocaleString()} credits
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="mt-6 flex items-center justify-between border-t pt-5"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Payment via Stripe • Secure checkout
            </span>
            <button
              type="button"
              onClick={handleBuyCredits}
              disabled={buying}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0F1015',
                boxShadow: '0 8px 24px rgba(167,139,250,0.25), 0 0 0 1px rgba(255,255,255,0.6)',
              }}
            >
              {buying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting
                </>
              ) : (
                `Buy (${(CREDIT_PACKS.find((p) => p.amountUsd === selectedPack)?.credits ?? 0).toLocaleString()} credits)`
              )}
            </button>
          </div>
        </div>

        {/* RIGHT - balance + plan */}
        <aside className="flex h-full flex-col gap-4">
          <div
            className="flex flex-col rounded-3xl p-5"
            style={{ backgroundColor: '#191A22', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Account balance
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                style={{
                  color: '#E9E9F0',
                  fontSize: 'clamp(34px,3.2vw,44px)',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                }}
              >
                {(credits?.total ?? 0).toLocaleString()}
              </span>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>credits</span>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {(credits?.monthly_remaining ?? 0).toLocaleString()} monthly remaining
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {(credits?.purchased ?? 0).toLocaleString()} purchased (never expires)
            </p>
          </div>

          <AutoRechargeCard
            initialEnabled={autoEnabled}
            initialThreshold={autoThreshold}
            initialAmountUsd={autoAmountUsd}
            onSaved={(next) => {
              setAutoEnabled(next.enabled);
              setAutoThreshold(next.threshold);
              setAutoAmountUsd(next.amountUsd);
            }}
          />
        </aside>
      </section>

      {/* ── Choose plan ────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-base font-semibold" style={{ color: '#E9E9F0' }}>
          Choose your plan
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === planTier;
            const loadingThis = changingTier === plan.tier;
            const isFlagship = plan.tier === 'pro_plus';
            // PLANS is ordered cheap -> expensive, so index ordering
            // gives us upgrade/downgrade direction.
            const currentIdx = PLANS.findIndex((p) => p.tier === planTier);
            const thisIdx = PLANS.findIndex((p) => p.tier === plan.tier);
            const isDowngrade = currentIdx >= 0 && thisIdx < currentIdx;
            const ctaLabel = isCurrent
              ? 'Current plan'
              : isDowngrade
                ? 'Downgrade'
                : 'Upgrade';
            return (
              <div
                key={plan.tier}
                className="relative flex h-full flex-col rounded-3xl p-5"
                style={{
                  backgroundColor: isCurrent ? 'rgba(167,139,250,0.06)' : '#191A22',
                  border: isCurrent
                    ? '1px solid rgba(167,139,250,0.45)'
                    : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isCurrent
                    ? '0 0 40px rgba(167,139,250,0.1) inset'
                    : undefined,
                  minHeight: 280,
                }}
              >
                {isCurrent ? (
                  <span
                    className="absolute -top-2.5 left-5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{
                      backgroundColor: '#0F1015',
                      color: '#D4C7FF',
                      border: '1px solid rgba(167,139,250,0.55)',
                    }}
                  >
                    Current
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold" style={{ color: '#E9E9F0' }}>
                    {plan.name}
                  </p>
                  {isFlagship ? (
                    <Crown
                      className="h-4 w-4"
                      style={{
                        color: '#F7CA3D',
                        filter: 'drop-shadow(0 0 6px rgba(247,202,61,0.5))',
                      }}
                      aria-label="Premium tier"
                    />
                  ) : null}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    style={{
                      color: '#E9E9F0',
                      fontSize: 'clamp(30px,2.8vw,38px)',
                      fontWeight: 700,
                      letterSpacing: '-0.025em',
                      lineHeight: 1,
                    }}
                  >
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>/mo</span>
                </div>
                <ul className="mt-4 flex flex-col gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: isCurrent ? '#A78BFA' : 'rgba(255,255,255,0.4)' }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent || loadingThis}
                  onClick={() => handleChangePlan(plan.tier)}
                  className="mt-auto inline-flex h-10 w-full items-center justify-center gap-2 rounded-full pt-0 text-xs font-semibold transition-colors"
                  style={{
                    marginTop: 'auto',
                    backgroundColor: isCurrent
                      ? 'transparent'
                      : 'transparent',
                    color: isCurrent ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)',
                    border: isCurrent
                      ? '1px solid rgba(167,139,250,0.35)'
                      : '1px solid rgba(255,255,255,0.18)',
                    cursor: isCurrent ? 'default' : 'pointer',
                    opacity: loadingThis ? 0.7 : 1,
                  }}
                >
                  {loadingThis ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Redirecting
                    </>
                  ) : (
                    ctaLabel
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Payment history ────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-base font-semibold" style={{ color: '#E9E9F0' }}>
          Payment history
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          All credit purchases and subscription invoices.
        </p>
        <div
          className="mt-5 overflow-hidden rounded-2xl"
          style={{ backgroundColor: '#191A22', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{
              color: 'rgba(255,255,255,0.45)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span>Description</span>
            <span className="text-right">Credits</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Date</span>
          </div>
          {history && history.length > 0 ? (
            history.map((row, i) => (
              <div
                key={`${row.date}-${i}`}
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3 text-sm"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span style={{ color: '#E9E9F0' }}>
                  {row.invoice_url ? (
                    <a href={row.invoice_url} target="_blank" rel="noreferrer" className="hover:opacity-80">
                      {row.description ?? '—'}
                    </a>
                  ) : (
                    row.description ?? '—'
                  )}
                </span>
                <span className="text-right" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {row.credits ? `+${row.credits.toLocaleString()} Credits` : '—'}
                </span>
                <span className="text-right" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {row.amount_paid != null ? `$${row.amount_paid.toFixed(2)}` : '—'}
                </span>
                <span className="text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {new Date(row.date).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>
            ))
          ) : (
            <p className="px-5 py-6 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              No transactions yet.
            </p>
          )}
        </div>
      </section>

      {/* ── Danger zone ───────────────────────────────────────────── */}
      {isPaid ? (
        <section className="mt-12">
          <div
            className="rounded-3xl p-6"
            style={{
              border: '1px solid rgba(255,79,79,0.35)',
              backgroundColor: 'rgba(255,79,79,0.04)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: 'rgba(255,79,79,0.12)',
                  border: '1px solid rgba(255,79,79,0.3)',
                }}
                aria-hidden
              >
                <AlertTriangle className="h-4 w-4" style={{ color: '#FCA5A5' }} />
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-sm font-semibold" style={{ color: '#FCA5A5' }}>
                  Danger zone
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  Cancelling stops your monthly credit allowance and disables paid features at the end of the current billing period. Purchased credits remain on your account.
                </p>
              </div>
            </div>

            {cancelSuccess ? (
              <div
                className="mt-5 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm"
                style={{
                  border: '1px solid rgba(167,139,250,0.35)',
                  backgroundColor: 'rgba(167,139,250,0.08)',
                  color: '#D4C7FF',
                }}
              >
                <Check className="h-4 w-4" />
                Subscription cancelled. You&rsquo;ll keep access until the end of the current period.
              </div>
            ) : !showCancel ? (
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancel(true);
                    setCancelError(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#FCA5A5',
                    border: '1px solid rgba(255,79,79,0.5)',
                  }}
                >
                  Cancel subscription
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  Type <span style={{ color: '#FCA5A5', fontWeight: 600 }}>CANCEL</span> to confirm.
                </p>
                <input
                  type="text"
                  value={cancelInput}
                  onChange={(e) => {
                    setCancelInput(e.target.value);
                    if (cancelError) setCancelError(null);
                  }}
                  disabled={canceling}
                  className="h-10 rounded-full px-4 text-sm outline-none transition-colors disabled:opacity-60"
                  style={{
                    backgroundColor: '#0F1015',
                    color: '#E9E9F0',
                    border: '1px solid rgba(255,79,79,0.3)',
                    maxWidth: 240,
                  }}
                  placeholder="CANCEL"
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
                {cancelError ? (
                  <div
                    className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs"
                    style={{
                      border: '1px solid rgba(255,79,79,0.35)',
                      backgroundColor: 'rgba(255,79,79,0.08)',
                      color: '#FCA5A5',
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {cancelError}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancel(false);
                      setCancelInput('');
                      setCancelError(null);
                    }}
                    disabled={canceling}
                    className="rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:opacity-60"
                    style={{
                      color: 'rgba(255,255,255,0.65)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    Keep subscription
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSubscription}
                    disabled={canceling || cancelInput.trim().toUpperCase() !== 'CANCEL'}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      backgroundColor: '#7F1D1D',
                      color: '#FFFFFF',
                    }}
                  >
                    {canceling ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Cancelling
                      </>
                    ) : (
                      'Confirm cancel'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Auto-recharge toggle card. Lives in the billing side panel.
 *
 * When enabled, the credits-check edge function (Stripe webhook side)
 * auto-buys a credit pack as soon as the balance drops below
 * `threshold`. Defaults: threshold = 1000 credits, amount = $50.
 */
function AutoRechargeCard({
  initialEnabled,
  initialThreshold,
  initialAmountUsd,
  onSaved,
}: {
  initialEnabled: boolean;
  initialThreshold: number;
  initialAmountUsd: number;
  onSaved: (n: { enabled: boolean; threshold: number; amountUsd: number }) => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [amountUsd, setAmountUsd] = useState(initialAmountUsd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  async function save(next: { enabled: boolean; threshold: number; amountUsd: number }) {
    setSaving(true);
    setError(null);
    try {
      // The edge function expects `threshold_credits` + `pack_slug`.
      const { error: fnError } = await invokeFn('auto-topup', {
        method: 'POST',
        body: {
          enabled: next.enabled,
          threshold_credits: next.threshold,
          pack_slug: 'pack_3900',
        },
      });
      if (fnError) throw new Error(fnError.message || 'Save failed');
      onSaved(next);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1400);
    } catch (e) {
      // Revert UI so the toggle reflects the truth.
      setEnabled(initialEnabled);
      setThreshold(initialThreshold);
      setAmountUsd(initialAmountUsd);
      const raw = e instanceof Error ? e.message : 'Could not save';
      // Normalise gnarly backend errors into something a user can act on.
      let friendly = raw;
      if (/service[\s_]?role|missing_secret|not_configured/i.test(raw)) {
        friendly = 'Auto-recharge is temporarily unavailable.';
      } else if (/rate[\s_]?limit/i.test(raw)) {
        friendly = 'Too many changes in a row. Try again in a moment.';
      } else if (/unauthor/i.test(raw)) {
        friendly = 'Please sign in again and retry.';
      }
      setError(friendly);
    } finally {
      setSaving(false);
    }
  }

  function handleToggle() {
    if (saving) return;
    const next = !enabled;
    setEnabled(next);
    save({ enabled: next, threshold, amountUsd });
  }

  function handleBlurThreshold(raw: string) {
    if (saving) return;
    const parsed = Number(raw.replace(/[^0-9]/g, ''));
    const clamped = Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
    setThreshold(clamped);
    if (clamped !== initialThreshold) save({ enabled, threshold: clamped, amountUsd });
  }

  return (
    <div
      className="flex flex-1 flex-col rounded-3xl p-5"
      style={{ backgroundColor: '#191A22', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Auto-recharge
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Top up automatically when your balance gets low.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={saving}
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60"
          style={{
            backgroundColor: enabled ? '#A78BFA' : 'rgba(255,255,255,0.15)',
          }}
        >
          <span
            aria-hidden
            className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
            style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      <div
        className="mt-4 flex items-center gap-2"
        style={{ opacity: enabled ? 1 : 0.45 }}
      >
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
          When below
        </span>
        <input
          type="number"
          min={100}
          step={100}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value) || 0)}
          onBlur={(e) => handleBlurThreshold(e.target.value)}
          disabled={!enabled || saving}
          className="h-8 w-24 rounded-md px-2 text-xs outline-none transition-colors disabled:cursor-not-allowed"
          style={{
            backgroundColor: '#0F1015',
            color: '#E9E9F0',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
          credits → buy 3,900 ($39)
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-[11px]" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      ) : savedTick ? (
        <p
          className="mt-3 inline-flex items-center gap-1 text-[11px]"
          style={{ color: 'rgba(167,139,250,0.85)' }}
        >
          <Check className="h-3 w-3" />
          Saved
        </p>
      ) : saving ? (
        <p
          className="mt-3 inline-flex items-center gap-1 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
