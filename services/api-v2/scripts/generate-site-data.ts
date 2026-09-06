#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * public-skill/site-data.json, everything the website's Docs section
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
  V2_DEFAULT_VIDEO_QUALITY,
  V2_VOICES,
  V2_IMAGE_SIZES,
  V2_VIDEO_ASPECTS,
  V2_VIDEO_QUALITIES,
  GenerateVideoSchema,
  GenerateImageSchema,
  GenerateAudioSchema,
  quoteGenerate,
  type QuoteExtras,
  type V2VideoMode,
} from '@agentmedia/schema/v2';
import { LOOSE_SURFACE_TOOLS } from '../src/mcp/loose-tools.js';
import { AUTO_POLICY, publicView } from '../src/lib/model-view.js';
import { promptingGuide, recipes, realismRubric, priceLadder } from './public-skill-loose.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const MCP_URL = 'https://api.agent-media.ai/mcp';
const API = 'https://api.agent-media.ai';

const VIDEO_MODE_ORDER: V2VideoMode[] = ['text', 'image', 'reference'];

function q(kind: 'video' | 'image' | 'audio', input: Record<string, unknown>, extras?: QuoteExtras) {
  const schema = kind === 'video' ? GenerateVideoSchema : kind === 'image' ? GenerateImageSchema : GenerateAudioSchema;
  const r = quoteGenerate(kind as 'video', schema.parse(input) as never, extras);
  return {
    model: r.model,
    ...(r.mode ? { mode: r.mode } : {}),
    ...(r.quality ? { quality: r.quality } : {}),
    credits: r.credits,
    usd: Number((r.credits * 0.01).toFixed(2)),
    breakdown: r.breakdown,
  };
}

export function buildSiteData(pluginVersion: string) {
  const live = Object.values(V2_MODELS).filter((m) => m.status === 'live');
  const liveVideo = live.filter((m) => m.kind === 'video' && m.video);
  const candidates = Object.values(V2_MODELS).filter((m) => m.status === 'candidate');
  const imageDefault = V2_MODELS[V2_DEFAULT_MODEL.image];

  // Per (model, mode) limits: seconds, aspects, qualities, refs. The same
  // cells the schema validates against at submit.
  const videoLimits = Object.fromEntries(
    liveVideo.map((m) => [
      m.id,
      Object.fromEntries(
        VIDEO_MODE_ORDER.filter((mode) => m.video!.modes[mode]).map((mode) => {
          const s = m.video!.modes[mode]!;
          return [
            mode,
            {
              seconds: [s.seconds[0], s.seconds[1]],
              aspects: s.aspects,
              aspect_default: s.aspectDefault,
              qualities: s.qualities,
              ...(mode === 'image' ? { last_frame: Boolean(s.lastFrame) } : {}),
              ...(mode === 'reference' && s.refs
                ? {
                    refs: {
                      images: s.refs.images,
                      videos: s.refs.videos,
                      audios: s.refs.audios,
                      ...(s.refs.videoSecondsTotal ? { video_seconds_total: s.refs.videoSecondsTotal } : {}),
                      ...(s.refs.audioSecondsTotal ? { audio_seconds_total: s.refs.audioSecondsTotal } : {}),
                      audio_alone: s.refs.audioAlone,
                    },
                  }
                : {}),
            },
          ];
        }),
      ),
    ]),
  );

  return {
    pack_version: pluginVersion,
    source: 'https://github.com/gitroomhq/agent-media-app',
    connector: {
      url: MCP_URL,
      transport: 'streamable-http',
      auth: 'OAuth 2.1 with dynamic client registration (browser sign-in); `Authorization: Bearer ma_...` API keys also accepted.',
      clients: [
        { id: 'claude', label: 'Claude.ai / Claude Desktop', how: 'Settings > Connectors > Add custom connector > paste the URL > Connect.' },
        { id: 'claude-code', label: 'Claude Code', command: `claude mcp add --transport http agent-media ${MCP_URL}` },
        { id: 'codex', label: 'Codex', command: `codex mcp add agent-media --url ${MCP_URL}`, note: 'For scripted runs, write tools need `codex exec --dangerously-bypass-approvals-and-sandbox` or an approval policy that allows them.' },
        { id: 'grok', label: 'Grok', command: `grok mcp add agent-media -t http ${MCP_URL}` },
        { id: 'cursor', label: 'Cursor', config: `{ "mcpServers": { "agent-media": { "url": "${MCP_URL}" } } }`, note: '~/.cursor/mcp.json' },
        { id: 'local', label: 'Any stdio client', command: 'npx -y -p @agentmedia/mcp-server@latest agent-media-mcp', note: 'A stdio proxy to the same hosted server; set AGENT_MEDIA_API_KEY. Do not register both the connector and the proxy in one client, or every tool appears twice.' },
      ],
      prompt: `Set up agent-media so I can generate videos, images and voice from here.\n1. Add the MCP server: ${MCP_URL} (Streamable HTTP).\n2. Authenticate: complete the sign-in in the browser it opens.\n3. Call list_models and tell me what you can make.`,
      polling: `Every generate tool returns a job id. Call get_run_status with wait:true; each call blocks up to about 45 seconds, a video usually needs several calls (${liveVideo.map((m) => `${m.id}: ${m.usage!.latency}`).join('; ')}). Never report a result before get_run_status returned its URL.`,
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
      // The three video modes per live video model, as list_models shows
      // them: inputs, limits, price per second, proof.
      video_modes: Object.fromEntries(liveVideo.map((m) => [m.id, publicView(m, {}).video!.modes])),
      candidates: candidates.map((m) => ({ id: m.id, kind: m.kind, tier: m.tier, modes: m.modes, best_for: m.bestFor, avoid_for: m.avoidFor, note: 'planned: not selectable and unpriced until a real run is recorded' })),
      recent_url: `${API}/v1/models`,
    },
    pricing: {
      credit_usd: 0.01,
      rules: [
        ...live.map((m) =>
          m.kind === 'video'
            ? {
                model: m.id,
                kind: m.kind,
                rate: `${priceLadder(m)}, per output second; default quality ${V2_DEFAULT_VIDEO_QUALITY}`,
                per_quality: m.video!.creditsPerSecond,
                reference_clips: 'seconds of video_refs are measured at submit and billed at the same per-second rate as output seconds',
              }
            : {
                model: m.id,
                kind: m.kind,
                rate: m.kind === 'audio' ? `${m.credits!.perUnit * 100} credit per 100 characters, rounded up` : `${m.credits!.perUnit} credits per ${m.credits!.unit}`,
              },
        ),
        { model: 'quote, list_models, list_characters, get_run_status, upload_image, rate_run', kind: 'free', rate: '0 credits' },
      ],
      examples: [
        q('video', { prompt: 'x'.repeat(10), seconds: 5 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 10 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 15 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 5, quality: '480p' }),
        q('video', { prompt: 'x'.repeat(10), seconds: 5, quality: '1080p' }),
        q('video', { prompt: 'x'.repeat(10), seconds: 5, first_frame: 'https://example.com/still.png' }),
        q('video', { prompt: 'x'.repeat(10), seconds: 5, video_refs: ['https://example.com/ref.mp4'] }, { inputVideoSeconds: 5 }),
        q('video', { prompt: 'x'.repeat(10), seconds: 5, model: 'seedance-2.5' }),
        q('image', { prompt: 'portrait' }),
        q('audio', { text: 'a'.repeat(250) }),
      ],
      refund: 'Credits are deducted at submit. A job that fails refunds automatically.',
    },
    limits: {
      video: {
        modes: 'first_frame (and optional last_frame) selects image-to-video; refs, video_refs or audio_refs select reference; neither is text. Frames and refs cannot be mixed on Seedance.',
        seconds: Object.fromEntries(
          liveVideo.map((m) => [
            m.id,
            Object.fromEntries(VIDEO_MODE_ORDER.filter((mode) => m.video!.modes[mode]).map((mode) => [mode, [...m.video!.modes[mode]!.seconds]])),
          ]),
        ),
        aspects: [...V2_VIDEO_ASPECTS],
        qualities: [...V2_VIDEO_QUALITIES],
        quality_default: V2_DEFAULT_VIDEO_QUALITY,
        per_model: videoLimits,
        consistency: 'keep a series consistent with refs (the same portrait or character sheet in every call); there is no other handle',
      },
      image: { sizes: [...V2_IMAGE_SIZES], resolutions: imageDefault.limits.resolutions ?? [...V2_IMAGE_SIZES], refs_max: imageDefault.limits.refsMax ?? 0 },
      audio: { voices: Object.entries(V2_VOICES).map(([name, v]) => ({ name, note: v.note })), tones: ['energetic', 'calm', 'confident', 'dramatic'], max_chars: 4000 },
      refs: 'https URLs only. Use upload_image (PNG/JPEG, 10 MB) to turn bytes or a foreign URL into one. Never inline base64. Reference clips and audio are https URLs too.',
    },
    rest: {
      base: API,
      auth: 'Authorization: Bearer ma_... (from `agent-media login` or the dashboard)',
      routes: [
        { method: 'POST', path: '/v2/generate/{video|image|audio}', body: 'the tool arguments', returns: '201 { job_id, model, mode?, quality?, credits_deducted, breakdown, auto?, status_url }' },
        { method: 'POST', path: '/v2/quote/{video|image|audio}', body: 'the same arguments', returns: '200 { credits, usd, model, mode?, quality?, breakdown, auto? }' },
        { method: 'GET', path: '/v1/videos/{job_id}', body: '', returns: '{ status, video_url } (the URL is a png or mp3 for those kinds)' },
        { method: 'GET', path: '/v1/models', body: '', returns: 'the catalog with modes, prices per quality and recent stats; public' },
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
