// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * SupportModal
 *
 * Lightweight in-app ticket form. Opens from the sidebar Support
 * button. POSTs to /api/support which emails the operator via Resend.
 * Auto-attaches the signed-in user's email + id server-side - the form
 * itself only asks for subject + message.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

export function SupportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setSent(false);
    setError(null);
    // small delay so the input is mounted before focus.
    const id = setTimeout(() => subjectRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSend() {
    if (sending) return;
    const s = subject.trim();
    const m = message.trim();
    if (!s) {
      setError('Subject is required.');
      return;
    }
    if (m.length < 5) {
      setError('Message is too short.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: s, message: m }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Send failed (${res.status})`);
      setSent(true);
      setSubject('');
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Contact support"
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-lg rounded-3xl p-6"
        style={{
          backgroundColor: '#191A22',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(167,139,250,0.05) inset',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{
            color: 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'rgba(167,139,250,0.18)',
                border: '1px solid rgba(167,139,250,0.4)',
              }}
              aria-hidden
            >
              <Check className="h-5 w-5" style={{ color: '#A78BFA' }} />
            </span>
            <p className="text-base font-medium" style={{ color: '#E9E9F0' }}>
              Ticket sent
            </p>
            <p className="max-w-sm text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              We&rsquo;ll get back to you on the email tied to your account.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0F1015',
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Support
            </p>
            <h2
              className="mt-1 font-normal"
              style={{
                color: '#E9E9F0',
                fontSize: 'clamp(20px,1.8vw,24px)',
                letterSpacing: '-0.025em',
              }}
            >
              How can we help?
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Send a ticket and a human will reply. We pull your account email automatically.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                disabled={sending}
                maxLength={200}
                className="h-11 rounded-2xl px-4 text-sm outline-none transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: '#0F1015',
                  color: '#E9E9F0',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's going on?"
                disabled={sending}
                rows={6}
                maxLength={4000}
                className="resize-none rounded-2xl px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: '#0F1015',
                  color: '#E9E9F0',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              {error ? (
                <div
                  className="rounded-2xl px-3 py-2 text-xs"
                  style={{
                    border: '1px solid rgba(255,79,79,0.35)',
                    backgroundColor: 'rgba(255,79,79,0.08)',
                    color: '#FCA5A5',
                  }}
                >
                  {error}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {message.length}/4000
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sending}
                  className="rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:opacity-60"
                  style={{
                    color: 'rgba(255,255,255,0.65)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#0F1015',
                    boxShadow:
                      '0 8px 24px rgba(167,139,250,0.25), 0 0 0 1px rgba(255,255,255,0.6)',
                  }}
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sending
                    </>
                  ) : (
                    'Send ticket'
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
