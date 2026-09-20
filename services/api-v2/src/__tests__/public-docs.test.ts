// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const docs = JSON.parse(readFileSync(new URL('../../../../docs/public-guides.json', import.meta.url), 'utf8'));
type Section = { id: string; title: string; paragraphs: string[]; steps?: string[]; code?: string; note?: string; links?: { href: string; label: string }[] };
type Page = { slug: string; title: string; group: string; summary: string; sections: Section[] };
const pages: Page[] = docs.pages;
describe('public documentation source', () => {
  it('has unique routable pages and unique section anchors', () => {
    expect(pages.length).toBeGreaterThan(5);
    expect(new Set(pages.map(p => p.slug)).size).toBe(pages.length);
    for (const page of pages) {
      expect(page.slug).toMatch(/^[a-z0-9-]+$/);
      for (const value of [page.title, page.group, page.summary]) expect(value.length).toBeGreaterThan(0);
      expect(new Set(page.sections.map(s => s.id)).size).toBe(page.sections.length);
      for (const section of page.sections) {
        expect(section.id).toMatch(/^[a-z0-9-]+$/);
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.paragraphs.every(p => typeof p === 'string')).toBe(true);
      }
    }
  });
  it('links to existing guide routes or explicit HTTPS resources', () => {
    const routes = new Set(['/docs', ...['connect','tools','models','pricing','rest','recipes','prompting',...pages.map(p=>p.slug)].map(s=>'/docs/'+s)]);
    for (const page of pages) for (const section of page.sections) for (const link of section.links ?? []) {
      expect(link.label.length).toBeGreaterThan(0);
      if (link.href.startsWith('/')) expect(routes.has(link.href.split('#')[0])).toBe(true);
      else expect(new URL(link.href).protocol).toBe('https:');
    }
  });
  it('documents paid generation, account checks, temporary uploads and same-job recovery', () => {
    const text = JSON.stringify(pages);
    for (const phrase of ['paid credits', 'get_account', '24 hours', 'first_frame', 'original job ID']) expect(text).toContain(phrase);
  });
});
