# Changelog

## 2.4.0

- Add make_ugc as the recommended complete first-video workflow on the hosted connector, with quote_ugc as its no-charge price and balance check. Direct generators remain available for advanced control.

## 2.3.3

- Generation capacity now covers loose image, video, and audio jobs as well as composed skills. `TOO_MANY_ACTIVE_RENDERS` means wait for a current generation to finish, then retry the same request identity.

## 2.3.2

- Retrieve uploads as native image previews with original generation URLs. Recover forgotten upload sessions with get_uploads({}) or the cached upload_image panel:recent key. Inspect the actual image; never guess its subject from account metadata.

## 2.3.1

- Link the public documentation hub for setup, uploads, account checks, troubleshooting, REST and self-hosting. Generation still requires paid credits.

## 2.3.0

- Add free, read-only authenticated account/credit readiness. Cached catalogs receive the same check through list_models. Quote before the first generation; an unavailable balance is not zero credits.

## 2.2.1

- Upload results now include exact generation input examples and instructions to continue an existing request with the uploaded references. Upload-only requests remain non-billable.

## 2.2.0

- Add generation request identities: recover the same job after response loss without another charge. Preserve job IDs on uncertain worker acknowledgements and report refunds only when confirmed.

## 2.1.1

- Clarify Claude connector sign-in and conversation activation, Claude Code user scope, and Codex OAuth login. Add a no-generation upload check to setup guidance.

## 2.1.0

- Temporary multi-image upload panels with 24-hour expiry; old connector catalogs can open and read panels through upload_image.
- Upload-only requests activate the agent-media skill. Plugin version bumped so installed clients can receive the new guidance.

## 2.0.0

- The loose surface: nine tools (generate_video, generate_image, generate_audio, quote, list_models, list_characters, get_run_status, upload_image, rate_run). The agent writes the prompt and picks the model instead of calling a fixed recipe.
- generate_video has three modes, chosen by the fields you pass: text, image-to-video (first_frame and optional last_frame) and reference (refs, video_refs, audio_refs addressed as @image1, @video1, @audio1).
- Quality 480p, 720p (default) and 1080p, with the credits per second of each on list_models; seven aspect ratios.
- model "auto" picks from the last 30 days of scored runs, and rate_run feeds those numbers back.

## 1.x

- The fixed skills (make_ugc and friends). Still available over REST and the CLI.
