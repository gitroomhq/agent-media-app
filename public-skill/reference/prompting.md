# Prompting for real-looking output

On the loose surface the prompt is yours, so the realism work the fixed pipelines did server-side is now in your hands. This page is what they injected, and how to use it.

## The rubric (verbatim from the worker)

```text
Critical realism rules (must all be visible in the frame):
- skin shows pores, oil sheen on T-zone, baby hairs at hairline, slight under-eye softness;
- single mixed light source (soft window daylight + warm interior bulb), realistic shadows;
- stable iPhone-like framing by default (no noticeable shake/drift), with slight off-axis angle (about 5-12 degrees) and imperfect centering;
- 9:16 vertical, looks like raw iPhone footage, NOT a studio shot;
- NO plastic AI sheen, NO uncanny symmetry, NO ultra-smoothed skin;
- NO shiny/plastic face, NO glowing light on the face, NO beauty-filter glow;
- subtle asymmetry: head tilt, blink, micro-expressions;
- hands are always doing something — gesturing, holding a product, adjusting clothing, or otherwise occupied (never limp at the sides);
- mouth caught mid-syllable when talking, not closed and not open-smile;
- eyes slightly off-center to camera, not a dead stare;
- no visible phone, selfie-stick, or outstretched selfie arm unless explicitly requested.
```

## How to use it

- Write the shot as prose, not tags. The models read sentences better than keyword lists.
- Order: who (age, look) → where (setting, light) → what they do with their hands → camera (phone framing, slight off-axis) → the spoken words in quotes.
- Pick 4–6 rubric lines that matter for THIS shot and fold them in naturally: "natural skin texture, soft window light, slight head tilt, hands busy with the bottle".
- For a series, keep the wording of the person and setting identical across calls and pass the same `refs`.
- Do not say "selfie" or "phone" unless a phone should be in the frame; say "talking to camera".
- Speech: quote the words verbatim; ~2.3 words per second.

## Two worked prompts

**Talking head, 5s, seedance-2.0**

> A 28-year-old woman in a bright apartment kitchen, phone-camera framing slightly off-axis, natural skin texture with a little T-zone sheen, soft window daylight from the left and a warm lamp behind her. She holds a small amber serum bottle up near her cheek, tilts her head and says: "Okay. I did not expect this to actually work." Eyes just off the lens, mouth caught mid-word.

**Product frame, generate_image with the product photo in refs**

> The same woman holding THIS bottle (from the reference) up to the lens with both hands, label facing camera, bedroom corner, soft window light, phone photo, natural skin, no beauty-filter glow.
