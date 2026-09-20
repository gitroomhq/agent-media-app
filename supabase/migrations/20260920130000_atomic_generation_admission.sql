-- Copyright 2026 agent-media contributors. Apache-2.0 license.
-- Atomically enforce the shared render limit for loose image/video/audio jobs.
-- The HTTP middleware remains the fast user-facing check. This RPC is the
-- transaction boundary that prevents two API instances from both admitting a
-- request after observing the same free slot.

CREATE OR REPLACE FUNCTION public.submit_generation_request(
  p_job_id uuid, p_user_id uuid, p_idempotency_key text, p_request_hash text,
  p_model text, p_kind text, p_prompt text, p_credit_cost integer,
  p_input_params jsonb, p_response jsonb, p_max_concurrent integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt jsonb;
  v_active integer;
  v_cutoff timestamptz := now() - interval '1 hour';
BEGIN
  IF p_user_id IS NULL OR p_job_id IS NULL OR p_kind NOT IN ('image','video','audio')
     OR p_kind IS NULL OR p_credit_cost IS NULL OR p_credit_cost <= 0
     OR p_max_concurrent IS NULL OR p_max_concurrent <= 0
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
     OR p_response->>'job_id' IS DISTINCT FROM p_job_id::text
     OR p_response->>'credits_deducted' IS DISTINCT FROM p_credit_cost::text
     OR p_idempotency_key IS NULL
     OR p_idempotency_key NOT LIKE 'loose:' || p_user_id::text || ':%' THEN
    RAISE EXCEPTION 'INVALID_GENERATION_REQUEST';
  END IF;

  -- A replay never needs a new slot. Serialize its identity first and return
  -- the durable receipt before entering account admission.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  v_receipt := public.get_generation_request(p_user_id, p_idempotency_key);
  IF v_receipt IS NOT NULL THEN
    IF v_receipt->>'request_hash' IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('created', false, 'status', v_receipt->>'status', 'response', v_receipt->'response');
  END IF;

  -- One lock per account serializes distinct loose submissions across API
  -- replicas. Count all three active ledgers to preserve the shared limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('generation-admission:' || p_user_id::text, 0));
  SELECT
    (SELECT count(*) FROM public.generation_jobs
      WHERE user_id = p_user_id AND status IN ('submitted','processing') AND created_at >= v_cutoff)
    + (SELECT count(*) FROM public.skill_runs
      WHERE user_id = p_user_id AND status IN ('submitted','running') AND created_at >= v_cutoff)
    + (SELECT count(*) FROM public.primitive_runs
      WHERE user_id = p_user_id AND skill_run_id IS NULL
        AND status IN ('submitted','running') AND created_at >= v_cutoff)
    INTO v_active;
  IF v_active >= p_max_concurrent THEN
    RAISE EXCEPTION 'TOO_MANY_ACTIVE_RENDERS:%:%', v_active, p_max_concurrent;
  END IF;

  INSERT INTO public.generation_jobs (
    id, user_id, model_slug, operation, status, prompt, credit_cost,
    provider_slug, provider_job_id, input_params, idempotency_key
  ) VALUES (
    p_job_id, p_user_id, p_model, 'generate_' || p_kind, 'submitted', p_prompt, p_credit_cost,
    'railway', p_job_id::text, p_input_params, p_idempotency_key
  );
  INSERT INTO public.generation_request_receipts(idempotency_key,user_id,job_id,request_hash,response)
    VALUES (p_idempotency_key,p_user_id,p_job_id,p_request_hash,p_response);
  PERFORM public.deduct_credits(p_user_id, p_credit_cost, p_job_id, 'generate_' || p_kind || ' · ' || (p_response->>'breakdown'));
  RETURN jsonb_build_object('created', true, 'status', 'submitted', 'response', p_response);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_generation_request(uuid,uuid,text,text,text,text,text,integer,jsonb,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_generation_request(uuid,uuid,text,text,text,text,text,integer,jsonb,jsonb,integer) TO service_role;
