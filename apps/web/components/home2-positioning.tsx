// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /home2 - Scroll-driven positioning statement.
 *
 * Cryptix-style sticky-scroll word reveal: the section is 200vh tall, the
 * statement is pinned via position:sticky to the middle of the viewport,
 * and as the user scrolls past it, each word transitions from dim+blurred
 * to crisp white. Once a word is "past" it stays sharp.
 *
 * Each word has a personal "reveal point" along the section's scroll
 * range; we interpolate opacity + blur across a small fade window so the
 * effect reads as smooth rather than stepped even on slow scroll wheels.
 */

import { useEffect, useRef, useState } from 'react';

const STATEMENT =
  'Agent-first, fully automated, production-grade - empowering your AI to script, render, and post video without a single human click.';

const WORDS = STATEMENT.split(' ');

const FADE_WINDOW = 0.06;

export function Home2Positioning() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const node = sectionRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportH = window.innerHeight;
      // Reveal triggers as the section enters from the bottom and
      // completes by the time the section sits well into view. Words are
      // already white the moment the section first reads on screen.
      const start = viewportH;          // section top at viewport bottom
      const end = viewportH * 0.25;     // section top ¾ of the way up
      const range = start - end;
      const p = Math.max(0, Math.min(1, (start - rect.top) / range));
      setProgress(p);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative px-6 py-24">
      <div className="mx-auto flex max-w-4xl justify-center">
        <h2
          className="text-center font-normal"
          style={{
            fontSize: 'clamp(20px, 2.6vw, 38px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
          }}
        >
          {WORDS.map((word, i) => {
            const wordStart = i / WORDS.length;
            const t = (progress - wordStart) / FADE_WINDOW;
            const reveal = Math.max(0, Math.min(1, t));
            const opacity = 0.18 + 0.82 * reveal;
            return (
              <span
                key={i}
                style={{
                  color: 'var(--cryptix-text)',
                  opacity,
                  transition: 'opacity 0.15s linear',
                  display: 'inline-block',
                  marginRight: '0.25em',
                }}
              >
                {word}
              </span>
            );
          })}
        </h2>
      </div>
    </section>
  );
}
