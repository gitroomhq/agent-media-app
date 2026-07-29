// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Admin observability helper: map vNext `primitive_runs` rows into the same
 * job shape the admin UI already renders for legacy `generation_jobs`.
 *
 * Why: vNext skills (make_portrait / make_simple_selfie / make_product_in_hands
 * / …) write to `primitive_runs`, NOT `generation_jobs`. The admin panel only
 * read `generation_jobs`, so every vNext user showed "No generations found" and
 * "0 credits used" even though they generated and were charged. This bridges
 * the two so admins see real activity + spend.
 *
 * Credit numbers MUST match services/api-v2/src/skills/credit-quotes.ts +
 * services/primitive-worker-vnext/src/client/credits.ts.
 */

const VIDEO_BY_DURATION: Record<number, number> = { 5: 140, 10: 280, 15: 420 };

export function vnextCreditCost(primitiveId: string, input: unknown): number {
  const d = (input as { duration?: number } | null)?.duration;
  switch (primitiveId) {
    case 'portrait_gpt2':
      return 35;
    case 'character_sheet_gpt2':
      return 35;
    case 'wireframe_gpt2':
      return 35;
    case 'subtitles_v2':
      return 15;
    case 'simple_selfie':
    case 'product_in_hands':
    case 'lip_sync':
      return VIDEO_BY_DURATION[typeof d === 'number' ? d : 10] ?? 280;
    default:
      return 0;
  }
}

export interface AdminJob {
  user_id: string;
  id: string;
  model_slug: string | null;
  operation: string | null;
  status: string | null;
  prompt: string | null;
  output_media_url: string | null;
  credit_cost: number | null;
  error_message: string | null;
  error_code: string | null;
  created_at: string | null;
  completed_at?: string | null;
}

interface PrimitiveRunRow {
  user_id: string;
  id: string;
  primitive_id: string;
  status: string;
  input: unknown;
  created_at: string;
  finished_at?: string | null;
  primitive_artifacts?: Array<{ url: string }> | null;
}

/** Normalize a vNext primitive_run into the admin job shape. */
export function mapPrimitiveRunToJob(r: PrimitiveRunRow): AdminJob {
  const input = (r.input ?? {}) as Record<string, unknown>;
  const prompt =
    (input.generated_prompt as string) ??
    (input.script as string) ??
    (input.scene_action as string) ??
    (input.description as string) ??
    null;
  return {
    user_id: r.user_id,
    id: r.id,
    model_slug: r.primitive_id,
    operation: 'vnext',
    // Normalize 'succeeded' → 'completed' so the UI + credit totals (which
    // filter status === 'completed') treat vNext runs the same as legacy.
    status: r.status === 'succeeded' ? 'completed' : r.status,
    prompt: typeof prompt === 'string' ? prompt.slice(0, 500) : null,
    output_media_url: r.primitive_artifacts?.[0]?.url ?? null,
    credit_cost: r.status === 'succeeded' ? vnextCreditCost(r.primitive_id, r.input) : 0,
    error_message: null,
    error_code: null,
    created_at: r.created_at,
    completed_at: r.finished_at ?? null,
  };
}
