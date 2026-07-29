// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Hover-to-publish control for a gallery video. Renders X / TikTok / Instagram
 * icon buttons; clicking one opens a caption modal that publishes the video to
 * the user's connected channel for that network via /api/v1/social/publish.
 *
 * Drop <PublishToSocial videoUrl={...} /> into a gallery card's hover overlay.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Loader2, Send, X as XIcon, Check } from 'lucide-react';
import { NetworkLogo } from '@/components/brand-icons';

interface Channel { id: string; name: string; provider: string; profile?: string | null }

const NETWORKS: { key: string; label: string }[] = [
  { key: 'x', label: 'X' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
];

// A connected channel matches the chosen network (Instagram covers the
// standalone variant too).
function channelMatches(c: Channel, network: string): boolean {
  if (network === 'instagram') return c.provider === 'instagram' || c.provider === 'instagram-standalone';
  return c.provider === network;
}

export function PublishToSocial({ videoUrl }: { videoUrl: string }) {
  const [network, setNetwork] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const openFor = useCallback(async (net: string) => {
    setNetwork(net); setCaption(''); setMsg(null); setErr(null);
    if (channels === null && !loadingChannels) {
      setLoadingChannels(true);
      try {
        const r = await fetch('/api/v1/social/channels', { credentials: 'include' });
        const j = await r.json();
        setChannels(r.ok ? (j.channels ?? []) : []);
      } catch { setChannels([]); }
      finally { setLoadingChannels(false); }
    }
  }, [channels, loadingChannels]);

  const close = () => { if (!busy) setNetwork(null); };

  async function publish() {
    if (!network) return;
    const match = (channels ?? []).find((c) => channelMatches(c, network));
    if (!match) { setErr(`No connected ${network} account. Connect it in Social first.`); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch('/api/v1/social/publish', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl, channel_ids: [match.id], caption, type: 'now' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || `publish ${r.status}`);
      const n = Array.isArray(j?.post_ids) ? j.post_ids.length : 0;
      if (n === 0) throw new Error('Postiz accepted the request but created no post.');
      setMsg('Published! 🎉');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const pretty = NETWORKS.find((n) => n.key === network)?.label ?? network;
  const matched = network ? (channels ?? []).find((c) => channelMatches(c, network)) : null;

  return (
    <>
      {/* Hover icon buttons */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        {NETWORKS.map((n) => (
          <button
            key={n.key}
            type="button"
            title={`Publish to ${n.label}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void openFor(n.key); }}
            className="flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-transform hover:scale-110"
            style={{ backgroundColor: 'rgba(15,16,21,0.72)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            <NetworkLogo provider={n.key} size={16} />
          </button>
        ))}
      </div>

      {/* Caption modal — portaled to <body> so the card's overflow-hidden /
          hover transform can't clip or mis-position it, and its clicks never
          bubble back into the card. */}
      {network && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { e.stopPropagation(); close(); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <NetworkLogo provider={network} size={20} />
                <h3 className="text-sm font-semibold" style={{ color: '#E9E9F0' }}>Publish to {pretty}</h3>
              </div>
              <button type="button" onClick={close} style={{ color: 'rgba(255,255,255,0.5)' }}><XIcon className="h-4 w-4" /></button>
            </div>

            {loadingChannels ? (
              <div className="flex h-20 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} /></div>
            ) : !matched ? (
              <div className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                No connected {pretty} account.{' '}
                <Link href="/dashboard/social" className="underline" style={{ color: '#A78BFA' }}>Connect it in Social →</Link>
              </div>
            ) : (
              <>
                <p className="mt-1 text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  to {matched.name}{matched.profile ? ` · @${matched.profile}` : ''}
                </p>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption…"
                  rows={3}
                  className="mt-3 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: '#0F1015', color: '#E9E9F0', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                {err ? <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ border: '1px solid rgba(255,79,79,0.3)', background: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>{err}</div> : null}
                <div className="mt-3 flex items-center justify-end gap-3">
                  {msg ? <span className="inline-flex items-center gap-1 text-sm" style={{ color: '#34D399' }}><Check className="h-4 w-4" />{msg}</span> : null}
                  {!msg && (
                    <button type="button" onClick={publish} disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: '#A78BFA', color: '#0F1015' }}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish now
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
