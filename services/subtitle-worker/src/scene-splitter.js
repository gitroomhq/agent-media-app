// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Scene Splitter — Uses GPT-4o-mini to segment a script into scenes.
 *
 * Each scene has narration text, a scene type (talking_head or broll),
 * and a visual description for B-roll generation.
 */

import OpenAI from 'openai';

// Lazy init — avoid crashing at import time if env var is missing
let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * @typedef {Object} Scene
 * @property {string} text - Narration text for this scene
 * @property {'talking_head' | 'broll'} type - Scene type
 * @property {string} visualPrompt - Visual description for B-roll video generation
 */

/**
 * Split a script into scenes with narration, type classification, and visual prompts.
 *
 * @param {string} script - The full narration script
 * @param {number|null} [targetDuration] - Target video duration in seconds (affects scene count)
 * @returns {Promise<Scene[]>}
 */
export async function splitScenes(script, targetDuration = null) {
  // Scale scene count based on target duration
  const minScenes = targetDuration && targetDuration >= 30 ? 5 : 3;
  const maxScenes = targetDuration && targetDuration >= 30 ? 8 : 6;
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an award-winning cinematographer and UGC video director. Split the given script into ${minScenes}-${maxScenes} scenes for a short-form vertical (9:16) video.${targetDuration ? ` Target duration: ~${targetDuration} seconds. Create enough scenes to fill this duration — each scene is typically 3-5 seconds.` : ''}

For each scene, provide:
1. "text" — the exact narration text for that scene (must use the original script words verbatim, no additions)
2. "type" — either "talking_head" or "broll":
   - "talking_head": Direct-to-camera speaking. Use for opening hooks, personal opinions, emotional moments, calls to action.
   - "broll": Visual cutaway. Use for illustrating concepts, showing examples, transitions between ideas.
3. "visualPrompt" — a cinematic visual description for AI video generation. CRITICAL RULES for visualPrompt:
   - Describe REAL-WORLD visuals only: people, places, objects, nature, cityscapes, hands, activities
   - Use specific camera vocabulary: dolly shot, tracking shot, crane shot, rack focus, shallow depth of field, wide establishing shot, tight close-up, over-the-shoulder, Dutch angle, push-in
   - Specify lighting: golden hour, dramatic side-lighting, rim light, soft diffused light, high-key, moody low-key, silhouette, backlit, neon glow
   - Describe motion: slow motion, time-lapse, handheld, steadicam, smooth dolly, whip pan, parallax
   - NEVER describe screens, UIs, apps, software, dashboards, code, websites, or computer interfaces
   - NEVER mention product names, brand names, or specific tools in the visual description
   - NEVER include text overlays, title cards, or abstract visual concepts
   - Focus on the EMOTION or CONCEPT behind the narration, not the literal subject
   - Good: "Slow-motion dolly shot of hands typing on a laptop in a sunlit cafe, shallow depth of field with bokeh, steam rising from a coffee cup, golden hour light"
   - Bad: "A screen showing the Agent Media CLI interface"
   - Good: "Steadicam tracking shot of a person walking confidently through a modern office, dramatic rim light streaming through floor-to-ceiling windows, rack focus to their determined expression"
   - Bad: "A screenshot of a product dashboard with analytics"

VISUAL COHERENCE — this is critical:
   - All B-roll scenes must feel like they belong in the SAME video as the talking_head scenes
   - B-roll should show actions, environments, and moments that naturally relate to the narration topic
   - Use a consistent visual style across all B-roll: same color temperature, similar environments, same energy level
   - B-roll should feel like natural cutaways from the speaker's world, NOT random stock footage
   - If the narration is about tech/creation, show: hands working, coffee shop vibes, modern workspaces, creative energy, city life
   - If the narration is about emotions/motivation, show: nature, movement, light, human moments
   - AVOID mixing wildly different environments (e.g., don't go from beach to office to forest in one video)

Scene pacing rules:
- Every word of the original script must appear in exactly one scene's text
- Each scene should be 1-3 sentences
- Start with a talking_head scene for the hook
- Alternate between talking_head and broll naturally
- Aim for ~40% talking_head and ~60% broll
- End with a talking_head scene (call to action)

Return JSON: { "scenes": [{ "text": "...", "type": "talking_head" | "broll", "visualPrompt": "..." }, ...] }`,
      },
      {
        role: 'user',
        content: script,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('GPT-4o-mini returned empty response for scene splitting');
  }

  const parsed = JSON.parse(content);
  const scenes = parsed.scenes;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('GPT-4o-mini returned no scenes');
  }

  if (scenes.length > maxScenes) {
    scenes.length = maxScenes;
  }

  // Enforce hook-first: first scene should be talking_head
  if (scenes.length > 1 && scenes[0].type !== 'talking_head') {
    const thIdx = scenes.findIndex(s => s.type === 'talking_head');
    if (thIdx > 0) [scenes[0], scenes[thIdx]] = [scenes[thIdx], scenes[0]];
  }

  // Validate each scene has required fields
  for (const scene of scenes) {
    if (!scene.text || !scene.type || !scene.visualPrompt) {
      throw new Error('Scene missing required fields (text, type, visualPrompt)');
    }
    if (scene.type !== 'talking_head' && scene.type !== 'broll') {
      // Default to broll if invalid type
      scene.type = 'broll';
    }
  }

  return scenes;
}
