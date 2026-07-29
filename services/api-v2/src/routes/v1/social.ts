// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /v1/social/* — connect social channels (TikTok / Instagram / X) and publish
 * agent-media videos to them via the Postiz Enterprise API.
 */

import type { Request, Response } from 'express';
import { supabase } from '../../server.js';
import {
  listIntegrations,
  createPostizUser,
  addChannel,
  listUserChannels,
  deleteChannel,
  uploadFromUrl,
  createPost,
} from '../../lib/postiz.js';

// The providers we expose in the UI (user asked for TikTok, Instagram, X).
const ALLOWED_PROVIDERS = new Set(['tiktok', 'instagram', 'instagram-standalone', 'x']);

const APP_URL = (process.env.APP_PUBLIC_URL || 'https://app.agent-media.ai').replace(/\/+$/, '');
const R2_PUBLIC = (process.env.R2_PUBLIC_URL || 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev').replace(/\/+$/, '');

function uid(req: Request): string | null {
  return (req as { userId?: string }).userId ?? null;
}

/** Get the user's Postiz id, creating + persisting it once on first use. */
async function getOrCreatePostizUserId(userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('postiz_users')
    .select('postiz_user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.postiz_user_id) return existing.postiz_user_id as string;

  const { data: au } = await supabase.auth.admin.getUserById(userId);
  const email = au?.user?.email ?? `${userId}@users.agent-media.ai`;
  const postizId = await createPostizUser({ email });
  await supabase.from('postiz_users').insert({ user_id: userId, postiz_user_id: postizId });
  return postizId;
}

/** GET /v1/social/providers — the connectable networks (cached). */
export async function listSocialProvidersRoute(_req: Request, res: Response): Promise<void> {
  try {
    const all = await listIntegrations();
    const providers = all.filter((p) => ALLOWED_PROVIDERS.has(p.identifier));
    res.status(200).json({ providers });
  } catch (e) {
    res.status(502).json({ error: 'postiz_unavailable', detail: (e as Error).message });
  }
}

/** GET /v1/social/channels — the user's connected channels. */
export async function listSocialChannelsRoute(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const postizId = await getOrCreatePostizUserId(userId);
    const raw = await listUserChannels(postizId);
    // Normalize: Postiz returns the network in `identifier`; expose it as `provider`.
    const channels = (raw ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.identifier,
      profile: c.profile ?? null,
      picture: c.picture ?? null,
      disabled: c.disabled ?? false,
    }));
    res.status(200).json({ channels });
  } catch (e) {
    res.status(502).json({ error: 'postiz_error', detail: (e as Error).message });
  }
}

/** POST /v1/social/connect { provider } — returns the OAuth URL to open. */
export async function connectSocialRoute(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  const provider = String(req.body?.provider ?? '');
  if (!ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({ error: 'invalid_provider', detail: `provider must be one of: ${[...ALLOWED_PROVIDERS].join(', ')}` });
    return;
  }
  try {
    const postizId = await getOrCreatePostizUserId(userId);
    const url = await addChannel({
      postizUserId: postizId,
      provider,
      redirectUrl: `${APP_URL}/dashboard/social?connected=${encodeURIComponent(provider)}`,
    });
    res.status(200).json({ url });
  } catch (e) {
    res.status(502).json({ error: 'postiz_error', detail: (e as Error).message });
  }
}

/** DELETE /v1/social/channels/:channelId — disconnect a channel. */
export async function deleteSocialChannelRoute(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  const channelId = String(req.params.channelId ?? '');
  if (!channelId) { res.status(400).json({ error: 'missing_channel_id' }); return; }
  try {
    const postizId = await getOrCreatePostizUserId(userId);
    await deleteChannel({ postizUserId: postizId, channelId });
    res.status(200).json({ success: true });
  } catch (e) {
    res.status(502).json({ error: 'postiz_error', detail: (e as Error).message });
  }
}

/**
 * POST /v1/social/publish
 *   { video_url (R2), channel_ids: string[], caption, type: 'now'|'schedule', date? }
 * Uploads the video to Postiz then posts/schedules it to each channel.
 */
export async function publishSocialRoute(req: Request, res: Response): Promise<void> {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }
  const body = req.body ?? {};
  const videoUrl = String(body.video_url ?? '');
  const channelIds: string[] = Array.isArray(body.channel_ids) ? body.channel_ids.map(String) : [];
  const caption = String(body.caption ?? '').slice(0, 2000);
  const type = body.type === 'schedule' ? 'schedule' : 'now';
  const date = body.date ? String(body.date) : undefined;

  // SSRF guard: only our own R2-hosted videos.
  if (!videoUrl.startsWith(R2_PUBLIC + '/')) {
    res.status(400).json({ error: 'video_url must be an agent-media R2 URL' });
    return;
  }
  if (channelIds.length === 0) { res.status(400).json({ error: 'channel_ids required' }); return; }
  if (type === 'schedule' && !date) { res.status(400).json({ error: 'date required when type=schedule' }); return; }

  try {
    const postizId = await getOrCreatePostizUserId(userId);

    // Resolve each picked channel to its network (needed for settings.__type).
    const userChannels = await listUserChannels(postizId);
    const byId = new Map(userChannels.map((c) => [c.id, c]));
    const unknown = channelIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      res.status(400).json({ error: 'unknown_channel', detail: `not a connected channel: ${unknown.join(', ')}` });
      return;
    }

    // Register the (R2-hosted) video with Postiz by URL — Postiz fetches it
    // itself and returns a path on its own upload domain (required by /posts).
    const media = await uploadFromUrl(postizId, videoUrl);

    const result = await createPost({
      postizUserId: postizId,
      type,
      date,
      posts: channelIds.map((integrationId) => ({
        integrationId,
        network: byId.get(integrationId)!.identifier,
        content: caption,
        media: [{ id: media.id, path: media.path! }],
      })),
    });

    res.status(200).json({ success: true, media_id: media.id, post_ids: result.postIds });
  } catch (e) {
    res.status(502).json({ error: 'postiz_error', detail: (e as Error).message });
  }
}
