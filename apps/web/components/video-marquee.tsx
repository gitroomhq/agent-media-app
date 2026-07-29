// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Infinite vertical-scrolling marquee of real generated videos. Used on
 * the paywall page as social proof. Inspired by ReddGrow's testimonial
 * marquee but built around our actual content.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * One tile in the marquee. Sets the video source only when the tile
 * scrolls into view, then explicitly calls .load() + .play() — relying
 * on the `loadedmetadata` event with preload="none" doesn't work,
 * because the browser never starts loading metadata in the first place.
 */
function MarqueeTile({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '200px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible) {
      if (!el.src) {
        el.src = src;
        el.load(); // explicit fetch — preload="none" otherwise blocks it
      }
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [visible, src]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      className="w-full rounded-xl object-cover shadow-md"
      style={{
        aspectRatio: '9 / 16',
        background:
          'linear-gradient(135deg, #ede9fe 0%, #fce7f3 50%, #fef3c7 100%)',
      }}
    />
  );
}

interface ShowcaseVideo {
  url: string;
  poster: string | null;
}

interface ApiResponse {
  videos?: ShowcaseVideo[];
}

const PER_LANE_MAX = 4;

function laneVideos(all: ShowcaseVideo[], offset: number, stride: number): ShowcaseVideo[] {
  const lane: ShowcaseVideo[] = [];
  for (let i = offset; i < all.length && lane.length < PER_LANE_MAX; i += stride) lane.push(all[i]);
  if (lane.length === 0) return [];
  return [...lane, ...lane];
}

export function VideoMarquee() {
  const [videos, setVideos] = useState<ShowcaseVideo[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/showcase-videos');
        if (!res.ok) return;
        const data = (await res.json()) as ApiResponse;
        if (!cancelled && Array.isArray(data.videos) && data.videos.length > 0) {
          setVideos(data.videos);
        }
      } catch { /* render empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (videos.length === 0) {
    return (
      <div className="grid h-[640px] grid-cols-3 gap-3 overflow-hidden">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-[9/16] animate-pulse rounded-xl bg-zinc-200" />
        ))}
      </div>
    );
  }

  const lanes = [
    { videos: laneVideos(videos, 0, 3), speed: 60 },
    { videos: laneVideos(videos, 1, 3), speed: 45, reverse: true },
    { videos: laneVideos(videos, 2, 3), speed: 75 },
  ];

  return (
    <div
      className="relative grid h-[680px] grid-cols-3 gap-3 overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)',
      }}
    >
      {lanes.map((lane, i) => (
        <div
          key={i}
          className="flex flex-col gap-3"
          style={{
            animation: `marquee-${lane.reverse ? 'down' : 'up'} ${lane.speed}s linear infinite`,
          }}
        >
          {lane.videos.map((v, idx) => (
            <MarqueeTile key={`${i}-${idx}`} src={v.url} poster={v.poster} />
          ))}
        </div>
      ))}

      {/* GLOBAL keyframes — styled-jsx scopes @keyframes by default,
          which renames the animation and breaks the reference from the
          inline style attribute. */}
      <style jsx global>{`
        @keyframes marquee-up {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes marquee-down {
          0%   { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
