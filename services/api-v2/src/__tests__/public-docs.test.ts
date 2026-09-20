// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { readFileSync } from 'node:fs';
import { GenerateVideoSchema, quoteGenerate } from '@agentmedia/schema/v2';
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

describe('public REST examples', () => {
  const data = JSON.parse(readFileSync(new URL('../../../../public-skill/site-data.json', import.meta.url), 'utf8'));
  it('starts with a valid quote that does not submit a paid generation', () => {
    expect(data.rest.curl).toContain('/v2/quote/video');
    const body = JSON.parse(data.rest.curl.match(/-d '([^']+)'/)[1]);
    const parsed = GenerateVideoSchema.parse(body);
    expect(quoteGenerate('video', parsed).credits).toBeGreaterThan(0);
  });
  it('includes account and upload recovery routes registered by the API', () => {
    const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
    const uploads = readFileSync(new URL('../uploads/routes.ts', import.meta.url), 'utf8');
    for (const path of ['/v1/me/readiness', '/v1/upload-sessions', '/v1/uploads/presign', '/v1/uploads/confirm']) {
      expect(data.rest.routes.some((r: {path: string}) => r.path === path)).toBe(true);
      expect(server + uploads).toContain("'" + path + "'");
    }
    const presign = data.rest.routes.find((r: {path: string}) => r.path === '/v1/uploads/presign');
    expect(presign.body).toContain('bytes');
    expect(presign.returns).toContain('put_url');
    expect(presign.body).not.toContain('file_bytes');
  });
});
