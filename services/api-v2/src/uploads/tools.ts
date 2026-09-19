// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { UPLOAD_RESOURCE_URI } from './types.js';
export const openUploadPanelTool = {
  name: 'open_upload_panel',
  title: 'Upload images',
  description:
    'Open a drag-and-drop image upload panel for the user. Use when the user wants to supply photos, portraits, products, or image references, especially in Claude or ChatGPT. PNG/JPEG/WebP, up to 25 MB each and 10 images, available for up to 24 hours. No generation credits. Returns a browser link for clients without inline panels. Never ask the user to paste base64. After the user uploads, call get_uploads with the returned session_id; use the exact image_url in refs, first_frame, or a skill image field. Do not generate before images are ready.',
  inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  annotations: {
    title: 'Upload images',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  _meta: { ui: { resourceUri: UPLOAD_RESOURCE_URI } },
};
export const getUploadsTool = {
  name: 'get_uploads',
  title: 'Get uploaded images',
  description:
    'Get ready image URLs and expiry times from an upload panel on this account. Call after the user finishes uploading, not in a tight polling loop. Images expire after 24 hours; request a fresh upload if expired. Reuse these URLs for generation without downloading, re-encoding, or making a permanent copy.',
  inputSchema: {
    type: 'object' as const,
    properties: { session_id: { type: 'string', format: 'uuid' } },
    required: ['session_id'],
    additionalProperties: false,
  },
  annotations: {
    title: 'Get uploaded images',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
