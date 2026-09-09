// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The presigned upload exists for one reason: an agent must never have to
 * carry a user's photo through its own context, because when it does it
 * shrinks the photo until the base64 fits (observed in the field: a 1254px
 * product PNG delivered to the video model as a 300px, quality-55 JPEG).
 *
 * These assertions pin the parts of that contract that are easy to break
 * later: the two-step shape, the per-user key, and the tool text that
 * tells an agent to send the original file.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('presigned upload (no base64 through the model)', () => {
  const lib = read('lib/r2-upload.ts');
  const routes = read('routes/v1/uploads.ts');
  const server = read('server.ts');
  const tool = read('mcp/loose-tools.ts');
  const mcp = read('routes/mcp.ts');

  it('signs a PUT pinned to the exact size and type, in a per-user staging key', () => {
    expect(lib).toContain('export async function presignUpload(');
    expect(lib).toMatch(/ContentType: mime, ContentLength: bytes/);
    expect(lib).toMatch(/vnext\/staging\/\$\{userId\}/);
    // Short-lived on purpose: a signed write URL is a capability.
    expect(lib).toMatch(/PRESIGN_TTL_SECONDS = 15 \* 60/);
  });

  it('confirmation runs the same gate as the base64 path before any URL is handed out', () => {
    const confirm = lib.slice(lib.indexOf('export async function confirmUpload('));
    expect(confirm).toContain('moderateImageOrThrow');
    expect(confirm).toMatch(/not a PNG or JPEG/);
    expect(confirm).toMatch(/too large/);
    // A staged object that fails validation is deleted, never left reachable.
    expect(confirm).toContain('DeleteObjectCommand');
    // And one user cannot confirm another user's key into their namespace.
    expect(confirm).toMatch(/does not belong to this user/);
  });

  it('direct PUT raises the cap above the base64 one, because there is no 33% inflation', () => {
    expect(lib).toMatch(/MAX_PRESIGNED_BYTES = 25 \* 1024 \* 1024/);
    expect(lib).toMatch(/MAX_UPLOAD_BYTES = 10 \* 1024 \* 1024/);
  });

  it('both routes are mounted behind auth', () => {
    expect(server).toContain("app.post('/v1/uploads/presign', readLimiter, authMiddleware, presignUploadRoute);");
    expect(server).toContain("app.post('/v1/uploads/confirm', readLimiter, authMiddleware, confirmUploadRoute);");
  });

  it('upload_image offers the file path first and tells the agent not to resize', () => {
    const desc = tool.slice(tool.indexOf("name: 'upload_image'"), tool.indexOf("name: 'upload_image'") + 2200);
    expect(desc).toMatch(/file_bytes/);
    expect(desc).toMatch(/never pass through this conversation|NO reason to resize/);
    expect(desc).toMatch(/25 MB/);
    // base64 stays, but as the last resort it now is.
    expect(desc).toMatch(/Only when 1 and 2 are impossible/);
    expect(desc).not.toMatch(/[–—]/); // house style
  });

  it('the connector forwards both steps and prints the curl the agent should run', () => {
    const handler = mcp.slice(mcp.indexOf("if (name === 'upload_image')"), mcp.indexOf("if (name === 'upload_image')") + 4000);
    expect(handler).toContain('/v1/uploads/presign');
    expect(handler).toContain('/v1/uploads/confirm');
    expect(handler).toMatch(/curl -X PUT/);
    expect(handler).toMatch(/ORIGINAL file, unresized/);
  });
});
