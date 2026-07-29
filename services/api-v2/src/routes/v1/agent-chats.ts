// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Agent chat + project persistence (Phase 1).
 *
 * Keeps the in-app agent's older sessions as reopenable CHATS. The stateless
 * brain (POST /v1/agent) and the execution+credit path (/v1/skills/<slug>/run)
 * are UNTOUCHED — persistence is purely additive and CLIENT-DRIVEN for v1: the
 * web client (which already holds the full, ordered, run-linked transcript)
 * fire-and-forget appends each message to POST /v1/agent/chats/:id/messages.
 *
 * All routes are auth-scoped: RLS (auth.uid()=user_id) is defense-in-depth, but
 * api-v2 uses the service-role client (which BYPASSES RLS), so the explicit
 * `.eq('user_id', userId)` on every query is the REAL guard. Append/seq is
 * idempotent by (chat_id, client_msg_id) and serial per chat (single-tab v1).
 */

import type { Request, Response } from 'express';
import { supabase } from '../../server.js';

// ── shared helpers ──────────────────────────────────────────────────────────

function requireUser(req: Request, res: Response): string | null {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return null;
  }
  return userId;
}

function clampLimit(raw: unknown, def: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), max) : def;
}

// A persisted message as the client sends it. `content` is the client's
// Msg.content verbatim: a string OR an array of Anthropic content blocks
// (text | tool_use | tool_result). We store it as jsonb with no transform.
type IncomingMessage = {
  role: 'user' | 'assistant';
  content: unknown;
  client_msg_id?: string | null;
  skill_run_id?: string | null;
  primitive_run_id?: string | null;
  run_kind?: 'skill' | 'primitive' | null;
};

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Derive the in-flight tool run from the message rows (no extra query): the
 * LAST tool_use whose id never appears as a tool_result's tool_use_id is the
 * run the client should re-attach + re-poll on reopen. Mirrors the client's
 * own resumeIfNeeded() so the reopen response is self-describing.
 */
function computeInflight(
  rows: Array<{ content: unknown; skill_run_id: string | null; run_kind: string | null }>,
): { tool_use_id: string; skill_run_id: string | null; run_kind: string | null } | null {
  const satisfied = new Set<string>();
  const pending: Array<{ id: string; skill_run_id: string | null; run_kind: string | null }> = [];
  for (const row of rows) {
    if (!Array.isArray(row.content)) continue;
    for (const block of row.content as Array<Record<string, unknown>>) {
      if (block?.type === 'tool_use' && typeof block.id === 'string') {
        pending.push({ id: block.id, skill_run_id: row.skill_run_id, run_kind: row.run_kind });
      } else if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        satisfied.add(block.tool_use_id);
      }
    }
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    if (!satisfied.has(pending[i].id)) {
      return { tool_use_id: pending[i].id, skill_run_id: pending[i].skill_run_id, run_kind: pending[i].run_kind };
    }
  }
  return null;
}

// ── POST /v1/agent/chats ─────────────────────────────────────────────────────
// Create a chat. Optionally append a first message in the same call.
// Body: { project_id?, title?, first_message?: IncomingMessage }
export async function createChatRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;

  const body = (req.body ?? {}) as {
    project_id?: string | null;
    title?: string | null;
    first_message?: IncomingMessage | null;
  };

  const projectId = isUuid(body.project_id) ? body.project_id : null;
  const title = typeof body.title === 'string' ? body.title.slice(0, 200) : null;

  const { data: chat, error } = await supabase
    .from('agent_chats')
    .insert({ user_id: userId, project_id: projectId, title })
    .select('id, project_id, title, status, pinned, last_skill_run_id, message_count, last_message_at, created_at, updated_at')
    .single();

  if (error || !chat) {
    console.error(`[agent chats create] ${error?.message ?? 'no row'}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create chat' } });
    return;
  }

  // Optional inline first message — reuse the append path for seq/counters.
  if (body.first_message && typeof body.first_message === 'object') {
    await appendMessagesToChat(userId, chat.id, [body.first_message]);
  }

  res.status(201).json({ id: chat.id, chat });
}

// ── POST /v1/agent/chats/:id/messages ────────────────────────────────────────
// The core write. Idempotent by (chat_id, client_msg_id), server-assigns seq,
// bumps message_count / last_message_at / last_skill_run_id.
// Body: { messages: IncomingMessage[] }
export async function appendMessagesRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;

  const chatId = req.params.id;
  if (!isUuid(chatId)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid chat id' } });
    return;
  }

  const raw = (req.body ?? {}) as { messages?: unknown };
  const incoming = Array.isArray(raw.messages) ? (raw.messages as IncomingMessage[]) : [];
  if (incoming.length === 0) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'messages[] required' } });
    return;
  }

  const result = await appendMessagesToChat(userId, chatId, incoming);
  if (result.error === 'not_found') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chat not found' } });
    return;
  }
  if (result.error) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to append messages' } });
    return;
  }
  res.status(200).json({ inserted: result.inserted, message_count: result.message_count });
}

/**
 * Shared append: ownership check → drop already-present client_msg_ids
 * (idempotent) → assign seq = MAX(seq)+1.. → insert → bump chat counters.
 * Serial per chat (single-tab v1); the UNIQUE(chat_id,seq) index is the backstop.
 */
async function appendMessagesToChat(
  userId: string,
  chatId: string,
  incoming: IncomingMessage[],
): Promise<{ error?: 'not_found' | 'db'; inserted: number; message_count: number }> {
  // 1) Ownership.
  const { data: chat, error: chatErr } = await supabase
    .from('agent_chats')
    .select('id, message_count')
    .eq('id', chatId)
    .eq('user_id', userId)
    .maybeSingle();
  if (chatErr) {
    console.error(`[agent chats append] load chat: ${chatErr.message}`);
    return { error: 'db', inserted: 0, message_count: 0 };
  }
  if (!chat) return { error: 'not_found', inserted: 0, message_count: 0 };

  // 2) Idempotency: skip any client_msg_id already persisted to this chat.
  const ids = incoming.map((m) => m.client_msg_id).filter((v): v is string => typeof v === 'string' && v.length > 0);
  let present = new Set<string>();
  if (ids.length > 0) {
    const { data: existing, error: existErr } = await supabase
      .from('agent_messages')
      .select('client_msg_id')
      .eq('chat_id', chatId)
      .in('client_msg_id', ids);
    if (existErr) {
      console.error(`[agent chats append] dedup: ${existErr.message}`);
      return { error: 'db', inserted: 0, message_count: 0 };
    }
    present = new Set((existing ?? []).map((r) => r.client_msg_id as string));
  }

  const fresh = incoming.filter((m) => !(typeof m.client_msg_id === 'string' && present.has(m.client_msg_id)));
  if (fresh.length === 0) {
    return { inserted: 0, message_count: chat.message_count };
  }

  // 3) Server-assign seq starting at MAX(seq)+1.
  const { data: maxRow, error: maxErr } = await supabase
    .from('agent_messages')
    .select('seq')
    .eq('chat_id', chatId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    console.error(`[agent chats append] max seq: ${maxErr.message}`);
    return { error: 'db', inserted: 0, message_count: 0 };
  }
  let seq = (maxRow?.seq ?? 0) as number;

  const rows = fresh.map((m) => ({
    chat_id: chatId,
    user_id: userId,
    seq: ++seq,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content ?? null,
    skill_run_id: isUuid(m.skill_run_id) ? m.skill_run_id : null,
    primitive_run_id: isUuid(m.primitive_run_id) ? m.primitive_run_id : null,
    run_kind: m.run_kind === 'skill' || m.run_kind === 'primitive' ? m.run_kind : null,
    client_msg_id: typeof m.client_msg_id === 'string' && m.client_msg_id.length > 0 ? m.client_msg_id : null,
  }));

  const { error: insErr } = await supabase.from('agent_messages').insert(rows);
  if (insErr) {
    // A concurrent writer raced us on (chat_id, seq) or (chat_id, client_msg_id).
    // Treat as benign in v1 (serial assumption) and report no-op rather than 500.
    console.error(`[agent chats append] insert: ${insErr.message}`);
    return { error: 'db', inserted: 0, message_count: chat.message_count };
  }

  // 4) Bump chat counters. last_skill_run_id = last skill run in this batch.
  const lastSkillRun = [...rows].reverse().find((r) => r.skill_run_id)?.skill_run_id ?? null;
  const newCount = (chat.message_count ?? 0) + rows.length;
  const patch: Record<string, unknown> = { message_count: newCount, last_message_at: new Date().toISOString() };
  if (lastSkillRun) patch.last_skill_run_id = lastSkillRun;
  const { error: bumpErr } = await supabase.from('agent_chats').update(patch).eq('id', chatId).eq('user_id', userId);
  if (bumpErr) console.error(`[agent chats append] bump: ${bumpErr.message}`); // non-fatal

  return { inserted: rows.length, message_count: newCount };
}

// ── GET /v1/agent/chats/:id ──────────────────────────────────────────────────
// Reopen: { chat, messages[] (seq ASC, windowed), inflight }.
// Query: ?before_seq=&limit=60
export async function getChatRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;

  const chatId = req.params.id;
  if (!isUuid(chatId)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid chat id' } });
    return;
  }

  const limit = clampLimit((req.query as { limit?: string }).limit, 60, 200);
  const beforeSeq = Number((req.query as { before_seq?: string }).before_seq);

  const { data: chat, error: chatErr } = await supabase
    .from('agent_chats')
    .select('id, project_id, title, status, pinned, last_skill_run_id, message_count, last_message_at, archived_at, created_at, updated_at')
    .eq('id', chatId)
    .eq('user_id', userId)
    .maybeSingle();
  if (chatErr) {
    console.error(`[agent chats get] ${chatErr.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to load chat' } });
    return;
  }
  if (!chat) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chat not found' } });
    return;
  }

  // Window the tail: take the newest `limit` (older than before_seq if given),
  // then return ascending so the client renders top→bottom.
  let q = supabase
    .from('agent_messages')
    .select('seq, role, content, skill_run_id, primitive_run_id, run_kind, client_msg_id, created_at')
    .eq('chat_id', chatId)
    .eq('user_id', userId);
  if (Number.isFinite(beforeSeq)) q = q.lt('seq', beforeSeq);
  const { data: rowsDesc, error: msgErr } = await q.order('seq', { ascending: false }).limit(limit);
  if (msgErr) {
    console.error(`[agent chats get messages] ${msgErr.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to load messages' } });
    return;
  }
  const messages = (rowsDesc ?? []).slice().reverse();
  const has_more = (rowsDesc?.length ?? 0) === limit && messages.length > 0 && (messages[0].seq as number) > 1;

  res.status(200).json({ chat, messages, has_more, inflight: computeInflight(messages) });
}

// ── GET /v1/agent/chats ──────────────────────────────────────────────────────
// Left-rail list: pinned first, then recency. Query: ?project_id=&status=&q=&limit=
// Returns { chats[], projects[] } — no messages (cheap).
export async function listChatsRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;

  const limit = clampLimit((req.query as { limit?: string }).limit, 50, 100);
  const status = (req.query as { status?: string }).status;
  const projectId = (req.query as { project_id?: string }).project_id;
  const search = (req.query as { q?: string }).q;

  let q = supabase
    .from('agent_chats')
    .select('id, project_id, title, status, pinned, last_skill_run_id, message_count, last_message_at, created_at, updated_at')
    .eq('user_id', userId);
  // Soft-archive: default to non-archived unless status=archived|all requested.
  if (status === 'archived') q = q.not('archived_at', 'is', null);
  else if (status !== 'all') q = q.is('archived_at', null);
  if (isUuid(projectId)) q = q.eq('project_id', projectId);
  if (typeof search === 'string' && search.trim()) q = q.ilike('title', `%${search.trim()}%`);

  const { data: chats, error } = await q
    .order('pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error(`[agent chats list] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to list chats' } });
    return;
  }

  // Projects[] alongside (empty in P1 — projects UI lands in P3).
  const { data: projects } = await supabase
    .from('agent_projects')
    .select('id, name, emoji, instructions, created_at, updated_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);

  res.status(200).json({ chats: chats ?? [], projects: projects ?? [] });
}

// ── PATCH /v1/agent/chats/:id ────────────────────────────────────────────────
// Rename / pin / archive / move-to-project. Body: { title?, pinned?, status?, project_id? }
export async function patchChatRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;

  const chatId = req.params.id;
  if (!isUuid(chatId)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid chat id' } });
    return;
  }

  const body = (req.body ?? {}) as {
    title?: unknown;
    pinned?: unknown;
    status?: unknown;
    project_id?: unknown;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 200);
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
  if (body.status === 'active' || body.status === 'archived') {
    patch.status = body.status;
    patch.archived_at = body.status === 'archived' ? new Date().toISOString() : null;
  }
  if (body.project_id === null) patch.project_id = null;
  else if (isUuid(body.project_id)) patch.project_id = body.project_id;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No valid fields to update' } });
    return;
  }

  const { data, error } = await supabase
    .from('agent_chats')
    .update(patch)
    .eq('id', chatId)
    .eq('user_id', userId)
    .select('id, project_id, title, status, pinned, last_skill_run_id, message_count, last_message_at, archived_at, created_at, updated_at')
    .maybeSingle();
  if (error) {
    console.error(`[agent chats patch] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to update chat' } });
    return;
  }
  if (!data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chat not found' } });
    return;
  }
  res.status(200).json({ chat: data });
}

// ── DELETE /v1/agent/chats/:id ───────────────────────────────────────────────
// SOFT-archive only (never hard delete — preserves skill_run audit links).
export async function deleteChatRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;

  const chatId = req.params.id;
  if (!isUuid(chatId)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid chat id' } });
    return;
  }

  const { data, error } = await supabase
    .from('agent_chats')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', chatId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error(`[agent chats delete] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to archive chat' } });
    return;
  }
  if (!data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chat not found' } });
    return;
  }
  res.status(200).json({ ok: true, id: data.id });
}

// ════════════════════════════════════════════════════════════════════════════
// Projects (Phase 3) — left-rail groups; a chat belongs to 0/1 project. A
// project's `instructions` are the pinned free-text context the client passes
// to the brain for every chat in the project.
// ════════════════════════════════════════════════════════════════════════════

const PROJECT_COLS = 'id, name, emoji, instructions, created_at, updated_at';

// GET /v1/agent/projects
export async function listProjectsRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { data, error } = await supabase
    .from('agent_projects')
    .select(PROJECT_COLS)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error(`[agent projects list] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to list projects' } });
    return;
  }
  res.status(200).json({ projects: data ?? [] });
}

// POST /v1/agent/projects { name, emoji?, instructions? }
export async function createProjectRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const body = (req.body ?? {}) as { name?: unknown; emoji?: unknown; instructions?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name required' } });
    return;
  }
  const { data, error } = await supabase
    .from('agent_projects')
    .insert({
      user_id: userId,
      name,
      emoji: typeof body.emoji === 'string' ? body.emoji.slice(0, 8) : null,
      instructions: typeof body.instructions === 'string' ? body.instructions.slice(0, 8000) : null,
    })
    .select(PROJECT_COLS)
    .single();
  if (error || !data) {
    console.error(`[agent projects create] ${error?.message ?? 'no row'}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create project' } });
    return;
  }
  res.status(201).json({ project: data });
}

// PATCH /v1/agent/projects/:id { name?, emoji?, instructions? }
export async function patchProjectRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid project id' } });
    return;
  }
  const body = (req.body ?? {}) as { name?: unknown; emoji?: unknown; instructions?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (typeof body.emoji === 'string') patch.emoji = body.emoji.slice(0, 8) || null;
  if (typeof body.instructions === 'string') patch.instructions = body.instructions.slice(0, 8000);
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No valid fields to update' } });
    return;
  }
  const { data, error } = await supabase
    .from('agent_projects')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(PROJECT_COLS)
    .maybeSingle();
  if (error) {
    console.error(`[agent projects patch] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to update project' } });
    return;
  }
  if (!data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  res.status(200).json({ project: data });
}

// DELETE /v1/agent/projects/:id — soft-archive; detach its chats (project_id→null)
// so they fall back to loose Recents rather than dangling on a hidden project.
export async function deleteProjectRoute(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = req.params.id;
  if (!isUuid(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid project id' } });
    return;
  }
  await supabase.from('agent_chats').update({ project_id: null }).eq('project_id', id).eq('user_id', userId);
  const { data, error } = await supabase
    .from('agent_projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error(`[agent projects delete] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to archive project' } });
    return;
  }
  if (!data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return;
  }
  res.status(200).json({ ok: true, id: data.id });
}
