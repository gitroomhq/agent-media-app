// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Hume AI Octave 2 TTS — Text-to-Speech with emotional intelligence.
 *
 * Octave 2 understands the meaning of text and automatically matches
 * emotion, pacing, and delivery — no manual emotion tags needed.
 *
 * API: POST https://api.hume.ai/v0/tts/file
 */

import { writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HUME_API_KEY = () => process.env.HUME_API_KEY;
const BASE_URL = 'https://api.hume.ai/v0';

// ── Voice descriptions for Hume's custom voice generation ──────────────────
// Hume generates voices from natural language descriptions — no voice IDs needed.

const VOICE_DESCRIPTIONS = {
  young_female:
    'Young woman in her early 20s. Upbeat, energetic TikTok creator energy. ' +
    'Natural vocal fry, casual delivery, like talking to a friend over FaceTime. ' +
    'Quick pace with genuine enthusiasm.',
  female:
    'Woman in her early 30s. Warm, confident, relatable. ' +
    'Speaks like a trusted friend sharing advice. Natural pauses, ' +
    'varied intonation, authentic personality.',
  young_male:
    'Young man in his early 20s. Casual, laid-back content creator. ' +
    'Natural speech patterns with "like" and "honestly" energy. ' +
    'Genuine excitement without being over-the-top.',
  male:
    'Man in his mid 30s. Confident, knowledgeable, approachable. ' +
    'Speaks with natural authority but not stiff. ' +
    'Like explaining something cool to a buddy.',
  elder_female:
    'Woman in her late 60s. Warm, wise, gentle humor. ' +
    'Speaks with the confidence of experience. Slightly slower pace, ' +
    'rich tone, grandmotherly warmth with a sharp wit.',
  elder_male:
    'Man in his late 60s. Calm, authoritative, storyteller energy. ' +
    'Deep voice with natural gravitas. Measured pace, ' +
    'like sharing hard-earned wisdom over whiskey.',
  mom:
    'Woman in her early 40s. Friendly, approachable, down-to-earth mom. ' +
    'Speaks with warmth and genuine care. Natural, unforced delivery ' +
    'like chatting at school pickup.',
};

// Map ElevenLabs pre-made voice IDs → Hume voice description keys
const VOICE_ID_TO_DESCRIPTION = {
  'cgSgspJ2msm6clMCkdW9': 'young_female', // Jessica
  'EXAVITQu4vr4xnSDxMaL': 'female',       // Sarah
  'TX3LPaxmHKxFdv7VOQHJ': 'young_male',   // Liam
  'iP95p4xoKVk53GoZ742B': 'male',          // Chris
  'pFZP5JQG7iQjIQuC4Bku': 'elder_female',  // Lily
  'pqHfZKP75CvOlQylNhV4': 'elder_male',    // Bill
  'XrExE9yKIg1WjnnlVkGX': 'mom',           // Matilda
};

// ── Tone → acting direction overlay ──────────────────────────────────────────

const TONE_DIRECTIONS = {
  energetic: 'Pump up the energy — sound genuinely hyped, like you just discovered something amazing.',
  calm: 'Speak in a warm, relaxed, intimate tone — sharing a secret with a close friend over coffee.',
  confident: 'Speak with natural authority — no filler words, you KNOW this works.',
  dramatic: 'Use dramatic pauses before key reveals. Build tension, then speed up at the payoff.',
};

/**
 * Generate TTS audio using Hume AI Octave 2.
 *
 * @param {string} text - Text to convert to speech
 * @param {string} voiceIdOrKey - ElevenLabs voice_id (mapped to description) or direct description key
 * @param {string} outputPath - Path to write the WAV file
 * @param {string|null} [tone] - Voice tone: energetic, calm, confident, dramatic
 * @param {number|null} [voiceSpeed] - Speed multiplier (0.5–2.0)
 * @returns {Promise<void>}
 */
export async function generateHumeTTS(text, voiceIdOrKey, outputPath, tone = null, voiceSpeed = null) {
  if (!text || text.length === 0) {
    throw new Error('Hume TTS: text is empty');
  }

  const apiKey = HUME_API_KEY();
  if (!apiKey) {
    throw new Error('HUME_API_KEY environment variable is not set');
  }

  // Strip emotion tags — Hume understands emotion from context, tags would confuse it
  const cleanText = text.replace(/\[\w+\]/g, '').replace(/\s{2,}/g, ' ').trim();

  // Resolve voice description
  const descKey = VOICE_ID_TO_DESCRIPTION[voiceIdOrKey] ?? voiceIdOrKey;
  let description = VOICE_DESCRIPTIONS[descKey] ?? VOICE_DESCRIPTIONS.female;

  // Add tone direction if specified
  if (tone && TONE_DIRECTIONS[tone]) {
    description += ' ' + TONE_DIRECTIONS[tone];
  }

  // Build utterance — description acts as both voice prompt and acting direction
  const utterance = {
    text: cleanText,
    description, // voice character + acting direction combined
  };

  if (voiceSpeed != null) {
    utterance.speed = Math.min(Math.max(voiceSpeed, 0.5), 2.0);
  }

  const body = {
    utterances: [utterance],
    format: { type: 'wav' },
  };

  const response = await fetch(`${BASE_URL}/tts/file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hume-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`Hume TTS failed (${response.status}): ${errorBody}`);
  }

  // Response is WAV audio bytes — save directly
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  // Normalize to pcm_s16le 44100 Hz mono for pipeline consistency
  const tmpPath = outputPath.replace(/\.wav$/, '.tmp.wav');
  await writeFile(tmpPath, audioBuffer);
  await execFileAsync('ffmpeg', [
    '-y', '-i', tmpPath,
    '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '1',
    outputPath,
  ]);
  await unlink(tmpPath).catch(() => {});
}
