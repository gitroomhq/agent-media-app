// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Billing dashboard page.
 *
 * Displays the user's current plan, credit balances, plan comparison,
 * and billing history. All data is fetched client-side via the Supabase
 * edge functions (credits-check) and direct table queries.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Zap,
  Check,
  Clock,
  AlertCircle,
  Sparkles,
  BarChart3,
  Coins,
  TrendingUp,
  CreditCard,
  ExternalLink,
  Settings,
  Bell,
  Plus,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { analytics } from '@/lib/analytics';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BillingState {
  user_id: string;
  plan: {
    tier: string;
    name: string;
    status: string;
    cancel_at_period_end: boolean;
    trial_active: boolean;
    trial_ends_at: string | null;
    current_period_end: string | null;
  };
  credits: {
    monthly_remaining: number;
    purchased: number;
    total: number;
  };
  limits: {
    max_concurrent_jobs: number;
    max_video_duration: number;
    models_available: string[];
  };
}

interface MonthlyStats {
  jobCount: number;
  creditsUsed: number;
  avgCostPerJob: number;
}

interface Invoice {
  date: string;
  amount_paid: number;
  currency: string;
  status: string;
  invoice_url: string | null;
  description: string;
  credits: number | null;
}

interface PaymentMethod {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

interface BillingHistory {
  invoices: Invoice[];
  payment_method: PaymentMethod | null;
}

// ── Plan Configuration (mirrors stripe-config.ts for display) ──────────────

interface PlanDisplay {
  tier: string;
  name: string;
  priceMonthly: number;
  credits: number;
  creditsLabel: string;
  features: string[];
}

const PLAN_DISPLAY: PlanDisplay[] = [
  {
    tier: 'starter',
    name: 'Creator',
    priceMonthly: 39,
    credits: 3900,
    creditsLabel: '/month',
    features: [
      '3,900 credits/month',
      'Up to 10s videos',
    ],
  },
  {
    tier: 'creator',
    name: 'Pro',
    priceMonthly: 69,
    credits: 6900,
    creditsLabel: '/month',
    features: [
      '6,900 credits/month',
      'Up to 15s videos',
    ],
  },
  {
    tier: 'pro_plus',
    name: 'Pro Plus',
    priceMonthly: 129,
    credits: 12900,
    creditsLabel: '/month',
    features: [
      '12,900 credits/month',
      'Up to 15s videos',
      'Early access to improved UGC tools',
    ],
  },
];

// Map plan tiers to checkout API tiers
const CHECKOUT_TIER_MAP: Record<string, string> = {
  starter: 'starter',
  creator: 'creator',
  pro_plus: 'pro_plus',
};

/**
 * PAYG credit top-up presets.
 *
 * Ratio: 100 credits per USD ($1 = 100 credits).
 * Minimum purchase: $50 (5,000 credits). Server enforces this floor.
 */
interface CreditPreset {
  usd: number;
  credits: number;
}
const CREDIT_PRESETS: CreditPreset[] = [
  { usd: 50, credits: 5_000 },
  { usd: 100, credits: 10_000 },
  { usd: 300, credits: 30_000 },
  { usd: 1000, credits: 100_000 },
  { usd: 2000, credits: 200_000 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function usagePercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function usageBarColor(percent: number): string {
  if (percent >= 90) return 'bg-danger';
  if (percent >= 70) return 'bg-warning';
  return 'bg-accent';
}

function statusBadgeVariant(
  status: string,
  cancelAtPeriodEnd: boolean,
): 'live' | 'soon' | 'default' | 'video' {
  if (cancelAtPeriodEnd) return 'soon';
  switch (status) {
    case 'active':
      return 'live';
    case 'trialing':
      return 'soon';
    case 'expired':
    case 'canceled':
    case 'past_due':
      return 'default';
    default:
      return 'default';
  }
}

function statusBadgeLabel(status: string, cancelAtPeriodEnd: boolean): string {
  if (cancelAtPeriodEnd) return 'CANCELING';
  if (status === 'expired') return 'EXPIRED';
  return status.toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelInput, setCancelInput] = useState('');
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
    jobCount: 0,
    creditsUsed: 0,
    avgCostPerJob: 0,
  });
  const [billingHistory, setBillingHistory] = useState<BillingHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedPaygUsd, setSelectedPaygUsd] = useState<number>(CREDIT_PRESETS[1].usd);
  const [paygLoading, setPaygLoading] = useState(false);
  const [paygSuccess, setPaygSuccess] = useState<string | null>(null);

  // Auto-recharge settings — loaded from auto_topup_config, saved on modal close
  const [autoRechargeOpen, setAutoRechargeOpen] = useState(false);
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeThreshold, setAutoRechargeThreshold] = useState(1000);
  const [autoRechargeAmountUsd, setAutoRechargeAmountUsd] = useState(50);
  const [autoRechargeSaving, setAutoRechargeSaving] = useState(false);

  // Low balance email alerts — loaded from low_balance_alerts, saved on modal close
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(1000);
  const [lowBalanceEmail, setLowBalanceEmail] = useState('');
  const [lowBalanceSaving, setLowBalanceSaving] = useState(false);
  const fetchBillingData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Force token refresh via getUser() before any edge function calls
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to view billing information.');
        setLoading(false);
        return;
      }

      // Fetch billing + monthly stats in parallel (saves ~300ms)
      const firstOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      );

      const [billingResult, monthJobsResult] = await Promise.all([
        invokeFn('credits-check', { method: 'GET' }),
        supabase
          .from('generation_jobs')
          .select('id, credit_cost, status')
          .gte('created_at', firstOfMonth.toISOString())
          .is('deleted_at', null),
      ]);

      if (billingResult.error) {
        throw new Error(billingResult.error.message || 'Failed to load billing data');
      }

      setBilling(billingResult.data as BillingState);

      const monthJobs = monthJobsResult.data;
      if (monthJobs) {
        const jobCount = monthJobs.length;
        const creditsUsed = monthJobs.reduce(
          (sum, j) => sum + (j.credit_cost ?? 0),
          0,
        );
        const avgCostPerJob = jobCount > 0 ? creditsUsed / jobCount : 0;
        setMonthlyStats({ jobCount, creditsUsed, avgCostPerJob });
      }

      // Fetch billing history (invoices + payment method) in background
      setHistoryLoading(true);
      invokeFn('billing-history', { method: 'GET' })
        .then(({ data: histData }) => {
          if (histData && !histData.error) {
            setBillingHistory(histData as BillingHistory);
          }
        })
        .finally(() => setHistoryLoading(false));

    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load billing data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    analytics.init();
    analytics.trackEvent('billing_viewed');
  }, []);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  // Load auto-recharge + low-balance config on mount.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [topupRes, alertRes] = await Promise.all([
        supabase
          .from('auto_topup_config')
          .select('enabled, threshold_credits, topup_amount_cents')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('low_balance_alerts')
          .select('threshold_credits, email')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (topupRes.data) {
        setAutoRechargeEnabled(topupRes.data.enabled ?? false);
        setAutoRechargeThreshold(topupRes.data.threshold_credits ?? 1000);
        if (topupRes.data.topup_amount_cents) {
          setAutoRechargeAmountUsd(topupRes.data.topup_amount_cents / 100);
        }
      }
      if (alertRes.data) {
        setLowBalanceThreshold(alertRes.data.threshold_credits ?? 1000);
        setLowBalanceEmail(alertRes.data.email ?? '');
      } else if (user.email) {
        setLowBalanceEmail(user.email);
      }
    })();
  }, []);

  async function saveAutoRecharge() {
    setAutoRechargeSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { error: upsertError } = await supabase
        .from('auto_topup_config')
        .upsert({
          user_id: user.id,
          enabled: autoRechargeEnabled,
          threshold_credits: autoRechargeThreshold,
          topup_amount_cents: autoRechargeAmountUsd * 100,
          pack_slug: null,
        }, { onConflict: 'user_id' });

      if (upsertError) throw new Error(upsertError.message);
      setAutoRechargeOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save auto-recharge');
    } finally {
      setAutoRechargeSaving(false);
    }
  }

  async function saveLowBalanceAlert() {
    setLowBalanceSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      if (!lowBalanceEmail) throw new Error('Email is required');

      const { error: upsertError } = await supabase
        .from('low_balance_alerts')
        .upsert({
          user_id: user.id,
          threshold_credits: lowBalanceThreshold,
          email: lowBalanceEmail,
        }, { onConflict: 'user_id' });

      if (upsertError) throw new Error(upsertError.message);
      setLowBalanceOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alert');
    } finally {
      setLowBalanceSaving(false);
    }
  }

  async function removeLowBalanceAlert() {
    setLowBalanceSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('low_balance_alerts').delete().eq('user_id', user.id);
      setLowBalanceEmail('');
      setLowBalanceOpen(false);
    } finally {
      setLowBalanceSaving(false);
    }
  }

  // Detect PAYG success return from Stripe: show banner, strip query params.
  // Webhook may lag a few seconds, so we refetch once immediately and
  // once again after a short delay to catch the balance update.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success' && params.get('type') === 'payg') {
      setPaygSuccess(
        'Payment successful. Credits will appear in your balance within a few seconds.',
      );
      analytics.trackEvent('payg_purchase_completed');
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('type');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
      const refetchTimer = setTimeout(fetchBillingData, 3000);
      return () => clearTimeout(refetchTimer);
    }
  }, [fetchBillingData]);

  async function handleBuyCredits(usd: number) {
    setPaygLoading(true);
    setPaygSuccess(null);
    setError(null);
    analytics.trackEvent('payg_purchase_initiated', { amount_usd: usd });

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to purchase credits.');
        return;
      }

      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;

      const { data, error: fnError } = await invokeFn('checkout', {
        body: {
          amount_cents: usd * 100,
          ...(dubId ? { dub_id: dubId } : {}),
        },
      });

      if (fnError) {
        const detail = data?.error_description ?? fnError.message ?? 'Checkout failed';
        throw new Error(detail);
      }
      if (data?.error) {
        throw new Error(data.error_description ?? data.error);
      }
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      throw new Error('Checkout URL missing from response');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setError(message);
    } finally {
      setPaygLoading(false);
    }
  }

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    analytics.trackEvent('plan_change_initiated', { target_tier: tier });

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to make a purchase.');
        return;
      }

      // Capture dub.co affiliate click ID from cookie (set by analytics script)
      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;

      const { data, error: fnError } = await invokeFn('checkout', {
        body: { plan_tier: tier, ...(dubId ? { dub_id: dubId } : {}) },
      });

      if (fnError) {
        // The response body may contain a more specific error
        const detail = data?.error_description ?? fnError.message ?? 'Checkout failed';
        throw new Error(detail);
      }

      if (data?.error) {
        throw new Error(data.error_description ?? data.error);
      }

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data?.upgraded) {
        // Plan was upgraded in-place via Stripe API (no redirect needed)
        setError(null);
        fetchBillingData();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Checkout failed';
      setError(message);
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleCancelSubscription() {
    setCancelLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await invokeFn('cancel-subscription', {
        body: {},
      });

      if (fnError) throw new Error(fnError.message || 'Failed to cancel subscription');
      if (data?.error) throw new Error(data.error_description || data.error);

      setShowCancelConfirm(false);
      setCancelInput('');
      fetchBillingData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to cancel subscription',
      );
    } finally {
      setCancelLoading(false);
    }
  }

  // ── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-text">Billing</h1>
        <p className="mt-2 text-sm text-text-muted">
          Manage your plan and credits
        </p>
        <div className="mt-12 flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-4 text-sm text-text-muted">
            Loading billing data...
          </p>
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (error && !billing) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-text">Billing</h1>
        <p className="mt-2 text-sm text-text-muted">
          Manage your plan and credits
        </p>
        <div className="mt-12 flex flex-col items-center justify-center py-20">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
            <AlertCircle className="mx-auto h-8 w-8 text-danger" />
          </div>
          <p className="mt-4 text-sm text-danger">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={fetchBillingData}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!billing) return null;

  // ── Derived Values ─────────────────────────────────────────────────────────

  const currentPlan = PLAN_DISPLAY.find((p) => p.tier === billing.plan.tier);
  const monthlyAllowance = currentPlan?.credits ?? 0;
  const monthlyUsed = monthlyAllowance - billing.credits.monthly_remaining;
  const usagePct = usagePercent(monthlyUsed, monthlyAllowance);
  const trialDaysLeft = billing.plan.trial_ends_at
    ? daysUntil(billing.plan.trial_ends_at)
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text">Billing</h1>
      <p className="mt-2 text-sm text-text-muted">
        Manage your plan and credits
      </p>

      {/* Inline error banner */}
      {error && (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {/* PAYG purchase success banner */}
      {paygSuccess && (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-accent" />
              <p className="text-xs text-accent">{paygSuccess}</p>
            </div>
            <button
              onClick={() => setPaygSuccess(null)}
              className="text-xs text-text-muted hover:text-text"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Add Credits heading (spans both columns) ─────────────────── */}
      <div className="mt-8 mb-5">
        <h2 className="text-2xl font-bold text-text">Add Credits</h2>
        <p className="mt-1 text-sm text-text-muted">
          Top up your account. Purchased credits never expire.
        </p>
      </div>

      {/* ── Section: Add Credits (main) + Account Balance sidebar ────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: Add Credits card (spans 2/3) */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="mb-6 text-sm font-semibold text-text">Select an amount</p>

            <div className="grid grid-cols-3 gap-4">
              {CREDIT_PRESETS.map((preset) => {
                const isSelected = selectedPaygUsd === preset.usd;
                return (
                  <button
                    key={preset.usd}
                    type="button"
                    onClick={() => setSelectedPaygUsd(preset.usd)}
                    disabled={paygLoading}
                    className={`relative flex flex-col items-center justify-center rounded-2xl border-2 bg-background px-6 py-8 transition-all ${
                      isSelected
                        ? 'border-text shadow-md'
                        : 'border-border hover:border-border-bright/60'
                    } disabled:opacity-60`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-text">
                        <Check className="h-4 w-4 text-background" strokeWidth={3} />
                      </div>
                    )}
                    <p className="font-sans text-3xl font-bold text-text">
                      ${preset.usd}
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium text-text-muted">
                      Get {preset.credits.toLocaleString()} Credits
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-muted">Payment Method</span>
                <span className="inline-flex w-fit items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-text">
                  stripe
                </span>
              </div>
              <Button
                size="lg"
                onClick={() => handleBuyCredits(selectedPaygUsd)}
                disabled={paygLoading}
                className="h-12 rounded-full bg-text px-8 text-background hover:bg-text/90"
              >
                {paygLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening checkout...
                  </>
                ) : (
                  <>
                    Buy (Get{' '}
                    {CREDIT_PRESETS.find((p) => p.usd === selectedPaygUsd)
                      ?.credits.toLocaleString() ?? ''}{' '}
                    Credits)
                  </>
                )}
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-text-muted">
              By clicking Buy, you agree to our{' '}
              <Link href="/terms" className="underline hover:text-text">
                Terms of Service
              </Link>
              . All purchases are final.
            </p>
          </div>
        </div>

        {/* RIGHT: Sidebar — Account Balance + Low Balance + Current Plan */}
        <div className="space-y-3 self-start">
          {/* Account Balance — big number, minimal */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Account Balance
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-5xl font-bold leading-none text-text">
                {billing.credits.total.toLocaleString()}
              </span>
              <span className="text-sm text-text-muted">Credits</span>
            </div>
            <div className="mt-3 space-y-0.5 text-[11px] text-text-muted">
              <p>
                {billing.credits.monthly_remaining.toLocaleString()} monthly remaining
              </p>
              <p>
                {billing.credits.purchased.toLocaleString()} purchased (never expires)
              </p>
            </div>
          </div>

          {/* Low Balance Alert */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-text-muted" />
              <h3 className="text-sm font-semibold text-text">Low Balance Alert</h3>
            </div>
            {lowBalanceEmail ? (
              <div className="mt-3 text-xs text-text-muted">
                <p>
                  Alert at{' '}
                  <span className="font-semibold text-text">
                    {lowBalanceThreshold.toLocaleString()} credits
                  </span>
                </p>
                <p className="mt-1 truncate">{lowBalanceEmail}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-text-muted">
                Get an email when your balance drops low.
              </p>
            )}
            <button
              onClick={() => setLowBalanceOpen(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-text hover:border-border-bright/60"
            >
              <Plus className="h-3 w-3" />
              {lowBalanceEmail ? 'Update alert' : 'Add reminder'}
            </button>
          </div>

          {/* Current Plan mini card — tightened */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                  Current Plan
                </p>
                <p className="mt-1.5 text-base font-bold text-text">{billing.plan.name}</p>
                {currentPlan && currentPlan.priceMonthly > 0 && (
                  <p className="mt-0.5 text-xs text-text-muted">
                    ${currentPlan.priceMonthly}/mo
                  </p>
                )}
              </div>
              <Badge variant={statusBadgeVariant(billing.plan.status, billing.plan.cancel_at_period_end)}>
                {statusBadgeLabel(billing.plan.status, billing.plan.cancel_at_period_end)}
              </Badge>
            </div>
            {billing.plan.status === 'active' && !billing.plan.cancel_at_period_end && billing.plan.current_period_end && (
              <p className="mt-2 text-xs text-text-muted">
                Renews {formatDate(billing.plan.current_period_end)}
              </p>
            )}
            {billing.plan.tier !== 'free' && billing.plan.status === 'active' && !billing.plan.cancel_at_period_end && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="mt-2 text-xs text-text-muted underline hover:text-danger"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Auto-Recharge full-width strip ─────────────────────────────── */}
      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold text-text">Auto-Recharge</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              autoRechargeEnabled
                ? 'border-green-600/30 bg-green-600/10 text-green-700'
                : 'border-red-600/30 bg-red-600/10 text-red-700'
            }`}
          >
            {autoRechargeEnabled ? 'ENABLED' : 'OFF'}
          </span>
          {autoRechargeEnabled ? (
            <>
              <span className="text-border">·</span>
              <span>Below {autoRechargeThreshold.toLocaleString()} credits</span>
              <span className="text-border">·</span>
              <span>Recharge ${autoRechargeAmountUsd}</span>
            </>
          ) : (
            <>
              <span className="text-border">·</span>
              <span>Automatically top up when balance runs low</span>
            </>
          )}
        </div>
        <button
          onClick={() => setAutoRechargeOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text hover:border-border-bright/60"
        >
          <Settings className="h-3 w-3" />
          {autoRechargeEnabled ? 'Settings' : 'Enable'}
        </button>
      </div>

      {/* ── Section 2: Plan Comparison ─────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          Choose Your Plan
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PLAN_DISPLAY.map((plan, idx) => {
            const isCurrent = billing.plan.tier === plan.tier;
            const currentIdx = PLAN_DISPLAY.findIndex((p) => p.tier === billing.plan.tier);
            const isDowngrade = currentIdx >= 0 && idx < currentIdx;
            return (
              <div
                key={plan.tier}
                className={`relative flex flex-col rounded-lg border p-5 transition-all ${
                  isCurrent
                    ? 'border-accent/60 bg-accent/5'
                    : 'border-border bg-card hover:border-border-bright/30'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-4">
                    <Badge variant="live" className="border-transparent bg-accent text-background font-bold uppercase tracking-widest">CURRENT</Badge>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-text">
                  {plan.name}
                </h3>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-text">
                    ${plan.priceMonthly}
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    /mo
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span className="font-mono text-sm text-accent">
                    {plan.credits.toLocaleString()} credits
                  </span>
                  <span className="font-mono text-[10px] text-text-muted">
                    {plan.creditsLabel}
                  </span>
                </div>

                <ul className="mt-4 flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-xs text-text-muted"
                    >
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent/60" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isCurrent ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled
                    >
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!!checkoutLoading}
                      onClick={() =>
                        handleCheckout(
                          CHECKOUT_TIER_MAP[plan.tier] ?? plan.tier,
                        )
                      }
                    >
                      {checkoutLoading ===
                      (CHECKOUT_TIER_MAP[plan.tier] ?? plan.tier) ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-3 w-3" />
                          {isDowngrade ? 'Change' : 'Upgrade'}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Payment History ──────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-text">Payment History</h2>
        <div className="mt-2 border-b border-border pb-2">
          <p className="text-sm text-text-muted">
            All credit purchases and subscription invoices
          </p>
        </div>
        <div className="mt-4">
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading invoices...
            </div>
          ) : billingHistory && billingHistory.invoices.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-muted">Credits</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-muted">Amount</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Date</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistory.invoices.map((inv, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm text-text">{inv.description}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {inv.credits ? (
                          <span className="font-semibold text-accent">
                            +{inv.credits.toLocaleString()} Credits
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-text">
                        ${inv.amount_paid.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {formatDate(inv.date)}
                      </td>
                      <td className="px-4 py-3">
                        {inv.invoice_url && (
                          <a
                            href={inv.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-muted">No invoices yet.</p>
          )}
        </div>
      </section>

      {/* Auto-Recharge Settings Modal */}
      {autoRechargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-text-muted" />
                <h3 className="text-lg font-semibold text-text">Auto-Recharge Settings</h3>
              </div>
              <button
                onClick={() => setAutoRechargeOpen(false)}
                className="text-text-muted hover:text-text"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5 px-6 py-5">
              <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                <p className="text-xs text-text">
                  <span className="font-semibold">Auto-recharge</span> uses the same card as your
                  last purchase. Card-only, USD-only.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">Enable Auto-Recharge</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Automatically recharge when balance falls below threshold
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={autoRechargeEnabled}
                  onClick={() => setAutoRechargeEnabled(!autoRechargeEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                    autoRechargeEnabled ? 'bg-accent' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow-md transition-transform ${
                      autoRechargeEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {autoRechargeEnabled && (
                <button
                  onClick={() => {
                    setAutoRechargeEnabled(false);
                  }}
                  className="text-[11px] text-danger underline hover:text-danger/80"
                >
                  Disable auto-recharge
                </button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-text">Threshold</label>
                  <input
                    type="number"
                    value={autoRechargeThreshold}
                    onChange={(e) => setAutoRechargeThreshold(Math.max(0, Number(e.target.value)))}
                    min={100}
                    max={50000}
                    step={100}
                    disabled={!autoRechargeEnabled}
                    className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-text focus:outline-none disabled:opacity-50"
                  />
                  <p className="mt-1 text-[10px] text-text-muted">
                    Trigger when credits fall below this
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text">Recharge Amount</label>
                  <select
                    value={autoRechargeAmountUsd}
                    onChange={(e) => setAutoRechargeAmountUsd(Number(e.target.value))}
                    disabled={!autoRechargeEnabled}
                    className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-text focus:outline-none disabled:opacity-50"
                  >
                    {CREDIT_PRESETS.map((p) => (
                      <option key={p.usd} value={p.usd}>
                        ${p.usd} ({p.credits.toLocaleString()} credits)
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-text-muted">
                    Amount added when triggered
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAutoRechargeOpen(false)}
                disabled={autoRechargeSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveAutoRecharge}
                disabled={autoRechargeSaving}
              >
                {autoRechargeSaving ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Low Balance Alert Modal */}
      {lowBalanceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-text-muted" />
                <h3 className="text-lg font-semibold text-text">Low Balance Alert</h3>
              </div>
              <button
                onClick={() => setLowBalanceOpen(false)}
                className="text-text-muted hover:text-text"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="text-xs font-semibold text-text">Email</label>
                <input
                  type="email"
                  value={lowBalanceEmail}
                  onChange={(e) => setLowBalanceEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-text focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text">
                  Alert when balance falls below
                </label>
                <input
                  type="number"
                  value={lowBalanceThreshold}
                  onChange={(e) => setLowBalanceThreshold(Math.max(0, Number(e.target.value)))}
                  min={100}
                  step={100}
                  className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-text-muted">Credits</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              {lowBalanceEmail ? (
                <button
                  onClick={removeLowBalanceAlert}
                  disabled={lowBalanceSaving}
                  className="text-xs text-danger underline hover:text-danger/80 disabled:opacity-50"
                >
                  Remove alert
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLowBalanceOpen(false)}
                  disabled={lowBalanceSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveLowBalanceAlert}
                  disabled={lowBalanceSaving}
                >
                  {lowBalanceSaving ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text">Cancel Subscription</h3>
            <p className="mt-2 text-sm text-text-muted">
              Your plan will remain active until the end of the current billing period.
              To confirm, type <span className="font-mono font-semibold text-text">cancel my subscription</span> below.
            </p>
            <input
              type="text"
              value={cancelInput}
              onChange={(e) => setCancelInput(e.target.value)}
              placeholder="Type 'cancel my subscription'"
              className="mt-4 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-danger focus:outline-none"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={handleCancelSubscription}
                disabled={cancelLoading || cancelInput !== 'cancel my subscription'}
                className="text-xs text-text-muted underline hover:text-danger disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
              >
                {cancelLoading ? 'Canceling...' : 'Continue cancellation'}
              </button>
              <Button
                size="sm"
                onClick={() => { setShowCancelConfirm(false); setCancelInput(''); }}
                disabled={cancelLoading}
              >
                Keep plan
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
