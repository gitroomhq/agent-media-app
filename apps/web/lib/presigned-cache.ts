// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Client-side TTL cache for presigned download URLs.
 *
 * Avoids redundant Edge Function calls by caching presigned URLs
 * and refreshing them before they expire. Uses a configurable buffer
 * (default 5 minutes) to ensure URLs are refreshed well before expiry.
 *
 * Usage:
 *   import { presignedCache } from '@/lib/presigned-cache';
 *   const url = await presignedCache.getUrl(jobId, 'media', supabase);
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface CachedUrl {
  url: string;
  expiresAt: number;
  type: 'media' | 'thumbnail';
}

interface PresignedUrlResponse {
  url: string;
  expiresAt: string;
  type: 'media' | 'thumbnail';
  external?: boolean;
}

class PresignedUrlCache {
  private cache = new Map<string, CachedUrl>();

  /** Refresh buffer: fetch a new URL if the cached one expires within this window. */
  private readonly TTL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get a presigned URL for a job's media or thumbnail output.
   *
   * Returns a cached URL if it is still valid (with buffer), otherwise
   * fetches a fresh presigned URL from the Edge Function.
   *
   * @param jobId    - The generation job UUID.
   * @param type     - The output type: 'media' or 'thumbnail'.
   * @param supabase - A Supabase client instance for invoking the Edge Function.
   * @returns The presigned download URL.
   */
  async getUrl(
    jobId: string,
    type: 'media' | 'thumbnail',
    supabase: SupabaseClient,
  ): Promise<string> {
    const key = `${jobId}:${type}`;
    const cached = this.cache.get(key);

    // Return cached URL if it won't expire within the buffer window
    if (cached && cached.expiresAt - Date.now() > this.TTL_BUFFER_MS) {
      return cached.url;
    }

    // Fetch a fresh presigned URL
    const { data, error } = await supabase.functions.invoke<PresignedUrlResponse>(
      'presigned-url',
      {
        body: { jobId, type },
      },
    );

    if (error) throw error;
    if (!data) throw new Error('Empty response from presigned-url function');

    this.cache.set(key, {
      url: data.url,
      expiresAt: new Date(data.expiresAt).getTime(),
      type,
    });

    return data.url;
  }

  /**
   * Invalidate a specific cached URL entry.
   *
   * @param jobId - The generation job UUID.
   * @param type  - The output type to invalidate.
   */
  invalidate(jobId: string, type: 'media' | 'thumbnail'): void {
    this.cache.delete(`${jobId}:${type}`);
  }

  /**
   * Clear all cached presigned URLs.
   */
  clear(): void {
    this.cache.clear();
  }
}

/** Singleton presigned URL cache instance. */
export const presignedCache = new PresignedUrlCache();
