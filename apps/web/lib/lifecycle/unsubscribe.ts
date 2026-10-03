// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribe(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId, secret));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
