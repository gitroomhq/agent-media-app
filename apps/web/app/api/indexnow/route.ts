// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { NextResponse } from 'next/server';

const INDEXNOW_KEY = '364ce6d98965491fef9f559712a0fc50';
const HOST = 'agent-media.ai';

const ALL_URLS = [
  `https://${HOST}/`,
  `https://${HOST}/docs`,
  `https://${HOST}/docs/api-reference`,
  `https://${HOST}/models`,
  `https://${HOST}/pricing`,
  `https://${HOST}/status`,
  `https://${HOST}/developers`,
  // Developer landing pages (May 2026 SEO push)
  `https://${HOST}/ugc-video-api`,
  `https://${HOST}/sdk/typescript`,
  `https://${HOST}/sdk/python`,
  `https://${HOST}/mcp`,
  `https://${HOST}/cli`,
  // For (industry/persona) pages
  `https://${HOST}/for/saas`,
  `https://${HOST}/for/dropshipping`,
  `https://${HOST}/for/coaches`,
  `https://${HOST}/for/b2b`,
  `https://${HOST}/for/d2c-brands`,
  `https://${HOST}/for/developers`,
  // Money pages (June 2026 SEO push)
  `https://${HOST}/ai-ugc-video-generator`,
  `https://${HOST}/ai-ugc-ads`,
  `https://${HOST}/best`,
  `https://${HOST}/how-to`,
  // Comparison pages
  `https://${HOST}/compare/makeugc-alternative`,
  `https://${HOST}/compare/arcads-alternative`,
  `https://${HOST}/compare/creatify-alternative`,
  `https://${HOST}/compare/heygen-alternative`,
  `https://${HOST}/compare/cheapest-ai-video`,
  `https://${HOST}/compare/synthesia-alternative`,
  `https://${HOST}/compare/topview-alternative`,
  `https://${HOST}/compare/creatify-api`,
  `https://${HOST}/compare/arcads-api`,
  // Legal & meta
  `https://${HOST}/terms`,
  `https://${HOST}/privacy`,
  `https://${HOST}/llms.txt`,
];

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${INDEXNOW_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const urls = body?.urls ?? ALL_URLS;

  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const status = res.status;
  const text = await res.text().catch(() => '');

  return NextResponse.json({
    success: status === 200 || status === 202,
    indexnow_status: status,
    urls_submitted: urls.length,
    response: text,
  });
}

export async function GET() {
  return NextResponse.json({
    info: 'POST to this endpoint with Authorization: Bearer <key> to submit URLs to IndexNow.',
    urls_count: ALL_URLS.length,
  });
}
