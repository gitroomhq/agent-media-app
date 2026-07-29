// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// The Evolink governor must never submit more concurrent tasks than a key allows
// (Seedance 2.0 = ~3/account), and must spread load across a pool of keys so
// capacity scales by adding keys.

import { describe, it, expect, beforeEach } from 'vitest';
import { withEvolinkSlot, __resetEvolinkPoolForTest, evolinkInFlight } from '../client/evolink-pool.js';

beforeEach(() => __resetEvolinkPoolForTest());

describe('evolink concurrency governor', () => {
  it('never exceeds keys × per-key concurrency and uses every key', async () => {
    process.env.EVOLINK_API_KEYS = 'keyA,keyB';
    process.env.EVOLINK_MAX_CONCURRENT_PER_KEY = '2';
    __resetEvolinkPoolForTest();

    const live: Record<string, number> = { keyA: 0, keyB: 0 };
    let maxTotal = 0;
    const maxPerKey: Record<string, number> = { keyA: 0, keyB: 0 };
    const used = new Set<string>();

    const job = () =>
      withEvolinkSlot(async (key) => {
        used.add(key);
        live[key] += 1;
        maxPerKey[key] = Math.max(maxPerKey[key], live[key]);
        maxTotal = Math.max(maxTotal, live.keyA + live.keyB);
        await new Promise((r) => setTimeout(r, 10));
        live[key] -= 1;
      });

    await Promise.all(Array.from({ length: 30 }, job));

    expect(maxTotal).toBeLessThanOrEqual(4); // 2 keys × 2
    expect(maxPerKey.keyA).toBeLessThanOrEqual(2);
    expect(maxPerKey.keyB).toBeLessThanOrEqual(2);
    expect(used.has('keyA') && used.has('keyB')).toBe(true);
    expect(evolinkInFlight()).toBe(0); // every slot released
  });

  it('falls back to the single EVOLINK_API_KEY and caps its concurrency', async () => {
    delete process.env.EVOLINK_API_KEYS;
    process.env.EVOLINK_API_KEY = 'solo';
    process.env.EVOLINK_MAX_CONCURRENT_PER_KEY = '3';
    __resetEvolinkPoolForTest();

    let live = 0;
    let maxTotal = 0;
    await Promise.all(
      Array.from({ length: 12 }, () =>
        withEvolinkSlot(async () => {
          live += 1;
          maxTotal = Math.max(maxTotal, live);
          await new Promise((r) => setTimeout(r, 5));
          live -= 1;
        }),
      ),
    );
    expect(maxTotal).toBeLessThanOrEqual(3);
  });

  it('throws PROVIDER_UNCONFIGURED when no key is set', async () => {
    delete process.env.EVOLINK_API_KEYS;
    delete process.env.EVOLINK_API_KEY;
    __resetEvolinkPoolForTest();
    await expect(withEvolinkSlot(async () => 1)).rejects.toThrow(/not configured/);
  });
});
