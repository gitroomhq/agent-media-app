// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const imageCache = new Map<string, 'loading' | 'loaded' | 'error'>();

export function optimizedActorImageUrl(
  src: string | null | undefined,
  {
    width = 240,
    height,
    quality = 65,
  }: {
    width?: number;
    height?: number;
    quality?: number;
  } = {},
) {
  if (!src) return '';

  try {
    const url = new URL(src);
    const isSupabasePublicObject = url.pathname.includes('/storage/v1/object/public/');

    if (isSupabasePublicObject) {
      url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      url.searchParams.set('width', String(width));
      url.searchParams.set('height', String(height ?? Math.round((width * 16) / 9)));
      url.searchParams.set('quality', String(quality));
      url.searchParams.set('resize', 'cover');
      url.searchParams.set('format', 'webp');
      return url.toString();
    }

    return src;
  } catch {
    return src;
  }
}

function imageCacheState(src: string | null | undefined) {
  return src ? imageCache.get(src) : undefined;
}

export function isImageCached(src: string | null | undefined) {
  return imageCacheState(src) === 'loaded';
}

export function markImageLoaded(src: string) {
  imageCache.set(src, 'loaded');
}

export function preloadImage(src: string | null | undefined) {
  if (!src || typeof window === 'undefined') return;
  if (imageCache.get(src) === 'loaded' || imageCache.get(src) === 'loading') return;

  imageCache.set(src, 'loading');
  const image = new window.Image();
  image.decoding = 'async';
  image.onload = () => markImageLoaded(src);
  image.onerror = () => imageCache.set(src, 'error');
  image.src = src;
}

export function preloadImages(srcs: Array<string | null | undefined>, limit = 24) {
  srcs.slice(0, limit).forEach(preloadImage);
}

export function usePreloadImages(srcs: Array<string | null | undefined>, limit = 24) {
  const key = useMemo(() => srcs.filter(Boolean).slice(0, limit).join('\n'), [limit, srcs]);

  useEffect(() => {
    if (!key) return;
    const timeout = window.setTimeout(() => {
      preloadImages(key.split('\n'), limit);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [key, limit]);
}

export function CachedImage({
  src,
  alt,
  className,
  loading = 'lazy',
  fetchPriority = 'auto',
  rootClassName = 'relative h-full w-full overflow-hidden bg-[#e6e6e8]',
}: {
  src: string;
  alt: string;
  className: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
  rootClassName?: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(() => isImageCached(src));

  useEffect(() => {
    setLoaded(isImageCached(src));

    let cancelled = false;
    let timeout: number | undefined;

    const syncLoadedState = () => {
      if (cancelled) return;

      const state = imageCacheState(src);
      if (state === 'loaded' || state === 'error') {
        setLoaded(true);
        return;
      }

      const image = imageRef.current;
      if (image?.complete) {
        if (image.naturalWidth > 0) {
          markImageLoaded(src);
        } else {
          imageCache.set(src, 'error');
        }
        setLoaded(true);
        return;
      }

      timeout = window.setTimeout(syncLoadedState, 120);
    };

    preloadImage(src);
    syncLoadedState();

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [src]);

  return (
    <div className={rootClassName}>
      <ImageSkeleton visible={!loaded} />
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className={`absolute inset-0 z-10 ${className} transition-transform duration-500 ease-out ${
          loaded ? 'scale-100' : 'scale-[1.01]'
        }`}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        onLoad={() => {
          markImageLoaded(src);
          setLoaded(true);
        }}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}

export function ImageSkeleton({
  visible = true,
  className = '',
}: {
  visible?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-[#dedee2] via-[#f5f5f6] to-[#d6d6da] transition-opacity duration-300 ${
        visible ? 'animate-pulse opacity-100' : 'opacity-0'
      } ${className}`}
    />
  );
}
