# Script pacing — how word count picks the duration

`make_ugc` does **not** ask you for a duration. It counts the words in your `script` and picks the take length for you:

| Words in your script | Duration you get | Credits |
| -------------------- | ---------------- | ------- |
| 1 – 11               | 5s               | 140     |
| 12 – 22              | 10s              | 280     |
| 23 +                 | 15s              | 420     |

That mapping is the server's `fitDuration()` — the same function the quote and the run both use, so the number `/quote` returns is the number you are charged.

**The boundaries are what matter.** A 12-word script is a 10-second video, not a 5-second one — and costs 280 credits, not 140. For a 5s take, stay at **11 words or fewer**.

Roughly 2.5 words per second is the natural TikTok talking-head cadence: too few words leaves dead air the model fills with filler "um"s, too many and it races and the lip-sync breaks.

## Longer scripts

There is no rejection for a long script. Anything past 22 words becomes a 15s take, and a multi-sentence script is split into several takes stitched together — each priced by the same table. Call `/quote` first if you want the cost before spending.

## Examples

- 5s clip: *"This app completely changed my morning routine — try it."* (9 words)
- 10s clip: *"I've used this for two weeks and it saves me thirty minutes every morning. My coffee is still hot."* (20 words)
- 15s clip: *"Okay so I've been using this for two weeks now and it genuinely saves me thirty minutes every single morning, no joke — my coffee is still hot by the time I'm finished."* (33 words)
