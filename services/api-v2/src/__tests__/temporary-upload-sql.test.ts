// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = randomUUID();
const other = randomUUID();
beforeAll(async () => {
  await db.exec(
    'create role anon; create role authenticated; create role service_role; create table public.profiles(id uuid primary key);',
  );
  await db.query('insert into profiles values ($1),($2)', [owner, other]);
  await db.exec(
    readFileSync(
      new URL(
        '../../../../supabase/migrations/20260919140000_temporary_image_uploads.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
}, 30_000);
afterAll(() => db.close());
async function session(user = owner) {
  const id = randomUUID();
  await db.query('select create_temporary_upload_session($1,$2,$3)', [id, user, 'a'.repeat(64)]);
  return id;
}
const reserve = (id: string, sessionId: string, user = owner, hash = 'hash') =>
  db.query<{ id: string; status: string; expires_at: string; lease_token: string }>(
    'select * from reserve_temporary_upload_asset($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, sessionId, user, 'image.png', hash, 100, 'b'.repeat(64), randomUUID()],
  );
describe('temporary upload database contract', () => {
  it('creates a 24-hour session and enforces owner, in-flight retry and payload identity', async () => {
    const s = await session();
    const id = randomUUID();
    const { rows } = await db.query<{ ttl: number }>(
      'select extract(epoch from (expires_at-created_at))::int ttl from temporary_upload_sessions where id=$1',
      [s],
    );
    expect(rows[0].ttl).toBe(86400);
    await expect(reserve(id, s, other)).rejects.toThrow('UPLOAD_EXPIRED');
    await reserve(id, s);
    await expect(reserve(id, s)).rejects.toThrow('UPLOAD_IN_PROGRESS');
    await expect(reserve(id, s, owner, 'different')).rejects.toThrow('UPLOAD_CONFLICT');
    await db.query("update temporary_upload_assets set status='ready' where id=$1", [id]);
    const replay = await reserve(id, s);
    expect(replay.rows[0]).toMatchObject({ id, status: 'ready' });
  });
  it('reclaims failed uploads but never extends the original expiry', async () => {
    const s = await session();
    const id = randomUUID();
    const first = await reserve(id, s);
    await db.query("update temporary_upload_assets set status='failed' where id=$1", [id]);
    const retry = await reserve(id, s);
    expect(retry.rows[0].expires_at).toEqual(first.rows[0].expires_at);
    expect(retry.rows[0].lease_token).not.toBe(first.rows[0].lease_token);
    await db.query(
      "update temporary_upload_sessions set expires_at=now()-interval '1 second' where id=$1",
      [s],
    );
    await expect(reserve(randomUUID(), s)).rejects.toThrow('UPLOAD_EXPIRED');
  });
  it('bounds a session at ten reservations', async () => {
    const s = await session();
    for (let i = 0; i < 10; i++) await reserve(randomUUID(), s);
    await expect(reserve(randomUUID(), s)).rejects.toThrow('UPLOAD_FILE_LIMIT');
  });
  it('does not grant anonymous or signed-in clients direct table/RPC access', async () => {
    const { rows } = await db.query<{ tables: boolean; rpc: boolean }>(`select
      has_table_privilege('authenticated','temporary_upload_assets','select') as tables,
      has_function_privilege('anon','create_temporary_upload_session(uuid,uuid,text)','execute') as rpc`);
    expect(rows[0]).toEqual({ tables: false, rpc: false });
  });
});
