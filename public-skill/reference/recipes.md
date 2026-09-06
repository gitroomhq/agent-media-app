# Recipes

What the fixed skills used to do, as sequences of the loose tools. 1 credit = $0.01.

## 1. Talking-head UGC clip

_150 credits for 5s on seedance-2.0_

1. `generate_video` — Script in quotes in the prompt; seconds from the word count (about 2.3 per second); refs = a portrait if the face must persist.
2. `get_run_status` — Poll with wait:true until completed; hand over the URL.

## 2. Product in hand

_20 credits for the frame, then the clip_

1. `upload_image` — The product photo becomes an https URL.
2. `generate_image` — "... holding THIS product up to the lens, label facing camera ..." with the product URL (and a portrait, if any) in refs.
3. `generate_video` — The frame URL in refs, the pitch in quotes. The product stays the product.

## 3. Crazy look (silent reaction clip)

_150 credits per 5s clip_

1. `generate_video` — "Extreme close-up, face fills the frame, one exaggerated bug-eyed shock held straight into the lens, slow lean-in, no speech"; audio: false; seconds: 5; a portrait in refs so it is the same face every time.
2. Burn the caption in the editor, or ask for a static caption in the prompt. Volume: same prompt + same refs, N calls, N performances.

## 4. B-roll with voiceover

_1 credit per 100 characters_

1. `generate_audio` — The narration, a named voice, a tone.
2. Lay it over the footage in the editor. Muxing external video is not on this surface; the fixed make_subtitles and make_ugc REST routes still exist for that.

## 5. A series with one face

_20 credits once, then 150 per 5s clip_

1. `generate_image` — Once: a clean head-and-shoulders portrait.
2. `generate_video` — Every clip: the same portrait URL in refs, the same person/setting wording, a different script.
3. `list_characters` — Saved characters from the dashboard appear here; their character_sheet_url works the same way in refs.

## 6. Two people

_150–450 credits per exchange_

1. `generate_video` — Both portraits in refs and a prompt that names who says what: "Two friends on a couch. The one on the left says: ... The one on the right laughs and says: ...". Keep it to 10–15s per exchange.

## 7. The hero clip

_about 3x the credits of seedance-2.0_

1. `quote` — Price it first: model "seedance-2.5", seconds up to 10.
2. `generate_video` — One take, a strong reference. Expect a longer render than 2.0.
