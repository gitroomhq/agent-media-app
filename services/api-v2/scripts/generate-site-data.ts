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
import { openUploadPanelTool, getUploadsTool } from '../src/uploads/tools.js';
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
        { id: 'claude', label: 'Claude.ai / Claude Desktop / Cowork', how: 'Customize > Connectors > + > Add custom connector > paste the URL > Connect and sign in. Enable Agent Media in the conversation connector menu.' },
        { id: 'claude-code', label: 'Claude Code', command: `claude mcp add --transport http --scope user agent-media ${MCP_URL}`, note: 'Available in all your projects. In Claude Code, run /mcp, select agent-media, and complete browser sign-in. If already connected, do not add a second copy.' },
        { id: 'chatgpt', label: 'ChatGPT (web)', how: 'Enable Developer mode where your account or workspace permits it. Create a custom MCP app with the connector URL and OAuth, complete sign-in, then select Agent Media in the conversation. Refresh the app tools when the catalog changes.', note: 'Settings labels and availability vary by account and workspace policy. See the linked official ChatGPT setup guide below.' },
        { id: 'codex', label: 'Codex', command: `codex mcp add agent-media --url ${MCP_URL}`, note: 'Then run codex mcp login agent-media to complete browser sign-in. Keep your normal approval settings; review requested tool actions.' },
        { id: 'grok', label: 'Grok CLI', command: `grok mcp add --transport http agent-media ${MCP_URL}` },
        { id: 'cursor', label: 'Cursor', config: `{ "mcpServers": { "agent-media": { "url": "${MCP_URL}" } } }`, note: '~/.cursor/mcp.json' },
        { id: 'local', label: 'Any stdio client', command: 'npx -y -p @agentmedia/mcp-server@latest agent-media-mcp', note: 'A stdio proxy to the same hosted server; set AGENT_MEDIA_API_KEY. Do not register both the connector and the proxy in one client, or every tool appears twice.' },
      ],
      prompt: `Set up agent-media so I can generate videos, images and voice from here.\n1. Add the MCP server: ${MCP_URL} (Streamable HTTP).\n2. Authenticate: complete the sign-in in the browser it opens.\n3. Call list_models and tell me what you can make.\n4. Open the existing image upload panel using open_upload_panel, or upload_image with {} if only the older tools are available. Do not generate anything yet.`,
      polling: `Every generate tool returns a job id. Call get_run_status with wait:true; each call blocks up to about 45 seconds, a video usually needs several calls (${liveVideo.map((m) => `${m.id}: ${m.usage!.latency}`).join('; ')}). Never report a result before get_run_status returned its URL.`,
    },
    tools: [...LOOSE_SURFACE_TOOLS, openUploadPanelTool, getUploadsTool].map((t) => ({
      name: t.name,
      title: (t.annotations as { title: string }).title,
      read_only: (t.annotations as { readOnlyHint: boolean }).readOnlyHint,
      spends_credits: ['generate_video', 'generate_image', 'generate_audio'].includes(t.name),
      description: ['open_upload_panel', 'get_uploads'].includes(t.name)
        ? 'Optional: available only when temporary uploads are enabled; check tools/list before calling. ' + t.description
        : t.description,
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
        { model: 'get_account, quote, list_models, list_characters, get_run_status, upload_image, open_upload_panel, get_uploads, rate_run', kind: 'no generation charge', rate: '0 credits; does not grant or refill credits' },
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
      refund: 'Credits are deducted when a new generation is accepted. Failure and refund confirmation are separate: report a refund only when the service confirms it. A timeout or unavailable status does not prove failure or a refund.',
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
      refs: 'Use HTTPS URLs. The temporary upload panel accepts up to 10 still PNG/JPEG/WebP images, 25 MB each, and expires 24 hours after session creation. For a local file, use the presign/PUT/confirm flow. The legacy base64/URL upload endpoint has separate limits. Never paste image bytes into chat.',
    },
    rest: {
      base: API,
      auth: 'Authorization: Bearer YOUR_AGENT_MEDIA_API_KEY',
      routes: [
        { method: 'POST', path: '/v2/generate/{video|image|audio}', body: 'the tool arguments', returns: '201 new job; 200 saved receipt on retry; 202 acknowledgement uncertain. Returns job_id, request_id, credits_deducted, status_url and model details.' },
        { method: 'POST', path: '/v2/quote/{video|image|audio}', body: 'the same arguments', returns: '200 { credits, usd, model, mode?, quality?, breakdown, auto? }' },
        { method: 'GET', path: '/v1/videos/{job_id}', body: '', returns: '{ status, video_url, ... }; video_url holds the output for image/audio too. 503 STATUS_UNAVAILABLE: retry the same job.' },
        { method: 'GET', path: '/v1/me/readiness', body: '', returns: '{ authenticated, credits, generation, uploads, billing_url }; 503 means balance unknown' },
        { method: 'GET', path: '/v1/models', body: '', returns: 'the catalog with modes, prices per quality and recent stats; public' },
        { method: 'POST', path: '/v1/runs/{job_id}/rate', body: '{ score: 1..5, note? }', returns: '200 { job_id, model, score }' },
        { method: 'POST', path: '/v1/upload-sessions', body: '{}; temporary uploads must be enabled', returns: '201 { session_id, upload_url, upload_token, expires_at, max_bytes, max_files, images }' },
        { method: 'GET', path: '/v1/upload-sessions/{session_id}', body: '', returns: '{ session_id, expires_at, max_bytes, max_files, images }; owner authentication required' },
        { method: 'POST', path: '/v1/uploads/presign', body: '{ bytes, content_type?, filename? }', returns: '{ put_url, upload_key, content_type, bytes, expires_in, ... }; PUT original bytes, then confirm' },
        { method: 'POST', path: '/v1/uploads/confirm', body: '{ upload_key }', returns: '{ image_url, mime, bytes }' },
        { method: 'POST', path: '/v1/uploads/image', body: '{ image_base64 } or { image_url }', returns: '{ image_url }' },
        { method: 'GET', path: '/v1/characters', body: '', returns: 'saved characters with sheet/portrait URLs' },
      ],
      openapi: `${API}/openapi.json`,
      reference: `${API}/docs`,
      curl: `curl -X POST ${API}/v2/quote/video \\\n  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \\\n  -d '{ "prompt": "A 28-year-old woman in a bright kitchen, phone framing, holds a serum bottle to the lens and says: \\"Okay, I did not expect this to work.\\"", "seconds": 5 }'`,
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
