// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /mcp — public HTTP MCP server for agent-media.
 *
 * What this is: a Model Context Protocol server exposed over HTTP so
 * clients that can't run local stdio MCP processes (Claude.ai, Cowork,
 * Claude Desktop's web mode, anything else that wants a remote MCP
 * URL) can use agent-media's one generation tool: make_ugc
 * ("Agent-Media UGC Video") — give a script plus a person/image/
 * character and get back a finished vertical video (captions are
 * opt-in — the agent asks before adding them).
 *
 * Tools exposed:
 *   - make_ugc — "Agent-Media UGC Video", the single agent-facing
 *     generation tool. One call: script + a person/image/character in,
 *     finished vertical video out (captions opt-in). The agent never
 *     picks a sub-skill; make_ugc resolves identity and routes internally.
 *   - list_characters — read-only; list saved, reusable characters.
 * (The legacy create_selfie / create_character / create_subtitle
 *  primitives remain wired for back-compat but are no longer the
 *  user-facing offering.)
 *
 * Auth: standard Bearer ma_xxx in the Authorization header. The
 * existing authMiddleware runs before this route, so `req.userId`
 * is already populated when this handler fires.
 *
 * Statelessness: each request creates a fresh MCP server + transport.
 * No session storage, no in-memory state. This means each tool call
 * is a single round-trip; streaming partial responses (progress
 * events while a job runs) is NOT exposed via this transport — the
 * client polls the returned job_id via GET /v1/videos/<id> instead.
 *
 * Why stateless: simpler ops, no need for a session store, plays well
 * with serverless / multi-instance Railway deployments.
 */

import type { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { V2_GENERATORS, type V2GeneratorRecord } from '@agentmedia/schema/v2';
import { SKILLS } from '../skills/registry.js';
import {
  IMAGE_URL_HINT,
  generateAudioTool,
  generateImageTool,
  generateVideoTool,
  generationAnnotations,
  getRunStatusTool,
  listCharactersTool,
  listModelsTool,
  quoteTool,
  readOnlyAnnotations,
  uploadImageTool,
} from '../mcp/loose-tools.js';
import { isPrimitivesRouteEnabled } from './v1/primitives.js';

const PUBLIC_API_BASE =
  process.env.PUBLIC_API_BASE ?? 'https://api.agent-media.ai';

/**
 * Build an MCP server scoped to a single user's API key. Tool handlers
 * call back into the same api-v2 REST surface using the user's bearer
 * token, so credit debits + auth + rate-limits all flow through the
 * normal path.
 */
/**
 * Anthropic's Connectors Directory rejects any server whose tools lack a
 * `title` and the applicable `readOnlyHint` / `destructiveHint`. Ours had
 * NO annotations at all, so the whole server was unlistable — and the
 * hints are useful independently: they tell a client which tools are safe
 * to call speculatively and which spend the user's credits.
 *
 * Nothing here destroys data: generation tools create new media, so they
 * are writes with destructiveHint:false, and they touch a remote service
 * so openWorldHint is true.
 */

/** AGENT_SURFACE=fixed restores the recipe tools; anything else is the loose surface. */
export function isLooseSurface(): boolean {
  return (process.env.AGENT_SURFACE ?? 'loose').trim().toLowerCase() !== 'fixed';
}

/** "make_ugc" -> "Make UGC" style display title. */
function titleFromSlug(slug: string): string {
  return slug
    .split('_')
    .map((w) => (w === 'ugc' ? 'UGC' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Render an API error for an agent.
 *
 * The connector used to return a bare `Error (400): invalid_input` and drop
 * `detail` on the floor. The dropped part is the only actionable half: a real
 * agent session hit a word-count rejection, saw only "invalid_input", assumed
 * its product IMAGE was at fault and spent ten turns re-encoding base64 — the
 * answer ("script should be about 15-33 words for a 15s clip") was in the
 * response the whole time.
 */
function formatApiError(status: number, data: unknown): string {
  const d = data as
    | { error?: string | { message?: string; code?: string }; detail?: unknown; skill?: string }
    | null;
  const raw = d?.error;
  const head =
    typeof raw === 'string' ? raw : (raw?.message ?? raw?.code ?? `HTTP ${status}`);
  const parts = [`Error (${status}): ${head}`];
  if (d?.skill) parts.push(`Skill: ${d.skill}`);

  const detail = d?.detail as
    | { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
    | string
    | undefined;
  if (typeof detail === 'string') {
    parts.push(detail);
  } else if (detail && typeof detail === 'object') {
    // Zod's flatten() shape — the field name plus its message is exactly what
    // an agent needs to fix the call and retry.
    for (const [field, msgs] of Object.entries(detail.fieldErrors ?? {})) {
      for (const m of msgs ?? []) parts.push(`- ${field}: ${m}`);
    }
    for (const m of detail.formErrors ?? []) parts.push(`- ${m}`);
    if (!detail.fieldErrors && !detail.formErrors) {
      parts.push(JSON.stringify(detail).slice(0, 600));
    }
  }
  return parts.join('\n');
}

/**
 * Every tool handler here re-enters our own public REST surface over the
 * network (Railway → edge → Railway). Two of those calls carried NO timeout,
 * so a single stalled hop left the MCP request open until the CLIENT gave
 * up — which is exactly what "the connector hangs and then fails on every
 * call" looks like from the other side. A bounded call that fails in 30s with
 * a sentence the agent can read beats an unbounded one that hangs forever.
 */
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

async function apiFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchResponse> {
  const { timeoutMs = 30_000, ...rest } = init;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}


/** Does this tool's JSON schema have an image-ish input worth hinting about? */
function takesAnImage(schema: unknown): boolean {
  const props = (schema as { properties?: Record<string, unknown> })?.properties;
  if (!props) return false;
  return Object.keys(props).some((k) => /image|photo|portrait|character/i.test(k));
}

export function buildMcpServer(apiKey: string): Server {
  const server = new Server(
    { name: 'agent-media', version: '0.4.0' },
    { capabilities: { tools: {} } },
  );

  // A10: when MAKE_UGC_ENABLED makes make_ugc the one curated agent surface, the
  // only V2 generator that stays on tools/list is create_character (the cheap
  // character path make_ugc + Route 0 depend on). create_selfie folds into
  // make_ugc; create_subtitle is replaced by the agent-facing make_subtitles.
  const makeUgcOn = process.env.MAKE_UGC_ENABLED?.trim() === 'true';

  // The agent surface. 'loose' (default): the agent says what it wants —
  // generate_image / generate_video / generate_audio + quote, with the
  // model catalog as the recommendation layer — and NO fixed recipe tools
  // are listed. 'fixed': the previous list (make_ugc, create_character…)
  // for a rollback without a deploy. The fixed skills stay on REST for the
  // dashboard either way.
  const surface = isLooseSurface() ? 'loose' : 'fixed';

  // Pre-compute the tool list once per server instance.
  const tools = Object.values(V2_GENERATORS)
    .filter((def): def is V2GeneratorRecord => !!def.mcp)
    .filter(() => surface === 'fixed')
    .filter((def) => !makeUgcOn || def.mcp!.toolName === 'create_character')
    .map((def) => {
      const schema = zodToJsonSchema(def.inputSchema as any, {
        name: `${def.id}_input`,
        $refStrategy: 'none',
      });
      const inputSchema =
        (schema as any).definitions?.[`${def.id}_input`] ?? schema;
      return {
        def,
        listEntry: {
          name: def.mcp!.toolName,
          description:
            (def.status === 'beta' ? '[beta] ' : '') +
            def.summary +
            '\n\n' +
            def.description +
            (takesAnImage(inputSchema) ? IMAGE_URL_HINT : ''),
          inputSchema,
          annotations: generationAnnotations(titleFromSlug(def.mcp!.toolName)),
        },
      };
    });

  // vNext skill tools — registered only when the feature flag is on so
  // we don't advertise tools whose REST surface returns 404.
  interface VnextSkillTool {
    listEntry: {
      name: string;
      description: string;
      inputSchema: unknown;
    };
    slug: string;
  }
  // When MAKE_UGC_ENABLED is on, make_ugc is THE one curated agent surface
  // (agentFacing) and the other skills drop off tools/list; until then keep the
  // existing skills and hide the unfinished make_ugc so the surface is unchanged.
  const vnextSkillTools: VnextSkillTool[] = surface === 'fixed' && isPrimitivesRouteEnabled()
    ? Object.values(SKILLS)
        .filter((s) => (makeUgcOn ? s.agentFacing === true : s.slug !== 'make_ugc'))
        .map((s) => {
        const schema = zodToJsonSchema(s.inputSchema as any, {
          name: `${s.slug}_input`,
          $refStrategy: 'none',
        });
        const inputSchema =
          (schema as any).definitions?.[`${s.slug}_input`] ?? schema;
        return {
          slug: s.slug,
          listEntry: {
            name: s.slug,
            description:
              `${s.name} (v${s.version}) — ${s.description}` +
              (takesAnImage(inputSchema) ? IMAGE_URL_HINT : ''),
            inputSchema,
            annotations: generationAnnotations(s.name),
          },
        };
      })
    : [];
  const skillBySlug = new Map(vnextSkillTools.map((t) => [t.slug, t]));

  const byName = new Map(tools.map((t) => [t.listEntry.name, t.def]));

  const looseTools = surface === 'loose' ? [generateVideoTool, generateImageTool, generateAudioTool, quoteTool] : [];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...looseTools,
      ...tools.map((t) => t.listEntry),
      ...vnextSkillTools.map((t) => t.listEntry),
      listCharactersTool,
      getRunStatusTool,
      uploadImageTool,
      listModelsTool,
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // The loose surface: forward to /v2/generate/:kind and /v2/quote/:kind.
    // Validation (including the live-catalog model check) happens there,
    // so an agent naming a candidate model gets the live list back in the
    // error text and can retry in one turn.
    const looseKind =
      name === 'generate_video' ? 'video' : name === 'generate_image' ? 'image' : name === 'generate_audio' ? 'audio' : null;
    if (surface === 'loose' && (looseKind || name === 'quote')) {
      const isQuote = name === 'quote';
      const q = (args ?? {}) as { kind?: string; input?: unknown };
      const kind = isQuote ? String(q.kind ?? '') : looseKind!;
      if (!['image', 'video', 'audio'].includes(kind)) {
        return { content: [{ type: 'text', text: 'kind must be image, video or audio.' }], isError: true };
      }
      const body = isQuote ? (q.input ?? {}) : (args ?? {});
      let resp: FetchResponse;
      try {
        resp = await apiFetch(`${PUBLIC_API_BASE}/v2/${isQuote ? 'quote' : 'generate'}/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          timeoutMs: 45_000,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: `agent-media API did not respond in time (${(err as Error).message}). ${isQuote ? 'Call quote again.' : 'The job may or may not have started — call get_run_status if you were given an id, otherwise submit again.'}` }],
          isError: true,
        };
      }
      const text = await resp.text();
      let data: any;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!resp.ok) {
        return { content: [{ type: 'text', text: formatApiError(resp.status, data) }], isError: true };
      }
      if (isQuote) {
        return {
          content: [{ type: 'text', text: `${data?.credits} credits ($${data?.usd}) — ${data?.breakdown}. Model: ${data?.model}. Nothing was rendered.` }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: [
            `Submitted ${name}: job_id ${data?.job_id} on ${data?.model} — ${data?.credits_deducted} credits deducted (${data?.breakdown}).`,
            `Now call get_run_status with run_id "${data?.job_id}" (wait:true) until it is completed, then give the user the URL. ${kind === 'video' ? 'A clip takes a few minutes.' : kind === 'image' ? 'An image takes under a minute.' : 'Audio takes seconds.'}`,
          ].join('\n'),
        }],
      };
    }

    // Read-only: the model catalog (GET /v1/models).
    if (name === 'list_models') {
      const withCandidates = (args as { include_candidates?: boolean })?.include_candidates === true;
      let resp: FetchResponse;
      try {
        resp = await apiFetch(`${PUBLIC_API_BASE}/v1/models${withCandidates ? '?include=candidates' : ''}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeoutMs: 20_000,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: `agent-media did not answer in time (${(err as Error).message}). Call list_models again.` }],
          isError: true,
        };
      }
      const text = await resp.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!resp.ok) {
        return { content: [{ type: 'text', text: formatApiError(resp.status, data) }], isError: true };
      }
      const d = data as {
        models?: Array<{
          id: string; kind: string; tier: string; status: string;
          credits: { unit: string; perUnit: number; base?: number } | null;
          limits: { minSeconds?: number; maxSeconds?: number; refs?: string };
          quality: string; speed: string; best_for: string[]; avoid_for: string[];
          docs_url: string; verified: { date: string; runId?: string } | null;
          select_with: { field: string; value: string; on: string[]; not_on: string[] } | null;
        }>;
        default_video_model?: string;
      } | null;
      const lines = (d?.models ?? []).map((m) => {
        const price = m.credits
          ? (m.credits.perUnit === 0 ? 'included in the generator credits' : `${m.credits.perUnit} credits/${m.credits.unit}`)
          : 'no price (candidate, not selectable)';
        const sel = m.select_with
          ? `select: ${m.select_with.field}="${m.select_with.value}" on ${m.select_with.on.join(', ')}; NOT on ${m.select_with.not_on.join(', ')}`
          : 'select: not selectable (used inside the pipelines)';
        const lim = [m.limits?.maxSeconds ? `max ${m.limits.maxSeconds}s` : null, m.limits?.refs ? `refs: ${m.limits.refs}` : null].filter(Boolean).join(', ');
        return [
          `- ${m.id} [${m.kind}, ${m.tier}, ${m.status}] — ${price}; ${m.quality} quality, ${m.speed}${lim ? `; ${lim}` : ''}`,
          `    best for: ${m.best_for.join('; ')}`,
          m.avoid_for?.length ? `    avoid for: ${m.avoid_for.join('; ')}` : null,
          `    ${sel}${m.verified ? ` · verified ${m.verified.date}` : ' · no recorded run'} · docs: ${m.docs_url}`,
        ].filter(Boolean).join('\n');
      });
      return {
        content: [{
          type: 'text',
          text: [
            `${d?.models?.length ?? 0} model(s). Default video model: ${d?.default_video_model ?? 'seedance-2.0'}. 1 credit = $0.01. Select a live model by passing its id as \`model\` to generate_video / generate_image / generate_audio (omit it for the default). Candidates cannot be selected.`,
            ...lines,
          ].join('\n'),
        }],
      };
    }

    // Bytes → URL. Forwards to POST /v1/uploads/image.
    if (name === 'upload_image') {
      const a = (args ?? {}) as { image_base64?: string; image_url?: string };
      const b64 = typeof a.image_base64 === 'string' ? a.image_base64.trim() : '';
      const src = typeof a.image_url === 'string' ? a.image_url.trim() : '';
      if (!b64 && !src) {
        return {
          content: [{ type: 'text', text: 'Provide image_base64 (the bytes) or image_url (an https image to re-host).' }],
          isError: true,
        };
      }
      let resp: FetchResponse;
      try {
        resp = await apiFetch(`${PUBLIC_API_BASE}/v1/uploads/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(b64 ? { image_base64: b64 } : { image_url: src }),
          // Generous: a 10 MB upload has to travel and then be moderated.
          timeoutMs: 60_000,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Upload did not complete in time (${(err as Error).message}). Try once more; if it fails again the image is probably too large — ask the user for a smaller one or a public URL.` }],
          isError: true,
        };
      }
      const text = await resp.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!resp.ok) {
        return { content: [{ type: 'text', text: formatApiError(resp.status, data) }], isError: true };
      }
      const up = data as { image_url?: string; bytes?: number; mime?: string } | null;
      return {
        content: [
          {
            type: 'text',
            text: [
              `Image stored: ${up?.image_url ?? '(no url returned)'}`,
              up?.bytes ? `${Math.round(up.bytes / 1024)} KB, ${up.mime}` : null,
              'Pass this URL to the generation tool. Do not send the base64 again — reuse this URL for every retry.',
            ].filter(Boolean).join('\n'),
          },
        ],
      };
    }

    // Read-only: resolve a run/job id across all three pipelines.
    if (name === 'get_run_status') {
      const runId = String((args as { run_id?: string })?.run_id ?? '').trim();
      const wait = (args as { wait?: boolean })?.wait === true;
      if (!runId) {
        return { content: [{ type: 'text', text: 'run_id is required.' }], isError: true };
      }

      // Composed skill runs, primitive runs and v2 jobs live behind three
      // different paths; the agent holds one opaque id, so try each.
      const PATHS = [
        `/v1/skills/runs/${encodeURIComponent(runId)}`,
        `/v1/primitives/runs/${encodeURIComponent(runId)}`,
        `/v1/videos/${encodeURIComponent(runId)}`,
      ];

      async function probe(): Promise<{ found: boolean; body?: any }> {
        for (const path of PATHS) {
          try {
            const r = await apiFetch(`${PUBLIC_API_BASE}${path}`, {
              headers: { Authorization: `Bearer ${apiKey}` },
              timeoutMs: 20_000,
            });
            if (r.status === 404) continue;
            const t = await r.text();
            let d: any;
            try { d = t ? JSON.parse(t) : null; } catch { d = t; }
            if (r.ok) return { found: true, body: d };
          } catch {
            // try the next shape
          }
        }
        return { found: false };
      }

      const TERMINAL = new Set(['completed', 'succeeded', 'failed', 'canceled', 'cancelled', 'error']);
      // wait:true used to hold the request for 110s. Connector clients cut a
      // tool call off well before that (60s is a common ceiling), so the tool
      // that exists to END the agent's blindness was itself the most likely
      // call to "hang and then fail". Stay comfortably under: the agent just
      // calls again, and it is told to.
      const deadline = Date.now() + (wait ? 45_000 : 0);
      let result = await probe();
      while (
        wait &&
        result.found &&
        !TERMINAL.has(String(result.body?.status ?? '').toLowerCase()) &&
        Date.now() < deadline
      ) {
        await new Promise((r) => setTimeout(r, 8_000));
        result = await probe();
      }

      if (!result.found) {
        return {
          content: [{ type: 'text', text: `No run found for id "${runId}". Check the id you were given at submit time.` }],
          isError: true,
        };
      }

      const b = result.body ?? {};
      const status = String(b.status ?? 'unknown');
      // Every pipeline names its output differently. Primitive and skill runs
      // return artifacts as an ARRAY ([{ url, kind, mime }]) — the scalar-only
      // lookup below missed it entirely, so a finished run reported
      // "succeeded" with no link and the agent still could not hand the user
      // a video. That is the same dead end this tool exists to remove.
      //
      // A COMPOSED skill run (make_ugc_video — the main product surface) nests
      // both of these one level down: the link is `final_output.video_url` and
      // the artifacts hang off `steps[].artifacts`, not the top level. Neither
      // was read, so a live make_ugc that rendered a video in 3m35s reported
      // "status: succeeded" with NO link — the agent still could not hand the
      // user their video, which is the entire complaint this tool exists to
      // answer. (Reproduced against production on 2026-09-01, run 8f9a40f1.)
      const stepArtifacts: Array<{ url?: string; kind?: string; mime?: string }> =
        Array.isArray(b.steps)
          ? b.steps.flatMap((st: { artifacts?: unknown }) =>
              Array.isArray(st?.artifacts) ? st.artifacts : [],
            )
          : [];
      const artifactList: Array<{ url?: string; kind?: string; mime?: string }> =
        Array.isArray(b.artifacts)
          ? b.artifacts
          : Array.isArray(b.output?.artifacts)
            ? b.output.artifacts
            : Array.isArray(b.final_output?.artifacts)
              ? b.final_output.artifacts
              : stepArtifacts;
      const videoArtifact =
        artifactList.find((a) => typeof a?.mime === 'string' && a.mime.startsWith('video/')) ??
        artifactList.find((a) => typeof a?.url === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(a.url)) ??
        artifactList[0];
      const url =
        b.video_url ?? b.output_url ?? b.result_url ?? b.output_media_url ??
        b.final_output?.video_url ?? b.final_output?.output_url ??
        b.artifacts?.video_url ?? b.output?.video_url ?? videoArtifact?.url ?? null;
      // Surface every other artifact too (portrait, sheet, wireframe): an
      // agent asked to "show the character sheet" should not need a second
      // round trip.
      const namedOutputs = Object.entries(b.final_output ?? {})
        .filter(([k, v]) => typeof v === 'string' && /^https?:\/\//.test(v) && v !== url && k !== 'video_url')
        .map(([k, v]) => `  - ${k}: ${v}`);
      const otherArtifacts = [
        ...artifactList
          .filter((a) => a?.url && a.url !== url)
          .map((a) => `  - ${a.kind ?? 'artifact'}: ${a.url}`),
        ...namedOutputs,
      ];
      const done = TERMINAL.has(status.toLowerCase());
      const lines = [
        `Run ${runId} — status: ${status}`,
        url ? `${/\.(png|jpe?g|webp)(\?|$)/i.test(url) ? 'Image' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'Audio' : 'Video'}: ${url}` : null,
        otherArtifacts.length ? `Other artifacts:\n${otherArtifacts.join('\n')}` : null,
        typeof b.credits === 'number' ? `Credits: ${b.credits}` : null,
        b.error_message ? `Error: ${b.error_message}` : null,
        b.error_code ? `Error code: ${b.error_code}` : null,
        b.progress_detail?.stage ? `Stage: ${b.progress_detail.stage}` : null,
        !done ? 'Still running — call get_run_status again (or with wait:true).' : null,
      ].filter(Boolean);
      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        isError: /failed|error|canceled|cancelled/i.test(status),
      };
    }

    // Read-only: list saved characters (GET /v1/characters).
    if (name === 'list_characters') {
      const limit = Math.min(Math.max(Number((args as { limit?: number })?.limit) || 50, 1), 100);
      let resp: FetchResponse;
      try {
        resp = await apiFetch(`${PUBLIC_API_BASE}/v1/characters?limit=${limit}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeoutMs: 20_000,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: `agent-media did not answer in time (${(err as Error).message}). This is transient — call list_characters again.` }],
          isError: true,
        };
      }
      const text = await resp.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!resp.ok) {
        return { content: [{ type: 'text', text: formatApiError(resp.status, data) }], isError: true };
      }
      const chars = ((data as { characters?: Array<{ name?: string; character_id?: string | null; character_sheet_url?: string }> } | null)?.characters) ?? [];
      const body = chars.length
        ? chars.map((c) => `- ${c.name} — character_id: ${c.character_id ?? '(none)'}  |  sheet: ${c.character_sheet_url}`).join('\n')
        : 'No saved characters yet.';
      return { content: [{ type: 'text', text: `${chars.length} saved character(s). Reuse one by putting its sheet URL in \`refs\` of generate_video (loose surface) or passing character_id as \`character\` to make_ugc (fixed surface):\n${body}` }] };
    }

    // vNext skill route — forwards to /v1/skills/:slug/run.
    const skillTool = skillBySlug.get(name);
    if (skillTool) {
      let resp: FetchResponse;
      try {
        resp = await apiFetch(
          `${PUBLIC_API_BASE}/v1/skills/${skillTool.slug}/run`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(args ?? {}),
            // Bound the wait so a slow/cold upstream surfaces as a clean tool
            // error instead of a bare hanging connection. No retry: /run is not
            // idempotent without an Idempotency-Key, so a retry could double-submit.
            timeoutMs: 45_000,
          },
        );
      } catch (err) {
        return {
          content: [{ type: 'text', text: `agent-media API did not respond in time (${(err as Error).message}). The run may or may not have started — use the list/status tools to check.` }],
          isError: true,
        };
      }
      const text = await resp.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!resp.ok) {
        return {
          content: [{ type: 'text', text: formatApiError(resp.status, data) }],
          isError: true,
        };
      }
      const sub = data as {
        run_id?: string;
        skill_run_id?: string;
        workflow_id?: string;
        skill?: string;
        status?: string;
      } | null;
      // Composed skills (make_ugc_video / make_broll_talking_head) return a
      // skill_run_id polled at /v1/skills/runs/:id; primitives return a run_id
      // polled at /v1/primitives/runs/:id. Hand the agent the RIGHT URL — this
      // line previously hard-coded the primitives URL for EVERY skill, so a
      // composed run was untrackable over MCP (its skill_run_id 404'd there).
      const jobId = sub?.skill_run_id ?? sub?.run_id ?? null;
      const pollUrl = sub?.skill_run_id
        ? `GET /v1/skills/runs/${sub.skill_run_id}`
        : sub?.run_id
          ? `GET /v1/primitives/runs/${sub.run_id}`
          : 'GET /v1/skills/runs/<id>';
      return {
        content: [
          {
            type: 'text',
            text: [
              `Skill submitted: ${sub?.skill ?? skillTool.slug}`,
              jobId ? `Run id: ${jobId}` : null,
              sub?.workflow_id ? `Workflow id: ${sub.workflow_id}` : null,
              `NEXT STEP: call get_run_status with run_id "${jobId ?? '<id>'}" (add wait:true to wait ~45s per call; repeat until it is done) to get the video URL. Do not stop here — the user needs the link.`,
              `(REST equivalent: ${pollUrl})`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    }

    const def = byName.get(name);
    if (!def || !def.rest) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // Forward to the v2 REST endpoint using the caller's API key.
    let resp: FetchResponse;
    try {
      resp = await apiFetch(`${PUBLIC_API_BASE}${def.rest.path}`, {
        method: def.rest.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(args ?? {}),
        timeoutMs: 45_000,
      });
    } catch (err) {
      return {
        content: [{ type: 'text', text: `agent-media did not respond in time (${(err as Error).message}). The job may or may not have started — call list_characters or get_run_status before resubmitting, so the user is not charged twice.` }],
        isError: true,
      };
    }
    const text = await resp.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!resp.ok) {
      return {
        content: [{ type: 'text', text: formatApiError(resp.status, data) }],
        isError: true,
      };
    }

    const sub = data as {
      job_id?: string;
      credits_deducted?: number;
      status?: string;
    } | null;
    return {
      content: [
        {
          type: 'text',
          text: [
            `Job submitted: ${sub?.job_id ?? '(no job id)'}`,
            sub?.credits_deducted != null ? `Credits: ${sub.credits_deducted}` : null,
            `NEXT STEP: call get_run_status with run_id "${sub?.job_id ?? '<job_id>'}" (add wait:true to wait ~45s per call; repeat until it is done) to get the video URL. Do not stop here — the user needs the link.`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  });

  return server;
}

/**
 * Express handler for POST /mcp + GET /mcp (SSE upgrade).
 *
 * Each request gets a fresh, stateless MCP server. No session cookies,
 * no in-memory state across requests.
 */
export async function mcpRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  const authToken = (req as any).authToken as string | undefined;
  if (!userId || !authToken) {
    res
      .status(401)
      .json({
        error: { code: 'UNAUTHORIZED', message: 'Bearer API key required' },
      });
    return;
  }

  const server = buildMcpServer(authToken);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  // Clean up on response close.
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, (req as any).body);
  } catch (err) {
    console.error('[mcp] handler error:', err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({
          error: { code: 'MCP_INTERNAL', message: 'MCP handler failed' },
        });
    }
  }
}
