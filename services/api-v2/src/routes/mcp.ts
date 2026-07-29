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
import { isPrimitivesRouteEnabled } from './v1/primitives.js';

const PUBLIC_API_BASE =
  process.env.PUBLIC_API_BASE ?? 'https://api.agent-media.ai';

/**
 * Build an MCP server scoped to a single user's API key. Tool handlers
 * call back into the same api-v2 REST surface using the user's bearer
 * token, so credit debits + auth + rate-limits all flow through the
 * normal path.
 */
function buildMcpServer(apiKey: string): Server {
  const server = new Server(
    { name: 'agent-media', version: '0.4.0' },
    { capabilities: { tools: {} } },
  );

  // A10: when MAKE_UGC_ENABLED makes make_ugc the one curated agent surface, the
  // only V2 generator that stays on tools/list is create_character (the cheap
  // character path make_ugc + Route 0 depend on). create_selfie folds into
  // make_ugc; create_subtitle is replaced by the agent-facing make_subtitles.
  const makeUgcOn = process.env.MAKE_UGC_ENABLED?.trim() === 'true';

  // Pre-compute the tool list once per server instance.
  const tools = Object.values(V2_GENERATORS)
    .filter((def): def is V2GeneratorRecord => !!def.mcp)
    .filter((def) => !makeUgcOn || def.mcp!.toolName === 'create_character')
    .map((def) => {
      const schema = zodToJsonSchema(def.inputSchema as any, {
        name: `${def.id}_input`,
        $refStrategy: 'none',
      });
      return {
        def,
        listEntry: {
          name: def.mcp!.toolName,
          description:
            (def.status === 'beta' ? '[beta] ' : '') +
            def.summary +
            '\n\n' +
            def.description,
          inputSchema:
            (schema as any).definitions?.[`${def.id}_input`] ?? schema,
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
  const vnextSkillTools: VnextSkillTool[] = isPrimitivesRouteEnabled()
    ? Object.values(SKILLS)
        .filter((s) => (makeUgcOn ? s.agentFacing === true : s.slug !== 'make_ugc'))
        .map((s) => {
        const schema = zodToJsonSchema(s.inputSchema as any, {
          name: `${s.slug}_input`,
          $refStrategy: 'none',
        });
        return {
          slug: s.slug,
          listEntry: {
            name: s.slug,
            description: `${s.name} (v${s.version}) — ${s.description}`,
            inputSchema:
              (schema as any).definitions?.[`${s.slug}_input`] ?? schema,
          },
        };
      })
    : [];
  const skillBySlug = new Map(vnextSkillTools.map((t) => [t.slug, t]));

  const byName = new Map(tools.map((t) => [t.listEntry.name, t.def]));

  // Read-only tool (no generation, no credits): list the user's saved
  // characters with their reuse URLs. Forwards to GET /v1/characters.
  const listCharactersTool = {
    name: 'list_characters',
    description:
      "List the authenticated user's saved, reusable characters. Each has a character_id (char_…) and a character_sheet_url — pass EITHER back to make_ugc's `character` prop to reuse that exact identity (skips re-generating the face). Plus a portrait/thumbnail URL for display.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max characters to return (default 50).' },
      },
      additionalProperties: false,
    },
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...tools.map((t) => t.listEntry),
      ...vnextSkillTools.map((t) => t.listEntry),
      listCharactersTool,
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Read-only: list saved characters (GET /v1/characters).
    if (name === 'list_characters') {
      const limit = Math.min(Math.max(Number((args as { limit?: number })?.limit) || 50, 1), 100);
      const resp = await fetch(`${PUBLIC_API_BASE}/v1/characters?limit=${limit}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await resp.text();
      let data: unknown;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!resp.ok) {
        const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${resp.status}`;
        return { content: [{ type: 'text', text: `Error (${resp.status}): ${msg}` }], isError: true };
      }
      const chars = ((data as { characters?: Array<{ name?: string; character_id?: string | null; character_sheet_url?: string }> } | null)?.characters) ?? [];
      const body = chars.length
        ? chars.map((c) => `- ${c.name} — character_id: ${c.character_id ?? '(none)'}  |  sheet: ${c.character_sheet_url}`).join('\n')
        : 'No saved characters yet.';
      return { content: [{ type: 'text', text: `${chars.length} saved character(s). Reuse one by passing its character_id (or sheet URL) as \`character\` to make_ugc:\n${body}` }] };
    }

    // vNext skill route — forwards to /v1/skills/:slug/run.
    const skillTool = skillBySlug.get(name);
    if (skillTool) {
      let resp: Awaited<ReturnType<typeof fetch>>;
      try {
        resp = await fetch(
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
            signal: AbortSignal.timeout(30_000),
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
        const msg =
          (data as { error?: string; detail?: unknown } | null)?.error ??
          `HTTP ${resp.status}`;
        return {
          content: [{ type: 'text', text: `Error (${resp.status}): ${msg}` }],
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
              `Poll with ${pollUrl} for status + artifacts.`,
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
    const resp = await fetch(`${PUBLIC_API_BASE}${def.rest.path}`, {
      method: def.rest.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(args ?? {}),
    });
    const text = await resp.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!resp.ok) {
      const errMessage =
        (data as { error?: { message?: string } } | null)?.error?.message ??
        `HTTP ${resp.status}`;
      return {
        content: [
          { type: 'text', text: `Error (${resp.status}): ${errMessage}` },
        ],
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
            'Poll with the get_video_status tool (or GET /v1/videos/<job_id>).',
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
