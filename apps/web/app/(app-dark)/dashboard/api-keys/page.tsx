// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/api-keys — manage the user's `ma_*` API keys.
 *
 * Keys are stored hashed, so we can NEVER re-display an existing one. We list
 * each key's prefix + metadata, let the user generate a new key (shown in full
 * exactly once), and revoke keys. This is the token agents use to authenticate.
 */

import { useEffect, useState } from 'react';
import { Loader2, Plus, Copy, Check, Trash2, KeyRound } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

function fmt(s: string | null): string {
  if (!s) return 'never';
  try {
    return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/v1/me/api-keys', { credentials: 'include' });
      if (!r.ok) { setError(`keys ${r.status}`); setKeys([]); return; }
      const j = (await r.json()) as { keys?: ApiKey[] };
      setKeys(j.keys ?? []);
    } catch (e) {
      setError((e as Error).message);
      setKeys([]);
    }
  }
  useEffect(() => { void load(); }, []);

  async function generate() {
    if (creating) return;
    setCreating(true);
    setError(null);
    setFreshKey(null);
    try {
      const r = await fetch('/api/v1/me/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || 'API key' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || `create ${r.status}`);
      setFreshKey(j.raw_key as string);
      setNewName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      const r = await fetch(`/api/v1/me/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || `revoke ${r.status}`); }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const active = (keys ?? []).filter((k) => k.is_active);

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>API Keys</p>
        <h1 className="font-normal" style={{ color: '#E9E9F0', fontSize: 'clamp(28px,2.6vw,36px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          Your API keys
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Use a key as <code style={{ background: '#1a1c25', padding: '1px 6px', borderRadius: 5 }}>Authorization: Bearer ma_…</code> for the CLI, MCP server, or REST API.
          Keys are stored hashed — we show the full key only once, when you create it, so copy it then.
        </p>
      </div>

      {/* Generate */}
      <div className="mt-8 flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Name (optional)</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. n8n production"
            maxLength={80}
            className="h-10 w-64 rounded-xl px-3 text-sm outline-none"
            style={{ backgroundColor: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={creating}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
          style={{ backgroundColor: '#A78BFA', color: '#0F1015' }}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Generate new key
        </button>
      </div>

      {/* Fresh key — shown once */}
      {freshKey ? (
        <div className="mt-4 rounded-2xl p-4" style={{ border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.08)' }}>
          <p className="text-xs font-semibold" style={{ color: '#C9B8FF' }}>Copy this key now — you won&rsquo;t be able to see it again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all overflow-x-auto whitespace-nowrap rounded-lg px-3 py-2 font-mono text-sm" style={{ background: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }}>
              {freshKey}
            </code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(freshKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
              style={{ color: copied ? '#34D399' : 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', backgroundColor: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>{error}</div>
      ) : null}

      {/* List */}
      <section className="mt-8">
        {keys === null ? (
          <div className="flex h-32 items-center justify-center rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
            </span>
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-2xl px-5 py-10 text-center text-sm" style={{ border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            <KeyRound className="mx-auto mb-2 h-5 w-5" style={{ color: '#A78BFA' }} />
            No active keys yet. Generate one above to connect your agent.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Key</th>
                  <th className="px-4 py-3 text-left font-medium">Last used</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {active.map((k) => (
                  <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-4 py-3" style={{ color: '#E9E9F0' }}>{k.name}</td>
                    <td className="px-4 py-3 font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>{k.key_prefix}…</td>
                    <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{fmt(k.last_used_at)}</td>
                    <td className="px-4 py-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{fmt(k.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => revoke(k.id)}
                        className="inline-flex items-center gap-1 text-xs transition-colors"
                        style={{ color: '#FCA5A5' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
