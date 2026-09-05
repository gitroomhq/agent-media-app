# Recipes

What the fixed skills used to do, as sequences of the loose tools. Prices are for seedance-2.0 unless stated; 1 credit = $0.01.

## 1. Talking-head UGC clip

1. `generate_video` — script in quotes in the prompt, `seconds` from the word count (~2.3 w/s), `refs` = a portrait if the face must persist. **150 credits for 5s.**
2. `get_run_status` until completed.

## 2. Product in hand

1. `upload_image` the product photo → URL.
2. `generate_image` — "… holding THIS product up to the lens, label facing camera …" with the product URL (and a portrait, if any) in `refs`. **20 credits.**
3. `generate_video` — the frame URL in `refs`, the pitch in quotes. The product stays the product.

## 3. Crazy look (silent reaction clip)

1. `generate_video` — "Extreme close-up, face fills the frame, one exaggerated bug-eyed shock held straight into the lens, slow lean-in, no speech", `audio: false`, `seconds: 5`, a portrait in `refs` so it is the same face every time.
2. Burn the caption in the editor, or ask for a static caption in the prompt.
3. Volume: same prompt + same refs, N calls, N performances.

## 4. B-roll with voiceover

1. `generate_audio` — the narration, a named voice, a tone.
2. The user lays it over their footage. (Muxing external video is not on this surface; the fixed `make_subtitles` and `make_ugc` REST routes still exist for that.)

## 5. A series with one face

1. `generate_image` once — a clean head-and-shoulders portrait. **20 credits.**
2. Every `generate_video` in the series: the same portrait URL in `refs`, the same person/setting wording, a different script.
3. Saved characters from the dashboard appear in `list_characters`; their `character_sheet_url` works the same way in `refs`.

## 6. Two people

`generate_video` with both portraits in `refs` and a prompt that names who says what: "Two friends on a couch. The one on the left says: … The one on the right laughs and says: …". Keep it to 10–15s per exchange.

## 7. The hero clip

`model: "seedance-2.5"`, `seconds` ≤ 10, one take, a strong reference. ≈3x the credits — quote it first.
