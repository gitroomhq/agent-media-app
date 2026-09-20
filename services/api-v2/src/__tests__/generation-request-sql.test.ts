// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const db = new PGlite();
const owner = randomUUID(), other = randomUUID();
const migration = (name: string) => readFileSync(new URL(`../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key); create table models(slug text primary key);
    create table user_credits(user_id uuid primary key, monthly_credits_remaining integer, purchased_balance integer);
    create function set_updated_at() returns trigger language plpgsql as $$begin NEW.updated_at=now(); return NEW; end$$;`);
  await db.exec(migration('20260216000007_generation_jobs'));
  await db.exec('alter table generation_jobs add column input_params jsonb;');
  await db.exec(migration('20260216000004_credit_transactions'));
  await db.exec(migration('20260528130000_deduct_credits_idempotent'));
  await db.exec(migration('20260919180000_generation_request_receipts'));
  await db.exec(`create table skill_runs(id uuid primary key, user_id uuid not null, status text not null, created_at timestamptz not null default now());
    create table primitive_runs(id uuid primary key, user_id uuid not null, skill_run_id uuid, status text not null, created_at timestamptz not null default now());`);
  await db.exec(migration('20260920130000_atomic_generation_admission'));
  await db.query('insert into profiles values ($1),($2)', [owner, other]);
  await db.query('insert into user_credits values ($1,1000,1000),($2,0,0)', [owner, other]);
  await db.exec("insert into models values ('gpt-image-2.5');");
}, 30_000);
afterAll(() => db.close());
async function submit(key: string, user = owner, hash = 'a'.repeat(64), cost = 20) {
  const id = randomUUID();
  const { rows } = await db.query<{ result: { created: boolean; status: string; response: { job_id: string; credits_deducted: number } } }>(
    'select submit_generation_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
    [id, user, `loose:${user}:${key}`, hash, 'gpt-image-2.5', 'image', 'Portrait', cost,
      { prompt: 'Portrait', model: 'gpt-image-2.5' }, { job_id: id, credits_deducted: cost, breakdown: 'image', request_id: key }],
  );
  return rows[0].result;
}
async function submitLimited(key: string, user = owner, limit = 3) {
  const id = randomUUID();
  const { rows } = await db.query<{ result: { created: boolean; status: string; response: { job_id: string; credits_deducted: number } } }>(
    'select submit_generation_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',
    [id, user, `loose:${user}:${key}`, 'c'.repeat(64), 'gpt-image-2.5', 'image', 'Portrait', 20,
      { prompt: 'Portrait', model: 'gpt-image-2.5' }, { job_id: id, credits_deducted: 20, breakdown: 'image', request_id: key }, limit],
  );
  return rows[0].result;
}
describe('durable generation request receipts and actual credit ledger', () => {
  it('replays a saved response with one job and debit, preserving its quote', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([submit(key), submit(key, owner, 'a'.repeat(64), 40)]);
    expect([a.created, b.created]).toEqual([true, false]);
    expect(b.response).toEqual(a.response);
    const { rows } = await db.query<{ count: number; total: number }>('select count(*)::int count, sum(amount)::int total from credit_transactions where reference_id=$1', [a.response.job_id]);
    expect(rows[0]).toEqual({ count: 1, total: -20 });
  });
  it('rejects changed input under the same key without another debit', async () => {
    const key = randomUUID();
    await submit(key);
    await expect(submit(key, owner, 'b'.repeat(64))).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('keeps intentionally new generations distinct', async () => {
    const a = await submit(randomUUID()), b = await submit(randomUUID());
    expect(a.response.job_id).not.toBe(b.response.job_id);
    expect(a.created && b.created).toBe(true);
  });
  it('rolls back the job and receipt when the debit fails; a funded retry can succeed', async () => {
    const key = randomUUID();
    await expect(submit(key, other)).rejects.toThrow('INSUFFICIENT_CREDITS');
    const { rows } = await db.query<{ count: number }>('select count(*)::int count from generation_jobs where user_id=$1', [other]);
    expect(rows[0].count).toBe(0);
    await db.query('update user_credits set purchased_balance=100 where user_id=$1', [other]);
    expect((await submit(key, other)).created).toBe(true);
  });
  it('scopes identities to the account', async () => {
    const key = randomUUID();
    const a = await submit(key), b = await submit(key, other);
    expect(a.response.job_id).not.toBe(b.response.job_id);
  });
  it('returns terminal jobs without resurrecting or charging them', async () => {
    const key = randomUUID(), a = await submit(key);
    await db.query("update generation_jobs set status='failed' where id=$1", [a.response.job_id]);
    const b = await submit(key);
    expect(b).toMatchObject({ created: false, status: 'failed', response: a.response });
  });
  it('blocks direct invocation by public and authenticated roles', async () => {
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(`select
      has_function_privilege('anon','submit_generation_request(uuid,uuid,text,text,text,text,text,integer,jsonb,jsonb)','execute') anon,
      has_function_privilege('authenticated','submit_generation_request(uuid,uuid,text,text,text,text,text,integer,jsonb,jsonb)','execute') authenticated`);
    expect(rows[0]).toEqual({ anon: false, authenticated: false });
  });
  it('atomically admits only one request for the last account slot and keeps replay recoverable', async () => {
    await db.query("update generation_jobs set status='completed' where user_id=$1", [owner]);
    await db.query("insert into skill_runs(id,user_id,status) values ($1,$3,'running'),($2,$3,'submitted')", [randomUUID(), randomUUID(), owner]);
    const keys = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled(keys.map((key) => submitLimited(key)));
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(String(rejected?.reason)).toContain('TOO_MANY_ACTIVE_RENDERS:3:3');
    const winner = outcomes.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof submitLimited>>> => result.status === 'fulfilled')!;
    const winnerKey = keys[outcomes.indexOf(winner)];
    expect(await submitLimited(winnerKey)).toMatchObject({ created: false, response: winner.value.response });
    const { rows } = await db.query<{ count: number }>("select count(*)::int count from generation_jobs where user_id=$1 and status='submitted'", [owner]);
    expect(rows[0].count).toBe(1);
  });
});
