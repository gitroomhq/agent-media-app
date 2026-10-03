'use client';

// Exit-intent offer on the plan pages: 30% off the first month of any plan.
// Desktop: mouse leaves through the top of the window. Phones: 25s idle.
// Also shown once when the user clicks Log out. Once per browser.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { EXIT_OFFER_IDLE_MS, EXIT_OFFER_SEEN_KEY, exitIntentFrom } from '@/lib/exit-offer';

export interface ExitOfferPlan {
  tier: string;
  name: string;
  priceMonthly: number;
}

function seen(): boolean {
  try {
    return window.localStorage.getItem(EXIT_OFFER_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(EXIT_OFFER_SEEN_KEY, '1');
  } catch {
    /* storage blocked: shows again next visit, harmless */
  }
}

const fmt = (n: number) => `$${(Math.round(n * 70) / 100).toFixed(2)}`;

export function useExitOffer(busy: boolean) {
  const [open, setOpen] = useState(false);
  const shown = useRef(false);

  const trigger = useCallback(
    (signal: Parameters<typeof exitIntentFrom>[0]) => {
      if (!exitIntentFrom({ ...signal, alreadyShown: shown.current || seen(), busy } as Parameters<typeof exitIntentFrom>[0])) {
        return false;
      }
      shown.current = true;
      markSeen();
      setOpen(true);
      return true;
    },
    [busy],
  );

  useEffect(() => {
    const onOut = (e: MouseEvent) =>
      trigger({ kind: 'mouseout', clientY: e.clientY, toElement: e.relatedTarget, alreadyShown: false, busy: false });
    document.addEventListener('mouseout', onOut);
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;
    const idle = touch ? window.setTimeout(() => trigger({ kind: 'idle', alreadyShown: false, busy: false }), EXIT_OFFER_IDLE_MS) : undefined;
    return () => {
      document.removeEventListener('mouseout', onOut);
      if (idle) window.clearTimeout(idle);
    };
  }, [trigger]);

  /** Returns true when the offer took over the Log out click. */
  const interceptLogout = useCallback(() => trigger({ kind: 'logout', alreadyShown: false, busy: false }), [trigger]);

  return { open, setOpen, interceptLogout };
}

export function ExitOfferModal({
  plans,
  loadingTier,
  onAccept,
  onClose,
  dark = false,
}: {
  plans: ExitOfferPlan[];
  loadingTier: string | null;
  onAccept: (tier: string) => void;
  onClose: () => void;
  dark?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-offer-title"
      data-testid="exit-offer"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md rounded-3xl p-6 shadow-2xl ${dark ? 'bg-[#121212] text-white' : 'bg-white text-black'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute right-4 top-4 rounded-full p-1 ${dark ? 'text-white/60 hover:text-white' : 'text-black/50 hover:text-black'}`}
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9162FF]">Before you go</p>
        <h2 id="exit-offer-title" className="mt-2 text-2xl font-bold tracking-[-0.02em]">
          30% off your first month
        </h2>
        <p className={`mt-2 text-sm ${dark ? 'text-white/70' : 'text-black/60'}`}>
          Pick any plan. The discount applies to your first month, then it&apos;s the regular price. Cancel anytime.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {plans.map((p) => (
            <button
              key={p.tier}
              type="button"
              disabled={loadingTier !== null}
              onClick={() => onAccept(p.tier)}
              className={`flex h-14 items-center justify-between rounded-2xl px-4 text-left transition-colors disabled:opacity-60 ${
                dark ? 'border border-white/15 hover:border-[#9162FF]' : 'border border-black/10 hover:border-[#9162FF]'
              }`}
            >
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="flex items-center gap-2 text-sm">
                {loadingTier === p.tier ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className={dark ? 'text-white/40 line-through' : 'text-black/40 line-through'}>${p.priceMonthly}</span>
                <span className="font-bold">{fmt(p.priceMonthly)}</span>
                <span className={dark ? 'text-white/50' : 'text-black/50'}>first month</span>
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`mt-4 w-full text-center text-xs underline underline-offset-4 ${dark ? 'text-white/50' : 'text-black/50'}`}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
