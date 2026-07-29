-- Migration: Reprice UGC pipeline to reflect real provider costs at 40% margin.
--
-- Real cost breakdown per video (Creatify Aurora $0.14/s + Veo 3.1 $1.20-1.60/clip):
--   15s  → Creatify ~8s ($1.12) + Veo 1 clip 6s ($1.20) + compute ($0.05) = $2.37
--   30s  → Creatify ~18s ($2.52) + Veo 2 clips 8s ($3.20) + compute ($0.10) = $5.82
--   60s  → Creatify ~36s ($5.04) + Veo 3 clips 8s ($4.80) + compute ($0.15) = $9.99
--   120s → Creatify ~72s ($10.08) + Veo 4 clips 8s ($6.40) + compute ($0.25) = $16.73
--
-- Formula: credit_cost = CEIL(provider_cost_usd / 0.60 * 100) → rounded to clean numbers
-- Margin at each tier: ~40-42%

UPDATE model_pricing SET
  credit_cost      = 400,
  provider_cost_usd = 2.37
WHERE model_slug = 'ugc-basic' AND operation = 'ugc_video' AND duration_seconds = 15;

UPDATE model_pricing SET
  credit_cost      = 1000,
  provider_cost_usd = 5.82
WHERE model_slug = 'ugc-basic' AND operation = 'ugc_video' AND duration_seconds = 30;

UPDATE model_pricing SET
  credit_cost      = 1750,
  provider_cost_usd = 9.99
WHERE model_slug = 'ugc-basic' AND operation = 'ugc_video' AND duration_seconds = 60;

UPDATE model_pricing SET
  credit_cost      = 3000,
  provider_cost_usd = 16.73
WHERE model_slug = 'ugc-basic' AND operation = 'ugc_video' AND duration_seconds = 120;
