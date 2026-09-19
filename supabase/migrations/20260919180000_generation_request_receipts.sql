-- Copyright 2026 agent-media contributors. Apache-2.0 license.
-- A request identity survives lost responses and process restarts. The job,
-- pinned quote, and debit commit together. Only the creator may dispatch.
-- Separate from user-editable job rows; receipt identity is service-owned.
-- No job FK: retain a tombstone if an administrator purges the job later.
CREATE TABLE public.generation_request_receipts (
  idempotency_key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.generation_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.generation_request_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.generation_request_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.get_generation_request(p_user_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('request_hash', r.request_hash, 'response', r.response,
    'status', coalesce(j.status, 'unknown'))
  FROM public.generation_request_receipts r
  LEFT JOIN public.generation_jobs j ON j.id = r.job_id AND j.user_id = r.user_id
  WHERE r.idempotency_key = p_idempotency_key AND r.user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.get_generation_request(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_generation_request(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_generation_request(
  p_job_id uuid, p_user_id uuid, p_idempotency_key text, p_request_hash text,
  p_model text, p_kind text, p_prompt text, p_credit_cost integer,
  p_input_params jsonb, p_response jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt jsonb;
BEGIN
  IF p_user_id IS NULL OR p_job_id IS NULL OR p_kind NOT IN ('image','video','audio')
     OR p_kind IS NULL OR p_credit_cost IS NULL OR p_credit_cost <= 0
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
     OR p_response->>'job_id' IS DISTINCT FROM p_job_id::text
     OR p_response->>'credits_deducted' IS DISTINCT FROM p_credit_cost::text
     OR p_idempotency_key IS NULL
     OR p_idempotency_key NOT LIKE 'loose:' || p_user_id::text || ':%' THEN
    RAISE EXCEPTION 'INVALID_GENERATION_REQUEST';
  END IF;
  -- Same identity serializes across API instances; hash collisions only add
  -- contention, never collapse different keys. No expiry permits a late retry.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  v_receipt := public.get_generation_request(p_user_id, p_idempotency_key);
  IF v_receipt IS NOT NULL THEN
    IF v_receipt->>'request_hash' IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('created', false, 'status', v_receipt->>'status', 'response', v_receipt->'response');
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
REVOKE ALL ON FUNCTION public.submit_generation_request(uuid,uuid,text,text,text,text,text,integer,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_generation_request(uuid,uuid,text,text,text,text,text,integer,jsonb,jsonb) TO service_role;
