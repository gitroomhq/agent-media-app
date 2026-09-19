// Copyright 2026 agent-media contributors. Apache-2.0 license.
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { uploadFixture } from './helpers/upload-fixture.js';
import { normalizeImage } from '../uploads/service.js';
import { createUploadRouter } from '../uploads/routes.js';

const png = () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: '#9966aa' } })
    .png()
    .toBuffer();
describe('temporary image uploads', () => {
  it('replays a completed upload without a second storage write', async () => {
    const f = uploadFixture();
    const created = await f.service.create(f.owner);
    const s = await f.service.authorize(created.session_id, { token: created.upload_token });
    const id = randomUUID();
    const bytes = await png();
    const first = await f.service.upload(s, id, 'portrait.png', bytes);
    expect(await f.service.upload(s, id, 'portrait.png', bytes)).toEqual(first);
    expect(f.writes()).toBe(1);
    await expect(f.service.upload(s, id, 'other.png', Buffer.from('other'))).rejects.toMatchObject({
      code: 'UPLOAD_CONFLICT',
    });
  });
  it('enforces ownership/capabilities and hard expiry even when storage cleanup fails', async () => {
    const f = uploadFixture();
    const created = await f.service.create(f.owner);
    await expect(
      f.service.authorize(created.session_id, { userId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.service.authorize(created.session_id, { token: '0'.repeat(64) }),
    ).rejects.toMatchObject({ status: 404 });
    const s = await f.service.authorize(created.session_id, { userId: f.owner });
    const image = await f.service.upload(s, randomUUID(), 'test.png', await png());
    const token = new URL(image.image_url).searchParams.get('token')!;
    expect((await f.service.read(image.asset_id, token)).bytes.length).toBeGreaterThan(0);
    await expect(f.service.read(image.asset_id, '0'.repeat(64))).rejects.toMatchObject({
      status: 404,
    });
    f.advance(86400001);
    f.failRemove(true);
    await expect(f.service.read(image.asset_id, token)).rejects.toMatchObject({ status: 410 });
    expect(await f.service.cleanup()).toEqual({ removed: 0, failed: 1 });
    expect(f.assets.size).toBe(1);
    f.failRemove(false);
    expect(await f.service.cleanup()).toEqual({ removed: 1, failed: 0 });
    expect(f.objects.size).toBe(0);
    expect(f.sessions.size).toBe(0);
  });
  it('fully decodes images, supports WebP, and rejects corrupt or non-image input', async () => {
    const bytes = await sharp(await png())
      .webp()
      .toBuffer();
    const normalized = await normalizeImage(bytes);
    expect(normalized).toMatchObject({ mime: 'image/png', width: 32, height: 24 });
    expect((await sharp(normalized.data).metadata()).format).toBe('png');
    await expect(
      normalizeImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
        ),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(normalizeImage((await png()).subarray(0, 40))).rejects.toMatchObject({
      status: 422,
    });
  });
  it('serves a binary upload through the restricted panel API, not the account credential', async () => {
    const f = uploadFixture();
    const app = express();
    app.use(
      createUploadRouter(f.service, (req, res, next) => {
        if (req.get('Authorization') !== 'Bearer fixture-owner') {
          res.sendStatus(401);
          return;
        }
        (req as express.Request & { userId: string }).userId = f.owner;
        next();
      }),
    );
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const created = await (
        await fetch(`${base}/v1/upload-sessions`, {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture-owner' },
        })
      ).json();
      const path = `/v1/upload-panels/${created.session_id}/files/${randomUUID()}?filename=photo.png`;
      expect(
        (await fetch(base + path, { method: 'PUT', body: new Uint8Array(await png()) })).status,
      ).toBe(401);
      const response = await fetch(base + path, {
        method: 'PUT',
        headers: {
          Authorization: `Upload ${created.upload_token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(await png()),
      });
      expect(response.status).toBe(200);
      const uploaded = await response.json();
      expect(uploaded.mime).toBe('image/png');
      const imageUrl = new URL(uploaded.image_url);
      const image = await fetch(base + imageUrl.pathname + imageUrl.search);
      expect(image.status).toBe(200);
      expect(image.headers.get('cache-control')).toContain('no-store');
      expect(
        (
          await fetch(`${base}/v1/upload-sessions/${created.session_id}`, {
            headers: { Authorization: `Upload ${created.upload_token}` },
          })
        ).status,
      ).toBe(401);
      const page = await fetch(base + '/upload');
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('Drop images here or browse');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
