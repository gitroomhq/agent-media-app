/**
 * Proxy wrapper for Supabase edge function calls.
 *
 * In local development, edge functions don't return CORS headers for
 * localhost origins. This routes calls through /api/fn/[name] which
 * runs server-side and avoids the CORS issue entirely.
 */

export async function invokeFn(
  name: string,
  options?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<{ data: any; error: any }> {
  const method = options?.method ?? (options?.body ? 'POST' : 'GET');

  try {
    const res = await fetch(`/api/fn/${name}`, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' && options?.body ? JSON.stringify(options.body) : undefined,
    });

    // The proxy SHOULD always return JSON, but if Next.js is mid-recompile,
    // the route throws, or a middleware redirects, we can get an HTML
    // error page. Parse defensively so the caller sees a useful message,
    // not the cryptic "Unexpected token '<', "<!DOCTYPE "..." JSON error.
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
      return {
        data: null,
        error: {
          message: `Edge function /api/fn/${name} returned non-JSON (HTTP ${res.status}). ${preview ? `First 200 chars: ${preview}` : ''}`.trim(),
        },
      };
    }

    if (!res.ok) {
      return { data, error: { message: data?.error_description ?? data?.error ?? `HTTP ${res.status}` } };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: (err as Error).message } };
  }
}
