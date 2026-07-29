// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Invite code redemption page.
 *
 * Authenticated users enter a beta invite code to activate their
 * subscription. On success, redirects to /gallery after a brief delay.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Ticket, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';

export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ plan: string; credits: number } | null>(null);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();

      // Force token refresh
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to redeem an invite code.');
        return;
      }

      const { data, error: fnError } = await invokeFn('invite-redeem', {
        body: { code: trimmed },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to redeem invite code');
      }

      if (data?.success) {
        setSuccess({ plan: data.plan, credits: data.credits });

        // Redirect to gallery after 2 seconds
        setTimeout(() => {
          router.push('/gallery');
          router.refresh();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem invite code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent-dim">
            <Ticket className="h-6 w-6 text-accent" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[#121212]">
            Redeem Invite Code
          </h1>
          <p className="mt-3 text-sm text-text-muted">
            Enter your beta invite code to activate your account.
          </p>
        </div>

        {/* Success state */}
        {success && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <span className="font-mono text-sm font-semibold text-accent">
                Welcome to the beta!
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <p className="font-mono text-xs text-text-muted">
                Plan activated:{' '}
                <span className="text-text">{success.plan}</span>
              </p>
              <p className="font-mono text-xs text-text-muted">
                Credits allocated:{' '}
                <span className="text-text">
                  {success.credits.toLocaleString()}
                </span>
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-accent" />
              <span className="font-mono text-xs text-text-muted">
                Redirecting to gallery...
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mt-6 rounded-md border border-danger/30 bg-danger/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
              <p className="font-mono text-xs text-danger">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={handleRedeem} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="invite-code"
                className="mb-1.5 block font-mono text-xs text-text-muted"
              >
                Invite Code
              </label>
              <input
                id="invite-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="BETA-001"
                autoComplete="off"
                autoFocus
                disabled={loading}
                className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm tracking-wider text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Ticket className="mr-2 h-4 w-4" />
                  Redeem Code
                </>
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 rounded-lg border border-border bg-background p-4">
          <p className="text-xs text-text-muted">
            Don&apos;t have an invite code? Contact us at{' '}
            <a
              href="mailto:beta@agent-media.ai"
              className="text-[#121212] transition-colors hover:underline"
            >
              beta@agent-media.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
