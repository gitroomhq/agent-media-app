import { NextRequest, NextResponse } from 'next/server';

type ErrorType =
  | 'validation_error'
  | 'authentication_error'
  | 'rate_limit_error'
  | 'not_found'
  | 'insufficient_credits'
  | 'server_error';

interface ApiError {
  error: { code: string; message: string; type: ErrorType };
}

const STATUS_TO_TYPE: Record<number, ErrorType> = {
  400: 'validation_error',
  401: 'authentication_error',
  402: 'insufficient_credits',
  403: 'authentication_error',
  404: 'not_found',
  429: 'rate_limit_error',
};

function errorType(status: number): ErrorType {
  return STATUS_TO_TYPE[status] ?? 'server_error';
}

export function errorResponse(status: number, code: string, message: string): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { code, message, type: errorType(status) } },
    {
      status,
      headers: stdHeaders(),
    },
  );
}

function stdHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Request-Id': crypto.randomUUID(),
    ...extra,
  };
}

function getGatewayConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Forwards a request to a Supabase Edge Function using the caller's
 * Bearer token (API key). Returns a normalised NextResponse.
 */
export async function gateway(
  req: NextRequest,
  fnName: string,
  opts: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  } = {},
): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return errorResponse(401, 'missing_api_key', 'Authorization header with Bearer token is required');
  }

  const method = opts.method ?? 'POST';
  const config = getGatewayConfig();
  if (!config) {
    return errorResponse(500, 'server_not_configured', 'Supabase gateway configuration is missing');
  }

  const url = new URL(`${config.supabaseUrl}/functions/v1/${fnName}`);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }

  const fetchOpts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      apikey: config.supabaseAnonKey,
    },
  };

  if (method === 'POST' && opts.body) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), fetchOpts);
  } catch (err) {
    return errorResponse(502, 'edge_function_unreachable', (err as Error).message);
  }

  let data: unknown;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    // Edge function returned non-JSON (e.g., HTML from a 502 proxy error).
    // Always return a clean JSON error instead of forwarding raw HTML.
    if (!res.ok) {
      return errorResponse(
        res.status >= 500 ? 502 : res.status,
        'edge_function_error',
        `Edge function returned non-JSON response (HTTP ${res.status})`,
      );
    }
    data = { raw: text };
  }

  // If the edge function returned an error, normalise it
  if (!res.ok) {
    const body = data as Record<string, unknown>;
    const msg = (body?.error as string) ?? (body?.message as string) ?? 'Request failed';
    return errorResponse(res.status, String(body?.error ?? 'request_failed'), msg);
  }

  // Build response with standard + passthrough headers
  const extra: Record<string, string> = {};
  for (const key of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
    const v = res.headers.get(key);
    if (v) extra[key] = v;
  }

  return NextResponse.json(data, {
    status: res.status,
    headers: stdHeaders(extra),
  });
}
