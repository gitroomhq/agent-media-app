-- Add 10s UGC pricing bucket for quick test videos
INSERT INTO model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES ('ugc-basic', 'ugc_video', 10, NULL, 100, 1.00)
ON CONFLICT DO NOTHING;
