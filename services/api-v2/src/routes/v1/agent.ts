// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v1/agent — the in-app creative agent's "brain" (walking skeleton).
 *
 * Stateless: the client holds the transcript and posts the full `messages`
 * array (Anthropic Messages format) each turn. We inject the live skill
 * registry as tools and call Claude. We DON'T run skills here — when Claude
 * emits a tool_use, the client runs it via the existing /v1/skills/<slug>/run
 * (+ poll) path and posts the tool_result back to continue. That keeps the
 * proven dispatch/credit/idempotency path as the single execution surface and
 * solves long-running renders with the deferred-then-resume loop.
 */

import type { Request, Response } from 'express';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SKILLS } from '../../skills/registry.js';
import { supabase } from '../../server.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_AGENT_MODEL || 'claude-sonnet-4-6';

const SYSTEM = `You are agent-media's in-app creative assistant. You make short vertical UGC videos for the user by calling the available skill tools.

STYLE: Reply in ONE short sentence (≤12 words) before a tool call — no preamble, no recap, no restating their request. After a tool result, one short sentence too.

READ EACH TOOL'S SCHEMA and obey every field constraint in its description (especially the script word-count) so the FIRST call succeeds. Don't submit a call you know will fail validation.

NEW CHARACTER: if the user wants to create a new character but hasn't described one, do NOT invent a random person and generate — ASK for a short description (age, look, vibe, setting) first, and offer that they can instead reuse a saved character. Only generate once you have their description.

GATE — confirm before you generate (every render costs the user credits, so never guess): before calling make_ugc, make sure you have (1) what they want SAID (a spoken script — write it yourself from their topic, see below) or a scene_action, and (2) the CHARACTER — a fresh look (a person description) or a saved one to reuse. make_ugc INFERS the length from the script, so do NOT ask about duration. If anything is missing or the request is vague, fill the gap before generating — but ask for only ONE thing per turn; NEVER bundle two questions in one message. For any DECISION you MUST call ask_user (it renders as a selection card) instead of asking in prose — this is not optional:
  • WHICH saved CHARACTER to reuse, or new-look vs reuse-a-character → ask_user with the options.
  • CAPTIONS → ask_user "Add captions?" with options "Hormozi captions" / "TikTok captions" / "No captions" (recommend "No captions" unless the user mentioned captions). Captions are OFF by default — only pass captions:true + the matching caption_style if they pick a style; NEVER add captions on your own.
  • Final confirmation before spending credits → ask_user "Generate now?" with options like "Yes, generate" / "Change something".
Use a plain sentence ONLY for the open-ended SCRIPT ("what should they say?"), and ask it on its own turn. Do NOT fire a generation on assumptions. If the user already gave you everything, don't stall — just go.

SAVED CHARACTERS: You CAN see the user's saved characters — call list_my_characters (it returns each character's name + character_sheet_url + a thumbnail the app shows). When they ask "show me my characters" / "which characters do I have" / "use one of my characters", call it instead of saying you don't have access. To reuse one, pass its character_sheet_url to the relevant video tool. AFTER it returns, the app ALREADY renders the characters as image cards — so reply with ONE short sentence only (e.g. "Here are your saved characters — tap one to reuse it."). NEVER print a table, a numbered/bulleted list, or any raw URLs / file paths in your text; keep the URLs to yourself and use one only when the user actually picks a character.

How to create — ONE tool does it all:
- Call make_ugc for any UGC video. Pass the spoken script (ANY length — a one-liner makes one clip; a full monologue makes a seamless multi-take video, never trimmed) plus the identity: person (a text description), image (a photo URL), or character (a saved character's character_sheet_url to reuse). Captions are OPT-IN — never add them on your own (ask via the CAPTIONS gate above); the length is inferred from the script. For a narrated b-roll / gameplay / product-clip review, also pass broll_url. make_ugc handles the face, the takes and the duration — you NEVER call portrait/sheet/selfie/caption steps yourself.
- ONLY for a video where the person physically HOLDS or WEARS a product, use make_product_in_hands (pass the product image as product_image_url — any URL — or product_image_base64; set subject e.g. "a young woman" to lock gender, framing "close_up" unless they want a full-body turn-around).
- For a TWO-PERSON PODCAST / interview / conversation between two people, use make_podcast. It needs TWO saved characters — character_a and character_b (each a saved character's character_sheet_url, or a char_… id; call list_my_characters to get them) — and an ordered \`script\` array of turns, each { speaker: "A" | "B", line: "…" }. WRITE the back-and-forth dialogue yourself from the user's topic (short, natural lines) and confirm it with ask_user before generating. Optionally pass \`room\` to describe the studio look. The same CAPTIONS gate applies (opt-in). If the user has fewer than TWO saved characters, ask them to pick or create a second one first — never invent one.

Rules:
- make_ugc paces and chunks the script for you — pass the user's FULL line or monologue and do NOT trim it (a long script becomes a seamless multi-take video, never cut). Just don't pad a short idea out to fill time.
- Any reference image/video URL you pass to a tool must be an agent-media R2 URL — either the output of a previous tool (character_sheet_url, video_url) OR a character_sheet_url the USER hands you to reuse a saved character. Don't invent URLs.
- A tool takes a few minutes; you'll get its result (a video_url / artifacts) back and can then call the next tool or finish.
- IF A TOOL RESULT IS "failed" OR "timeout": do NOT silently call it again — a blind retry just burns more of the user's credits. Say in ONE short sentence that it didn't work, then ASK whether they want you to try again, and only retry after they say yes.
- IF THE FAILURE SAYS "insufficient_credits" (or mentions not enough credits): do NOT retry and do NOT offer to retry — it will fail again. Tell them plainly in one sentence how many credits it needs vs what they have, and that they can top up on the Billing page (the app shows a Buy credits button next to the failure).
- SAME PERSON within a chat: after you make a video, that person is saved as a character. For the NEXT video in this conversation, REUSE them — pass their character_sheet_url as make_ugc's character (call list_my_characters to get it) — instead of generating a new person, UNLESS the user asks for a different/new person. Reusing keeps the exact same face and is faster + cheaper (it reuses the portrait + character sheet rather than re-making them; the sheet is never skipped). If you are NOT sure whether they want the same person or a new one, ask_user "Same person, or a new one?".
- When you start a generation, your one-line message should say it's running + a rough time (a few minutes; a long monologue takes longer). The app shows the live step-by-step (portrait → character sheet → video → captions), so don't repeat each step in prose.
- Before a multi-step chain, briefly tell the user the plan. Never claim something is done before its tool result comes back.
- With a broll_url whose footage already shows its own on-screen text, set captions:false so make_ugc doesn't duplicate it. For a REVIEW (an intro then play-by-play of the footage), structure the script as the intro line, then a line containing only --- , then the narration — the actor delivers the intro to camera, then the b-roll plays through the narration, continuing seamlessly. Example: "Today we review X vs Y.\n---\nWhite opens e4, Black answers c5 …". Without the --- the b-roll is just placed normally.
- If a user message contains "[product_image_url: <URL>]", that is the user's uploaded product photo — pass that exact <URL> as product_image_url to make_product_in_hands. Don't ask them to upload it again.
- If a user message contains "[character_sheet_url: <URL>]", that is the saved character the user JUST picked — pass that exact <URL> as make_ugc's character and do NOT ask which character again. (An uploaded photo URL goes in make_ugc's image; a b-roll/clip URL goes in broll_url.)
- BE THE WRITER, not an interrogator. When the user gives a TOPIC, vibe, or angle instead of the exact words (e.g. "a woman complaining about her man", "something funny about Mondays"), WRITE the spoken line yourself — one punchy, natural line that fits the duration — then show it in your reply and call ask_user to confirm, options: "Use this line" (recommended) / "Write a different one". NEVER demand the user type the verbatim line; only ask them to write it if they say they want to.
- NEVER put sexual or suggestive words in any description or prompt (e.g. "sexy", "seductive", "sultry", "provocative", "cleavage", "lingerie", "hot"). OpenAI's image safety system hard-rejects them and the generation fails. Say "attractive", "stylish", "polished", or "confident" instead — same intent, and it passes.`;

interface AnthropicTool { name: string; description: string; input_schema: Record<string, unknown> }

// Read-only tools that are NOT generation skills (no Temporal workflow, no
// credits). The client executes these directly (e.g. list_my_characters hits
// the characters endpoint) instead of the /v1/skills/<slug>/run dispatch path.
const READ_ONLY_TOOLS: AnthropicTool[] = [
  {
    name: 'list_my_characters',
    description:
      "List the user's saved, reusable characters. Returns each character's name, character_sheet_url (the identity URL you pass back into a video tool to reuse them) and a thumbnail the app displays. Use this whenever the user asks to see / pick / reuse one of their saved characters — you DO have access to this.",
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max characters to return (default 50).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'ask_user',
    description:
      "Ask the user to DECIDE something by presenting choices — the app renders this as an interactive selection card (numbered, keyboard-navigable), not a chat sentence. Use it WHENEVER you need a decision: which duration (5/10/15s), which video type, which character to reuse, or a 'generate now?' confirmation before spending credits. Provide 2-4 short concrete options and mark the single best default with recommended:true. This costs no credits and generates nothing; the user's pick (or their typed answer, or skip) comes back as the tool result. PREFER this over asking the question in prose for any decision point. Do NOT use it for open-ended description requests (e.g. 'describe the person you want') — ask those in one short sentence.",
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'One short question (≤14 words).' },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          description: '2-4 short choices.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Short choice label (≤6 words).' },
              description: { type: 'string', description: 'Optional one-line clarification.' },
              recommended: { type: 'boolean', description: 'Mark the single best default true.' },
            },
            required: ['label'],
            additionalProperties: false,
          },
        },
        allow_other: { type: 'boolean', description: "Offer a free-text 'Something else' row (default true)." },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
  },
];

// When make_ugc is live it is the ONE generation tool the agent calls (plus
// make_product_in_hands for product-in-hand clips); the other skills are internal
// to make_ugc's router. Until the flag is on, expose them all (legacy behavior).
const WEB_AGENT_SKILLS = new Set(['make_ugc', 'make_product_in_hands', 'make_podcast']);

function buildTools(supportsAsk: boolean): AnthropicTool[] {
  const makeUgcOn = process.env.MAKE_UGC_ENABLED?.trim() === 'true';
  const skills = makeUgcOn
    ? Object.values(SKILLS).filter((s) => WEB_AGENT_SKILLS.has(s.slug))
    : Object.values(SKILLS);
  const skillTools = skills.map((s) => {
    const wrapped = zodToJsonSchema(s.inputSchema, s.slug) as {
      definitions?: Record<string, Record<string, unknown>>;
    } & Record<string, unknown>;
    const schema = (wrapped.definitions?.[s.slug] ?? wrapped) as Record<string, unknown>;
    delete schema.$schema;
    // Anthropic requires an object schema.
    if (schema.type !== 'object') {
      return { name: s.slug, description: s.description, input_schema: { type: 'object', properties: {}, additionalProperties: true } };
    }
    return { name: s.slug, description: s.description, input_schema: schema };
  });
  const readOnly = supportsAsk ? READ_ONLY_TOOLS : READ_ONLY_TOOLS.filter((t) => t.name !== 'ask_user');
  return [...skillTools, ...readOnly];
}

type Msg = { role?: string; content?: unknown };

function hasToolResult(m: Msg): boolean {
  return Array.isArray(m.content) && m.content.some(
    (b) => b && typeof b === 'object' && (b as { type?: string }).type === 'tool_result',
  );
}

/**
 * Keep the most recent `max` messages, then trim leading messages until the
 * window starts on a CLEAN user turn (role === 'user' with no tool_result
 * block). Anthropic rejects a messages[] that starts with an assistant turn or
 * with a tool_result whose matching tool_use was trimmed away — this guarantees
 * a valid start so long conversations are windowed, never hard-failed.
 */
export function windowMessages(messages: Msg[], max: number): Msg[] {
  if (messages.length <= max) return messages;
  const win = messages.slice(-max);
  while (win.length > 1 && (win[0].role !== 'user' || hasToolResult(win[0]))) {
    win.shift();
  }
  return win;
}

/**
 * Build a compact context block so the brain OPENS knowing the user — their
 * saved characters (name + reuse URL). Injected into the system prompt so the
 * agent can proactively offer / reuse a character without a list_my_characters
 * round-trip. Best-effort: any failure just omits the block.
 */
async function buildUserContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('user_characters')
      .select('name, character_sheet_url')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(12);
    const chars = (data ?? []).filter((c) => c.name && c.character_sheet_url);
    if (chars.length === 0) return '';
    const list = chars.map((c) => `- "${String(c.name).slice(0, 60)}" → ${c.character_sheet_url}`).join('\n');
    return `\n\nWHO YOU'RE WORKING WITH — the user already has these SAVED CHARACTERS (you know them; reuse one by passing its character_sheet_url into a video tool, and refer to them by name. Only call list_my_characters if they ask to browse the full set):\n${list}`;
  } catch {
    return '';
  }
}

// Pinned PROJECT context — the user's free-text instructions for the current
// project (brand voice, audience, recurring character/product, do's & don'ts).
// Client-provided (the user's own content); capped to bound the payload.
function buildProjectContext(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.trim().slice(0, 4000);
  if (!text) return '';
  return `\n\nPROJECT CONTEXT — the user pinned this for the current project; honor it for EVERY video in this conversation (brand voice, audience, recurring character/product, do's & don'ts):\n${text}`;
}

export async function agentRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) { res.status(503).json({ error: 'agent_unconfigured', detail: 'ANTHROPIC_API_KEY not set' }); return; }

  const messages = (req.body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'invalid_input', detail: 'messages[] required (Anthropic format)' });
    return;
  }
  // Hard upper bound only as an abuse guard. Normal long sessions are handled
  // by windowing below (we no longer hard-fail at 80 — that surfaced as a
  // cryptic "agent 400" the moment a real creative session got going).
  if (messages.length > 1000) {
    res.status(400).json({
      error: 'conversation_too_long',
      detail: 'This conversation has too many messages — start a new chat to continue.',
    });
    return;
  }

  // Window to the most recent turns so a long session never balloons the
  // payload (cost/latency) — trimmed to a valid Anthropic start.
  const windowed = windowMessages(messages, 60);

  // Client capability gate: only offer the interactive ask_user choice tool to
  // clients that declare support (the new web client sends this header). Keeps
  // the brain backward-compatible — an old client never receives ask_user and so
  // never breaks trying to "run" it as a skill.
  const caps = String((req.headers['x-am-agent-caps'] as string | undefined) ?? '');
  const supportsAsk = caps.split(',').map((s) => s.trim()).includes('ask_user');

  // Make the brain open knowing the user (their saved characters).
  const userContext = await buildUserContext(userId);
  // …and the pinned context of the project this chat belongs to (if any).
  const projectContext = buildProjectContext((req.body as { project_context?: unknown })?.project_context);

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM + userContext + projectContext,
        tools: buildTools(supportsAsk),
        messages: windowed,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      res.status(502).json({ error: 'anthropic_error', detail: (data as { error?: unknown }).error ?? data });
      return;
    }
    const d = data as { stop_reason?: string; content?: unknown };
    res.status(200).json({ stop_reason: d.stop_reason ?? 'end_turn', content: d.content ?? [] });
  } catch (err) {
    res.status(502).json({ error: 'agent_error', detail: (err as Error).message });
  }
}
