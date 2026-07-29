import { NextRequest, NextResponse } from 'next/server';
import { gateway, errorResponse } from '@/lib/api/v1/gateway';
import { validateVideoBody } from '@/lib/api/v1/validate-video';

/** Maximum request body size: 1 MB. */
const MAX_BODY_BYTES = 1_048_576;

/**
 * When set, POST /api/v1/videos forwards to the V2 service
 * (/v1/generate/ugc_video) instead of the legacy Supabase edge function.
 * V2 is the canonical dispatch path — full webhook_url + SSRF validation.
 */
const API_V2_URL = process.env.API_V2_URL?.replace(/\/+$/, '') ?? '';

const ALLOWED_FIELDS = new Set([
  'script', 'prompt', 'product_url', 'actor_slug', 'target_duration',
  'style', 'tone', 'voice_speed', 'music', 'cta', 'aspect_ratio',
  'template', 'composition_mode', 'pip_options', 'allow_broll',
  'broll_model', 'broll_images', 'product_image_url', 'dub_language',
  'scenes', 'overlay_text', 'webhook_url',
]);

export async function POST(req: NextRequest) {
  // ── Body size limit ──────────────────────────────────────────────────
  const contentLength = req.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return errorResponse(413, 'body_too_large', 'Request body must be 1 MB or smaller');
  }

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON');
  }

  // Whitelist public params
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (ALLOWED_FIELDS.has(key)) body[key] = input[key];
  }

  // ── Validate all fields ──────────────────────────────────────────────
  const validation = validateVideoBody(body);
  if (!validation.ok) {
    return errorResponse(400, 'validation_error', validation.error!);
  }

  // Transform prompt → generate_script + script_prompt
  if (body.prompt) {
    body.generate_script = true;
    body.script_prompt = body.prompt;
    delete body.prompt;
  }

  // Transform scenes → scenes_input (edge function field name)
  if (body.scenes) {
    body.scenes_input = body.scenes;
    delete body.scenes;
  }

  // Flatten pip_options
  if (body.pip_options && typeof body.pip_options === 'object') {
    const pip = body.pip_options as Record<string, unknown>;
    if (pip.position) body.pip_position = pip.position;
    if (pip.size) body.pip_size = pip.size;
    if (pip.animation) body.pip_animation = pip.animation;
    if (pip.frame_style) body.pip_style = pip.frame_style;
    delete body.pip_options;
  }

  if (API_V2_URL) {
    return proxyToV2Generate(req, body);
  }

  return gateway(req, 'ugc-video', { body });
}

/**
 * Forward a V1 POST /api/v1/videos request to api-v2's
 * /v1/generate/ugc_video endpoint, preserving Bearer auth and request body.
 * api-v2 already normalises V1 field names (scenes_input, pip_*, etc).
 */
async function proxyToV2Generate(
  req: NextRequest,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return errorResponse(401, 'missing_api_key', 'Authorization header with Bearer token is required');
  }

  const url = `${API_V2_URL}/v1/generate/ugc_video`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return errorResponse(502, 'upstream_unreachable', (err as Error).message);
  }

  const text = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return errorResponse(
      upstream.status >= 500 ? 502 : upstream.status,
      'upstream_error',
      `api-v2 returned non-JSON response (HTTP ${upstream.status})`,
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Request-Id': crypto.randomUUID(),
  };
  for (const key of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
    const v = upstream.headers.get(key);
    if (v) headers[key] = v;
  }

  return NextResponse.json(data, { status: upstream.status, headers });
}

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const body: Record<string, unknown> = { list: true };
  if (params.limit) body.limit = Number(params.limit);
  if (params.offset) body.offset = Number(params.offset);
  if (params.status) body.status = params.status;
  if (params.sort) body.sort = params.sort;
  return gateway(req, 'job-status', { body });
}
