/**
 * Edge Function: actors
 *
 * Public endpoint (no auth required) to list and filter actors.
 *
 * Routes:
 *   GET /functions/v1/actors                         -> all active actors
 *   GET /functions/v1/actors?gender=female            -> filter by gender
 *   GET /functions/v1/actors?age_range=18-25          -> filter by age range
 *   GET /functions/v1/actors?actor_type=Young+Adult   -> filter by type
 *   GET /functions/v1/actors?search=emma              -> search by name
 *   GET /functions/v1/actors?slug=emma                -> exact slug lookup
 */

import { supabaseAdmin } from "../_shared/supabase.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Rate limiting ────────────────────────────────────────────────────────────

const IP_WINDOW_MS = 60_000;
const IP_MAX_REQUESTS = 60;

interface IpBucket { timestamps: number[] }
const ipBuckets = new Map<string, IpBucket>();

function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const cutoff = now - IP_WINDOW_MS;
  let bucket = ipBuckets.get(ip);
  if (!bucket) { bucket = { timestamps: [] }; ipBuckets.set(ip, bucket); }
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  if (bucket.timestamps.length >= IP_MAX_REQUESTS) return { allowed: false, remaining: 0 };
  bucket.timestamps.push(now);
  return { allowed: true, remaining: IP_MAX_REQUESTS - bucket.timestamps.length };
}

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = {
    "Content-Type": "application/json",
    ...getCorsHeaders(origin),
    ...getSecurityHeaders(),
  };

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // Rate limit
  const ip = getClientIp(req);
  const { allowed, remaining } = checkIpRateLimit(ip);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again in 60 seconds." }),
      { status: 429, headers: { ...headers, "Retry-After": "60" } },
    );
  }

  try {
    const url = new URL(req.url);
    const gender = url.searchParams.get("gender");
    const ageRange = url.searchParams.get("age_range");
    const actorType = url.searchParams.get("actor_type");
    const search = url.searchParams.get("search");
    const slug = url.searchParams.get("slug");

    const db = supabaseAdmin();

    // Slug lookup — single actor
    if (slug) {
      const { data, error } = await db
        .from("actors")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .single();

      if (error || !data) {
        // Suggest similar slugs
        let hint = "";
        const { data: allSlugs } = await db
          .from("actors")
          .select("slug")
          .eq("status", "active");
        if (allSlugs) {
          const lev = (a: string, b: string): number => {
            const m = a.length, n = b.length;
            const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
              Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
            );
            for (let i = 1; i <= m; i++)
              for (let j = 1; j <= n; j++)
                d[i][j] = Math.min(
                  d[i - 1][j] + 1,
                  d[i][j - 1] + 1,
                  d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
                );
            return d[m][n];
          };
          const similar = allSlugs
            .map((r) => ({ slug: r.slug as string, dist: lev(slug!, r.slug as string) }))
            .filter((r) => r.dist <= 2 && r.dist > 0)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 3)
            .map((r) => r.slug);
          if (similar.length) {
            hint = ` Did you mean: ${similar.join(", ")}?`;
          }
        }
        return new Response(
          JSON.stringify({ error: `Actor '${slug}' not found.${hint}` }),
          { status: 404, headers },
        );
      }

      return new Response(JSON.stringify({ actor: data }), {
        status: 200,
        headers: { ...headers, "X-RateLimit-Remaining": String(remaining) },
      });
    }

    // List with filters
    let query = db
      .from("actors")
      .select("*", { count: "exact" })
      .eq("status", "active")
      .order("name", { ascending: true });

    if (gender) query = query.eq("gender", gender);
    if (ageRange) query = query.eq("age_range", ageRange);
    if (actorType) query = query.eq("actor_type", actorType);
    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error, count } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to query actors" }),
        { status: 500, headers },
      );
    }

    return new Response(
      JSON.stringify({ actors: data ?? [], total: count ?? 0 }),
      {
        status: 200,
        headers: { ...headers, "X-RateLimit-Remaining": String(remaining) },
      },
    );
  } catch (err) {
    console.error("actors edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers },
    );
  }
});
