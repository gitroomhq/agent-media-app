// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Postiz integration routes.
 *
 *   GET  /v1/integrations/postiz/accounts
 *     Lists the user's connected social accounts on Postiz.
 *     Reads the user's profiles.postiz_api_key (set via /settings) and
 *     proxies to GET https://api.postiz.com/public/v1/integrations.
 *     We never return the API key itself to the client.
 *
 *   POST /v1/integrations/postiz/test
 *     Fires a synthetic publish to verify the user's API key + chosen
 *     integration. No video generation involved — uses a placeholder
 *     1x1 PNG hosted on agent-media. (Useful as the "Test connection"
 *     button on /settings.)
 *
 * The actual auto-publish on job.completed lives in the
 * webhook-provider edge function (no api-v2 involvement at fire time).
 */

import type { Request, Response } from 'express';
import { supabase } from '../server.js';

const POSTIZ_BASE = 'https://api.postiz.com/public/v1';

interface PostizIntegration {
  id: string;
  name: string;
  identifier: string;
  picture: string | null;
  disabled: boolean;
  profile: string | null;
}

async function postizListIntegrations(apiKey: string): Promise<PostizIntegration[]> {
  const resp = await fetch(`${POSTIZ_BASE}/integrations`, {
    headers: {
      Authorization: apiKey,
      'User-Agent': 'agent-media-postiz/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Postiz integrations list failed: HTTP ${resp.status} — ${text.slice(0, 300)}`), {
      status: resp.status,
    });
  }
  return (await resp.json()) as PostizIntegration[];
}

export async function postizListAccountsRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } });
    return;
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('postiz_api_key, postiz_default_integrations')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Could not load profile' } });
    return;
  }
  const apiKey = (profile?.postiz_api_key as string | null) ?? null;
  if (!apiKey) {
    res.status(200).json({
      configured: false,
      integrations: [],
      default_integrations: [],
    });
    return;
  }

  try {
    const integrations = await postizListIntegrations(apiKey);
    const safe = integrations.map((i) => ({
      id: i.id,
      name: i.name,
      identifier: i.identifier,
      picture: i.picture,
      disabled: i.disabled,
      profile: i.profile,
    }));
    res.status(200).json({
      configured: true,
      integrations: safe,
      default_integrations: (profile?.postiz_default_integrations as string[] | null) ?? [],
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 502;
    const message = err instanceof Error ? err.message : 'Postiz request failed';
    res.status(status === 401 || status === 403 ? 400 : 502).json({
      error: {
        code: status === 401 || status === 403 ? 'POSTIZ_AUTH_FAILED' : 'POSTIZ_UPSTREAM',
        message,
      },
    });
  }
}
