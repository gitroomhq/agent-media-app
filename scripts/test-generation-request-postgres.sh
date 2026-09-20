#!/usr/bin/env bash
set -euo pipefail
# Dedicated CI service container; never accepts a production database URL.
: "${PGTEST_CONTAINER:?Set PGTEST_CONTAINER to a disposable postgres container id}"
task_tmp=$(mktemp -d)
trap 'rm -rf "$task_tmp"' EXIT
for name in 20260216000007_generation_jobs 20260216000004_credit_transactions 20260528130000_deduct_credits_idempotent 20260919180000_generation_request_receipts 20260920130000_atomic_generation_admission; do
  cp "supabase/migrations/$name.sql" "$task_tmp/"
done
cp services/api-v2/test-fixtures/generation-request-postgres.sql "$task_tmp/setup.sql"
cp services/api-v2/test-fixtures/generation-capacity-postgres.sql "$task_tmp/capacity.sql"
cat > "$task_tmp/submit.sql" <<'SQL'
BEGIN;
SELECT gen_random_uuid() job_id \gset
SELECT submit_generation_request(:'job_id'::uuid,'11111111-1111-4111-8111-111111111111',
 'loose:11111111-1111-4111-8111-111111111111:concurrent',repeat('a',64),'gpt-image-2.5','image','Portrait',20,
 '{"prompt":"Portrait"}', jsonb_build_object('job_id',:'job_id','breakdown','image','credits_deducted',20))->>'created';
SELECT pg_sleep(1);
COMMIT;
SQL
docker exec "$PGTEST_CONTAINER" mkdir -p /tmp/generation-request-test
docker cp "$task_tmp/." "$PGTEST_CONTAINER:/tmp/generation-request-test/"
docker exec "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/generation-request-test/setup.sql > /dev/null
# Independent connections overlap while the winner holds its transaction lock.
docker exec "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -tA -f /tmp/generation-request-test/submit.sql > "$task_tmp/a" &
first=$!
docker exec "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -tA -f /tmp/generation-request-test/submit.sql > "$task_tmp/b" &
second=$!
wait "$first"
wait "$second"
[[ $(cat "$task_tmp/a" "$task_tmp/b" | grep -c '^true$') = 1 ]]
[[ $(cat "$task_tmp/a" "$task_tmp/b" | grep -c '^false$') = 1 ]]
docker exec -i "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$BEGIN
 IF (SELECT count(*) FROM generation_jobs) <> 1 OR (SELECT count(*) FROM generation_request_receipts) <> 1
    OR (SELECT sum(amount) FROM credit_transactions) <> -20
    OR (SELECT monthly_credits_remaining FROM user_credits) <> 80 THEN
   RAISE EXCEPTION 'Concurrent submissions duplicated the job or debit';
 END IF;
END$$;
SQL
printf 'PASS: overlapping PostgreSQL transactions produced one job, one receipt, and one debit.\n'

# Two different requests race for one remaining account slot. Unlike identical
# idempotency keys, both want a new job; the per-account advisory lock must let
# exactly one commit and reject the other before insertion or debit.
docker exec -i "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
UPDATE generation_jobs SET status='completed';
INSERT INTO skill_runs(id,user_id,status) VALUES
  (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','running'),
  (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','submitted');
SQL
set +e
docker exec "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -tA -f /tmp/generation-request-test/capacity.sql > "$task_tmp/cap-a" 2> "$task_tmp/cap-a.err" &
first=$!
docker exec "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -tA -f /tmp/generation-request-test/capacity.sql > "$task_tmp/cap-b" 2> "$task_tmp/cap-b.err" &
second=$!
wait "$first"; first_status=$?
wait "$second"; second_status=$?
set -e
[[ $(( (first_status == 0) + (second_status == 0) )) = 1 ]]
grep -q 'TOO_MANY_ACTIVE_RENDERS:3:3' "$task_tmp/cap-a.err" "$task_tmp/cap-b.err"
docker exec -i "$PGTEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$BEGIN
 IF (SELECT count(*) FROM generation_jobs WHERE status='submitted') <> 1
    OR (SELECT count(*) FROM generation_request_receipts) <> 2
    OR (SELECT sum(amount) FROM credit_transactions) <> -40
    OR (SELECT monthly_credits_remaining FROM user_credits) <> 60 THEN
   RAISE EXCEPTION 'Concurrent capacity admission created an extra job or debit';
 END IF;
END$$;
SQL
printf 'PASS: two distinct requests racing for one slot admitted one job and one debit.\n'
