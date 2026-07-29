// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Settings page with profile management, API key management,
 * preferences, connected accounts, and danger zone.
 *
 * API keys are managed via the apikey-manage edge function.
 * Keys are displayed with a masked prefix and can be
 * copied to the clipboard via a terminal-style interaction.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  CheckCheck,
  Key,
  Loader2,
  AlertCircle,
  Trash2,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApiKeyRecord {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Provider display helpers ───────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email (OTP)',
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

// ── SVG icons for providers ────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyFull, setNewKeyFull] = useState<string | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);

  // Revoke state
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  // Preferences state
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [emailNotificationsLoading, setEmailNotificationsLoading] = useState(false);
  const [autoTopUpEnabled, setAutoTopUpEnabled] = useState(false);
  const [autoTopUpLoading, setAutoTopUpLoading] = useState(false);

  // Subscription state
  const [cancelLoading, setCancelLoading] = useState(false);
  const [planTier, setPlanTier] = useState<string>('free');

  // Connected accounts state
  const [providers, setProviders] = useState<string[]>([]);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookSecretRevealed, setWebhookSecretRevealed] = useState(false);
  const [webhookSecretCopied, setWebhookSecretCopied] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);


  // Load user profile, preferences, and connected accounts in parallel
  useEffect(() => {
    async function loadAll() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Populate profile immediately from cached user object
      setEmail(user.email ?? '');
      setDisplayName(
        user.user_metadata?.display_name ??
          user.user_metadata?.full_name ??
          '',
      );
      setEmailNotifications(
        user.user_metadata?.email_notifications ?? false,
      );
      setProviders(user.app_metadata?.providers ?? []);

      // Fire all edge-function calls in parallel
      const [billingResult, autoTopUpResult, apiKeysResult] =
        await Promise.all([
          invokeFn('credits-check', { method: 'GET' }),
          invokeFn('auto-topup', { method: 'GET' }).catch(() => ({ data: null, error: null })),
          invokeFn('apikey-manage', { body: { action: 'list' } }),
        ]);

      if (billingResult.data?.plan?.tier) {
        setPlanTier(billingResult.data.plan.tier);
      }

      if (!autoTopUpResult.error && autoTopUpResult.data) {
        setAutoTopUpEnabled(autoTopUpResult.data.enabled ?? false);
      }

      if (!apiKeysResult.error && apiKeysResult.data?.keys) {
        setApiKeys(apiKeysResult.data.keys);
      } else if (apiKeysResult.error) {
        setApiKeysError('Failed to load API keys');
      }
      setApiKeysLoading(false);

      // Webhook config from profiles (RLS scopes to own row).
      // Postiz config has its own page at /integrations/postiz.
      const { data: profile } = await supabase
        .from('profiles')
        .select('webhook_url, webhook_secret')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) {
        setWebhookUrl(profile.webhook_url ?? '');
        setWebhookSecret(profile.webhook_secret ?? '');
      }
    }

    loadAll();
  }, []);

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setWebhookSaving(true);
    setWebhookError(null);
    setWebhookSaved(false);
    try {
      const trimmed = webhookUrl.trim();
      // Empty string clears the webhook; otherwise must be https://
      if (trimmed.length > 0 && !/^https:\/\//i.test(trimmed)) {
        setWebhookError('Webhook URL must start with https://');
        return;
      }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setWebhookError('Not authenticated');
        return;
      }
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ webhook_url: trimmed === '' ? null : trimmed })
        .eq('id', user.id);
      if (updateErr) {
        setWebhookError(updateErr.message);
        return;
      }
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 3000);
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setWebhookSaving(false);
    }
  }

  async function handleCopyWebhookSecret() {
    try {
      await navigator.clipboard.writeText(webhookSecret);
      setWebhookSecretCopied(true);
      setTimeout(() => setWebhookSecretCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  // Refresh API keys after create/revoke
  const fetchApiKeys = useCallback(async () => {
    try {
      const { data, error: fnError } = await invokeFn('apikey-manage', {
        body: { action: 'list' },
      });
      if (!fnError) {
        setApiKeys(data?.keys ?? []);
      }
    } catch {
      // Best effort refresh
    }
  }, []);

  // Save profile
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileLoading(true);
    setProfileSaved(false);

    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { display_name: displayName },
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch {
      // Best effort
    } finally {
      setProfileLoading(false);
    }
  }

  // Copy key prefix to clipboard
  async function handleCopyKey(keyId: string, prefix: string) {
    try {
      await navigator.clipboard.writeText(prefix);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  // Copy full new key to clipboard
  async function handleCopyNewKey() {
    if (!newKeyFull) return;
    try {
      await navigator.clipboard.writeText(newKeyFull);
      setNewKeyCopied(true);
      setTimeout(() => setNewKeyCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  // Create new API key via apikey-manage
  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);

    try {
      const { data, error: fnError } = await invokeFn('apikey-manage', {
        body: { action: 'create', name: newKeyName.trim() },
      });

      if (!fnError && data?.key) {
        setNewKeyFull(data.key);
        setNewKeyName('');
        fetchApiKeys();
      }
    } catch {
      // Best effort
    } finally {
      setCreatingKey(false);
    }
  }

  // Revoke an API key via apikey-manage
  async function handleRevokeKey(keyId: string) {
    setRevokingKeyId(keyId);

    try {
      const supabase = createClient();
      const { error: fnError } = await invokeFn('apikey-manage', {
        body: { action: 'revoke', keyId },
      });

      if (!fnError) {
        setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
        setShowRevokeConfirm(null);
        setRevokeSuccess(keyId);
        setTimeout(() => setRevokeSuccess(null), 2000);
      }
    } catch {
      // Best effort
    } finally {
      setRevokingKeyId(null);
    }
  }

  // Toggle email notifications
  async function toggleEmailNotifications() {
    setEmailNotificationsLoading(true);
    const newValue = !emailNotifications;

    try {
      const supabase = createClient();
      await supabase.auth.updateUser({
        data: { email_notifications: newValue },
      });
      setEmailNotifications(newValue);
    } catch {
      // Revert on failure -- state unchanged
    } finally {
      setEmailNotificationsLoading(false);
    }
  }

  // Open Stripe portal for subscription cancellation
  function handleCancelSubscription() {
    window.location.href = '/billing';
  }

  // Toggle auto top-up
  async function toggleAutoTopUp() {
    setAutoTopUpLoading(true);
    const newValue = !autoTopUpEnabled;

    try {
      const { error: fnError } = await invokeFn('auto-topup', {
        body: { enabled: newValue },
      });

      if (!fnError) {
        setAutoTopUpEnabled(newValue);
      }
    } catch {
      // Revert on failure -- state unchanged
    } finally {
      setAutoTopUpLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text">Settings</h1>
      <p className="mt-2 text-sm text-text-muted">
        Manage your account and preferences
      </p>

      {/* ── Profile Section ──────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          Profile
        </h2>
        <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="display-name"
              className="mb-1.5 block text-xs text-text-muted"
            >
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="h-10 w-full max-w-md rounded-md border border-border bg-background px-3 font-mono text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs text-text-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
              placeholder="you@example.com"
              className="h-10 w-full max-w-md rounded-md border border-border bg-background px-3 font-mono text-sm text-text placeholder:text-text-muted/50 disabled:opacity-50"
            />
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              Email cannot be changed here
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={profileLoading}>
              {profileLoading ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
            {profileSaved && (
              <span className="font-mono text-xs text-accent">
                <CheckCheck className="mr-1 inline h-3 w-3" />
                Saved
              </span>
            )}
          </div>
        </form>
      </section>

      {/* ── API Keys Section ─────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          API Keys
        </h2>
        <div className="mt-4">
          <p className="text-sm text-text-muted">
            API keys allow programmatic access to the Agent Media platform via
            the CLI and REST API.
          </p>

          {/* New key created banner */}
          {newKeyFull && (
            <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-start gap-3">
                <Key className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="flex-1">
                  <p className="font-mono text-xs text-accent">
                    New API key created. Copy it now -- you will not see it
                    again.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text break-all">
                      {newKeyFull}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyNewKey}
                    >
                      {newKeyCopied ? (
                        <CheckCheck className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setNewKeyFull(null);
                      setNewKeyCopied(false);
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Create new key */}
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label
                htmlFor="key-name"
                className="mb-1.5 block text-xs text-text-muted"
              >
                Key Name
              </label>
              <input
                id="key-name"
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., CLI, CI/CD Pipeline"
                className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <Button
              size="sm"
              disabled={creatingKey || !newKeyName.trim()}
              onClick={handleCreateKey}
            >
              {creatingKey ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-3 w-3" />
                  Create API Key
                </>
              )}
            </Button>
          </div>

          {/* Revoke success toast */}
          {revokeSuccess && (
            <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-2.5">
              <span className="font-mono text-xs text-accent">
                <CheckCheck className="mr-1.5 inline h-3 w-3" />
                API key revoked successfully
              </span>
            </div>
          )}

          {/* Key list */}
          {apiKeysLoading ? (
            <div className="mt-6 flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : apiKeysError ? (
            <div className="mt-6 rounded-lg border border-danger/30 bg-danger/10 p-4 text-center">
              <AlertCircle className="mx-auto h-5 w-5 text-danger" />
              <p className="mt-2 font-mono text-xs text-danger">
                {apiKeysError}
              </p>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="mt-6 rounded-lg border border-border bg-card p-6 text-center">
              <Key className="mx-auto h-6 w-6 text-text-muted" />
              <p className="mt-3 font-mono text-sm text-text-muted">
                No API keys created
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {apiKeys.map((key) => (
                <div key={key.id}>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-border-bright/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Key className="h-3.5 w-3.5 shrink-0 text-accent/60" />
                        <span className="font-mono text-sm text-text truncate">
                          {key.name}
                        </span>
                        <Badge variant="default">
                          {key.key_prefix}...
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-4">
                        <span className="font-mono text-[10px] text-text-muted">
                          Created {formatDate(key.created_at)}
                        </span>
                        {key.last_used_at && (
                          <span className="font-mono text-[10px] text-text-muted">
                            Last used {formatDate(key.last_used_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 ml-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyKey(key.id, key.key_prefix)}
                        title="Copy to clipboard"
                      >
                        {copiedKeyId === key.id ? (
                          <CheckCheck className="h-3.5 w-3.5 text-accent" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRevokeConfirm(key.id)}
                        className="hover:text-danger"
                        title="Revoke key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Inline revoke confirmation */}
                  {showRevokeConfirm === key.id && (
                    <div className="mt-1.5 rounded-md border border-danger/30 bg-danger/5 px-4 py-3">
                      <p className="font-mono text-xs text-danger">
                        Revoke &lsquo;{key.name}&rsquo;? This cannot be undone.
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRevokeConfirm(null)}
                          disabled={revokingKeyId === key.id}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevokeKey(key.id)}
                          disabled={revokingKeyId === key.id}
                        >
                          {revokingKeyId === key.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Revoking...
                            </>
                          ) : (
                            'Confirm Revoke'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Note: Full API keys cannot be retrieved after creation for security */}
        </div>
      </section>

      {/* ── Preferences Section ──────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          Preferences
        </h2>
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm text-text">Email Notifications</p>
              <p className="text-xs text-text-muted">
                Receive email when generations complete
              </p>
            </div>
            <button
              onClick={toggleEmailNotifications}
              disabled={emailNotificationsLoading}
              className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                emailNotifications ? 'bg-accent' : 'bg-border'
              }`}
              aria-label="Toggle email notifications"
              role="switch"
              aria-checked={emailNotifications}
            >
              <div
                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                  emailNotifications ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm text-text">Auto Top-Up</p>
              <p className="text-xs text-text-muted">
                Automatically purchase credits when balance is low
              </p>
              {autoTopUpEnabled && (
                <Link
                  href="/billing"
                  className="mt-1 inline-block font-mono text-[10px] text-accent hover:underline"
                >
                  Configure in Billing &rarr;
                </Link>
              )}
            </div>
            <button
              onClick={toggleAutoTopUp}
              disabled={autoTopUpLoading}
              className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                autoTopUpEnabled ? 'bg-accent' : 'bg-border'
              }`}
              aria-label="Toggle auto top-up"
              role="switch"
              aria-checked={autoTopUpEnabled}
            >
              <div
                className={`h-5 w-5 rounded-full bg-white transition-transform ${
                  autoTopUpEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* ── Webhooks Section ─────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          Webhooks
        </h2>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-text-muted">
            agent-media POSTs <code className="rounded bg-zinc-100 px-1 font-mono text-xs">job.completed</code> and{' '}
            <code className="rounded bg-zinc-100 px-1 font-mono text-xs">job.failed</code> events to this URL when any of your
            jobs reaches a terminal state. Each request is signed with{' '}
            <code className="rounded bg-zinc-100 px-1 font-mono text-xs">X-AgentMedia-Signature: t=&lt;ts&gt;,v1=&lt;hmac&gt;</code>{' '}
            using your secret below. Verify the HMAC of <code className="rounded bg-zinc-100 px-1 font-mono text-xs">{`${'`${t}.${rawBody}`'}`}</code> against the <code className="rounded bg-zinc-100 px-1 font-mono text-xs">v1</code> value before trusting the payload.
          </p>

          <form onSubmit={handleSaveWebhook} className="space-y-3">
            <div>
              <label htmlFor="webhook-url" className="mb-1.5 block text-sm font-medium text-text">
                Webhook URL
              </label>
              <input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-app.com/agent-media-webhook"
                className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-xs text-text-muted">
                Must be HTTPS. Leave blank to disable. Per-job <code className="font-mono">webhook_url</code> in the API body overrides this.
              </p>
            </div>

            {webhookError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{webhookError}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={webhookSaving}>
                {webhookSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
              {webhookSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-700">
                  <CheckCheck className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </form>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text">Signing Secret</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                type={webhookSecretRevealed ? 'text' : 'password'}
                value={webhookSecret}
                className="flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-text focus:outline-none"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setWebhookSecretRevealed((v) => !v)}>
                {webhookSecretRevealed ? 'Hide' : 'Reveal'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleCopyWebhookSecret}>
                {webhookSecretCopied ? <><CheckCheck className="mr-1.5 h-3.5 w-3.5" />Copied</> : <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</>}
              </Button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Used as the HMAC-SHA256 key on outbound webhook calls. Keep it secret. Rotation will be added to the API in a follow-up.
            </p>
          </div>
        </div>
      </section>

      {/* ── Connected Accounts Section ───────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="border-b border-border pb-3 text-sm font-semibold text-[#121212]">
          Connected Accounts
        </h2>
        <div className="mt-6 space-y-3">
          {/* Always show email auth if email is present */}
          {email && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm text-text">{email}</p>
                  <p className="text-xs text-text-muted">Email (OTP)</p>
                </div>
              </div>
              <Badge variant="live">CONNECTED</Badge>
            </div>
          )}

          {/* Show Google if connected */}
          {providers.includes('google') && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <GoogleIcon className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm text-text">Google</p>
                  <p className="text-xs text-text-muted">OAuth</p>
                </div>
              </div>
              <Badge variant="live">CONNECTED</Badge>
            </div>
          )}

          {/* Show other providers dynamically */}
          {providers
            .filter((p) => p !== 'email' && p !== 'google')
            .map((provider) => (
              <div
                key={provider}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-sm text-text">
                      {providerLabel(provider)}
                    </p>
                    <p className="text-xs text-text-muted">OAuth</p>
                  </div>
                </div>
                <Badge variant="live">CONNECTED</Badge>
              </div>
            ))}

          {/* Empty state when no providers loaded yet */}
          {!email && providers.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <Mail className="mx-auto h-6 w-6 text-text-muted" />
              <p className="mt-3 font-mono text-sm text-text-muted">
                No connected accounts found
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Subscription Management ─────────────────────────────────────── */}
      {planTier !== 'free' && planTier !== 'payg' && (
        <section className="mt-12">
          <h2 className="border-b border-border pb-3 text-sm font-semibold text-text-muted">
            Subscription
          </h2>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Need to cancel or change your plan?
            </p>
            <button
              onClick={handleCancelSubscription}
              className="font-mono text-xs text-text-muted underline decoration-text-muted/30 hover:text-text transition-colors"
            >
              Manage on Billing page
            </button>
          </div>
        </section>
      )}

      {/* ── Danger Zone ──────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="border-b border-danger/30 pb-3 text-sm font-semibold text-danger">
          Danger Zone
        </h2>
        <div className="mt-6 rounded-lg border border-danger/30 bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text">Delete Account</p>
              <p className="text-xs text-text-muted">
                Permanently delete your account and all data
              </p>
            </div>
            <Button variant="destructive" size="sm">
              Delete Account
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
