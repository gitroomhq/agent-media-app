'use client';

// TikTok CompleteRegistration for new accounts, on whatever app page a fresh
// signup lands first (/onboarding is not guaranteed: the onboarding gate is
// env-controlled). Must render inside VariableContextComponent so the
// Supabase browser client can read its runtime config.

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { trackSignupOnce } from '@/lib/tiktok-pixel';

export default function TikTokSignup() {
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const fire = () =>
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (data.session?.user) trackSignupOnce(data.session.user);
        })
        .catch(() => {});
    fire();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') fire();
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
