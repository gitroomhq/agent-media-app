// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Login page - Huly-styled.
 *
 * Dark full-bleed surface with a react-bits Aurora canvas glowing
 * behind a glass card. Email OTP (6-digit) + Google OAuth + Postiz
 * OAuth. No password, no signup route — OTP auto-creates accounts.
 */

import { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { analytics } from '@/lib/analytics';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';

const Aurora = dynamic(() => import('@/components/Aurora'), { ssr: false });

// Aurora colour stops biased to our dark purple palette - tuned to
// stay subtle against the dark surface so the card still reads as the
// hero element. Light-cream stop kept as a faint outer halo.
const AURORA_STOPS = ['#1a1230', '#3a2c66', '#5a3fb0'];

export default function LoginPage() {
  return (
    <div className="theme-cryptix relative min-h-screen overflow-hidden">
      {/* Aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <Aurora colorStops={AURORA_STOPS} amplitude={1.0} blend={0.55} />
      </div>

      {/* Top nav - just a back link */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            color: 'var(--cryptix-text)',
            backgroundColor: 'rgba(10,10,20,0.55)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
        <Link href="/" className="inline-flex items-center gap-2.5">
          <AgentMediaLogo size={26} />
          <span
            className="text-base font-semibold"
            style={{ color: 'var(--cryptix-text)', letterSpacing: '-0.01em' }}
          >
            AgentMedia
          </span>
        </Link>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-160px)] items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <Suspense
            fallback={
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 backdrop-blur-xl">
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--cryptix-text)' }} />
                </div>
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </main>

      <footer className="relative z-10 pb-8 text-center text-xs" style={{ color: 'var(--cryptix-text-muted)' }}>
        <Link href="/terms" className="transition-opacity hover:opacity-80">Terms of Use</Link>
        <span className="mx-3 opacity-50">|</span>
        <Link href="/privacy" className="transition-opacity hover:opacity-80">Privacy policy</Link>
      </footer>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [postizLoading, setPostizLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    analytics.init();
    analytics.trackEvent('login_started');
  }, []);

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
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
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
      router.push(redirectTo);
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
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
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
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
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
    window.location.href = `/api/auth/postiz?redirect=${encodeURIComponent(redirectTo)}`;
  }

  // ── OTP screen ───────────────────────────────────────────────────────────
  if (otpSent) {
    return (
      <Card>
        <div className="flex flex-col items-center text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <Mail className="h-6 w-6" style={{ color: 'var(--cryptix-text)' }} />
          </div>
          <h1
            className="mt-5 text-3xl font-semibold"
            style={{ color: 'var(--cryptix-text)', letterSpacing: '-0.02em' }}
          >
            Enter your code
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--cryptix-text-muted)' }}>
            We sent a 6-digit code to{' '}
            <span style={{ color: 'var(--cryptix-text)', fontWeight: 500 }}>{email}</span>
          </p>

          {error ? <ErrorBox message={error} /> : null}

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
                className="h-14 w-12 rounded-xl text-center text-xl font-medium outline-none transition-colors disabled:opacity-50"
                style={{
                  color: 'var(--cryptix-text)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              />
            ))}
          </div>

          {verifying ? (
            <div className="mt-4 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--cryptix-text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--cryptix-text-muted)' }}>Verifying...</span>
            </div>
          ) : null}

          <p className="mt-8 text-xs" style={{ color: 'var(--cryptix-text-muted)' }}>
            Didn&apos;t receive it?{' '}
            <button
              onClick={() => {
                setOtpSent(false);
                setOtpCode(['', '', '', '', '', '']);
                setError(null);
              }}
              className="font-medium transition-opacity hover:opacity-80"
              style={{ color: 'var(--cryptix-text)' }}
            >
              Try again
            </button>
          </p>
        </div>
      </Card>
    );
  }

  // ── Email entry screen ───────────────────────────────────────────────────
  return (
    <Card>
      <h1
        className="text-3xl font-semibold sm:text-4xl"
        style={{ color: 'var(--cryptix-text)', letterSpacing: '-0.02em' }}
      >
        Welcome back
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--cryptix-text-muted)' }}>
        Sign in or create your account
      </p>

      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={handleSendOtp} className="mt-8 space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-xs font-medium"
            style={{ color: 'var(--cryptix-text-muted)' }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@work-email.com"
            autoComplete="email"
            disabled={loading}
            className="h-12 w-full rounded-xl px-4 text-sm outline-none transition-colors disabled:opacity-50"
            style={{
              color: 'var(--cryptix-text)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          />
        </div>

        {/* Primary CTA - Huly pill */}
        <div className="flex justify-center">
          <button type="submit" disabled={loading} className="contents">
            <Home2CTAButton href="#" variant="light" size="lg" showArrow={false}>
              {loading ? 'Sending code...' : 'Continue with email'}
            </Home2CTAButton>
          </button>
        </div>
      </form>

      <div className="my-7 flex items-center gap-3">
        <div className="h-px flex-1" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--cryptix-text-muted)' }}>or</span>
        <div className="h-px flex-1" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProviderButton
          onClick={handleGoogleLogin}
          loading={oauthLoading}
          icon={<GoogleIcon className="h-4 w-4" />}
          label="Sign in with Google"
        />
        <ProviderButton
          onClick={handlePostizLogin}
          loading={postizLoading}
          icon={<PostizIcon className="h-4 w-4" />}
          label="Sign in with Postiz"
        />
      </div>
    </Card>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  // Glassy card with a faint inner edge. Matches huly.io's "Create new
  // account" panel: dark surface, soft white edge, slight gradient.
  return (
    <div
      className="relative rounded-[28px] p-8 sm:p-10"
      style={{
        background:
          'radial-gradient(120% 100% at 100% 0%, rgba(167,139,250,0.18) 0%, rgba(20,15,40,0.0) 60%), linear-gradient(180deg, rgba(20,15,30,0.78) 0%, rgba(10,10,15,0.82) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        boxShadow:
          '0 30px 80px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </div>
  );
}

function ProviderButton({
  onClick,
  loading,
  icon,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50"
      style={{
        color: 'var(--cryptix-text)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.14)',
      }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="mt-5 w-full rounded-xl px-4 py-3"
      style={{
        border: '1px solid rgba(239, 68, 68, 0.35)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
      }}
    >
      <p className="text-xs" style={{ color: '#fca5a5' }}>{message}</p>
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
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#FFFFFF" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#FFFFFF" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FFFFFF" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#FFFFFF" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
