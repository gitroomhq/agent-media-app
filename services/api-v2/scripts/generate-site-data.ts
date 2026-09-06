#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * public-skill/site-data.json — everything the website's Docs section
 * renders, generated from the same objects as the connector and the
 * skill pack: tools/list (src/mcp/loose-tools.ts), the model catalog
 * (@agentmedia/schema/v2), the prices (quoteGenerate), the recipes and
 * prompting guide (scripts/public-skill-loose.ts), the REST routes.
 *
 * The website fetches this file from the public repo (raw GitHub, main)
 * at build/revalidate time and falls back to a committed snapshot. So a
 * change here reaches agent-media.ai/docs without a website deploy, and
 * the site can never describe a tool or a price the server does not have.
 *
 * Run via `pnpm --filter api-v2 gen:public-skill` (this script is invoked
 * from generate-public-skill.ts). CI's gen:public-skill:check guards it.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V2_MODELS,
  V2_DEFAULT_MODEL,
  V2_VOICES,
  V2_IMAGE_SIZES,
  V2_VIDEO_ASPECTS,
  GenerateVideoSchema,
  GenerateImageSchema,
  GenerateAudioSchema,
  quoteGenerate,
} from '@agentmedia/schema/v2';
import { LOOSE_SURFACE_TOOLS } from '../src/mcp/loose-tools.js';
import { AUTO_POLICY, publicView } from '../src/lib/model-view.js';
import { promptingGuide, recipes, realismRubric } from './public-skill-loose.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const MCP_URL = 'https://api.agent-media.ai/mcp';
const API = 'https://api.agent-media.ai';

function q(kind: 'video' | 'image' | 'audio', input: Record<string, unknown>) {
  const schema = kind === 'video' ? GenerateVideoSchema : kind === 'image' ? GenerateImageSchema : GenerateAudioSchema;
  const r = quoteGenerate(kind as 'video', schema.parse(input) as never);
  return { model: r.model, credits: r.credits, usd: Number((r.credits * 0.01).toFixed(2)), breakdown: r.breakdown };
}

export function buildSiteData(pluginVersion: string) {
  const live = Object.values(V2_MODELS).filter((m) => m.status === 'live');
  const candidates = Object.values(V2_MODELS).filter((m) => m.status === 'candidate');

  return {
    pack_version: pluginVersion,
    source: 'https://github.com/gitroomhq/agent-media-app',
    connector: {
      url: MCP_URL,
      transport: 'streamable-http',
      auth: 'OAuth 2.1 with dynamic client registration (browser sign-in); `Authorization: Bearer ma_...` API keys also accepted.',
      clients: [
        { id: 'claude', label: 'Claude.ai / Claude Desktop', how: 'Settings → Connectors → Add custom connector → paste the URL → Connect.' },
        { id: 'claude-code', label: 'Claude Code', command: `claude mcp add --transport http agent-media ${MCP_URL}` },
        { id: 'codex', label: 'Codex', command: `codex mcp add agent-media --url ${MCP_URL}`, note: 'For scripted runs, write tools need `codex exec --dangerously-bypass-approvals-and-sandbox` or an approval policy that allows them.' },
        { id: 'grok', label: 'Grok', command: `grok mcp add agent-media -t http ${MCP_URL}` },
        { id: 'cursor', label: 'Cursor', config: `{ "mcpServers": { "agent-media": { "url": "${MCP_URL}" } } }`, note: '~/.cursor/mcp.json' },
        { id: 'local', label: 'Any stdio client', command: 'npx -y -p @agentmedia/mcp-server@latest agent-media-mcp', note: 'A stdio proxy to the same hosted server; set AGENT_MEDIA_API_KEY. Do not register both the connector and the proxy in one client, or every tool appears twice.' },
      ],
      prompt: `Set up agent-media so I can generate videos, images and voice from here.\n1. Add the MCP server: ${MCP_URL} (Streamable HTTP).\n2. Authenticate: complete the sign-in in the browser it opens.\n3. Call list_models and tell me what you can make.`,
      polling: 'Every generate tool returns a job id. Call get_run_status with wait:true; each call blocks up to ~45 seconds, a video usually needs several calls (seedance-2.0 renders 5s in about 3 minutes, seedance-2.5 takes far longer). Never report a result before get_run_status returned its URL.',
    },
    tools: LOOSE_SURFACE_TOOLS.map((t) => ({
      name: t.name,
      title: (t.annotations as { title: string }).title,
      read_only: (t.annotations as { readOnlyHint: boolean }).readOnlyHint,
      spends_credits: ['generate_video', 'generate_image', 'generate_audio'].includes(t.name),
      description: t.description,
      input_schema: t.inputSchema,
    })),
    models: {
      defaults: V2_DEFAULT_MODEL,
      auto_policy: AUTO_POLICY,
      live: live.map((m) => publicView(m, {})),
      candidates: candidates.map((m) => ({ id: m.id, kind: m.kind, tier: m.tier, best_for: m.bestFor, note: m.cost.note })),
      recent_url: `${API}/v1/models`,
    },
    pricing: {
      credit_usd: 0.01,
      rules: [
        ...live.map((m) => ({
          model: m.id,
          kind: m.kind,
          rate: m.kind === 'audio' ? `${m.credits!.perUnit * 100} credit per 100 characters, rounded up` : `${m.credits!.perUnit} credits per ${m.credits!.unit}`,
        })),
        { model: 'quote, list_models, list_characters, get_run_status, upload_image, rate_run', kind: 'free', rate: '0 credits' },
      ],
      examples: [
        q('video', { prompt: 'x'.repeat(10), seconds: 5 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 10 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 15 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 5, model: 'seedance-2.5' }),
        q('image', { prompt: 'portrait' }),
        q('audio', { text: 'a'.repeat(250) }),
      ],
      refund: 'Credits are deducted at submit. A job that fails refunds automatically.',
    },
    limits: {
      video: { seconds: [4, 15], aspect: [...V2_VIDEO_ASPECTS], refs_max: 4 },
      image: { sizes: [...V2_IMAGE_SIZES], refs_max: 4 },
      audio: { voices: Object.entries(V2_VOICES).map(([name, v]) => ({ name, note: v.note })), tones: ['energetic', 'calm', 'confident', 'dramatic'], max_chars: 4000 },
      refs: 'https URLs only. Use upload_image (PNG/JPEG, 10 MB) to turn bytes or a foreign URL into one. Never inline base64.',
    },
    rest: {
      base: API,
      auth: 'Authorization: Bearer ma_... (from `agent-media login` or the dashboard)',
      routes: [
        { method: 'POST', path: '/v2/generate/{video|image|audio}', body: 'the tool arguments', returns: '201 { job_id, model, credits_deducted, breakdown, auto?, status_url }' },
        { method: 'POST', path: '/v2/quote/{video|image|audio}', body: 'the same arguments', returns: '200 { credits, usd, model, breakdown, auto? }' },
        { method: 'GET', path: '/v1/videos/{job_id}', body: '', returns: '{ status, video_url } (the URL is a png or mp3 for those kinds)' },
        { method: 'GET', path: '/v1/models', body: '', returns: 'the catalog with recent stats; public' },
        { method: 'POST', path: '/v1/runs/{job_id}/rate', body: '{ score: 1..5, note? }', returns: '200 { job_id, model, score }' },
        { method: 'POST', path: '/v1/uploads/image', body: '{ image_base64 } or { image_url }', returns: '{ image_url }' },
        { method: 'GET', path: '/v1/characters', body: '', returns: 'saved characters with sheet/portrait URLs' },
      ],
      openapi: `${API}/openapi.json`,
      reference: `${API}/docs`,
      curl: `curl -X POST ${API}/v2/generate/video \\\n  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \\\n  -d '{ "prompt": "A 28-year-old woman in a bright kitchen, phone framing, holds a serum bottle to the lens and says: \\"Okay, I did not expect this to work.\\"", "seconds": 5 }'`,
      fixed_skills_note: 'The fixed recipes (make_ugc, make_podcast, make_subtitles, selfie, crazy look) remain REST and CLI routes for the dashboard. They are not MCP tools.',
    },
    recipes: recipes(),
    prompting: promptingGuide(REPO_ROOT),
    rubric: realismRubric(REPO_ROOT),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const out = resolve(REPO_ROOT, 'public-skill', 'site-data.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildSiteData(process.env.PACK_VERSION ?? '2.0.0'), null, 2) + '\n');
  console.log(`wrote ${out}`);
}
