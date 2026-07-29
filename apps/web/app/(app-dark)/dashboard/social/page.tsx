// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/social — connect TikTok / Instagram / X and publish generated
 * videos to them (via Postiz Enterprise, server-side).
 */

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Trash2, Send, Check } from 'lucide-react';
import { NetworkLogo, PoweredByPostiz } from '@/components/brand-icons';

interface Provider { name: string; identifier: string; toolTip?: string }
interface Channel { id: string; name: string; provider: string; profile?: string | null }

const PRETTY: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  'instagram-standalone': 'Instagram (Standalone)',
  x: 'X',
};

export default function SocialPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // publish form
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/social/channels', { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) { setError(j?.detail || j?.error || `channels ${r.status}`); setChannels([]); return; }
      setChannels(j.channels ?? []);
    } catch (e) { setError((e as Error).message); setChannels([]); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/social/providers', { credentials: 'include' });
        const j = await r.json();
        if (r.ok) setProviders(j.providers ?? []);
      } catch { /* ignore */ }
    })();
    void loadChannels();
  }, [loadChannels]);

  async function connect(provider: string) {
    setBusy(provider); setError(null);
    try {
      const r = await fetch('/api/v1/social/connect', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j?.detail || j?.error || `connect ${r.status}`);
      window.open(j.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function disconnect(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/v1/social/channels/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      await loadChannels();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function publish() {
    setPublishMsg(null); setError(null);
    const channel_ids = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);
    if (!videoUrl || channel_ids.length === 0) { setError('Pick a video URL and at least one channel.'); return; }
    setBusy('publish');
    try {
      const r = await fetch('/api/v1/social/publish', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl, channel_ids, caption, type: 'now' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || `publish ${r.status}`);
      const n = Array.isArray(j?.post_ids) ? j.post_ids.length : 0;
      if (n === 0) throw new Error('Postiz accepted the request but created no post — nothing was published.');
      setPublishMsg(`Published to ${n} channel${n === 1 ? '' : 's'}! 🎉`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Social</p>
      <h1 className="mt-1 font-normal" style={{ color: '#E9E9F0', fontSize: 'clamp(28px,2.6vw,36px)', letterSpacing: '-0.03em' }}>Publish to social</h1>
      <p className="mt-1 max-w-2xl text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
        Connect TikTok, Instagram, and X, then publish any generated video straight to them.
      </p>
      <div className="mt-2"><PoweredByPostiz /></div>

      {error ? <div className="mt-4 rounded-2xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', background: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>{error}</div> : null}

      {/* Connect */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Connect a channel</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {providers.length === 0 ? <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</span> :
          providers.map((p) => {
            const isConnected = (channels ?? []).some((c) => c.provider === p.identifier);
            const label = PRETTY[p.identifier] ?? p.name;
            return (
              <button key={p.identifier} type="button" onClick={() => connect(p.identifier)} disabled={isConnected || busy === p.identifier}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-default"
                style={{
                  background: isConnected ? 'rgba(52,211,153,0.10)' : '#14151F',
                  border: `1px solid ${isConnected ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: isConnected ? '#34D399' : '#E9E9F0',
                  opacity: busy === p.identifier ? 0.6 : 1,
                }}>
                <NetworkLogo provider={p.identifier} size={17} />
                {isConnected ? <Check className="h-4 w-4" /> : busy === p.identifier ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" style={{ color: '#A78BFA' }} />}
                {isConnected ? `${label} connected` : `Connect ${label}`}
              </button>
            );
          })}
      </div>

      {/* Connected */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Connected channels</h2>
      <div className="mt-3">
        {channels === null ? <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</span> :
          channels.length === 0 ? <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No channels yet — connect one above.</p> :
          <div className="flex flex-col gap-2">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="inline-flex items-center gap-2.5" style={{ color: '#E9E9F0' }}>
                  <NetworkLogo provider={c.provider} size={18} />
                  {c.name} <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {PRETTY[c.provider] ?? c.provider}{c.profile ? ` · @${c.profile}` : ''}</span>
                </span>
                <button type="button" onClick={() => disconnect(c.id)} disabled={busy === c.id} className="inline-flex items-center gap-1 text-xs" style={{ color: '#FCA5A5' }}>
                  <Trash2 className="h-3.5 w-3.5" /> Disconnect
                </button>
              </div>
            ))}
          </div>}
      </div>

      {/* Publish */}
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.55)' }}>Publish a video</h2>
      <div className="mt-3 flex flex-col gap-3 rounded-2xl p-4" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.06)' }}>
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Video URL (R2-hosted — from your Gallery)"
          className="h-10 rounded-xl px-3 text-sm outline-none" style={{ background: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }} />
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" rows={2}
          className="resize-none rounded-xl px-3 py-2 text-sm outline-none" style={{ background: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }} />
        <div className="flex flex-wrap gap-3">
          {(channels ?? []).map((c) => (
            <label key={c.id} className="inline-flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <input type="checkbox" checked={!!picked[c.id]} onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))} />
              <NetworkLogo provider={c.provider} size={15} />
              {c.name} ({PRETTY[c.provider] ?? c.provider})
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={publish} disabled={busy === 'publish'} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: '#A78BFA', color: '#0F1015' }}>
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish now
          </button>
          {publishMsg ? <span className="text-sm" style={{ color: '#34D399' }}>{publishMsg}</span> : null}
        </div>
      </div>
    </div>
  );
}
