// Copyright 2026 agent-media contributors. Apache-2.0 license.

export const UPLOADED_IMAGE_GENERATION_GUIDANCE =
  'Inspect the native image previews returned with retrieved uploads before describing them or writing image-specific prompts. Never infer what the image shows from an email domain, account metadata, or filename. Use the original URLs for generation, not preview bytes. If the session ID was lost, call get_uploads with {} to list recent sessions, or upload_image with {"upload_key":"panel:recent"} for cached catalogs; retrieve the matching session before asking for re-upload. Account-wide recent uploads may belong to other conversations, so clarify ambiguous selection. Uploading stores an image; it does not attach it to a generation automatically. If the user already requested a generation with these images, continue that request using the returned URLs; do not stop at "upload complete" or ask again whether to use them. For generate_image, put the relevant image_url values in refs. For generate_video, use refs for product/person/appearance references, or first_frame for animating a still (last_frame only for an explicitly requested ending frame); never combine refs with frame fields. Preserve the user\'s intended image roles and model limits; ask only if the role or selection is unclear. For a fixed skill, use its declared image field. Include the URL in the tool arguments, not only in the prompt. Do not substitute a newly generated image for the uploaded reference. If the request was upload-only, report readiness and wait for a generation request; uploading alone does not authorize spending credits. After submitting, poll get_run_status and return the result.';

/** Partial input examples, not automatic generation calls or spending authorization. */
export function uploadedImageHandoff(images: Array<{ image_url: string }>) {
  const urls = images.map(image => image.image_url);
  if (!urls.length) return {
    ready: false,
    next_step: 'No ready images yet. Wait for the user to finish uploading, then retrieve this session again. Do not start the reference-dependent generation or substitute a text-only generation.',
  };
  return {
    ready: true,
    next_step: UPLOADED_IMAGE_GENERATION_GUIDANCE,
    input_note: 'Partial inputs only: keep the requested prompt and other required fields, select the relevant images within model limits, and choose one video mode.',
    input_examples: [
      { tool: 'generate_image', purpose: 'Edit or compose using the uploaded references', arguments: { refs: urls } },
      { tool: 'generate_video', purpose: 'Keep the appearance of the uploaded people or products', arguments: { refs: urls } },
      ...(urls.length === 1 ? [{ tool: 'generate_video', purpose: 'Animate the uploaded still as frame one', arguments: { first_frame: urls[0] } }] : []),
    ],
  };
}

/** Shared by connection instructions, image tools, and generated skill docs. */
export const IMAGE_UPLOAD_GUIDANCE =
  'When the user wants to provide a product photo, portrait, screenshot, or image reference, check tools/list. If open_upload_panel is available, offer it first: call open_upload_panel with {}, show its inline panel or returned browser link, and wait for the user to finish. Then call get_uploads with the returned session_id and use the exact ready image_url in refs, first_frame, last_frame, or the matching skill image field. Do not start a reference-dependent generation until the required images are ready. The panel accepts still PNG, JPEG, and WebP, up to 10 images and 25 MB each. Images expire 24 hours after the panel is created; show the returned expiry, request a new upload if expired, and never make a permanent copy. Uploading uses no generation credits. Do not ask the user for base64, shell commands, or a public hosting service; do not continuously poll while waiting for them. Only call these tool names when discovered. If they are missing from the connected tool catalog, call upload_image with {} to open the same panel; use the returned panel: upload_key with upload_image to retrieve images after the user finishes. If that reports the panel is unavailable, use upload_image only for an already accessible file or URL. Do not build an upload page or request a local folder as a substitute for the existing panel. Never invent access to a chat attachment: if you cannot read it, explain that and offer the panel when available. Browser fallback works without inline UI support; do not promise an inline panel in every client.' + '\n' + UPLOADED_IMAGE_GENERATION_GUIDANCE;

export const UPLOAD_PANEL_COMPAT_GUIDANCE =
  'REFERENCE IMAGE UPLOADS: Agent Media already has a ready-made upload panel. If open_upload_panel is missing from your available tools, call upload_image with {} (no arguments) to open it. Show the returned browser link and wait for the user. Then call upload_image with only the exact panel: upload_key returned by that call to retrieve all uploaded image URLs. Up to 10 images, 24 hours, no generation credits. Do not build a new upload page or request a local folder for this workflow.' + '\n' + UPLOADED_IMAGE_GENERATION_GUIDANCE;
