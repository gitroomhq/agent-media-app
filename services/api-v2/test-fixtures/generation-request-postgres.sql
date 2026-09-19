-- Disposable PostgreSQL test database only. No production credentials.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE profiles(id uuid PRIMARY KEY);
CREATE TABLE models(slug text PRIMARY KEY);
CREATE TABLE user_credits(user_id uuid PRIMARY KEY, monthly_credits_remaining integer, purchased_balance integer);
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END$$;
\ir 20260216000007_generation_jobs.sql
ALTER TABLE generation_jobs ADD COLUMN input_params jsonb;
\ir 20260216000004_credit_transactions.sql
\ir 20260528130000_deduct_credits_idempotent.sql
\ir 20260919180000_generation_request_receipts.sql
INSERT INTO profiles VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO user_credits VALUES ('11111111-1111-4111-8111-111111111111',100,0);
INSERT INTO models VALUES ('gpt-image-2.5');
