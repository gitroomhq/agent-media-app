// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, X, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { analytics } from '@/lib/analytics';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [postizLoading, setPostizLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setEmail('');
      setOtpCode(['', '', '', '', '', '']);
      setError(null);
      setLoading(false);
      setOauthLoading(false);
      setOtpSent(false);
      setVerifying(false);
    } else {
      analytics.init();
      analytics.trackEvent('login_started');
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setOtpSent(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(code: string) {
    if (code.length !== 6) return;

    setError(null);
    setVerifying(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'email',
      });

      if (authError) {
        setError(authError.message);
        setOtpCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      analytics.trackEvent('login_completed', { method: 'otp' });
      onClose();
      router.push('/gallery');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...otpCode];

    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((d, i) => {
        if (i + index < 6) newCode[i + index] = d;
      });
      setOtpCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();

      const full = newCode.join('');
      if (full.length === 6) handleVerifyOtp(full);
      return;
    }

    newCode[index] = value;
    setOtpCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const full = newCode.join('');
    if (full.length === 6) handleVerifyOtp(full);
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setOauthLoading(true);
    analytics.trackEvent('login_completed', { method: 'google' });

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/dashboard')}`,
        },
      });

      if (authError) {
        setError(authError.message);
        setOauthLoading(false);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setOauthLoading(false);
    }
  }

  function handlePostizLogin() {
    setError(null);
    setPostizLoading(true);
    analytics.trackEvent('login_completed', { method: 'postiz' });
    window.location.href = `/api/auth/postiz?redirect=${encodeURIComponent('/dashboard')}`;
  }

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
    >
      <div className="relative w-full max-w-md" style={{ animation: 'modalIn 200ms ease-out' }}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white shadow-md text-[#6b6b76] transition-colors hover:text-[#121212]"
        >
          <X className="h-4 w-4" />
        </button>

        {otpSent ? (
          /* ── OTP Verification ─────────────────────────────────────── */
          <div className="rounded-2xl border border-[#d4d4d4] bg-white p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#121212]/10">
                <Mail className="h-6 w-6 text-[#121212]" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-[#121212]">
                Enter Your Code
              </h2>
              <p className="mt-3 text-sm text-[#6b6b76]">
                We sent a 6-digit code to{' '}
                <span className="font-medium text-[#121212]">{email}</span>
              </p>

              {error && (
                <div className="mt-4 w-full rounded-md border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <div className="mt-6 flex gap-2">
                {otpCode.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={verifying}
                    autoFocus={i === 0}
                    className="h-12 w-10 rounded-lg border border-[#d4d4d4] bg-[#ededed] text-center text-lg font-medium text-[#121212] focus:border-[#121212] focus:outline-none focus:ring-1 focus:ring-[#121212]/30 disabled:opacity-50"
                  />
                ))}
              </div>

              {verifying && (
                <div className="mt-4 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#121212]" />
                  <span className="text-xs text-[#6b6b76]">Verifying...</span>
                </div>
              )}

              <div className="mt-8 w-full rounded-lg bg-[#ededed] p-4">
                <p className="text-xs text-[#6b6b76]">
                  Didn&apos;t receive it? Check your spam folder or{' '}
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode(['', '', '', '', '', '']);
                      setError(null);
                    }}
                    className="cursor-pointer font-medium text-[#121212] transition-colors hover:underline"
                  >
                    try again
                  </button>
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ── Email Entry ──────────────────────────────────────────── */
          <div className="rounded-2xl border border-[#d4d4d4] bg-white p-8">
            <h2 className="text-xl font-bold text-[#121212]">
              Sign in to agent-media
            </h2>
            <p className="mt-2 text-sm text-[#6b6b76]">
              Sign in or create your account
            </p>

            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSendOtp} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="modal-email"
                  className="mb-1.5 block text-xs font-medium text-[#6b6b76]"
                >
                  Email
                </label>
                <input
                  id="modal-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                  className="h-10 w-full rounded-lg border border-[#d4d4d4] bg-[#ededed] px-3 text-sm text-[#121212] placeholder:text-[#6b6b76]/50 focus:border-[#121212] focus:outline-none focus:ring-1 focus:ring-[#121212]/30 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#121212] text-sm font-medium text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-all duration-200 hover:bg-[#333] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Continue with Email
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#d4d4d4]" />
              <span className="text-xs text-[#6b6b76]">or</span>
              <div className="h-px flex-1 bg-[#d4d4d4]" />
            </div>

            <div className="mt-6 space-y-3">
              <button
                disabled={oauthLoading}
                onClick={handleGoogleLogin}
                className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d4d4d4] bg-white text-sm font-medium text-[#121212] shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-all duration-200 hover:bg-[#f5f5f5] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {oauthLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting to Google...
                  </>
                ) : (
                  <>
                    <GoogleIcon className="h-4 w-4" />
                    Continue with Google
                  </>
                )}
              </button>
              <button
                disabled={postizLoading}
                onClick={handlePostizLogin}
                className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d4d4d4] bg-white text-sm font-medium text-[#121212] shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-all duration-200 hover:bg-[#f5f5f5] hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {postizLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting to Postiz...
                  </>
                ) : (
                  <>
                    <PostizIcon className="h-4 w-4" />
                    Continue with Postiz
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PostizIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#7C3AED" />
      <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" fontFamily="sans-serif">P</text>
    </svg>
  );
}

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
