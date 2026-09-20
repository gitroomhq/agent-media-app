BEGIN;
SELECT gen_random_uuid() job_id, gen_random_uuid() request_id \gset
SELECT submit_generation_request(:'job_id'::uuid,'11111111-1111-4111-8111-111111111111',
 'loose:11111111-1111-4111-8111-111111111111:' || :'request_id',repeat('c',64),'gpt-image-2.5','image','Portrait',20,
 '{"prompt":"Portrait"}', jsonb_build_object('job_id',:'job_id','breakdown','image','credits_deducted',20),3)->>'created';
SELECT pg_sleep(1);
COMMIT;
