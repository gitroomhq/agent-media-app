// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Postiz Enterprise API client — social channel connect + publish.
 *
 * Auth: raw API key in the `Authorization` header (NOT `Bearer`), from
 * POSTIZ_ENTERPRISE_API_KEY. Base: https://enterprise-api.postiz.com.
 *
 * IMPORTANT: the Enterprise key is rate-limited to ~30 requests/hour GLOBALLY
 * (one key for the whole platform). So: cache integrations/list, create each
 * Postiz user once (persisted in postiz_users), and batch posts.
 */

const BASE = process.env.POSTIZ_BASE_URL?.replace(/\/+$/, '') || 'https://enterprise-api.postiz.com';

function apiKey(): string {
  const k = process.env.POSTIZ_ENTERPRISE_API_KEY?.trim();
  if (!k) throw new Error('POSTIZ_ENTERPRISE_API_KEY not configured');
  return k;
}

async function pfetch(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey(),
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    // Postiz stalls (no clean 429) when the ~30 req/hr Enterprise budget is
    // exhausted — fail fast (12s) so the UI degrades instead of hanging.
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function pjson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await pfetch(path, init);
  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`postiz ${path} ${r.status}: ${text.slice(0, 300)}`);
    (err as { status?: number }).status = r.status;
    throw err;
  }
  return (text ? JSON.parse(text) : null) as T;
}

export interface PostizIntegration {
  name: string;
  identifier: string;
  toolTip?: string;
}

// ── integrations/list is effectively static — cache it for an hour to spare
// the 30/hr budget. ───────────────────────────────────────────────────────
let _integrationsCache: { at: number; data: PostizIntegration[] } | null = null;
export async function listIntegrations(): Promise<PostizIntegration[]> {
  if (_integrationsCache && Date.now() - _integrationsCache.at < 3_600_000) {
    return _integrationsCache.data;
  }
  const raw = await pjson<{ social?: PostizIntegration[] }>('/public/v1/integrations/list');
  const data = raw.social ?? [];
  _integrationsCache = { at: Date.now(), data };
  return data;
}

/** Create a Postiz user; returns the Postiz userId. */
export async function createPostizUser(args: { email: string; name?: string }): Promise<string> {
  const data = await pjson<{ id?: string; userId?: string }>('/public/v1/create-user', {
    method: 'POST',
    body: JSON.stringify({ email: args.email, name: args.name ?? args.email }),
  });
  const id = data.id ?? data.userId;
  if (!id) throw new Error(`create-user returned no id: ${JSON.stringify(data).slice(0, 200)}`);
  return id;
}

/** Generate the OAuth connect URL for a provider (tiktok/instagram/x/…). */
export async function addChannel(args: {
  postizUserId: string;
  provider: string;
  redirectUrl: string;
  refreshId?: string;
}): Promise<string> {
  const data = await pjson<{ url?: string }>('/public/v1/add-channel', {
    method: 'POST',
    body: JSON.stringify({
      userId: args.postizUserId,
      provider: args.provider,
      redirectUrl: args.redirectUrl,
      ...(args.refreshId ? { refreshId: args.refreshId } : {}),
    }),
  });
  if (!data.url) throw new Error('add-channel returned no url');
  return data.url;
}

export interface PostizChannel {
  id: string;
  name: string;
  /** The network, e.g. "x" / "tiktok" / "instagram". (Postiz calls this field `identifier`.) */
  identifier: string;
  profile?: string;
  picture?: string;
  disabled?: boolean;
}

// Short per-user cache so repeat page loads don't each burn a Postiz request.
const _channelsCache = new Map<string, { at: number; data: PostizChannel[] }>();
export async function listUserChannels(postizUserId: string): Promise<PostizChannel[]> {
  const hit = _channelsCache.get(postizUserId);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = await pjson<PostizChannel[]>(`/public/v1/users/${encodeURIComponent(postizUserId)}/integrations`);
  _channelsCache.set(postizUserId, { at: Date.now(), data });
  return data;
}

export async function deleteChannel(args: { postizUserId: string; channelId: string }): Promise<void> {
  await pjson(`/public/v1/delete-channel`, {
    method: 'POST',
    body: JSON.stringify({ userId: args.postizUserId, channelId: args.channelId }),
  });
}

/**
 * Register media with Postiz from a public URL.
 *
 * We use /upload-from-url (NOT multipart /upload): the Enterprise gateway does
 * not forward multipart bodies to the file route — it always answered
 * "No file provided", verified against the live API + Postiz source. The
 * URL route makes Postiz fetch the asset itself (SSRF-safe on their side) and
 * returns a path on uploads.postiz.com — which createPost REQUIRES, because
 * Postiz rejects any post whose media isn't on its own upload domain.
 *
 * Returns the media id AND path; both are needed to attach it to a post.
 */
export async function uploadFromUrl(postizUserId: string, url: string): Promise<{ id: string; path: string }> {
  const data = await pjson<{ id?: string; path?: string }>(
    `/public/v1/users/${encodeURIComponent(postizUserId)}/upload-from-url`,
    { method: 'POST', body: JSON.stringify({ url }) },
  );
  if (!data.id || !data.path) {
    throw new Error(`upload-from-url returned no id/path: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { id: data.id, path: data.path };
}

/** Per-network required `settings` for createPost (verified against the live API). */
function networkSettings(network: string): Record<string, unknown> {
  const base = { __type: network };
  // X requires who_can_reply_post; without it Postiz 400s.
  if (network === 'x') return { ...base, who_can_reply_post: 'everyone' };
  return base;
}

export interface PostizPostInput {
  /** Postiz integration (channel) id. */
  integrationId: string;
  /** Network for settings.__type, e.g. "x" / "tiktok" / "instagram". */
  network: string;
  content: string;
  /** Uploaded media — MUST carry both id AND path (from uploadMedia). */
  media?: { id: string; path: string }[];
}

export interface PostizCreateResult {
  /** Postiz post ids that were actually created. Empty ⇒ nothing posted. */
  postIds: string[];
  /** Raw Postiz response, for logging/diagnostics. */
  raw: unknown;
}

/**
 * Schedule (type:'schedule' + date) or publish now (type:'now').
 *
 * Postiz's real schema is nested — integration.id, value[].content,
 * value[].image:[{id,path}], settings.__type:<network>. Sending a flat body
 * makes Postiz 200 while creating an EMPTY post that never reaches the network,
 * so we both send the correct shape AND verify post ids came back.
 */
export async function createPost(args: {
  postizUserId: string;
  type: 'now' | 'schedule';
  date?: string;
  posts: PostizPostInput[];
}): Promise<PostizCreateResult> {
  // Postiz's DTO requires date, shortLink AND tags on EVERY request (even
  // type:'now'); omitting any one 400s. For 'now' the date is just "post now".
  const date = args.date ?? new Date().toISOString();
  const raw = await pjson<unknown>(`/public/v1/users/${encodeURIComponent(args.postizUserId)}/posts`, {
    method: 'POST',
    body: JSON.stringify({
      type: args.type,
      date,
      shortLink: false,
      tags: [],
      posts: args.posts.map((p) => ({
        integration: { id: p.integrationId },
        value: [{ content: p.content, image: p.media ?? [] }],
        settings: networkSettings(p.network),
      })),
    }),
  });

  // Postiz returns an array of created posts (each with postId/id) on success.
  const postIds = extractPostIds(raw);
  if (postIds.length === 0) {
    throw new Error(`postiz created no post (empty result): ${JSON.stringify(raw).slice(0, 400)}`);
  }
  return { postIds, raw };
}

function extractPostIds(raw: unknown): string[] {
  const ids: string[] = [];
  const pick = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    const id = rec.postId ?? rec.id ?? rec.releaseURL;
    if (typeof id === 'string' && id) ids.push(id);
  };
  if (Array.isArray(raw)) raw.forEach(pick);
  else pick(raw);
  return ids;
}
