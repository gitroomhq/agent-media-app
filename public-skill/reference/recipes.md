# Recipes

What the fixed skills used to do, as sequences of the loose tools. 100 credits = 1 USD.

## 1. Talking-head UGC clip

_150 credits for 5 s on seedance-2.0 at 720p_

1. `generate_video`, Script in quotes in the prompt; seconds from the word count (about 2.3 per second); refs = a portrait if the face must persist, addressed as @image1.
2. `get_run_status`, Poll with wait:true until completed; hand over the URL.

## 2. Product in hand

_20 credits for the frame, then 150 for a 5 s clip at 720p_

1. `upload_image`, The product photo becomes an https URL.
2. `generate_image`, "... holding THIS product up to the lens, label facing camera ..." with the product URL (and a portrait, if any) in refs.
3. `generate_video`, The frame URL in refs as @image1, the pitch in quotes. The product stays the product.

## 3. Animate a still (image-to-video)

_150 credits for 5 s on seedance-2.0 at 720p (same rate as text mode)_

1. `generate_image`, The still: a portrait, a product shot, a scene. Or upload_image a photo the user has.
2. `generate_video`, That URL as first_frame; the prompt says what moves and what is said. Leave aspect out (adaptive follows the frame). No refs in this call: frames and refs cannot be mixed on Seedance.
3. `get_run_status`, Poll until completed. The clip opens on the exact still.

## 4. First and last frame

_150 credits for 5 s on seedance-2.0 at 720p; two stills first (20 credits each with generate_image)_

1. `generate_image`, Twice: the opening still and the closing still, same person and setting wording, a different pose or state.
2. `generate_video`, first_frame = the opening still, last_frame = the closing still; the prompt describes the move between them. The model animates from one to the other.

## 5. Match a reference clip's motion (video_refs)

_300 credits for a 5 s clip plus a 5 s reference clip on seedance-2.0 at 720p: the reference clip's seconds are billed at the same per-second rate_

1. `quote`, With video_refs the quote adds the reference clip seconds at the same rate (measured at submit); price it first.
2. `generate_video`, The clip in video_refs (https mp4/mov), a portrait in refs, and a prompt like "@image1 performs the same move as @video1, in a bright kitchen ...". Describe the NEW clip; never write edit or extend wording.
3. `get_run_status`, Poll until completed.

## 6. Crazy look (silent reaction clip)

_150 credits per 5 s clip at 720p_

1. `generate_video`, "Extreme close-up, face fills the frame, one exaggerated bug-eyed shock held straight into the lens, slow lean-in, no speech"; audio: false; seconds: 5; a portrait in refs (@image1) so it is the same face every time.
2. Burn the caption in the editor, or ask for a static caption in the prompt. Volume: same prompt + same refs, N calls, N performances.

## 7. B-roll with voiceover

_1 credit per 100 characters_

1. `generate_audio`, The narration, a named voice, a tone.
2. Lay it over the footage in the editor. Muxing external video is not on this surface; the fixed make_subtitles and make_ugc REST routes still exist for that. The mp3 URL also works as an audio_refs entry for generate_video.

## 8. A series with one face

_20 credits once, then 150 per 5 s clip at 720p_

1. `generate_image`, Once: a clean head-and-shoulders portrait.
2. `generate_video`, Every clip: the same portrait URL in refs as @image1, the same person/setting wording, a different script. The reference is what keeps the face.
3. `list_characters`, Saved characters from the dashboard appear here; their character_sheet_url works the same way in refs.

## 9. Two people

_150 to 450 credits per exchange at 720p_

1. `generate_video`, Both portraits in refs and a prompt that names who says what: "@image1 and @image2 on a couch. @image1 says: ... @image2 laughs and says: ...". Keep it to 10 to 15 s per exchange.

## 10. The hero clip

_about 3x the credits of seedance-2.0 (50 credits/s at 480p, 99 at 720p, 180 at 1080p)_

1. `quote`, Price it first: model "seedance-2.5", seconds up to 10, the quality the user asked for.
2. `generate_video`, One take, a strong reference. In image mode leave aspect out (adaptive only). Expect a much longer render than seedance-2.0 (12 to 25 minutes per clip; plan the wait).
