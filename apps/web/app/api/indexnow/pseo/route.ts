// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Daily IndexNow ping for pSEO pages. Hit by Vercel cron once per day AFTER
// the daily redeploy: submits the URLs whose publishAt date is today, so
// Bing/Yandex/Seznam (and Google via sitemap freshness) discover the new
// batch within minutes instead of days.
//
// Vercel cron (vercel.json):
//   { "crons": [{ "path": "/api/indexnow/pseo", "schedule": "30 6 * * *" }] }

import { NextResponse } from 'next/server';
import { LOCALE_SLUGS } from '@/seo/pseo-data';
import { pathFor, specsPublishedOn } from '@/seo/pseo-engine';

const INDEXNOW_KEY = '364ce6d98965491fef9f559712a0fc50';
const HOST = 'agent-media.ai';

function todaysUrls(date: Date): string[] {
  const urls: string[] = [];
  for (const spec of specsPublishedOn(date)) {
    for (const locale of LOCALE_SLUGS) {
      urls.push(`https://${HOST}${pathFor(spec, locale)}`);
    }
  }
  return urls;
}

async function submit(urls: string[]) {
  if (urls.length === 0) {
    return NextResponse.json({ success: true, urls_submitted: 0, note: 'no pages scheduled today' });
  }
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
  return NextResponse.json({
    success: res.status === 200 || res.status === 202,
    indexnow_status: res.status,
    urls_submitted: urls.length,
    sample: urls.slice(0, 3),
  });
}

// Vercel cron uses GET.
export async function GET(request: Request) {
  // Optional protection: set CRON_SECRET in Vercel env and it gets enforced.
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return submit(todaysUrls(new Date()));
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${INDEXNOW_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const date = body?.date ? new Date(body.date) : new Date();
  return submit(todaysUrls(date));
}
