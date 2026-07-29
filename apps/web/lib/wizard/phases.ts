// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Phase labels for the Content Machine wizard.
 *
 * The worker writes generation_jobs.progress_detail.phase at each step
 * boundary; the wizard renders the matching label. Single source of
 * truth so worker + UI stay in sync.
 */

export const SHEET_PHASE_LABEL: Record<string, string> = {
  queued: 'Queued',
  painting_portrait: 'Painting the portrait',
  building_sheet: 'Building the multi-angle sheet',
  uploading: 'Finalizing',
};

export const STORYBOARD_PHASE_LABEL: Record<string, string> = {
  queued: 'Queued',
  composing_panels: 'Composing the panels with dialogue',
  uploading: 'Finalizing',
};

export const VIDEO_PHASE_LABEL: Record<string, string> = {
  queued: 'Queued',
  submitted_to_provider: 'Sending to Seedance',
  polling: 'Rendering the shot',
  downloading: 'Downloading',
  uploading: 'Finalizing',
};

export type Operation = 'character_sheet' | 'character_storyboard' | 'character_video';

// Status-based fallback for when progress_detail.phase isn't written yet
// (e.g. the worker container is mid-roll-out and the row was inserted by
// an older build). Honest: tells the user where the job is in the queue
// pipeline instead of saying a generic "Working".
const STATUS_FALLBACK: Record<string, string> = {
  submitted: 'Queued — waiting for the worker',
  pending: 'Queued — waiting for the worker',
  queued: 'Queued — waiting for the worker',
  processing: 'Working',
};

export function phaseLabel(
  op: Operation,
  phase: string | null | undefined,
  status?: string | null,
): string {
  if (phase) {
    const map = op === 'character_sheet' ? SHEET_PHASE_LABEL
      : op === 'character_storyboard' ? STORYBOARD_PHASE_LABEL
      : VIDEO_PHASE_LABEL;
    if (map[phase]) return map[phase];
  }
  if (status && STATUS_FALLBACK[status]) return STATUS_FALLBACK[status];
  return 'Working';
}

// Observed median runtimes (sampled over the last week of production
// runs). Used by the wizard's progress bar to give an honest ETA. The
// bar caps at 95% if a run goes long, but typical runs land before
// these numbers.
export const SHEET_EXPECTED_SECONDS = 180;
export const STORYBOARD_EXPECTED_SECONDS = 120;
export const VIDEO_EXPECTED_SECONDS = 300;
