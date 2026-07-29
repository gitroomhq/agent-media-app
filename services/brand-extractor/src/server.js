// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * brand-extractor service.
 *
 * Single-purpose HTTP server that runs headless Chromium to grab
 * screenshot + og meta + colour palette for a given URL. Lives apart
 * from media-worker-v2 so the heavy Chromium image doesn't bloat the
 * video pipeline.
 *
 * Routes:
 *   GET  /health
 *   POST /brand-extract  { url, job_id? }   (synchronous, ~5-15s)
 *
 * Auth: every request must include the X-Worker-Secret header matching
 * the WORKER_SECRET env var.
 */

import express from 'express';
import { extractBrand } from './brand-extract.js';

const PORT = Number(process.env.PORT || 3000);
const WORKER_SECRET = process.env.WORKER_SECRET;

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'brand-extractor' });
});

function verifySecret(req, res, next) {
  const secret = req.headers['x-worker-secret'];
  if (!WORKER_SECRET || secret !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.post('/brand-extract', verifySecret, async (req, res) => {
  const { url, job_id } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const brand = await extractBrand({ url, jobId: job_id });
    return res.json({ ok: true, brand });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[brand-extract] failed:', message);
    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`brand-extractor listening on :${PORT}`);
});
