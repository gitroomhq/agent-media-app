// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Device flow approval page for CLI authentication.
 *
 * URL: /device?code=ABCD-EFGH
 *
 * Flow:
 *   1. Extract user_code from URL search params
 *   2. If user is not logged in, redirect to /login with redirect back here
 *   3. Display the user_code prominently
 *   4. Ask user to enter the 6-digit confirmation code shown in their terminal
 *   5. On "Approve": POST to /functions/v1/device-token/approve
 *   6. Show success message: "CLI authorized! You can close this window."
 *
 * This page is the critical bridge between CLI auth and browser auth.
 * The device flow uses CSRF protection via a 6-digit confirmation code.
 */

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, Terminal, Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function DeviceAuthPageWrapper() {
  return (
    <div className="mx-auto w-full max-w-md">
      <Suspense
        fallback={
          <div className="rounded-lg border border-border bg-card p-8">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="mt-4 font-mono text-sm text-text-muted">
              Loading...
            </p>
          </div>
        </div>
      }
    >
      <DeviceAuthPage />
    </Suspense>
    </div>
  );
}

type DeviceState =
  | 'loading'
  | 'no-code'
  | 'unauthenticated'
  | 'ready'
  | 'approving'
  | 'denying'
  | 'approved'
  | 'denied'
  | 'error';

function DeviceAuthPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userCode = searchParams.get('code');

  const [state, setState] = useState<DeviceState>('loading');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    async function checkAuth() {
      if (!userCode) {
        setState('no-code');
        return;
      }

      // Validate user_code format: XXXX-XXXX (uppercase letters)
      if (!/^[A-Z]{4}-[A-Z]{4}$/.test(userCode)) {
        setState('error');
        setError('Invalid device code format. Expected: ABCD-EFGH');
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login, then come back here
        const redirectUrl = `/device?code=${userCode}`;
        router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
        return;
      }

      setUserEmail(user.email ?? null);
      setState('ready');
    }

    checkAuth();
  }, [userCode, router]);

  async function handleApprove() {
    if (!userCode) return;

    // Validate the confirmation code is 6 digits
    if (!/^\d{6}$/.test(confirmationCode)) {
      setError('Enter the 6-digit code from your terminal');
      return;
    }

    setState('approving');
    setError(null);

    try {
      const supabase = createClient();
      // getUser() forces a server round-trip and refreshes the token
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState('unauthenticated');
        return;
      }

      const response = await fetch('/api/device-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: userCode,
          confirmation_code: confirmationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          data.error_description ||
          data.error ||
          'Failed to approve device';

        // Provide user-friendly error messages
        if (data.error === 'not_found') {
          setError(
            'Device code not found. It may have expired. Run "agent-media login" again.',
          );
        } else if (data.error === 'invalid_code') {
          setError(
            'Confirmation code does not match. Check the code in your terminal.',
          );
        } else if (data.error === 'expired_token') {
          setError(
            'This device code has expired. Run "agent-media login" again.',
          );
        } else if (data.error === 'invalid_state') {
          setError('This device code has already been used.');
        } else {
          setError(message);
        }
        setState('ready');
        return;
      }

      setState('approved');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setState('ready');
    }
  }

  async function handleDeny() {
    setState('denied');
  }

  // Handle confirmation code input -- auto-format to digits only
  function handleCodeInput(value: string) {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
    setConfirmationCode(digitsOnly);
    setError(null);
  }

  // ── No Code State ─────────────────────────────────────────────────────────

  if (state === 'no-code') {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <h1 className="mt-4 text-xl font-semibold text-text">
            Missing Device Code
          </h1>
          <p className="mt-3 text-sm text-text-muted">
            No device code was provided. To authorize CLI access, run:
          </p>
          <div className="mt-4 w-full rounded-lg border border-border bg-background p-4">
            <p className="font-mono text-sm text-accent">
              $ agent-media login
            </p>
          </div>
          <p className="mt-3 text-sm text-text-muted">
            This will open a new browser window with the correct authorization
            link.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading State ─────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-4 font-mono text-sm text-text-muted">
            Verifying session...
          </p>
        </div>
      </div>
    );
  }

  // ── Approved State ────────────────────────────────────────────────────────

  if (state === 'approved') {
    return (
      <div className="rounded-lg border border-accent/30 bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent-dim">
            <Check className="h-7 w-7 text-accent" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[#121212]">
            CLI Authorized
          </h1>
          <p className="mt-3 text-sm text-text-muted">
            Your CLI session has been authorized. You can close this window.
          </p>
          <div className="mt-6 w-full rounded-lg border border-border bg-background p-4">
            <div className="space-y-1 font-mono text-xs">
              <p className="text-text-muted">
                <span className="text-accent">$</span> agent-media whoami
              </p>
              <p className="text-accent">
                {'  '}Logged in as {userEmail ?? 'user'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Denied State ──────────────────────────────────────────────────────────

  if (state === 'denied') {
    return (
      <div className="rounded-lg border border-danger/30 bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-danger/30 bg-danger/10">
            <X className="h-7 w-7 text-danger" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-danger">
            Access Denied
          </h1>
          <p className="mt-3 text-sm text-text-muted">
            The CLI authorization request was denied. You can safely close this
            window.
          </p>
          <p className="mt-2 text-sm text-text-muted">
            If this was a mistake, run{' '}
            <span className="font-mono text-accent">agent-media login</span>{' '}
            again.
          </p>
        </div>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────────────

  if (state === 'error' && !userCode) {
    return (
      <div className="rounded-lg border border-danger/30 bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-8 w-8 text-danger" />
          <h1 className="mt-4 text-xl font-semibold text-danger">Error</h1>
          <p className="mt-3 text-sm text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  // ── Ready State: Show approval form ───────────────────────────────────────

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <h1 className="text-xl font-semibold text-[#121212]">
        Authorize CLI Access
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        A CLI session is requesting access to your account
        {userEmail && (
          <>
            {' '}
            (<span className="font-mono text-text">{userEmail}</span>)
          </>
        )}
        .
      </p>

      {/* Device code display */}
      <div className="mt-6 rounded-lg border border-accent/30 bg-accent-dim p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">
          Device Code
        </p>
        <p className="mt-3 font-mono text-4xl font-bold tracking-[0.3em] text-accent">
          {userCode}
        </p>
        <p className="mt-2 font-mono text-xs text-text-muted">
          Verify this matches the code in your terminal
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3">
          <p className="font-mono text-xs text-danger">{error}</p>
        </div>
      )}

      {/* Confirmation code input */}
      <div className="mt-6">
        <label
          htmlFor="confirm"
          className="mb-1.5 block font-mono text-xs text-text-muted"
        >
          Enter the 6-digit confirmation code from your terminal
        </label>
        <input
          id="confirm"
          type="text"
          inputMode="numeric"
          value={confirmationCode}
          onChange={(e) => handleCodeInput(e.target.value)}
          placeholder="000000"
          maxLength={6}
          disabled={state === 'approving'}
          className="h-12 w-full rounded-md border border-border bg-background px-3 text-center font-mono text-2xl tracking-[0.5em] text-text placeholder:text-text-muted/30 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50"
          autoFocus
        />
        <p className="mt-1.5 font-mono text-xs text-text-muted">
          <Terminal className="mr-1 inline h-3 w-3" />
          This code was displayed when you ran{' '}
          <span className="text-accent">agent-media login</span>
        </p>
      </div>

      {/* Actions */}
      <div className="mt-8 flex gap-3">
        <Button
          className="flex-1"
          disabled={
            state === 'approving' || confirmationCode.length !== 6
          }
          onClick={handleApprove}
        >
          {state === 'approving' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Authorizing...
            </>
          ) : (
            'Approve'
          )}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={state === 'approving'}
          onClick={handleDeny}
        >
          Deny
        </Button>
      </div>

      <p className="mt-6 text-center font-mono text-xs text-text-muted">
        This code expires in 15 minutes
      </p>
    </div>
  );
}
