# Script pacing — 2 to 4 words per second

Agent-Media UGC Video (`make_ugc`) enforces a word-count window per take, based on the duration it infers from your script:

| Duration | Words (min) | Words (max) |
| -------- | ----------- | ----------- |
| 5s       | 10          | 20          |
| 10s      | 20          | 40          |
| 15s      | 30          | 60          |

Scripts outside this window get rejected at submit with HTTP 400 — no spend.

Why: too few words = silence dead-air the model fills with filler ums; too many words = the model races and the lip-sync breaks. 2–4 wps is the natural TikTok talking-head cadence.

## Examples

- 5s clip: *"Honestly, this app changed my whole morning routine, you have to try it."* (13 words)
- 10s clip: *"Okay so I've been using this for two weeks and it genuinely saves me thirty minutes every single morning, no joke, my coffee is still hot by the time I'm done."* (32 words)
