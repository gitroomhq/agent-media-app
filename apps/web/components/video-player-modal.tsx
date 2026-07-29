// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * VideoPlayerModal
 *
 * Click a generation card → opens this modal with a full player +
 * Share button that copies the public video URL to clipboard. Used
 * from /dashboard and /dashboard/gallery so the user never leaves
 * the grid.
 *
 * Backdrop click / ESC closes.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Share2, X } from 'lucide-react';

export interface VideoModalSubject {
  id: string;
  url: string | null;
  label?: string | null;
  date?: string | null;
}

export function VideoPlayerModal({
  subject,
  onClose,
}: {
  subject: VideoModalSubject | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ESC to close.
  useEffect(() => {
    if (!subject) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subject, onClose]);

  // Reset copy state on subject change.
  useEffect(() => {
    setCopied(false);
  }, [subject?.id]);

  if (!subject) return null;

  async function handleShare() {
    if (!subject?.url) return;
    setSharing(true);
    try {
      if (navigator.share) {
        try {
          await navigator.share({ url: subject.url, title: subject.label ?? 'Generated video' });
          setSharing(false);
          return;
        } catch {
          // user cancelled native share or it failed; fall back to copy
        }
      }
      await navigator.clipboard.writeText(subject.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore; failure is silent
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Video player"
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl"
        style={{
          backgroundColor: '#0F1015',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.55)',
        }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex min-w-0 flex-col">
            {subject.label ? (
              <span
                className="truncate text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: '#A78BFA' }}
              >
                {subject.label}
              </span>
            ) : null}
            {subject.date ? (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {subject.date}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing || !subject.url}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0F1015',
                boxShadow:
                  '0 6px 18px rgba(167,139,250,0.22), 0 0 0 1px rgba(255,255,255,0.6)',
              }}
            >
              {sharing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{
                color: 'rgba(255,255,255,0.65)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Player */}
        <div
          className="flex flex-1 items-center justify-center overflow-hidden"
          style={{ backgroundColor: '#000' }}
        >
          {subject.url ? (
            <video
              ref={videoRef}
              src={subject.url}
              controls
              autoPlay
              playsInline
              className="block max-h-[78vh] max-w-full"
            />
          ) : (
            <p className="px-6 py-12 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              No media available
            </p>
          )}
        </div>

        {/* URL row */}
        {subject.url ? (
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <input
              readOnly
              value={subject.url}
              onClick={(e) => e.currentTarget.select()}
              className="h-9 flex-1 truncate rounded-full px-4 text-xs outline-none"
              style={{
                backgroundColor: '#191A22',
                color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
            <button
              type="button"
              onClick={async () => {
                if (!subject.url) return;
                await navigator.clipboard.writeText(subject.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors"
              style={{
                color: 'rgba(255,255,255,0.75)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
