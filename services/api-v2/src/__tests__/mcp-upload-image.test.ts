// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The connector must give an agent a way to hand us an image that is NOT
 * "paste the base64 into the generation call".
 *
 * Observed in production: a user attached a photo in chat, the agent had no
 * upload tool, so it inlined ~1 MB of base64 into make_ugc's arguments. The
 * client renders tool arguments, so the user watched a wall of base64 scroll
 * past ("it sends the 64 bit image on chat, as string"), and every validation
 * retry re-sent the whole blob.
 *
 * Second contract in here: no unbounded fetch may survive in this file. Two
 * of them did, and a stalled hop on either one is indistinguishable, from the
 * client's side, from "the connector hangs and then fails".
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source =
  readFileSync(join(here, '../routes/mcp.ts'), 'utf8') + '\n' + readFileSync(join(here, '../mcp/loose-tools.ts'), 'utf8');
const uploadRoute = readFileSync(join(here, '../routes/v1/uploads.ts'), 'utf8');
const server = readFileSync(join(here, '../server.ts'), 'utf8');

describe('hosted MCP: upload_image', () => {
  it('declares the tool and lists it in tools/list', () => {
    expect(source).toContain("name: 'upload_image'");
    expect(source).toContain('uploadImageTool,');
  });

  it('accepts either raw bytes or a foreign URL to re-host', () => {
    expect(source).toContain('image_base64');
    expect(source).toContain('image_url');
    expect(source).toContain('/v1/uploads/image');
  });

  it('tells the agent, in the tool description, not to paste base64 into chat', () => {
    const desc = source.slice(source.indexOf("name: 'upload_image'"));
    expect(desc).toMatch(/Do NOT paste base64/);
    expect(desc).toMatch(/costs? NO credits/i);
  });

  it('repeats that instruction on every tool that takes an image', () => {
    // The hint has to live on the generation tools too: an agent reading
    // make_ugc's schema alone must learn that upload_image exists.
    expect(source).toContain('IMAGE_URL_HINT');
    expect(source).toMatch(/call `upload_image` FIRST/);
    // applied on both surfaces — v2 generators and vNext skills
    const applications = source.match(/takesAnImage\(inputSchema\) \? IMAGE_URL_HINT : ''/g) ?? [];
    expect(applications.length).toBe(2);
  });
});

describe('hosted MCP: nothing may hang forever', () => {
  it('routes every outbound call through the bounded helper', () => {
    // A bare `fetch(` inside a tool handler is the bug this guards: no
    // timeout means the MCP request stays open until the CLIENT gives up.
    const bare = source.match(/(?<!api)\bfetch\(`/g) ?? [];
    expect(bare).toEqual([]);
    expect(source).toContain('AbortSignal.timeout(timeoutMs)');
  });

  it('keeps get_run_status wait:true under a connector client timeout', () => {
    const m = source.match(/wait \? (\d+)_000 : 0/);
    expect(m).not.toBeNull();
    // 60s is a common client ceiling; 110s guaranteed a client-side abort on
    // the one tool whose job is to stop the agent flying blind.
    expect(Number(m![1])).toBeLessThanOrEqual(50);
  });
});

describe('POST /v1/uploads/image', () => {
  it('is mounted, authenticated, and on the read (not generate) limiter', () => {
    expect(server).toContain(
      "app.post('/v1/uploads/image', readLimiter, authMiddleware, uploadImageRoute);",
    );
  });

  it('requires exactly one of image_base64 / image_url', () => {
    expect(uploadRoute).toContain('Provide either image_base64 or image_url.');
    expect(uploadRoute).toContain('not both');
  });

  it('reuses the shared helper, so moderation and the SSRF guard still apply', () => {
    expect(uploadRoute).toContain('uploadUserImageBase64');
    expect(uploadRoute).toContain('uploadUserImageFromUrl');
  });

  it('returns user-fixable failures as 400 so the agent stops retrying', () => {
    expect(uploadRoute).toMatch(/userFixable \? 400 : 500/);
  });
});
