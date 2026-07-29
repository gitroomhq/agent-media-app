// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * OAuth consent screen — the last missing piece of the hosted MCP connector.
 *
 * URL: /oauth/consent?authorization_id=…
 *
 * Supabase's OAuth 2.1 server owns the tokens but delegates the consent UI to
 * us, so this is where a user actually says "yes, let this AI use my account".
 * The flow that ends here:
 *   agent hits api.agent-media.ai/mcp → 401 names our authorization server →
 *   agent registers itself → browser opens /authorize → Supabase sends the user
 *   HERE → approve → back to the agent with a code → tokens.
 *
 * Deny is a first-class outcome, not an afterthought: an agent asking for access
 * the user does not want must be refusable in one click.
 */

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, Check, X, AlertTriangle, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type ConsentState =
  | 'loading'
  | 'no-id'
  | 'unauthenticated'
  | 'ready'
  | 'approving'
  | 'denying'
  | 'denied'
  | 'error';

interface AuthorizationDetails {
  client?: { name?: string; client_name?: string; client_id?: string };
  client_name?: string;
  scopes?: string[];
  scope?: string;
  redirect_uri?: string;
}

/** What the connector is asking for, in words a person can act on. */
const SCOPE_LABELS: Record<string, string> = {
  openid: 'Confirm who you are',
  email: 'See your email address',
  profile: 'See your basic profile',
};

export default function OAuthConsentPageWrapper() {
  return (
    <div className="mx-auto w-full max-w-md">
      <Suspense
        fallback={
          <div className="rounded-lg border border-border bg-card p-8">
            <div className="flex flex-col items-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="mt-4 font-mono text-sm text-text-muted">Loading…</p>
            </div>
          </div>
        }
      >
        <OAuthConsentPage />
      </Suspense>
    </div>
  );
}

function OAuthConsentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const authorizationId = searchParams.get('authorization_id') ?? '';

  const [state, setState] = useState<ConsentState>('loading');
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!authorizationId) {
        setState('no-id');
        return;
      }

      // getUser() forces a server round-trip, so an expired cookie is caught
      // here rather than at approve time.
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
        router.push(`/login?redirect=${encodeURIComponent(back)}`);
        setState('unauthenticated');
        return;
      }

      try {
        const resp = await fetch(
          `/api/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
          { cache: 'no-store' },
        );
        const data = (await resp.json()) as AuthorizationDetails & { error?: string };
        if (cancelled) return;

        if (!resp.ok) {
          setErrorMessage(
            data.error === 'not_authenticated'
              ? 'Your session expired. Sign in and try connecting again.'
              : 'This authorization link is no longer valid. Start the connection again from your AI assistant.',
          );
          setState('error');
          return;
        }
        setDetails(data);
        setState('ready');
      } catch {
        if (cancelled) return;
        setErrorMessage('Could not reach agent-media. Check your connection and try again.');
        setState('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorizationId, router]);

  async function decide(action: 'approve' | 'deny') {
    setState(action === 'approve' ? 'approving' : 'denying');
    try {
      const resp = await fetch('/api/oauth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorization_id: authorizationId, action }),
      });
      const data = (await resp.json()) as { redirect_url?: string; error?: string };

      if (!resp.ok || !data.redirect_url) {
        setErrorMessage(
          action === 'approve'
            ? 'Could not complete the connection. Start it again from your AI assistant.'
            : 'Could not cancel cleanly — you can safely close this window; nothing was connected.',
        );
        setState(action === 'approve' ? 'error' : 'denied');
        return;
      }

      // Hand control back to the agent's callback.
      window.location.href = data.redirect_url;
    } catch {
      setErrorMessage('Could not reach agent-media. Check your connection and try again.');
      setState('error');
    }
  }

  const clientName =
    details?.client?.client_name ??
    details?.client?.name ??
    details?.client_name ??
    'An AI assistant';

  const scopes =
    details?.scopes ?? (typeof details?.scope === 'string' ? details.scope.split(/\s+/) : []);

  if (state === 'loading' || state === 'unauthenticated') {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-4 font-mono text-sm text-text-muted">Checking your account…</p>
        </div>
      </div>
    );
  }

  if (state === 'no-id') {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <h1 className="mt-4 text-lg font-semibold">Nothing to connect</h1>
          <p className="mt-2 text-sm text-text-muted">
            Open this page from your AI assistant when it asks to connect to agent-media.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <h1 className="mt-4 text-lg font-semibold">Connection failed</h1>
          <p className="mt-2 text-sm text-text-muted">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center text-center">
          <X className="h-8 w-8 text-text-muted" />
          <h1 className="mt-4 text-lg font-semibold">Not connected</h1>
          <p className="mt-2 text-sm text-text-muted">
            {errorMessage || 'Nothing was shared. You can close this window.'}
          </p>
        </div>
      </div>
    );
  }

  const busy = state === 'approving' || state === 'denying';

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <Video className="h-6 w-6 text-accent" />
        </div>

        <h1 className="mt-4 text-xl font-semibold">
          Connect {clientName} to agent-media?
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          It will be able to make videos on your account and spend your credits.
        </p>
      </div>

      <div className="mt-6 rounded-md border border-border bg-background p-4 text-left">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          What it can do
        </p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>Create videos and see the ones it created</span>
          </li>
          <li className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>Use your credits to pay for them</span>
          </li>
          {scopes
            .filter((s) => SCOPE_LABELS[s])
            .map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{SCOPE_LABELS[s]}</span>
              </li>
            ))}
        </ul>
        <p className="mt-4 text-xs text-text-muted">
          You are always shown the price before any credits are spent. You can disconnect
          at any time from your account settings.
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => void decide('deny')}
          disabled={busy}
        >
          {state === 'denying' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
        </Button>
        <Button className="flex-1" onClick={() => void decide('approve')} disabled={busy}>
          {state === 'approving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Connect'
          )}
        </Button>
      </div>
    </div>
  );
}
