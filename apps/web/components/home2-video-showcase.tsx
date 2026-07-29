// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - Video showcase grid.
 *
 * White full-bleed section that breaks up the dark agentic surface
 * before "Why AgentMedia?". Reference: huly.io's "Unmatched
 * productivity" block - bold left-aligned headline, supporting copy,
 * then a 2×N grid of dark cards each with a media well + caption.
 *
 * Video sources are placeholders. The user will supply real clips
 * later; swap the empty <video> src / poster attributes when they
 * arrive.
 */

interface Tile {
  title: string;
  description: string;
  /** Path to mp4 file. Leave empty until the asset is provided. */
  videoSrc?: string;
  /** Optional poster image while the video loads. */
  poster?: string;
  /** Tailwind grid-column span on desktop. Defaults to span 1. */
  span?: 1 | 2;
  /** Vertical anchor for the video inside its well. Defaults to
   * 'center'. Use 'top' when the subject is at the top of the frame
   * (e.g. a talking head) so it isn't cropped off. */
  videoAlign?: 'top' | 'center' | 'bottom';
}

const TILES: Tile[] = [
  {
    title: 'One CLI command.',
    description:
      'Generate the video and post it - captions optional - all from your terminal.',
    span: 1,
    videoSrc:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/7252a5f8-48a5-439b-9e79-33333333cccc/simple-selfie.mp4',
  },
  {
    title: 'Built for agents.',
    description:
      'Drop AgentMedia into Claude, Cursor, n8n - any agent that speaks MCP, HTTP or shell.',
    span: 2,
    videoSrc:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/c3354440-1d8d-4832-ab4d-01bbd07bb9eb/character-video-final.mp4',
  },
  {
    title: 'Render in seconds.',
    description:
      'Realistic UGC, product demos, and ads delivered while your prompt is still warm.',
    span: 2,
    videoSrc:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/edf2f896-2441-4763-986a-44d1bd66ceaa/character-video-final.mp4',
  },
  {
    title: 'Auto-publish.',
    description:
      'TikTok, Instagram, YouTube - schedule or fire-and-forget from one webhook.',
    span: 1,
    videoSrc:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/cbcfaacb-3fcb-4f7a-b1ce-5cb34b39af36/character-video-final.mp4',
    videoAlign: 'top',
  },
];

export function Home2VideoShowcase() {
  return (
    <section className="relative w-full bg-white py-16 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2
          className="font-normal text-black"
          style={{
            fontSize: 'clamp(36px, 5vw, 72px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Unbeaten Video quality
        </h2>
        <p
          className="mt-6 max-w-xl text-base sm:text-lg"
          style={{ color: 'rgba(0,0,0,0.55)', lineHeight: 1.55 }}
        >
          AgentMedia ships the same render pipeline through CLI, MCP, REST
          and SDKs - so every agent on your team can create and post video -
          captions optional - without a designer in the loop.
        </p>

        {/* All outputs are 9:16 vertical (TikTok / Reels / Shorts). Use
            a uniform 4-column row on desktop, 2-column on mobile. Drops
            the asymmetric Huly grid because cropping a vertical video
            into a landscape tile chopped the subject's face off. */}
        <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4">
          {TILES.map((tile) => (
            <VideoTile key={tile.title} tile={tile} />
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoTile({ tile }: { tile: Tile }) {
  // All four tiles are uniform 9:16 vertical cards — matches the
  // source video aspect ratio so nothing gets cropped. `tile.span` is
  // ignored (left in the data for legacy layout switches).
  return (
    <div
      className="group relative aspect-[9/16] overflow-hidden rounded-[24px] bg-[#0e0e0e] p-5"
      style={{
        boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
      }}
    >
      {/* Video well - fills the upper portion; caption sits on top in
          the lower-left corner with absolute positioning. */}
      <div className="absolute inset-0">
        {tile.videoSrc ? (
          <video
            className="h-full w-full object-cover"
            style={{ objectPosition: tile.videoAlign === 'top' ? 'top' : tile.videoAlign === 'bottom' ? 'bottom' : 'center' }}
            src={tile.videoSrc}
            poster={tile.poster}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          // Placeholder gradient so the layout reads even with no asset.
          <div
            aria-hidden
            className="h-full w-full"
            style={{
              background:
                'radial-gradient(60% 70% at 50% 35%, rgba(167,139,250,0.18) 0%, rgba(20,15,40,0) 70%), linear-gradient(180deg, #141027 0%, #0e0e0e 100%)',
            }}
          />
        )}
      </div>

      {/* Bottom shade so caption stays readable over any video frame */}
      {tile.videoSrc ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.8) 100%)',
          }}
        />
      ) : null}

      {/* Caption overlay — compact in the 9:16 vertical card */}
      <div className="relative z-10 mt-auto flex h-full flex-col justify-end">
        <p className="text-[11px] font-semibold leading-snug text-white sm:text-xs">
          <span className="block text-white">{tile.title}</span>
          <span className="mt-1 block font-normal" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {tile.description}
          </span>
        </p>
      </div>
    </div>
  );
}
