-- Remove 60s and 120s UGC pricing rows to enforce 30s max duration
DELETE FROM model_pricing WHERE model_slug = 'ugc-basic' AND duration_seconds IN (60, 120);
