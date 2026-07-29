// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Lightweight image dimension probe — reads magic bytes for PNG / JPEG / WebP
 * without decoding the full image. Used to reject non-portrait uploads.
 *
 * Returns { width, height } or null if unsupported or unreadable.
 */

export type ImageDimensions = { width: number; height: number };

export async function probeImageDimensions(url: string, timeoutMs = 10_000): Promise<ImageDimensions | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { Range: 'bytes=0-65535' },
      signal: controller.signal,
    });
    if (!resp.ok && resp.status !== 206) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return parseDimensions(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR at byte 16
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: FF D8 — walk markers to find SOF
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 9) {
      if (buf[offset] !== 0xff) return null;
      const marker = buf[offset + 1];
      // SOFn markers (baseline 0xC0, progressive 0xC2, etc) — exclude 0xC4/0xC8/0xCC
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height };
      }
      const segLen = buf.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
    return null;
  }

  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    // VP8X (extended): bytes 24-26 = width-1 (LE), 27-29 = height-1 (LE)
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x58) {
      const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width, height };
    }
    // VP8L (lossless): byte 21 bit0..13 width-1, bits14..27 height-1
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4c) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    // VP8 lossy: frame header at byte 26, width/height at 26-29
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { width, height };
    }
  }

  return null;
}
