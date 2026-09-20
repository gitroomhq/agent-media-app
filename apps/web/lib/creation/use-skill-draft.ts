// Copyright 2026 agent-media contributors. Apache-2.0 license.
'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { draftKey, readDraft, saveDraft, type DraftValues } from './draft';

/** Same-tab, account-scoped recovery only. Never puts prompts or image URLs in navigation/cookies. */
export function useSkillDraft(slug: string, initial: DraftValues, fields: string[]) {
  const [values, setValues] = useState(initial);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saved, setSaved] = useState(false);
  const key = useRef<string | null>(null);
  const changed = useRef(false);
  useEffect(() => {
    let canceled = false;
    const supabase = createClient();
    let owner: string | null = null;
    let loaded = false;
    function restoreFor(userId: string | null) {
      if (canceled) return;
      if (loaded && userId === owner) return;
      if (loaded) {
        changed.current = false;
        setValues(initial); setSaved(false); setRestored(false);
      }
      owner = userId;
      loaded = true;
      key.current = userId ? draftKey(userId, slug) : null;
      if (!key.current) return;
      try {
        const draft = readDraft(sessionStorage, key.current, fields);
        if (draft && !changed.current) { setValues({ ...initial, ...draft }); setRestored(true); setSaved(true); }
      } catch { /* Storage can be disabled; the form still works. */ }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (loaded) restoreFor(session?.user.id ?? null);
    });
    void supabase.auth.getUser().then(({ data: { user } }) => {
      restoreFor(user?.id ?? null);
    }).catch(() => {}).finally(() => { if (!canceled) setReady(true); });
    return () => { canceled = true; subscription.unsubscribe(); };
    // RunPanel is keyed by slug; initial values and fields are stable for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  function update(field: string, value: unknown) {
    changed.current = true;
    setValues(previous => {
      const next = { ...previous, [field]: value };
      return next;
    });
  }
  useEffect(() => {
    if (!ready || !changed.current || !key.current) return;
    try { setSaved(saveDraft(sessionStorage, key.current, values)); } catch { setSaved(false); }
  }, [values, ready]);
  function clear() {
    if (key.current) { try { sessionStorage.removeItem(key.current); } catch {} }
    changed.current = false; setSaved(false); setRestored(false);
  }
  return { values, update, ready, restored, saved, clear };
}
