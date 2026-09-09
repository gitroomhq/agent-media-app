---
name: 'agent-media'
description: 'Make AI video, images and voice with agent-media as the director: write the prompt, pick the model (default seedance-2.0; seedance-2.5 for a hero clip at about 3x; gpt-image-2 for images; elevenlabs-tts for speech), pick the video mode (text; image-to-video with first_frame and optional last_frame; reference with refs, video_refs, audio_refs addressed as @image1 @video1 @audio1), pick the quality (480p, 720p default, 1080p), quote the price, poll for the URL. Tools: generate_video, generate_image, generate_audio, quote, list_models, list_characters, get_run_status, upload_image, rate_run. Use for UGC clips, product-in-hand, animating a still, first-to-last-frame moves, matching a reference clip, reaction clips, portraits, voiceover, and series with one face.'
allowed-tools: ['mcp__agent-media__generate_video', 'mcp__agent-media__generate_image', 'mcp__agent-media__generate_audio', 'mcp__agent-media__quote', 'mcp__agent-media__list_models', 'mcp__agent-media__list_characters', 'mcp__agent-media__get_run_status', 'mcp__agent-media__upload_image', 'mcp__agent-media__rate_run']
x-skill-slug: 'agent-media'
x-skill-version: '2.0.0'
x-surface: 'loose'
---
# agent-media, the skill

You are the director. agent-media gives you three primitives and a model catalog; there is no fixed recipe between your intent and the render. Read this once; it is the whole manual.

## The loop

1. **Decide the shot** in words: who, where, what happens, camera, and, if anyone speaks, the exact words in quotes.
2. **Pick the mode.** A still to animate: image-to-video (`first_frame`, optional `last_frame`). An identity, a look, a motion or a sound to keep: reference (`refs`, `video_refs`, `audio_refs`). Neither: text. Frames and refs cannot be mixed on Seedance.
3. **Pick the model.** Omit `model` and you get the default (`seedance-2.0` for video, `gpt-image-2.5` for images, `elevenlabs-tts` for speech); pass `"auto"` to let recent results decide. Call `list_models` when the job is unusual, it says what each model is good at, bad at, its modes and limits, what it costs per quality, and how it has actually performed lately. Only live models are accepted; naming a planned one returns the live list.
4. **Get identity right.** Same face across clips: pass the same reference URL in `refs` every time and call it @image1 in the prompt. Make the reference with `generate_image` (a clean portrait), take it from `list_characters` (a saved character sheet), or `upload_image` the user's photo. References are the only way a series stays consistent; there is no other handle.
5. **Quote if the user cares about cost** (`quote` costs nothing), then call the tool.
6. **Poll `get_run_status`** with the job id (`wait: true`) until it is `completed`, and hand the user the URL. Never report success before you hold the URL.

## The tools

### generate_video, 150 / 300 / 450 credits for 5 / 10 / 15 s on seedance-2.0 at 720p (75 at 480p, 375 at 1080p for 5 s; 495 for 5 s on seedance-2.5)

Three modes, chosen by the fields you pass:

- **Text**: the prompt alone. Aspect defaults to 9:16.
- **Image-to-video**: `first_frame` is an https still that becomes frame one of the clip; optional `last_frame` is the frame the clip ends on, and the model animates between them. Frames only: `refs`, `video_refs` and `audio_refs` are refused next to a frame on Seedance. Aspect defaults to `adaptive` (the clip takes the frame's ratio); on `seedance-2.5` adaptive is the only aspect in this mode, so leave `aspect` out. To keep an identity AND set the frame, put the frame image in `refs` instead and describe it as @image1.
- **Reference**: `refs` (https images: a portrait, a character sheet from `list_characters`, a product photo; the identity and look are kept), `video_refs` (https clips whose motion, framing or look the model follows), `audio_refs` (https wav/mp3: a voice or a sound the clip carries). Address them in the prompt as @image1, @image2, @video1, @audio1, numbered per list from 1. Reference clip seconds are billed like output seconds. Never write edit or extend wording ("edit the video", "remove", "replace", "extend", "continue the clip") in a reference prompt: the provider reclassifies the job and fails it late. Describe the NEW clip you want.

Reference mode:

```json
{
  "prompt": "@image1, a 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \"Okay, I did not expect this to actually work.\" Natural skin texture, soft window light, slight head tilt, hands busy with the bottle.",
  "refs": ["https://.../portrait.png"],
  "seconds": 5,
  "aspect": "9:16",
  "quality": "720p",
  "audio": true
}
```

Image-to-video:

```json
{
  "prompt": "The woman in the frame turns to the camera, smiles and says: \"Okay, this one is different.\" Slow handheld drift, soft window light stays constant.",
  "first_frame": "https://.../still.png",
  "seconds": 5
}
```

- `seconds` 4 to 15 on the live Seedance models (the exact range per model and mode is below), `aspect` `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `21:9`, `adaptive`, `quality` `480p`, `720p`, `1080p` (default 720p), `audio` true by default, `model` a live video id.
- Price ladder, credits per output second: seedance-2.0: 15 credits/s at 480p, 30 at 720p, 75 at 1080p; seedance-2.5: 50 credits/s at 480p, 99 at 720p, 180 at 1080p. A 5 s clip plus a 5 s reference clip on seedance-2.0 at 720p is 300 credits.
- seedance-2.0 modes: text (prompt only): 4 to 15 s, default aspect 9:16, 480p/720p/1080p; image-to-video (first_frame + optional last_frame): 4 to 15 s, default aspect adaptive, 480p/720p/1080p; reference (refs / video_refs / audio_refs, up to 9 images, 3 clips, 15 s total, 3 audio, 15 s total, not alone): 4 to 15 s, default aspect 9:16, 480p/720p/1080p.
- seedance-2.5 modes: text (prompt only): 4 to 15 s, default aspect 9:16, 480p/720p/1080p; image-to-video (first_frame + optional last_frame): 4 to 15 s, aspect adaptive only, 480p/720p/1080p; reference (refs / video_refs / audio_refs, up to 30 images, 10 clips, 30 s total, 10 audio, 30 s total): 4 to 15 s, default aspect 9:16, 480p/720p/1080p.
- Speech: put the exact words in quotes in the prompt and leave `audio: true`. The model renders the voice and lip-sync natively, you do not need `generate_audio` for a talking head.
- Pace the words: about 2.3 words per second. 5 s is 10 to 12 words, 10 s is 20 to 25, 15 s is 30 to 35. A longer script is several clips.

### generate_image, 20 credits

```json
{ "prompt": "Head-and-shoulders portrait of a 28-year-old woman, warm smile, soft window light, phone camera, natural skin, plain kitchen behind her", "size": "1024x1536" }
```

- `size` `1024x1024`, `1024x1536`, `1536x1024` (portrait is the default). With `refs` (up to 4) it edits/composes from them: put a product into a hand, re-light a portrait, pose a character sheet.
- This is how you make the reference a series needs, or the first frame a clip starts on. One portrait, then every clip cites it.

### generate_audio, 1 credit per 100 characters

```json
{ "text": "[excited] Three things nobody tells you about launching...", "voice": "sarah", "tone": "energetic" }
```

- Voices: `jessica` (young female), `sarah` (female), `liam` (young male), `chris` (male), `lily` (elder female), `bill` (elder male), `matilda` (warm, mom); or a raw ElevenLabs voice id. Emotion tags like `[excited]`, `[whispers]` are honoured.
- Use it for voiceover over b-roll, a standalone audio file, or an `audio_refs` entry for generate_video. Not for a talking head (see generate_video).

### quote

`{ "kind": "video", "input": { ...the same arguments... } }` returns credits, USD, model, mode, quality and the breakdown. Nothing is rendered. With `video_refs` the reference clip seconds are measured at submit and added at the same rate; the quote says so.

### list_models, list_characters, get_run_status, upload_image, rate_run

All free. `list_models` is the recommendation layer, read it before an unusual job; every video model lists its modes with inputs, seconds, aspects, qualities and credits per second, and every model carries `usage` (pick when, prompting tips, latency) and `recent` (last 30 days: runs, fail rate, auto-judge score, user ratings, typical render time). `list_characters` returns saved characters with `character_sheet_url` / portrait URLs for `refs`. `get_run_status` takes any job id this server gave you. `upload_image` turns a file on disk, raw bytes or a foreign URL into an https URL. When the photo is a FILE and you have a shell, use the file path: call `upload_image` with `file_bytes` (the exact size, `wc -c < photo.png`), run the curl PUT it prints, then call it again with the `upload_key`. The bytes go straight to storage without passing through this conversation, so send the ORIGINAL file: never resize, crop or re-encode a user's photo to make it fit, a shrunken product photo is what the video model will show. Base64 is the last resort, and never paste base64 into another tool call. `rate_run` records 1 to 5 and a note on a finished run: do it whenever the user reacts to an output, or you can see a defect yourself.

### model: "auto"

Every loose-surface job is scored by an auto-judge (3 frames or the image against the realism rubric, prompt adherence, identity match when refs were given) and every `rate_run` is stored. `model: "auto"` reads those numbers with one printed policy: the default, unless it failed more than 25% of at least 10 recent runs and another live model is healthy, or a live model within 1.5x the default's price beats its score by 0.10 over at least 10 judged runs. Only models that have the request's mode are candidates. `quote` and the submit response tell you which model auto chose and why. Use it when the user does not care which model; name the model when they do.

## How to use each model

From the catalog `usage` card. `list_models` returns the same text plus the last 30 days of real results.

### seedance-2.0 (default video)

- **Pick it when** you need a real-looking person saying real words, or a still brought to life, at a normal budget.
- **Best for:** talking-head UGC; product in hands; crazy look; bulk daily posts; animating a still (first frame) into a clip.
- **Avoid for:** clips over 15s; hero shots where 2.5 detail is worth 3x the price; anything that needs a seed.
- **Latency:** about 3 minutes for a 5 s clip at 720p.
- **Price:** 15 credits/s at 480p, 30 at 720p, 75 at 1080p; reference clip seconds (video_refs) are billed at the same per-second rate as output seconds.
- **Modes:**
  - text (prompt only): 4 to 15 s, default aspect 9:16, 480p/720p/1080p
  - image-to-video (first_frame + optional last_frame): 4 to 15 s, default aspect adaptive, 480p/720p/1080p
  - reference (refs / video_refs / audio_refs, up to 9 images, 3 clips, 15 s total, 3 audio, 15 s total, not alone): 4 to 15 s, default aspect 9:16, 480p/720p/1080p
- **Prompting:**
  - Write the shot as a director: who (age, look), where (setting, light), what happens, phone framing, and the exact spoken words in quotes. About 2.3 words per second.
  - Keep a person consistent across clips with refs (a portrait or a character sheet), addressed as @image1; the model has no seed.
  - To animate a specific still, pass it as first_frame; add last_frame to control where the motion ends.

### seedance-2.5

- **Pick it when** the user asked for the best possible single clip and accepts the wait and about 3x the price.
- **Best for:** hero product ads; close-up faces; one clip that has to be the best.
- **Avoid for:** drafts; bulk; anything where 2.0 is good enough: it is about 3x the credits; anyone who cannot wait 15 to 30 minutes.
- **Latency:** 12 to 25 minutes per clip; plan the wait.
- **Price:** 50 credits/s at 480p, 99 at 720p, 180 at 1080p; reference clip seconds (video_refs) are billed at the same per-second rate as output seconds.
- **Modes:**
  - text (prompt only): 4 to 15 s, default aspect 9:16, 480p/720p/1080p
  - image-to-video (first_frame + optional last_frame): 4 to 15 s, aspect adaptive only, 480p/720p/1080p
  - reference (refs / video_refs / audio_refs, up to 30 images, 10 clips, 30 s total, 10 audio, 30 s total): 4 to 15 s, default aspect 9:16, 480p/720p/1080p
- **Prompting:**
  - Same director-style prompt and @image1 references as seedance-2.0.
  - In image mode leave aspect out (it is adaptive); the frame decides the ratio.
  - Do not put edit or extend wording in a reference prompt.

### gpt-image-2.5 (default image)

- **Pick it when** you are making the image a video will be built on: a portrait, a character sheet, a first frame, or an edit that has to keep the same person.
- **Best for:** portraits and character sheets that a video has to keep; the first frame of a clip; product in hand; edits that must not lose the face.
- **Avoid for:** bulk throwaway drafts where gpt-image-2.5-flare is faster.
- **Latency:** about 30 seconds, a little longer for an edit with references.
- **Price:** 20 credits per image.
- **Prompting:**
  - Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "four poses on a plain background" or "headroom for a caption".
  - With refs it edits or composes from them and holds the identity across poses, which is what makes a character sheet usable as a video reference.
  - Pass the result straight to generate_video as first_frame (to animate it) or in refs (to keep that person across clips).

### gpt-image-2.5-flare

- **Pick it when** you want the same look as gpt-image-2.5 but faster, or you are making several images at once.
- **Best for:** variants and drafts at the same quality tier; batches of frames; anything where a few seconds matter.
- **Avoid for:** the one sheet a whole series depends on, where gpt-image-2.5 edits hold identity a little better.
- **Latency:** about 15 to 30 seconds.
- **Price:** 20 credits per image.
- **Prompting:**
  - Same prompts as gpt-image-2.5; it is the speed tier of the same family.

### gpt-image-2

- **Pick it when** you are reproducing something that was made on gpt-image-2; otherwise take the default.
- **Best for:** the previous generation, kept selectable for runs that were built on it.
- **Avoid for:** new work: gpt-image-2.5 is the default and holds identity better.
- **Latency:** under a minute.
- **Price:** 20 credits per image.
- **Prompting:**
  - Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "headroom for a caption".
  - With refs it EDITS or composes from them (a product into a hand, a portrait re-lit); without refs it paints from the prompt alone.

### elevenlabs-tts (default audio)

- **Pick it when** you need a clean voice track and no face.
- **Best for:** voiceover on b-roll; narration; a standalone voice file; an audio reference for generate_video.
- **Avoid for:** lip-synced talking head: generate_video renders speech natively.
- **Latency:** seconds.
- **Price:** 1 credit per 100 characters.
- **Prompting:**
  - Emotion tags like [excited] or [whispers] are honoured; keep sentences short for pacing.
  - Seven named voices (sarah default) or a raw ElevenLabs voice id.

## Writing a prompt that comes out real

The fixed pipelines used to inject this rubric into every prompt. Now it is yours to include, put the relevant lines in your `prompt`, in your own words:

```text
Critical realism rules (must all be visible in the frame):
- skin shows pores, oil sheen on T-zone, baby hairs at hairline, slight under-eye softness;
- single mixed light source (soft window daylight + warm interior bulb), realistic shadows;
- stable iPhone-like framing by default (no noticeable shake/drift), with slight off-axis angle (about 5-12 degrees) and imperfect centering;
- 9:16 vertical, looks like raw iPhone footage, NOT a studio shot;
- NO plastic AI sheen, NO uncanny symmetry, NO ultra-smoothed skin;
- NO shiny/plastic face, NO glowing light on the face, NO beauty-filter glow;
- subtle asymmetry: head tilt, blink, micro-expressions;
- hands are always doing something, gesturing, holding a product, adjusting clothing, or otherwise occupied (never limp at the sides);
- mouth caught mid-syllable when talking, not closed and not open-smile;
- eyes slightly off-center to camera, not a dead stare;
- no visible phone, selfie-stick, or outstretched selfie arm unless explicitly requested.
```

Also: name the age, the setting and the light; say what the hands are doing; do not write "selfie" or "phone" unless the phone should be visible; keep to one person unless it is a two-shot; quote the spoken words verbatim; with references, say what each @image1 / @video1 / @audio1 is for.

Full guide: [reference/prompting.md](../../reference/prompting.md).

## Recipes

The things the old fixed skills did, as prompts you write yourself, see [reference/recipes.md](../../reference/recipes.md) for the full versions:

- **Talking-head UGC**, generate_video with the script in quotes; a portrait in `refs` (@image1) if the face must persist.
- **Product in hand**, upload_image the product, then generate_image "...holding <product> up to the lens" with the product URL in refs, then generate_video with that frame in refs.
- **Animate a still (image-to-video)**, generate_image or upload_image the still, then generate_video with it as `first_frame` and a prompt that says what moves.
- **First and last frame**, two stills as `first_frame` and `last_frame`; the model animates from one to the other.
- **Match a reference clip's motion (video_refs)**, the clip in `video_refs`, a portrait in `refs`, and a prompt like "@image1 performs the same move as @video1 ..."; the clip's seconds are billed like output seconds.
- **Crazy look**, silent 5 s extreme close-up, one exaggerated expression held to the lens, `audio: false`; burn the caption in your editor or ask for it in the prompt.
- **B-roll voiceover**, generate_audio the narration; the user overlays it on their footage (agent-media does not mux external video on this surface).
- **A series with one face**, one generate_image portrait, then N generate_video calls with the same `refs` and the same person and setting wording.
- **Hero clip**, the one clip that must be the best: `model: "seedance-2.5"` (about 3x the credits, and a much longer wait). Never for drafts or bulk.

## Rules

- Ask before spending big: quote a 15 s seedance-2.5 clip, or any 1080p clip, before running it.
- Default model and default quality for everything unless the user asked for the best possible single clip.
- Every image, clip and audio URL must be https (upload_image first for images). Refs are kept private to the account.
- Never downscale a photo the user gave you. `upload_image` with `file_bytes` streams the original file straight to storage (up to 25 MB) and hands back a URL; resizing to fit a context window is what turns a customer product shot into a thumbnail.
- One mode per call: a first frame OR references, never both on Seedance.
- Poll until `completed`; a clip takes minutes (seedance-2.0: about 3 minutes for a 5 s clip at 720p; seedance-2.5: 12 to 25 minutes per clip; plan the wait), an image under a minute, audio seconds. If a job fails, the credits are refunded automatically, say so and retry with a clearer prompt.
- Do not claim a video exists until get_run_status returned its URL.
- After the user reacts to an output, call rate_run with an honest score. It is how the catalog learns.

## Errors

- `VALIDATION_ERROR` with `model` in the message, you named a planned or unknown model; the message lists the live ones.
- `VALIDATION_ERROR` with `first_frame`, `refs`, `seconds`, `aspect` or `quality` in the message, the request does not fit the (model, mode) cell; the message says the allowed range. Fix the field, do not switch surfaces.
- `VALIDATION_ERROR` with `prompt` in the message and `video_refs` given, the prompt reads as an edit or extend request; describe the new clip instead.
- `INSUFFICIENT_CREDITS`, the account is out; point the user to agent-media.ai billing.
- `TOO_MANY_ACTIVE_VIDEOS`, wait for one to finish.
- `CONTENT_POLICY_BLOCKED`, the provider refused the prompt or the reference; rephrase, or use a different image.
