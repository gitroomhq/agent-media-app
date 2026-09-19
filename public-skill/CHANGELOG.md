# Changelog

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
