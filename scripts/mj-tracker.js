#!/usr/bin/env node

/**
 * Midjourney Generation Tracker
 *
 * Tracks all MJ generations with actor mapping, status lifecycle,
 * and crash-safe persistence.
 *
 * Status: pending → submitted → generated → approved → uploaded → complete
 *         Also: failed, skipped
 *
 * Usage:
 *   import { MJTracker } from './mj-tracker.js';
 *   const tracker = new MJTracker();
 *   tracker.addJobs('green_screen', actors);
 *   const batch = tracker.getNextBatch(10);
 *   tracker.markSubmitted(batch[0].id);
 *   tracker.markGenerated(batch[0].id, { mj_job_id, mj_image_urls });
 *   tracker.markApproved(batch[0].id, [0]); // selected image index
 *   tracker.markUploaded(batch[0].id, ['https://r2-url...']);
 *   tracker.markComplete(batch[0].id, { db_field: 'green_screen_url' });
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

const TRACKER_PATH = new URL('./mj-tracker.json', import.meta.url).pathname;

export class MJTracker {
  constructor(path) {
    this.path = path || TRACKER_PATH;
    this.data = this._load();
  }

  _load() {
    if (existsSync(this.path)) {
      return JSON.parse(readFileSync(this.path, 'utf-8'));
    }
    return { version: 1, created_at: new Date().toISOString(), updated_at: null, jobs: [] };
  }

  _save() {
    this.data.updated_at = new Date().toISOString();
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }

  _promptHash(prompt) {
    return createHash('sha256').update(prompt).digest('hex').substring(0, 12);
  }

  // ── Add jobs ────────────────────────────────────────────────────────────

  addJob(actorSlug, actorId, purpose, prompt, portraitUrl) {
    const job = {
      id: randomUUID(),
      actor_slug: actorSlug,
      actor_id: actorId,
      purpose,
      prompt,
      prompt_hash: this._promptHash(prompt),
      portrait_url: portraitUrl,
      status: 'pending',
      batch_id: null,
      mj_job_id: null,
      mj_image_urls: [],
      selected_images: [],
      r2_urls: [],
      db_record_ids: [],
      error: null,
      created_at: new Date().toISOString(),
      submitted_at: null,
      generated_at: null,
      approved_at: null,
      uploaded_at: null,
      completed_at: null,
    };
    this.data.jobs.push(job);
    this._save();
    return job;
  }

  addJobs(purpose, actors, promptTemplate) {
    const added = [];
    for (const actor of actors) {
      const gender = actor.gender === 'female' ? 'woman' : 'man';
      const pronoun = actor.gender === 'female' ? 'her' : 'his';
      const prompt = promptTemplate
        .replaceAll('{age}', actor.age)
        .replaceAll('{nationality}', actor.nationality)
        .replaceAll('{gender}', gender)
        .replaceAll('{pronoun}', pronoun)
        .replaceAll('{portrait_url}', actor.portrait_url);

      added.push(this.addJob(actor.slug, actor.id, purpose, prompt, actor.portrait_url));
    }
    return added;
  }

  // ── Status transitions ──────────────────────────────────────────────────

  markSubmitted(jobId, batchId) {
    const job = this._findJob(jobId);
    job.status = 'submitted';
    job.batch_id = batchId || null;
    job.submitted_at = new Date().toISOString();
    this._save();
  }

  markGenerated(jobId, { mj_job_id, mj_image_urls }) {
    const job = this._findJob(jobId);
    job.status = 'generated';
    job.mj_job_id = mj_job_id;
    job.mj_image_urls = mj_image_urls || [];
    job.generated_at = new Date().toISOString();
    this._save();
  }

  markApproved(jobId, selectedIndices) {
    const job = this._findJob(jobId);
    job.status = 'approved';
    job.selected_images = selectedIndices;
    job.approved_at = new Date().toISOString();
    this._save();
  }

  markUploaded(jobId, r2Urls) {
    const job = this._findJob(jobId);
    job.status = 'uploaded';
    job.r2_urls = r2Urls;
    job.uploaded_at = new Date().toISOString();
    this._save();
  }

  markComplete(jobId, meta) {
    const job = this._findJob(jobId);
    job.status = 'complete';
    job.completed_at = new Date().toISOString();
    if (meta) job.db_meta = meta;
    this._save();
  }

  markFailed(jobId, error) {
    const job = this._findJob(jobId);
    job.status = 'failed';
    job.error = error;
    this._save();
  }

  markSkipped(jobId) {
    const job = this._findJob(jobId);
    job.status = 'skipped';
    this._save();
  }

  retryFailed(jobId) {
    const job = this._findJob(jobId);
    job.status = 'pending';
    job.error = null;
    job.mj_job_id = null;
    job.mj_image_urls = [];
    this._save();
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  _findJob(jobId) {
    const job = this.data.jobs.find(j => j.id === jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return job;
  }

  getNextBatch(n = 10) {
    return this.data.jobs.filter(j => j.status === 'pending').slice(0, n);
  }

  getByStatus(status) {
    return this.data.jobs.filter(j => j.status === status);
  }

  getByActor(actorSlug) {
    return this.data.jobs.filter(j => j.actor_slug === actorSlug);
  }

  getByPurpose(purpose) {
    return this.data.jobs.filter(j => j.purpose === purpose);
  }

  findByPromptHash(hash) {
    return this.data.jobs.find(j => j.prompt_hash === hash);
  }

  findByMJJobId(mjJobId) {
    return this.data.jobs.find(j => j.mj_job_id === mjJobId);
  }

  getSummary() {
    const byStatus = {};
    const byPurpose = {};
    for (const job of this.data.jobs) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      byPurpose[job.purpose] = (byPurpose[job.purpose] || 0) + 1;
    }
    return {
      total: this.data.jobs.length,
      byStatus,
      byPurpose,
    };
  }

  // ── Matching ────────────────────────────────────────────────────────────

  matchSubmittedToMJJobs(mjJobs) {
    // mjJobs: array of { mj_job_id, prompt_text, image_urls }
    // Match by finding submitted jobs whose prompt appears in the MJ job's prompt text
    const submitted = this.getByStatus('submitted');
    const matched = [];

    for (const mjJob of mjJobs) {
      const mjPromptLower = (mjJob.prompt_text || '').toLowerCase();

      for (const trackerJob of submitted) {
        // Match by actor slug in prompt (unique per actor)
        if (mjPromptLower.includes(trackerJob.actor_slug.toLowerCase()) ||
            trackerJob.prompt_hash === this._promptHash(mjJob.prompt_text || '')) {
          this.markGenerated(trackerJob.id, {
            mj_job_id: mjJob.mj_job_id,
            mj_image_urls: mjJob.image_urls || [],
          });
          matched.push({ tracker: trackerJob.actor_slug, mj: mjJob.mj_job_id });
          break;
        }
      }
    }
    return matched;
  }
}

// ── CLI interface ─────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('mj-tracker.js')) {
  const cmd = process.argv[2];
  const tracker = new MJTracker();

  switch (cmd) {
    case 'summary':
      console.log(JSON.stringify(tracker.getSummary(), null, 2));
      break;

    case 'status': {
      const status = process.argv[3];
      const jobs = tracker.getByStatus(status);
      for (const j of jobs) {
        console.log(`${j.actor_slug.padEnd(20)} ${j.status.padEnd(12)} ${j.purpose}`);
      }
      console.log(`\nTotal: ${jobs.length}`);
      break;
    }

    case 'next': {
      const n = parseInt(process.argv[3] || '10');
      const batch = tracker.getNextBatch(n);
      for (const j of batch) {
        console.log(`${j.actor_slug.padEnd(20)} ${j.prompt.substring(0, 60)}...`);
      }
      console.log(`\nNext batch: ${batch.length} jobs`);
      break;
    }

    default:
      console.log('Usage: node mj-tracker.js [summary|status <status>|next <n>]');
  }
}
