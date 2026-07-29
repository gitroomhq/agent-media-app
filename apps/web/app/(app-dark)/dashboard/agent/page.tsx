// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/agent — in-app creative agent (Claude-Desktop-style).
 *
 * The brain (/api/agent → api-v2) picks the next skill; this client runs it via
 * the proven /api/v1/skills/<slug>/run + poll path, then feeds the tool_result
 * back to continue (deferred-then-resume for long renders).
 *
 * Layout: a clean conversation column + a right WORKSPACE PANEL (Cowork-style)
 * that holds the live render Progress, the character picker, and an Artifacts
 * tray — so selections/progress live in a panel, not stuffed inline in the chat.
 *
 * Persistence: the transcript + each run's id are saved to localStorage, so a
 * refresh restores the conversation AND re-attaches to an in-flight render.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2, Send, Square, Sparkles, Wrench, Check, AlertCircle, ArrowDown, Plus, Trash2, X, RotateCcw, PanelRight, ListChecks, Users, Images, CornerDownLeft, Pencil, MessageSquarePlus, History, Pin, PinOff, Archive, Search, MoreHorizontal, Folder, FolderPlus, ChevronRight, ChevronDown } from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
// `cmid` is a stable per-message idempotency key (server dedup on (chat_id,
// cmid)); `skillRunId`/`runKind` link a tool_result message to the run that
// produced it so a reopened chat re-shows media + re-attaches its run. These
// three are CLIENT-ONLY — stripped before the transcript reaches the brain.
interface Msg { role: 'user' | 'assistant'; content: string | Block[]; cmid?: string; skillRunId?: string | null; runKind?: 'skill' | 'primitive' | null }
interface ChatSummary { id: string; title: string | null; status: string; pinned: boolean; message_count: number; last_message_at: string; project_id?: string | null }
interface Project { id: string; name: string; emoji?: string | null; instructions?: string | null }
interface SavedCharacter { id: string; name: string; character_sheet_url?: string | null; thumbnail_url?: string | null }
interface StepArtifact { url?: string; kind?: string; mime?: string }
interface StepInfo { primitive_run_id: string; primitive: string; status: string; artifacts?: StepArtifact[]; error?: { message?: string } | null }
interface ToolRun { skill: string; status: 'running' | 'succeeded' | 'failed'; mediaUrl?: string; note?: string; runId?: string; composed?: boolean; characters?: SavedCharacter[]; currentStep?: string; steps?: StepInfo[] }
interface AskOption { label: string; description?: string; recommended?: boolean }
interface PendingAsk { toolUseId: string; question: string; options: AskOption[]; allowOther: boolean }

// Friendly labels.
const STEP_LABEL: Record<string, string> = {
  portrait_gpt2: 'Portrait', portrait: 'Portrait',
  character_sheet_gpt2: 'Character sheet', character_sheet: 'Character sheet',
  wireframe_gpt2: 'Storyboard', wireframe: 'Storyboard',
  simple_selfie: 'Clip', lip_sync: 'Clip',
  product_in_hands: 'Product shot',
  compose: 'Compose', broll_overlay: 'Compose', subtitles: 'Captions',
};
const SKILL_LABEL: Record<string, string> = {
  make_ugc: 'Agent-Media UGC Video',
  make_portrait: 'Portrait', make_character_sheet: 'Character sheet', make_wireframe: 'Storyboard',
  make_simple_selfie: 'Talking-head clip', make_lip_sync: 'Lip-sync clip', make_subtitles: 'Captions',
  make_ugc_video: 'UGC video', make_broll_talking_head: 'B-roll talking-head', make_product_in_hands: 'Product video',
  make_podcast: 'Podcast', list_my_characters: 'Your characters',
};
function stepLabels(steps: StepInfo[]): string[] {
  const clipKinds = new Set(['simple_selfie', 'lip_sync']);
  const totalClips = steps.filter((s) => clipKinds.has(s.primitive)).length;
  let clipN = 0;
  return steps.map((s) => {
    const base = STEP_LABEL[s.primitive] ?? s.primitive.replace(/_/g, ' ');
    if (clipKinds.has(s.primitive) && totalClips > 1) { clipN += 1; return `${base} ${clipN}`; }
    return base;
  });
}
function isImage(url: string) { return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url); }
function skillLabel(name: string) { return SKILL_LABEL[name] ?? name.replace(/_/g, ' '); }

// ── Minimal markdown renderer (no dependency). The brain emits **bold**,
// *italic*, `code`, [links](url), and numbered/bulleted lists — render them
// instead of showing the raw markdown characters.
function mdInline(text: string, kp: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0; let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) out.push(<code key={`${kp}-${n}`} className="rounded px-1 py-0.5 text-[13px]" style={{ background: 'rgba(255,255,255,0.08)' }}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={`${kp}-${n}`} style={{ color: '#FFFFFF' }}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('*')) out.push(<em key={`${kp}-${n}`}>{t.slice(1, -1)}</em>);
    else { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t); if (mm) out.push(<a key={`${kp}-${n}`} href={mm[2]} target="_blank" rel="noreferrer" style={{ color: '#A78BFA', textDecoration: 'underline' }}>{mm[1]}</a>); }
    last = m.index + t.length; n++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  const isOl = (s: string) => /^\s*\d+[.)]\s+/.test(s);
  const isUl = (s: string) => /^\s*[-•]\s+/.test(s) || /^\s*\*\s+/.test(s);
  let i = 0; let k = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    if (isOl(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && isOl(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      blocks.push(<ol key={k} className="list-decimal space-y-1 pl-5">{items.map((it, j) => <li key={j}>{mdInline(it, `o${k}-${j}`)}</li>)}</ol>); k++;
      continue;
    }
    if (isUl(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && isUl(lines[i])) { items.push(lines[i].replace(/^\s*[-•*]\s+/, '')); i++; }
      blocks.push(<ul key={k} className="list-disc space-y-1 pl-5">{items.map((it, j) => <li key={j}>{mdInline(it, `u${k}-${j}`)}</li>)}</ul>); k++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isOl(lines[i]) && !isUl(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={k}>{para.map((p, j) => <span key={j}>{mdInline(p, `p${k}-${j}`)}{j < para.length - 1 ? <br /> : null}</span>)}</p>); k++;
  }
  return <div className="space-y-2.5 text-[15px] leading-relaxed" style={{ color: '#E9E9F0' }}>{blocks}</div>;
}

const TERMINAL = new Set(['succeeded', 'completed', 'success', 'failed', 'canceled', 'cancelled']);
const FAILSTATES = new Set(['failed', 'canceled', 'cancelled']);
const DONE = new Set(['succeeded', 'completed', 'success']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LS_KEY = 'am_agent_session_v1';
const MIGRATED_KEY = 'am_agent_migrated_v1';

const genId = (): string => {
  try { return crypto.randomUUID(); } catch { return `m_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
};

// Strip the hidden [marker] lines + markdown noise → a short chat title.
function titleFrom(text: string): string {
  const clean = text.replace(/\n*\[(?:product_image_url|character_sheet_url):[^\]]*\]/g, '').replace(/[*_`#>]/g, '').trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : (clean || 'New chat');
}

// Map a client Msg → the server's append payload (drops cmid into client_msg_id).
function toServerMessage(m: Msg) {
  return { role: m.role, content: m.content, client_msg_id: m.cmid, skill_run_id: m.skillRunId ?? null, run_kind: m.runKind ?? null };
}

// Reopen: rebuild the toolRuns map from persisted rows so inline media + ask_user
// answers re-render. tool_use names come from assistant blocks; results are parsed.
function rebuildToolRuns(msgs: Msg[]): Record<string, ToolRun> {
  const names: Record<string, string> = {};
  for (const m of msgs) if (Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use') names[b.id] = b.name;
  const tr: Record<string, ToolRun> = {};
  for (const m of msgs) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type !== 'tool_result') continue;
      const name = names[b.tool_use_id] ?? '';
      let parsed: { status?: string; video_url?: string; selected?: string; text?: string; skipped?: boolean } = {};
      try { parsed = JSON.parse(b.content); } catch { /* keep empty */ }
      if (name === 'ask_user') {
        tr[b.tool_use_id] = { skill: 'ask_user', status: 'succeeded', note: parsed.skipped ? 'skipped' : (parsed.selected ?? parsed.text) };
      } else {
        const status = parsed.status === 'failed' ? 'failed' : 'succeeded';
        tr[b.tool_use_id] = { skill: name, status, mediaUrl: parsed.video_url ?? undefined, runId: m.skillRunId ?? undefined, composed: m.runKind === 'skill' };
      }
    }
  }
  return tr;
}

// Open INTENTS, not finished prompts. Tapping a chip only fills the composer.
const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: '🗣️ Talking-head UGC', prompt: "I want to make a talking-head UGC video — " },
  { label: '🛍️ Product review', prompt: "I want to make a product review video — " },
  { label: '🎉 Hype clip (5s)', prompt: "I want a 5-second hype clip — " },
  { label: '✨ New character', prompt: "I want to create a new character — " },
];

export default function AgentPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [toolRuns, setToolRuns] = useState<Record<string, ToolRun>>({});
  const [chatId, setChatId] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [newProject, setNewProject] = useState(false); // inline "new project" input open
  const [projectMenuFor, setProjectMenuFor] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null); // context editor modal
  const [moveMode, setMoveMode] = useState(false); // chat … menu showing the project picker
  const [chatQuery, setChatQuery] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ url: string; name: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);
  const [askHighlight, setAskHighlight] = useState(0);
  const askResolverRef = useRef<((answer: string) => void) | null>(null);
  // Confirm-before-spend (Phase 0): a quoted cost gate shown before any paid tool_use.
  const [pendingSpend, setPendingSpend] = useState<{ toolUseId: string; skill: string; credits: number; available: number | null; sufficient: boolean } | null>(null);
  const spendResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectCtxRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);
  useEffect(() => { if (atBottom) scrollToBottom(); }, [messages, toolRuns, atBottom, scrollToBottom]);
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }

  // chatId is the source of truth for which conversation we're writing to; the
  // ref lets async loop steps read it without a stale closure.
  function setChat(id: string | null) {
    chatIdRef.current = id;
    setChatId(id);
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('chat', id); else url.searchParams.delete('chat');
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  }

  // ── Persistence + resume ──────────────────────────────────────────────
  // Server is the source of truth (cross-device); localStorage is a per-session
  // cache for instant paint + offline fallback. On first load we (a) open the
  // ?chat / cached chat from the server, or (b) adopt a legacy localStorage
  // session into a new server chat once — so no in-flight session is lost.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cached: { chatId?: string | null; messages?: Msg[]; toolRuns?: Record<string, ToolRun> } = {};
    try { const raw = localStorage.getItem(LS_KEY); if (raw) cached = JSON.parse(raw); } catch { /* ignore */ }
    const urlChat = (() => { try { return new URL(window.location.href).searchParams.get('chat'); } catch { return null; } })();

    void (async () => {
      void fetchChats();
      if (urlChat) {
        const ok = await openChat(urlChat, /*resume*/ true);
        if (!ok && cached.chatId === urlChat) { setMessages(cached.messages ?? []); setToolRuns(cached.toolRuns ?? {}); setChat(urlChat); }
        setHydrated(true);
        return;
      }
      if (cached.chatId) {
        // Instant paint from cache, then refresh from the server in the background.
        setMessages(cached.messages ?? []); setToolRuns(cached.toolRuns ?? {}); setChat(cached.chatId);
        void openChat(cached.chatId, /*resume*/ true);
        setHydrated(true);
        return;
      }
      if ((cached.messages?.length ?? 0) > 0) {
        // Legacy pre-persistence session → adopt into a server chat once.
        setMessages(cached.messages ?? []); setToolRuns(cached.toolRuns ?? {});
        await adoptLegacy(cached.messages ?? [], cached.toolRuns ?? {});
        void resumeIfNeeded(cached.messages ?? [], cached.toolRuns ?? {});
      }
      setHydrated(true);
    })();
  }, []);

  // Cache the live session (incl. chatId) for instant paint + offline fallback.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ chatId, messages, toolRuns })); } catch { /* ignore */ }
  }, [messages, toolRuns, chatId, hydrated]);

  function lastUnresolvedToolUse(msgs: Msg[]): Extract<Block, { type: 'tool_use' }> | null {
    const resolved = new Set<string>();
    for (const m of msgs) if (Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_result') resolved.add(b.tool_use_id);
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        const tu = m.content.find((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
        if (tu && !resolved.has(tu.id)) return tu;
      }
    }
    return null;
  }

  async function callBrain(msgs: Msg[]): Promise<{ stop_reason: string; content: Block[] }> {
    // Strip client-only persistence fields — the brain (Anthropic) only accepts {role, content}.
    const wire = msgs.map((m) => ({ role: m.role, content: m.content }));
    // Pinned context of the project this chat belongs to (injected into SYSTEM).
    const proj = activeProjectIdRef.current ? projects.find((p) => p.id === activeProjectIdRef.current) : undefined;
    const project_context = proj?.instructions?.trim() || undefined;
    const r = await fetch('/api/agent', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: wire, project_context }), signal: abortRef.current?.signal,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.detail ? JSON.stringify(j.detail).slice(0, 300) : (j?.error?.code ?? `agent ${r.status}`));
    return { stop_reason: j.stop_reason, content: (j.content ?? []) as Block[] };
  }

  // ── Chat persistence (client-driven, idempotent, fire-and-forget) ────────
  async function fetchChats() {
    try {
      const r = await fetch('/api/v1/agent/chats?limit=50', { credentials: 'include' });
      if (!r.ok) return;
      const j = (await r.json()) as { chats?: ChatSummary[]; projects?: Project[] };
      setChats(j.chats ?? []);
      setProjects(j.projects ?? []);
    } catch { /* ignore */ }
  }
  function setActiveProject(id: string | null) { activeProjectIdRef.current = id; setActiveProjectId(id); }

  /** Open a persisted chat from the server: rebuild messages + toolRuns, optionally resume. */
  async function openChat(id: string, resume: boolean): Promise<boolean> {
    try {
      const r = await fetch(`/api/v1/agent/chats/${id}`, { credentials: 'include' });
      if (!r.ok) return false;
      const j = (await r.json()) as { chat?: { project_id?: string | null }; messages?: Array<{ role: 'user' | 'assistant'; content: unknown; client_msg_id?: string | null; skill_run_id?: string | null; run_kind?: 'skill' | 'primitive' | null }> };
      const msgs: Msg[] = (j.messages ?? []).map((m) => ({
        role: m.role, content: m.content as string | Block[],
        cmid: m.client_msg_id ?? undefined, skillRunId: m.skill_run_id ?? undefined, runKind: m.run_kind ?? undefined,
      }));
      const tr = rebuildToolRuns(msgs);
      setMessages(msgs); setToolRuns(tr); setChat(id); setActiveProject(j.chat?.project_id ?? null);
      if (resume) void resumeIfNeeded(msgs, tr);
      return true;
    } catch { return false; }
  }

  /** Get (or mint) the chat we're writing to. Mints with a truncated auto-title. */
  async function ensureChat(titleSeed?: string): Promise<string | null> {
    if (chatIdRef.current) return chatIdRef.current;
    try {
      const r = await fetch('/api/v1/agent/chats', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleSeed ? titleFrom(titleSeed) : null, project_id: activeProjectIdRef.current }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { id?: string };
      if (!j.id) return null;
      setChat(j.id);
      void fetchChats();
      return j.id;
    } catch { return null; }
  }

  /** Append new messages to the current chat (idempotent by cmid). Fire-and-forget. */
  function persist(newMsgs: Msg[]) {
    const cid = chatIdRef.current;
    const rows = newMsgs.filter((m) => m.cmid);
    if (!cid || rows.length === 0) return;
    void fetch(`/api/v1/agent/chats/${cid}/messages`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: rows.map(toServerMessage) }),
    }).catch(() => { /* offline / local-dev without service role — cache still holds it */ });
  }

  /** One-time adoption of a legacy localStorage session into a fresh server chat. */
  async function adoptLegacy(msgs: Msg[], _tr: Record<string, ToolRun>) {
    try { if (localStorage.getItem(MIGRATED_KEY)) return; } catch { /* ignore */ }
    if (msgs.length === 0) return;
    const firstUser = msgs.find((m) => m.role === 'user' && typeof m.content === 'string');
    const seed = typeof firstUser?.content === 'string' ? firstUser.content : undefined;
    const id = await ensureChat(seed);
    if (!id) return;
    // Stamp cmids on any legacy messages that lack them so the append is idempotent.
    const stamped = msgs.map((m) => (m.cmid ? m : { ...m, cmid: genId() }));
    setMessages(stamped);
    persist(stamped);
    try { localStorage.setItem(MIGRATED_KEY, '1'); } catch { /* ignore */ }
    void fetchChats();
  }

  /** Poll an already-submitted run to completion → tool_result string. */
  async function pollRun(toolUseId: string, runId: string, composed: boolean): Promise<string> {
    const pollPath = composed ? `/api/v1/skills/runs/${runId}` : `/api/v1/primitives/runs/${runId}`;
    for (let i = 0; i < 200; i++) {
      await sleep(5000);
      if (cancelRef.current) {
        setToolRuns((p) => ({ ...p, [toolUseId]: { ...p[toolUseId], skill: p[toolUseId]?.skill ?? '', status: 'failed', note: 'canceled' } }));
        return JSON.stringify({ status: 'canceled' });
      }
      let pr: Response;
      try {
        pr = await fetch(pollPath, { credentials: 'include', signal: abortRef.current?.signal });
      } catch (e) {
        if (cancelRef.current || (e as Error)?.name === 'AbortError') {
          setToolRuns((p) => ({ ...p, [toolUseId]: { ...p[toolUseId], skill: p[toolUseId]?.skill ?? '', status: 'failed', note: 'canceled' } }));
          return JSON.stringify({ status: 'canceled' });
        }
        continue; // transient network blip — keep polling
      }
      if (!pr.ok) continue;
      const d = await pr.json();
      const status = String(d.status ?? '');
      // Glassbox: surface the live per-step checklist + any artifacts produced so
      // far (the API already returns current_step + steps[]). Shown in the panel.
      if (composed) {
        setToolRuns((p) => ({
          ...p,
          [toolUseId]: { ...p[toolUseId], skill: p[toolUseId]?.skill ?? '', currentStep: d.current_step ?? undefined, steps: Array.isArray(d.steps) ? (d.steps as StepInfo[]) : p[toolUseId]?.steps },
        }));
      }
      if (!TERMINAL.has(status)) continue;
      if (FAILSTATES.has(status)) {
        setToolRuns((p) => ({ ...p, [toolUseId]: { ...p[toolUseId], skill: p[toolUseId]?.skill ?? '', status: 'failed', note: d?.error?.message ?? d?.error ?? status } }));
        return JSON.stringify({ status: 'failed', error: d?.error ?? status });
      }
      const artifacts = (d.artifacts ?? []) as Array<{ url?: string }>;
      const videoUrl = (d.final_output?.video_url as string) ?? artifacts.find((a) => /\.(mp4|webm|mov)(\?|$)/i.test(a.url ?? ''))?.url ?? artifacts[0]?.url ?? null;
      setToolRuns((p) => ({ ...p, [toolUseId]: { ...p[toolUseId], skill: p[toolUseId]?.skill ?? '', status: 'succeeded', mediaUrl: videoUrl ?? undefined } }));
      return JSON.stringify({ status: 'succeeded', video_url: videoUrl, artifact_urls: artifacts.map((a) => a.url).filter(Boolean), final_output: d.final_output ?? null });
    }
    setToolRuns((p) => ({ ...p, [toolUseId]: { ...p[toolUseId], skill: p[toolUseId]?.skill ?? '', status: 'failed', note: 'timed out' } }));
    return JSON.stringify({ status: 'timeout' });
  }

  /** Read-only tool: list the user's saved characters. Resolves immediately. */
  async function listMyCharacters(tu: Extract<Block, { type: 'tool_use' }>): Promise<string> {
    setToolRuns((p) => ({ ...p, [tu.id]: { skill: tu.name, status: 'running' } }));
    try {
      const r = await fetch('/api/dashboard/characters', { credentials: 'include', signal: abortRef.current?.signal });
      if (!r.ok) throw new Error(`characters ${r.status}`);
      const j = (await r.json()) as { characters?: SavedCharacter[] };
      const limit = Math.min(Math.max(Number(tu.input?.limit) || 50, 1), 100);
      const list = (j.characters ?? []).filter((c) => !!c.character_sheet_url).slice(0, limit);
      setToolRuns((p) => ({ ...p, [tu.id]: { skill: tu.name, status: 'succeeded', characters: list } }));
      if (list.length > 0) setRailOpen(true);
      return JSON.stringify({
        status: 'succeeded',
        character_count: list.length,
        characters: list.map((c) => ({ name: c.name, character_sheet_url: c.character_sheet_url })),
      });
    } catch (e) {
      const note = e instanceof Error ? e.message : String(e);
      setToolRuns((p) => ({ ...p, [tu.id]: { skill: tu.name, status: 'failed', note } }));
      return JSON.stringify({ status: 'failed', error: note });
    }
  }

  /** Interactive selection: the brain's ask_user tool. Renders a choice card and
   *  RESOLVES (continuing the brain loop) only when the user picks / types / skips
   *  — Claude-Desktop-style. Costs nothing; no skill run. */
  function askUser(tu: Extract<Block, { type: 'tool_use' }>): Promise<string> {
    const inp = (tu.input ?? {}) as { question?: string; options?: AskOption[]; allow_other?: boolean };
    const options = Array.isArray(inp.options) ? inp.options.filter((o) => o && typeof o.label === 'string') : [];
    if (options.length === 0) return Promise.resolve(JSON.stringify({ status: 'answered', skipped: true }));
    setToolRuns((p) => ({ ...p, [tu.id]: { skill: 'ask_user', status: 'running' } }));
    setPendingAsk({ toolUseId: tu.id, question: String(inp.question ?? 'Choose an option'), options, allowOther: inp.allow_other !== false });
    const rec = options.findIndex((o) => o.recommended);
    setAskHighlight(rec >= 0 ? rec : 0);
    return new Promise<string>((resolve) => { askResolverRef.current = resolve; });
  }
  function resolveAsk(payload: { selected?: string; text?: string; skipped?: boolean }) {
    const r = askResolverRef.current;
    askResolverRef.current = null;
    const id = pendingAsk?.toolUseId;
    setPendingAsk(null);
    if (id) setToolRuns((p) => ({ ...p, [id]: { ...p[id], skill: 'ask_user', status: 'succeeded', note: payload.skipped ? 'skipped' : (payload.selected ?? payload.text) } }));
    r?.(JSON.stringify({ status: 'answered', ...payload }));
  }

  /** Confirm-before-spend (Phase 0): quote a paid skill, show the cost gate, resolve on
   *  Generate/Cancel. Fail-open (proceed) if the quote errors or the skill is free. */
  const FREE_TOOLS = new Set(['ask_user', 'list_my_characters']);
  async function confirmSpend(tu: Extract<Block, { type: 'tool_use' }>): Promise<boolean> {
    let quote: { credits?: number; available?: number | null; sufficient?: boolean } = {};
    try {
      const r = await fetch(`/api/v1/skills/${encodeURIComponent(tu.name)}/quote`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tu.input ?? {}), signal: abortRef.current?.signal,
      });
      if (r.ok) quote = await r.json();
    } catch { /* quote failed → proceed (fail-open; preflight still guards on /run) */ }
    const credits = Number(quote.credits ?? 0);
    if (!credits) return true; // free / unknown cost → no gate
    setRailOpen(true);
    setPendingSpend({ toolUseId: tu.id, skill: tu.name, credits, available: quote.available ?? null, sufficient: quote.sufficient !== false });
    return new Promise<boolean>((resolve) => { spendResolverRef.current = resolve; });
  }
  function resolveSpend(approved: boolean) {
    const r = spendResolverRef.current;
    spendResolverRef.current = null;
    setPendingSpend(null);
    r?.(approved);
  }
  // Arrow-key navigation while a choice card is open (Enter is handled in the composer).
  useEffect(() => {
    if (!pendingAsk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAskHighlight((h) => Math.min(pendingAsk.options.length - 1, h + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setAskHighlight((h) => Math.max(0, h - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingAsk]);
  // Enter = Generate (if affordable), Esc = Cancel, while the spend gate is open.
  useEffect(() => {
    if (!pendingSpend) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); if (pendingSpend.sufficient) resolveSpend(true); }
      else if (e.key === 'Escape') { e.preventDefault(); resolveSpend(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingSpend]);

  /** Submit a skill then poll it. Records runId so a refresh can resume. Returns
   *  the tool_result text + the run linkage to stamp on the persisted message. */
  type RunResult = { text: string; runId?: string; runKind?: 'skill' | 'primitive' };
  async function runSkill(tu: Extract<Block, { type: 'tool_use' }>): Promise<RunResult> {
    if (tu.name === 'list_my_characters') return { text: await listMyCharacters(tu) };
    if (tu.name === 'ask_user') return { text: await askUser(tu) };
    setToolRuns((p) => ({ ...p, [tu.id]: { skill: tu.name, status: 'running' } }));
    setRailOpen(true);
    const sub = await fetch(`/api/v1/skills/${encodeURIComponent(tu.name)}/run`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tu.input), signal: abortRef.current?.signal,
    });
    const subJson = await sub.json();
    if (!sub.ok) {
      const detail = subJson?.detail ?? subJson?.error ?? `run ${sub.status}`;
      setToolRuns((p) => ({ ...p, [tu.id]: { skill: tu.name, status: 'failed', note: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200) } }));
      return { text: JSON.stringify({ status: 'failed', error: detail }) };
    }
    const composed = Boolean(subJson.skill_run_id);
    const id = (subJson.skill_run_id ?? subJson.run_id) as string;
    setToolRuns((p) => ({ ...p, [tu.id]: { skill: tu.name, status: 'running', runId: id, composed } }));
    const text = await pollRun(tu.id, id, composed);
    return { text, runId: id, runKind: composed ? 'skill' : 'primitive' };
  }

  /** The brain↔tool loop, starting from a given conversation. Each new message is
   *  persisted (fire-and-forget, idempotent) so the chat survives reload/device. */
  async function driveLoop(start: Msg[]) {
    let convo = start;
    for (let step = 0; step < 12; step++) {
      if (cancelRef.current) break;
      const { content } = await callBrain(convo);
      const asstMsg: Msg = { role: 'assistant', content, cmid: genId() };
      convo = [...convo, asstMsg];
      setMessages(convo);
      persist([asstMsg]);
      const toolUse = content.find((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
      if (!toolUse) break;
      if (cancelRef.current) break;
      // Confirm-before-spend gate for paid skills. On decline, feed the brain a
      // declined tool_result so it can re-plan (offer alternatives) instead of spending.
      if (!FREE_TOOLS.has(toolUse.name)) {
        const approved = await confirmSpend(toolUse);
        if (cancelRef.current) break;
        if (!approved) {
          const declineMsg: Msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ status: 'declined', reason: 'user_declined_spend' }) }], cmid: toolUse.id };
          convo = [...convo, declineMsg];
          setMessages(convo);
          persist([declineMsg]);
          continue;
        }
      }
      const { text: resultText, runId, runKind } = await runSkill(toolUse);
      // cmid = the tool_use id (stable, unique) → idempotent re-append on retry.
      const trMsg: Msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: resultText }], cmid: toolUse.id, skillRunId: runId ?? null, runKind: runKind ?? null };
      convo = [...convo, trMsg];
      setMessages(convo);
      persist([trMsg]);
    }
  }

  /** On reload: if a tool_use has no result yet, re-attach to its run + continue. */
  async function resumeIfNeeded(msgs: Msg[], tr: Record<string, ToolRun>) {
    const tu = lastUnresolvedToolUse(msgs);
    if (!tu) return;
    const run = tr[tu.id];
    if (!run?.runId) return;
    cancelRef.current = false;
    abortRef.current = new AbortController();
    setBusy(true); setError(null);
    try {
      setToolRuns((p) => ({ ...p, [tu.id]: { ...run, status: 'running' } }));
      const resultText = await pollRun(tu.id, run.runId, !!run.composed);
      const trMsg: Msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu.id, content: resultText }], cmid: tu.id, skillRunId: run.runId ?? null, runKind: run.composed ? 'skill' : 'primitive' };
      const convo: Msg[] = [...msgs, trMsg];
      setMessages(convo);
      persist([trMsg]);
      await driveLoop(convo);
    } catch (e) { if (!cancelRef.current) setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function send(text: string) {
    // A typed reply while a choice card is open answers the choice (free-text).
    if (pendingAsk) { if (!text.trim()) return; setInput(''); resolveAsk({ text: text.trim() }); return; }
    if ((!text.trim() && !attachedImage) || busy) return;
    cancelRef.current = false;
    abortRef.current = new AbortController();
    setError(null); setInput(''); setAtBottom(true);
    const img = attachedImage;
    setAttachedImage(null);
    const base = text.trim() || 'Use this product image in a product video.';
    const content = img ? `${base}\n\n[product_image_url: ${img.url}]` : base;
    const userMsg: Msg = { role: 'user', content, cmid: genId() };
    // Mint the chat (idempotent) before driving so appends have a target; the
    // title is the truncated first user message (the chosen P1 default).
    await ensureChat(content);
    const convo: Msg[] = [...messages, userMsg];
    setMessages(convo);
    persist([userMsg]);
    setBusy(true);
    try { await driveLoop(convo); }
    catch (e) { if (!cancelRef.current) setError((e as Error).message); }
    finally { setBusy(false); void fetchChats(); }
  }

  /** Re-run a single failed generation, in place. Explicit (no silent re-spend). */
  async function retryRun(tu: Extract<Block, { type: 'tool_use' }>) {
    if (busy) return;
    cancelRef.current = false;
    abortRef.current = new AbortController();
    setBusy(true); setError(null);
    try { await runSkill(tu); }
    catch (e) { if (!cancelRef.current) setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function stop() {
    cancelRef.current = true;
    setBusy(false);
    abortRef.current?.abort();
    // Unblock the loop if it's parked on a confirm gate.
    if (spendResolverRef.current) resolveSpend(false);
    if (askResolverRef.current) resolveAsk({ skipped: true });
    const running = Object.values(toolRuns).find((r) => r.status === 'running' && r.runId && r.composed);
    if (running?.runId) {
      try {
        await fetch(`/api/v1/skills/runs/${encodeURIComponent(running.runId)}/cancel`, { method: 'POST', credentials: 'include' });
      } catch { /* ignore — client loop already halted */ }
    }
  }

  function newChat() {
    if (busy && !confirm('A generation is in progress — start a new chat anyway?')) return;
    setMessages([]); setToolRuns({}); setError(null); setAttachedImage(null);
    setChat(null); setActiveProject(null); // old chat persists on the server; just detach
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    void fetchChats();
  }
  // Start a new chat already homed in a project (its pinned context applies).
  function newChatInProject(pid: string) {
    if (busy && !confirm('A generation is in progress — start a new chat anyway?')) return;
    setMessages([]); setToolRuns({}); setError(null); setAttachedImage(null);
    setChat(null); setActiveProject(pid);
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }

  /** Reopen a past chat from the rail (disabled mid-generation to avoid cross-writes). */
  function selectChat(id: string) {
    if (id === chatIdRef.current || busy) return;
    setError(null);
    void openChat(id, true);
  }

  // ── Chat lifecycle (rail): rename / pin / archive ────────────────────────
  async function patchChat(id: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch(`/api/v1/agent/chats/${id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) return false;
      void fetchChats();
      return true;
    } catch { return false; }
  }
  function commitRename(id: string, value: string) {
    setRenamingId(null);
    const t = value.trim();
    if (t) { setChats((p) => p.map((c) => (c.id === id ? { ...c, title: t } : c))); void patchChat(id, { title: t }); }
  }
  async function archiveChat(id: string) {
    setMenuFor(null);
    setChats((p) => p.filter((c) => c.id !== id)); // optimistic
    try { await fetch(`/api/v1/agent/chats/${id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* ignore */ }
    if (chatIdRef.current === id) { setMessages([]); setToolRuns({}); setChat(null); setActiveProject(null); try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
    void fetchChats();
  }
  /** Move a chat into a project (or out: pid=null). Optimistic; re-injects context. */
  function moveChatToProject(id: string, pid: string | null) {
    setMenuFor(null); setMoveMode(false);
    setChats((p) => p.map((c) => (c.id === id ? { ...c, project_id: pid } : c)));
    if (chatIdRef.current === id) setActiveProject(pid);
    if (pid) setCollapsedProjects((p) => ({ ...p, [pid]: false }));
    void patchChat(id, { project_id: pid });
  }

  // ── Projects (rail groups + pinned context) ──────────────────────────────
  async function createProject(name: string): Promise<string | null> {
    const n = name.trim();
    if (!n) return null;
    try {
      const r = await fetch('/api/v1/agent/projects', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { project?: Project };
      if (j.project) setProjects((p) => [j.project as Project, ...p]);
      void fetchChats();
      return j.project?.id ?? null;
    } catch { return null; }
  }
  async function patchProject(id: string, body: Record<string, unknown>) {
    setProjects((p) => p.map((x) => (x.id === id ? { ...x, ...body } : x))); // optimistic
    try {
      await fetch(`/api/v1/agent/projects/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { /* ignore */ }
    void fetchChats();
  }
  async function deleteProject(id: string) {
    setProjectMenuFor(null);
    setProjects((p) => p.filter((x) => x.id !== id));
    setChats((p) => p.map((c) => (c.project_id === id ? { ...c, project_id: null } : c)));
    if (activeProjectIdRef.current === id) setActiveProject(null);
    try { await fetch(`/api/v1/agent/projects/${id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* ignore */ }
    void fetchChats();
  }
  function commitProjectRename(id: string, value: string) {
    setRenamingProjectId(null);
    const t = value.trim();
    if (t) void patchProject(id, { name: t });
  }

  // Close any open row/project menu (and the move-picker) on outside click.
  useEffect(() => {
    if (!menuFor && !projectMenuFor) return;
    const close = () => { setMenuFor(null); setProjectMenuFor(null); setMoveMode(false); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor, projectMenuFor]);

  // Upload a product image → Supabase Storage (signed PUT) → a signed read URL.
  async function handlePickImage(file: File) {
    setError(null);
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Upload a PNG, JPEG, or WebP image'); return;
    }
    if (file.size > 50 * 1024 * 1024) { setError('Image must be smaller than 50 MB'); return; }
    setUploadingImage(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      const { data, error: fnErr } = await invokeFn('upload-url', { body: { filename: safeName, content_type: file.type } });
      if (fnErr) throw new Error(fnErr.message ?? 'Failed to create upload URL');
      const u = data as { upload_url?: string; storage_path?: string } | null;
      if (!u?.upload_url || !u?.storage_path) throw new Error('Upload URL response was missing fields');
      const up = await fetch(u.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
      const signedResp = await fetch('/api/v1/generation-input-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: u.storage_path }),
      });
      const signed = await signedResp.json();
      if (!signedResp.ok || !signed?.signed_url) throw new Error(signed?.error?.message ?? 'Failed to sign uploaded image');
      setAttachedImage({ url: signed.signed_url as string, name: safeName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Picking a character acts immediately: send a clean "Use [name]" message and
  // carry the sheet URL in a hidden marker (the bubble hides it; the brain reads it).
  const reuseCharacter = (c: SavedCharacter) =>
    void send(`Use my saved character "${c.name}"\n\n[character_sheet_url: ${c.character_sheet_url}]`);

  const empty = messages.length === 0;

  // ── Derived workspace-panel data ──────────────────────────────────────
  const runList = Object.values(toolRuns);
  const activeRun = runList.find((r) => r.status === 'running' && (r.steps?.length ?? 0) > 0)
    ?? [...runList].reverse().find((r) => (r.steps?.length ?? 0) > 0);
  const charactersRun = [...runList].reverse().find((r) => Array.isArray(r.characters));
  const sessionArtifacts: { url: string; isImg: boolean }[] = (() => {
    const seen = new Set<string>(); const out: { url: string; isImg: boolean }[] = [];
    for (const r of runList) {
      for (const s of r.steps ?? []) for (const a of s.artifacts ?? []) if (a.url && !seen.has(a.url)) { seen.add(a.url); out.push({ url: a.url, isImg: isImage(a.url) }); }
      if (r.mediaUrl && !seen.has(r.mediaUrl)) { seen.add(r.mediaUrl); out.push({ url: r.mediaUrl, isImg: isImage(r.mediaUrl) }); }
    }
    return out;
  })();
  const hasPanelContent = Boolean(activeRun) || Boolean(charactersRun?.characters?.length) || sessionArtifacts.length > 0;

  const composer = (
    <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="w-full">
      <div className="rounded-[26px] px-4 py-3" style={{ background: '#1A1B23', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
        {attachedImage && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-[12px]" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachedImage.url} alt={attachedImage.name} className="h-7 w-7 rounded object-cover" />
            <span className="max-w-[160px] truncate">{attachedImage.name}</span>
            <button type="button" aria-label="Remove image" onClick={() => setAttachedImage(null)} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (pendingAsk && !input.trim()) { const o = pendingAsk.options[askHighlight]; if (o) resolveAsk({ selected: o.label }); return; }
              void send(input);
            }
          }}
          rows={empty ? 2 : 1}
          placeholder={pendingAsk ? 'Or reply directly…' : 'Describe the video you want to create…'}
          disabled={busy && !pendingAsk}
          className="max-h-40 w-full resize-none bg-transparent px-1 text-[15px] outline-none"
          style={{ color: '#E9E9F0' }}
        />
        <div className="mt-2 flex items-center justify-between">
          <>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePickImage(f); }} />
            <button type="button" aria-label="Attach a product image" title="Attach a product image" disabled={busy || uploadingImage} onClick={() => fileInputRef.current?.click()} className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-40" style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
              {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </>
          {busy && !pendingAsk ? (
            <button type="button" onClick={() => void stop()} aria-label="Stop generation" title="Stop" className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-opacity" style={{ background: '#A78BFA', color: '#0F1015' }}>
              <Square className="h-3.5 w-3.5" fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!pendingAsk && !input.trim() && !attachedImage} aria-label="Send" className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-opacity disabled:opacity-40" style={{ background: '#A78BFA', color: '#0F1015' }}>
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );

  // One row in the history rail: reopen on click; hover reveals a … menu
  // (rename / pin / archive); inline-edit while renaming.
  function renderChatRow(c: ChatSummary) {
    const active = c.id === chatId;
    if (renamingId === c.id) {
      return (
        <input
          key={c.id} autoFocus defaultValue={c.title ?? ''}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(c.id, (e.target as HTMLInputElement).value); } else if (e.key === 'Escape') { setRenamingId(null); } }}
          onBlur={(e) => commitRename(c.id, e.target.value)}
          className="w-full rounded-lg px-2.5 py-2 text-[13px] outline-none"
          style={{ background: '#14151F', border: '1px solid rgba(167,139,250,0.45)', color: '#E9E9F0' }}
        />
      );
    }
    return (
      <div key={c.id} className="group/row relative">
        <button type="button" onClick={() => selectChat(c.id)} disabled={busy && !active} title={c.title ?? 'New chat'}
          className="flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-7 text-left text-[13px] transition-colors hover:bg-white/[0.05] disabled:opacity-40"
          style={active ? { background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.28)' } : { border: '1px solid transparent' }}>
          {c.pinned
            ? <Pin className="h-3.5 w-3.5 shrink-0" style={{ color: active ? '#A78BFA' : 'rgba(255,255,255,0.45)' }} />
            : <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" style={{ color: active ? '#A78BFA' : 'rgba(255,255,255,0.3)' }} />}
          <span className="truncate" style={{ color: active ? '#E9E9F0' : 'rgba(255,255,255,0.72)' }}>{c.title ?? 'New chat'}</span>
        </button>
        <button type="button" aria-label="Chat options"
          onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.id ? null : c.id); }}
          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/[0.1] group-hover/row:opacity-100"
          style={{ color: 'rgba(255,255,255,0.6)' }}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuFor === c.id && (
          <div onClick={(e) => e.stopPropagation()} className="absolute right-1 top-9 z-50 w-44 rounded-lg p-1"
            style={{ background: '#1B1C2A', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {moveMode ? (
              <>
                <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Move to project</div>
                <div className="max-h-44 overflow-y-auto">
                  {projects.length === 0 && <div className="px-2 py-1.5 text-[12.5px]" style={{ color: 'rgba(255,255,255,0.4)' }}>No projects yet.</div>}
                  {projects.map((p) => (
                    <button key={p.id} type="button" onClick={() => moveChatToProject(c.id, p.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}>
                      <span className="w-4 text-center text-[13px]">{p.emoji || '📁'}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {c.project_id === p.id && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#A78BFA' }} />}
                    </button>
                  ))}
                </div>
                {c.project_id && (
                  <button type="button" onClick={() => moveChatToProject(c.id, null)} className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.06]" style={{ color: 'rgba(255,255,255,0.6)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <X className="h-3.5 w-3.5" /> Remove from project
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setMenuFor(null); setRenamingId(c.id); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}>
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </button>
                <button type="button" onClick={() => { setMenuFor(null); setChats((p) => p.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x))); void patchChat(c.id, { pinned: !c.pinned }); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}>
                  {c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />} {c.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" onClick={() => setMoveMode(true)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}>
                  <FolderPlus className="h-3.5 w-3.5" /> Move to project
                </button>
                <button type="button" onClick={() => void archiveChat(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#F4A4A4' }}>
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // One collapsible project group: header (emoji · name · count · … menu) +
  // its chats + a "new chat here". The … menu → rename / edit context / delete.
  function renderProject(p: Project, projChats: ChatSummary[]) {
    const collapsed = collapsedProjects[p.id];
    return (
      <div key={p.id} className="group/proj">
        <div className="relative flex items-center">
          <button type="button" onClick={() => setCollapsedProjects((s) => ({ ...s, [p.id]: !s[p.id] }))}
            className="flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]">
            {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />}
            <span className="text-[13px] leading-none">{p.emoji || '📁'}</span>
            {renamingProjectId === p.id ? (
              <input autoFocus defaultValue={p.name} onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitProjectRename(p.id, (e.target as HTMLInputElement).value); } else if (e.key === 'Escape') { setRenamingProjectId(null); } }}
                onBlur={(e) => commitProjectRename(p.id, e.target.value)}
                className="min-w-0 flex-1 rounded bg-transparent text-[13px] font-medium outline-none" style={{ color: '#E9E9F0' }} />
            ) : (
              <span className="flex-1 truncate text-[13px] font-medium" style={{ color: '#E9E9F0' }}>{p.name}</span>
            )}
            {projChats.length > 0 && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{projChats.length}</span>}
          </button>
          <button type="button" aria-label="Project options" onClick={(e) => { e.stopPropagation(); setProjectMenuFor(projectMenuFor === p.id ? null : p.id); }}
            className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/[0.1] group-hover/proj:opacity-100" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {projectMenuFor === p.id && (
            <div onClick={(e) => e.stopPropagation()} className="absolute right-1 top-8 z-50 w-44 rounded-lg p-1" style={{ background: '#1B1C2A', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <button type="button" onClick={() => { setProjectMenuFor(null); setRenamingProjectId(p.id); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}><Pencil className="h-3.5 w-3.5" /> Rename</button>
              <button type="button" onClick={() => { setProjectMenuFor(null); setEditingProject(p); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}><Sparkles className="h-3.5 w-3.5" /> Edit context</button>
              <button type="button" onClick={() => { setProjectMenuFor(null); newChatInProject(p.id); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#E9E9F0' }}><MessageSquarePlus className="h-3.5 w-3.5" /> New chat here</button>
              <button type="button" onClick={() => void deleteProject(p.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.06]" style={{ color: '#F4A4A4' }}><Trash2 className="h-3.5 w-3.5" /> Delete project</button>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="ml-3 space-y-0.5 pl-1" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            {projChats.map(renderChatRow)}
            <button type="button" onClick={() => newChatInProject(p.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.05]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <Plus className="h-3 w-3" /> New chat
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── History rail (Cowork-style left sidebar) ─────────────────────────────
  const historyRail = (
    <aside className="am-noscroll hidden w-[244px] shrink-0 flex-col overflow-y-auto md:flex" style={{ borderRight: '1px solid rgba(255,255,255,0.07)', background: '#0B0C11', scrollbarWidth: 'none' }}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <Sparkles className="h-4.5 w-4.5" style={{ color: '#A78BFA' }} />
        <span className="text-[13.5px] font-medium" style={{ color: '#E9E9F0' }}>Agent</span>
      </div>
      <div className="px-2.5 pb-1">
        <button type="button" onClick={newChat} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors hover:bg-white/[0.06]" style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#E9E9F0' }}>
          <MessageSquarePlus className="h-4 w-4" style={{ color: '#A78BFA' }} /> New chat
        </button>
      </div>
      {chats.length > 0 && (
        <div className="px-2.5 pb-1.5 pt-1">
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="Search chats" className="w-full bg-transparent text-[13px] outline-none" style={{ color: '#E9E9F0' }} />
            {chatQuery && <button type="button" aria-label="Clear search" onClick={() => setChatQuery('')} className="opacity-50 hover:opacity-100"><X className="h-3 w-3" style={{ color: '#E9E9F0' }} /></button>}
          </div>
        </div>
      )}
      <div className="flex-1 px-2 pb-4">
        {(() => {
          const q = chatQuery.trim().toLowerCase();
          const match = (c: ChatSummary) => !q || (c.title ?? 'new chat').toLowerCase().includes(q);
          const filtered = chats.filter(match);
          const pinned = filtered.filter((c) => c.pinned);
          const recents = filtered.filter((c) => !c.pinned && !c.project_id);
          const projChatsOf = (pid: string) => filtered.filter((c) => !c.pinned && c.project_id === pid);
          const visibleProjects = q ? projects.filter((p) => projChatsOf(p.id).length > 0) : projects;
          const trulyEmpty = chats.length === 0 && projects.length === 0 && !newProject;
          const noMatches = q.length > 0 && filtered.length === 0 && visibleProjects.length === 0;
          return (
            <>
              {/* Projects */}
              {(projects.length > 0 || newProject || chats.length > 0) && (
                <div className="mb-2">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.38)' }}><Folder className="h-3 w-3" /> Projects</span>
                    <button type="button" onClick={() => setNewProject(true)} aria-label="New project" title="New project" className="opacity-60 transition-opacity hover:opacity-100" style={{ color: '#A78BFA' }}><FolderPlus className="h-3.5 w-3.5" /></button>
                  </div>
                  {newProject && (
                    <div className="px-1 pb-1">
                      <input autoFocus placeholder="Project name…"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = (e.target as HTMLInputElement).value; setNewProject(false); void createProject(v); } else if (e.key === 'Escape') setNewProject(false); }}
                        onBlur={(e) => { const v = e.target.value; setNewProject(false); if (v.trim()) void createProject(v); }}
                        className="w-full rounded-lg px-2.5 py-1.5 text-[13px] outline-none" style={{ background: '#14151F', border: '1px solid rgba(167,139,250,0.45)', color: '#E9E9F0' }} />
                    </div>
                  )}
                  {visibleProjects.length === 0 && !newProject && (
                    <div className="px-2 pb-1 text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{q ? 'No matching projects.' : 'Group chats into a project.'}</div>
                  )}
                  {visibleProjects.map((p) => renderProject(p, projChatsOf(p.id)))}
                </div>
              )}
              {/* Pinned */}
              {pinned.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.38)' }}><Pin className="h-3 w-3" /> Pinned</div>
                  <div className="space-y-0.5">{pinned.map(renderChatRow)}</div>
                </div>
              )}
              {/* Recents (loose chats) */}
              {recents.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.38)' }}><History className="h-3 w-3" /> Recents</div>
                  <div className="space-y-0.5">{recents.map(renderChatRow)}</div>
                </div>
              )}
              {trulyEmpty && <div className="px-2 py-2 text-[12.5px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Your chats will show up here.</div>}
              {noMatches && <div className="px-2 py-2 text-[12.5px]" style={{ color: 'rgba(255,255,255,0.4)' }}>No chats match “{chatQuery}”.</div>}
            </>
          );
        })()}
      </div>
    </aside>
  );

  // Project pinned-context editor (modal). Free-text instructions injected into
  // the brain SYSTEM for every chat in the project.
  const projectEditor = editingProject ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setEditingProject(null)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-5" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[16px] leading-none">{editingProject.emoji || '📁'}</span>
          <span className="text-[15px] font-medium" style={{ color: '#E9E9F0' }}>{editingProject.name}</span>
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>Pinned context for this project — brand voice, audience, recurring character/product, do&apos;s &amp; don&apos;ts. The agent honors it for every chat in the project.</p>
        <textarea ref={projectCtxRef} key={editingProject.id} defaultValue={editingProject.instructions ?? ''} rows={7}
          placeholder={'e.g. Brand: Lumi skincare. Voice: warm, Gen-Z, never hard-sell. Always feature the founder “Mia”. Avoid medical claims.'}
          className="w-full resize-none rounded-xl p-3 text-[13.5px] leading-relaxed outline-none" style={{ background: '#0E0F16', border: '1px solid rgba(255,255,255,0.12)', color: '#E9E9F0' }} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setEditingProject(null)} className="rounded-lg px-3 py-1.5 text-[13px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>Cancel</button>
          <button type="button" onClick={() => { const v = projectCtxRef.current?.value ?? ''; void patchProject(editingProject.id, { instructions: v }); setEditingProject(null); }} className="rounded-lg px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-90" style={{ background: '#A78BFA', color: '#0F1015' }}>Save context</button>
        </div>
      </div>
    </div>
  ) : null;

  if (empty) {
    return (
      <div className="flex h-screen w-full">
        {projectEditor}
        {historyRail}
        <div className="mx-auto flex h-full min-w-0 flex-1 flex-col items-center justify-center px-6">
        <div className="mb-6 flex items-center gap-3">
          <Sparkles className="h-7 w-7" style={{ color: '#A78BFA' }} />
          <h1 className="text-3xl" style={{ color: '#E9E9F0', letterSpacing: '-0.02em' }}>What should we create?</h1>
        </div>
        <div className="w-full max-w-2xl">{composer}</div>
        <div className="mt-4 flex w-full max-w-2xl flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} type="button" onClick={() => setInput(s.prompt)} className="rounded-full px-3.5 py-2 text-[13px]" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>
              {s.label}
            </button>
          ))}
        </div>
        {error && <div className="mt-4 rounded-xl px-4 py-2.5 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', background: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <style>{`.am-noscroll::-webkit-scrollbar{display:none}`}</style>
      {projectEditor}
      {historyRail}

      {/* ── Conversation column ─────────────────────────────────────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-2 px-6 pt-4">
          {hasPanelContent && !railOpen && (
            <button type="button" onClick={() => setRailOpen(true)} title="Show workspace" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <PanelRight className="h-3.5 w-3.5" /> Workspace
            </button>
          )}
          <button type="button" onClick={newChat} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Trash2 className="h-3.5 w-3.5" /> New chat
          </button>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="am-noscroll flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="mx-auto w-full max-w-2xl space-y-5 px-6 py-6">
            {messages.map((m, i) => {
              if (m.role === 'user') {
                if (typeof m.content !== 'string') return null;
                const im = m.content.match(/\[product_image_url:\s*(\S+?)\s*\]/);
                const display = m.content.replace(/\n*\[(?:product_image_url|character_sheet_url):[^\]]*\]/g, '').trim();
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px]" style={{ background: '#26222E', color: '#E9E9F0' }}>
                      {im && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={im[1]} alt="product" className="mb-2 max-h-44 rounded-lg object-cover" />
                      )}
                      {display}
                    </div>
                  </div>
                );
              }
              const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content } as Block];
              return (
                <div key={i} className="flex flex-col gap-2.5">
                  {blocks.map((b, j) => {
                    if (b.type === 'text' && b.text.trim()) {
                      return <Markdown key={j} text={b.text} />;
                    }
                    if (b.type === 'tool_use' && b.name === 'ask_user') {
                      // Keep the choice visible in the transcript: the question as
                      // an assistant bubble, and (once answered) the user's pick as
                      // a reply bubble — so you can always see what you chose.
                      const run = toolRuns[b.id];
                      const q = String((b.input as { question?: string })?.question ?? 'Choose an option');
                      const ans = run?.status === 'succeeded' ? run.note : undefined;
                      return (
                        <div key={j} className="flex flex-col gap-1.5">
                          <div className="max-w-[88%] self-start rounded-2xl px-4 py-2.5 text-[15px]" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.08)', color: '#E9E9F0' }}>{q}</div>
                          {ans && (
                            <div className="max-w-[80%] self-end rounded-2xl px-4 py-2.5 text-[15px]" style={{ background: '#26222E', color: '#E9E9F0' }}>{ans === 'skipped' ? 'Skipped' : ans}</div>
                          )}
                        </div>
                      );
                    }
                    if (b.type === 'tool_use') {
                      // Compact status chip in the chat; the heavy stuff (live
                      // progress, character picker, artifacts) lives in the panel.
                      const run = toolRuns[b.id];
                      const label = skillLabel(b.name);
                      const statusText = run?.status === 'succeeded' ? 'done'
                        : run?.status === 'failed' ? `failed${run.note ? ` — ${run.note}` : ''}`
                        : b.name === 'list_my_characters' ? 'loading…'
                        : run?.currentStep && run.currentStep !== 'done' ? `${run.currentStep.replace(/_/g, ' ')}…`
                        : 'generating… · usually 1–2 min';
                      return (
                        <div key={j} className="inline-flex max-w-full flex-col gap-2">
                          <div className="inline-flex items-center gap-2 self-start rounded-xl px-3 py-2 text-[13px]" style={{ background: '#14151F', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {run?.status === 'succeeded' ? <Check className="h-4 w-4 shrink-0" style={{ color: '#34D399' }} />
                              : run?.status === 'failed' ? <AlertCircle className="h-4 w-4 shrink-0" style={{ color: '#F87171' }} />
                              : <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: '#A78BFA' }} />}
                            <Wrench className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                            <span style={{ color: '#E9E9F0' }}>{label}</span>
                            <span className="truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>· {statusText}</span>
                            {run?.status === 'failed' && b.name !== 'list_my_characters' && (
                              /(credit|insufficient)/i.test(run.note ?? '')
                                // Out of credits: retrying just fails again — offer the fix.
                                ? <Link href="/dashboard/billing" className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold transition-opacity hover:opacity-90" style={{ background: '#A78BFA', color: '#0F1015' }}>
                                    Buy credits
                                  </Link>
                                : <button type="button" onClick={() => void retryRun(b)} disabled={busy} title="Retry" className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] transition-opacity disabled:opacity-40" style={{ border: '1px solid rgba(255,255,255,0.14)', color: '#E9E9F0' }}>
                                    <RotateCcw className="h-3 w-3" /> Retry
                                  </button>
                            )}
                          </div>
                          {/* The finished video/image stays inline (the deliverable). */}
                          {run?.mediaUrl && (
                            isImage(run.mediaUrl)
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={run.mediaUrl} alt={label} className="w-full max-w-[280px] rounded-xl" />
                              : <video src={run.mediaUrl} controls className="w-full max-w-[280px] rounded-xl" />
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              );
            })}
            {busy && <div className="flex items-center gap-2 text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…</div>}
            {error && <div className="rounded-xl px-4 py-2.5 text-sm" style={{ border: '1px solid rgba(255,79,79,0.3)', background: 'rgba(255,79,79,0.08)', color: '#FCA5A5' }}>{error}</div>}
          </div>
        </div>

        {!atBottom && (
          <button type="button" onClick={() => { setAtBottom(true); scrollToBottom(); }} aria-label="Scroll to bottom"
            className="absolute bottom-28 left-1/2 z-10 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full backdrop-blur-md"
            style={{ background: 'rgba(30,31,40,0.9)', border: '1px solid rgba(255,255,255,0.14)', color: '#E9E9F0' }}>
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        <div className="shrink-0 px-6 pb-6 pt-2">
          <div className="mx-auto w-full max-w-2xl">
            {pendingAsk && (
              <div className="mb-2.5">
                <div className="rounded-[18px] p-1.5" style={{ background: '#1A1B23', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
                  <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
                    <span className="text-[14.5px]" style={{ color: '#E9E9F0' }}>{pendingAsk.question}</span>
                    <button type="button" aria-label="Dismiss" onClick={() => resolveAsk({ skipped: true })} className="opacity-40 hover:opacity-100" style={{ color: '#E9E9F0' }}><X className="h-4 w-4" /></button>
                  </div>
                  {pendingAsk.options.map((o, idx) => {
                    const hl = idx === askHighlight;
                    return (
                      <button key={idx} type="button" onMouseEnter={() => setAskHighlight(idx)} onClick={() => resolveAsk({ selected: o.label })}
                        className="flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors"
                        style={hl ? { background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.35)' } : { border: '1px solid transparent' }}>
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[12px]" style={{ background: 'rgba(255,255,255,0.08)', color: hl ? '#E9E9F0' : 'rgba(255,255,255,0.7)' }}>{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px]" style={{ color: '#E9E9F0' }}>{o.label}{o.recommended && <span style={{ color: '#A78BFA' }}> · Recommended</span>}</div>
                          {o.description && <div className="truncate text-[12.5px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{o.description}</div>}
                        </div>
                        {hl && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }} />}
                      </button>
                    );
                  })}
                  <div className="mt-0.5 flex items-center gap-3 rounded-[13px] px-3 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {pendingAsk.allowOther ? (
                      <button type="button" onClick={() => textareaRef.current?.focus()} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Pencil className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
                        <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.45)' }}>Something else…</span>
                      </button>
                    ) : <span className="flex-1" />}
                    <button type="button" onClick={() => resolveAsk({ skipped: true })} className="rounded-lg px-3 py-1 text-[12.5px]" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>Skip</button>
                  </div>
                </div>
                <div className="mt-2 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.32)' }}>↑↓ to navigate · Enter to select · or type below</div>
              </div>
            )}
            {pendingSpend && (
              <div className="mb-2.5">
                <div className="rounded-[18px] p-3.5" style={{ background: '#1A1B23', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(167,139,250,0.14)' }}><Sparkles className="h-4 w-4" style={{ color: '#A78BFA' }} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px]" style={{ color: '#E9E9F0' }}>
                        Generate <span style={{ color: '#E9E9F0', fontWeight: 600 }}>{skillLabel(pendingSpend.skill)}</span> for <span style={{ color: '#A78BFA', fontWeight: 600 }}>~{pendingSpend.credits.toLocaleString()} credits</span>?
                      </div>
                      <div className="text-[12.5px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {pendingSpend.available !== null ? `You have ${pendingSpend.available.toLocaleString()}.` : 'Balance unavailable.'}
                        {!pendingSpend.sufficient && <span style={{ color: '#F4A4A4' }}> Not enough credits.</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => resolveSpend(false)} className="rounded-lg px-3 py-1.5 text-[13px]" style={{ color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.12)' }}>Cancel</button>
                    {pendingSpend.sufficient ? (
                      <button type="button" onClick={() => resolveSpend(true)} className="rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90" style={{ background: '#A78BFA', color: '#0F1015' }}>
                        Generate
                      </button>
                    ) : (
                      // Out of credits: a LIVE link to top up (this was a disabled
                      // button labeled "Get credits" that did nothing).
                      <Link href="/dashboard/billing" className="rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90" style={{ background: '#A78BFA', color: '#0F1015' }}>
                        Get credits
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-2 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.32)' }}>Enter to generate · Esc to cancel · no credits spent until you confirm</div>
              </div>
            )}
            {composer}
          </div>
        </div>
      </div>

      {/* ── Workspace panel (Claude-Desktop style) ──────────────────────── */}
      {hasPanelContent && railOpen && (
        <aside className="am-noscroll hidden w-[340px] shrink-0 flex-col overflow-y-auto md:flex" style={{ borderLeft: '1px solid rgba(255,255,255,0.07)', background: '#0B0C11', scrollbarWidth: 'none' }}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3.5" style={{ background: '#0B0C11', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[13px] font-medium" style={{ color: '#E9E9F0' }}>Workspace</span>
            <button type="button" onClick={() => setRailOpen(false)} title="Hide workspace" className="opacity-50 hover:opacity-100" style={{ color: '#E9E9F0' }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-6 p-4">
            {/* Progress */}
            {activeRun?.steps && activeRun.steps.length > 0 && (() => {
              const labels = stepLabels(activeRun.steps);
              return (
                <section>
                  <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <ListChecks className="h-3.5 w-3.5" /> Progress
                  </div>
                  <div className="space-y-2">
                    {activeRun.steps.map((s, k) => {
                      const done = DONE.has(s.status);
                      const failed = FAILSTATES.has(s.status);
                      const art = (s.artifacts ?? []).find((a) => a.url);
                      return (
                        <div key={s.primitive_run_id}>
                          <div className="flex items-center gap-2 text-[13px]">
                            {done ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: '#34D399' }} />
                              : failed ? <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#F87171' }} />
                              : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: '#A78BFA' }} />}
                            <span style={{ color: done ? 'rgba(255,255,255,0.5)' : '#E9E9F0' }}>{labels[k]}</span>
                          </div>
                          {failed && s.error?.message && <div className="ml-5 mt-0.5 text-[12px]" style={{ color: '#F87171' }}>{s.error.message}</div>}
                          {art?.url && (
                            isImage(art.url)
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={art.url} alt={labels[k]} className="ml-5 mt-1.5 w-full max-w-[200px] rounded-lg" />
                              : <video src={art.url} muted className="ml-5 mt-1.5 w-full max-w-[200px] rounded-lg" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

            {/* Character picker (selection lives here, not inline) */}
            {charactersRun?.characters && (
              <section>
                <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <Users className="h-3.5 w-3.5" /> Characters
                </div>
                {charactersRun.characters.length === 0 ? (
                  <div className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>No saved characters yet — create one and it&apos;ll show up here.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {charactersRun.characters.map((c) => {
                      const img = c.thumbnail_url || c.character_sheet_url || '';
                      return (
                        <button key={c.id} type="button" title={`Reuse ${c.name}`} onClick={() => reuseCharacter(c)} className="flex flex-col gap-1.5 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.06]" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt={c.name} className="aspect-square w-full rounded-lg object-cover" style={{ background: '#0E0E14' }} />
                          <span className="truncate text-[12px]" style={{ color: '#E9E9F0' }}>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Artifacts tray */}
            {sessionArtifacts.length > 0 && (
              <section>
                <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <Images className="h-3.5 w-3.5" /> Artifacts
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sessionArtifacts.map((a, k) => (
                    <a key={k} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                      {a.isImg
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.url} alt={`artifact ${k + 1}`} className="aspect-square w-full object-cover" style={{ background: '#0E0E14' }} />
                        : <video src={a.url} muted className="aspect-square w-full object-cover" style={{ background: '#0E0E14' }} />}
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
