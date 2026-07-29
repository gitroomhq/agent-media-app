// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Payload passed from api-v2 to Temporal selfie workflow.
 * Keep this JSON-serializable for workflow history safety.
 */
export interface SelfieDispatchPayload {
  job_id: string;
  user_id: string;
  character_id?: string;
  photo_url?: string;
  description?: string;
  script?: string;
  scene_action?: string;
  background_music?: boolean | string;
  duration: number;
  subtitles: boolean;
  shot_preset?: string;
  vibe?: string;
  camera_locked?: boolean;
  phone_in_frame?: string;
  polish?: string;
  callback_url: string;
}
