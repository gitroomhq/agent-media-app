'use client';

import { useEffect, useRef, useState } from 'react';

interface ShowcaseItem {
  prompt: string;
  model: string;
  url: string;
  posterUrl?: string;
}

export function LazyVideo({
  src,
  poster,
  rootMargin = '240px',
  className = 'h-full w-full object-cover',
}: {
  src: string;
  poster?: string;
  rootMargin?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [rootMargin]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;
    void video.play().catch(() => {
      // Browser autoplay can be conservative; the poster remains visible.
    });
  }, [shouldLoad]);

  return (
    <video
      ref={videoRef}
      src={shouldLoad ? `${src}?v=3#t=0.4` : undefined}
      poster={poster}
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      className={className}
    />
  );
}

export function VideoCarousel({ items, variant = 'dark', compact = false }: { items: ShowcaseItem[]; variant?: 'dark' | 'light'; compact?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Double the items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="relative w-full overflow-hidden">
      {/* Fade edges */}
      <div className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-32 bg-gradient-to-r ${variant === 'light' ? 'from-[#ededed]' : 'from-[#121212]'} to-transparent`} />
      <div className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-32 bg-gradient-to-l ${variant === 'light' ? 'from-[#ededed]' : 'from-[#121212]'} to-transparent`} />

      <div
        ref={trackRef}
        className={`flex animate-marquee ${compact ? 'gap-3' : 'gap-5'}`}
        style={{ width: 'max-content' }}
      >
        {doubled.map((item, i) => (
          <div
            key={`${item.url}-${i}`}
            className={`group relative flex-shrink-0 ${compact ? 'w-[120px] sm:w-[140px]' : 'w-[200px] sm:w-[240px]'}`}
          >
            {/* Phone frame */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-lg transition-all duration-300 group-hover:border-white/20 group-hover:shadow-xl">
              <div className="relative aspect-[9/16]">
                <LazyVideo
                  src={item.url}
                  poster={item.posterUrl}
                  rootMargin={compact ? '120px' : '240px'}
                />
                {/* Model pill */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5">
                  <div className="rounded-lg bg-black/60 px-2.5 py-1.5 backdrop-blur-sm">
                    <p className="text-[10px] leading-tight text-white/90 line-clamp-2">
                      {item.prompt}
                    </p>
                    <p className="mt-1 text-[9px] font-medium text-white/50">
                      {item.model}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
