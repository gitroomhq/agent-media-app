-- Fix actor portrait URLs: bucket is "actors" not "actor-portraits"
UPDATE actors
SET portrait_url = REPLACE(portrait_url, '/actor-portraits/', '/actors/')
WHERE portrait_url LIKE '%/actor-portraits/%';
