// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'agent-media — Script-to-video UGC pipeline. AI talking heads, B-roll, voiceover, and subtitles from your terminal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#09090b',
          padding: '60px',
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            display: 'flex',
          }}
        />

        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(57,255,20,0.1) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Terminal prompt */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '32px',
            fontSize: '24px',
            fontFamily: 'monospace',
            color: '#6b6b76',
          }}
        >
          {'$ npm install -g agent-media-cli'}
        </div>

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '16px',
            marginBottom: '28px',
          }}
        >
          <span
            style={{
              fontSize: '80px',
              fontFamily: 'monospace',
              color: '#39ff14',
              fontWeight: 800,
              letterSpacing: '-2px',
            }}
          >
            {'>_'}
          </span>
          <span
            style={{
              fontSize: '80px',
              fontFamily: 'monospace',
              color: '#39ff14',
              fontWeight: 800,
              letterSpacing: '-1px',
            }}
          >
            agent-media
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '32px',
            fontFamily: 'monospace',
            color: '#e8e8ed',
            fontWeight: 600,
            marginBottom: '24px',
          }}
        >
          Script-to-Video UGC Pipeline
        </div>

        {/* Model chips */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {['UGC Pipeline', 'Talking Heads', 'B-Roll', 'Voiceover', 'Subtitles', '7 AI Models'].map((m) => (
            <span
              key={m}
              style={{
                fontSize: '18px',
                fontFamily: 'monospace',
                color: '#39ff14',
                border: '1px solid rgba(57,255,20,0.3)',
                borderRadius: '6px',
                padding: '6px 16px',
                background: 'rgba(57,255,20,0.05)',
              }}
            >
              {m}
            </span>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background:
              'linear-gradient(90deg, transparent, #39ff14, transparent)',
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
