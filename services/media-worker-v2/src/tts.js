// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * TTS — Unified Text-to-Speech router.
 *
 * Priority: Hume Octave 2 (default for actors) > ElevenLabs (cloned voices) > OpenAI (preset names).
 * Supports per-scene generation with prosody context for ElevenLabs.
 */

import OpenAI from 'openai';
import { writeFile } from 'node:fs/promises';
import { generateElevenLabsTTS } from './elevenlabs-tts.js';
import { generateHumeTTS } from './hume-tts.js';

// Lazy init — avoid crashing at import time if env var is missing
let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const OPENAI_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse']);
const MAX_TEXT_LENGTH = 4096; // OpenAI TTS limit

// ElevenLabs pre-made voice IDs — use eleven_v3 (not cloned voice model)
const ELEVENLABS_PREMADE_VOICES = new Set([
  'cgSgspJ2msm6clMCkdW9', // Jessica — young female
  'EXAVITQu4vr4xnSDxMaL', // Sarah — female
  'TX3LPaxmHKxFdv7VOQHJ', // Liam — young male
  'iP95p4xoKVk53GoZ742B', // Chris — male
  'pFZP5JQG7iQjIQuC4Bku', // Lily — elder female
  'pqHfZKP75CvOlQylNhV4', // Bill — elder male
  'XrExE9yKIg1WjnnlVkGX', // Matilda — mom
]);

// ── Emotion tag parser ────────────────────────────────────────────────────

/**
 * Emotion tags recognised in scripts: "This is [laughs] amazing [excited]"
 */
const KNOWN_EMOTION_TAGS = new Set([
  'laughs', 'excited', 'sighs', 'hesitant',
  'surprised', 'satisfied', 'neutral', 'clicking',
  'whispers', 'angry', 'sad', 'happy',
]);

/**
 * Parse emotion tags from text, stripping them and returning tag names.
 *
 * @param {string} text - Input text possibly containing [tag] markers
 * @returns {{ cleanText: string, tags: string[] }}
 */
export function parseEmotionTags(text) {
  const tagPattern = /\[(\w+)\]/g;
  const tags = [];

  const cleanText = text.replace(tagPattern, (match, tag) => {
    if (KNOWN_EMOTION_TAGS.has(tag.toLowerCase())) {
      tags.push(tag.toLowerCase());
      return '';
    }
    return match; // preserve unknown tags
  }).replace(/\s{2,}/g, ' ').trim();

  return { cleanText, tags };
}

// ── TTS Instructions Builder ──────────────────────────────────────────────

const TONE_INSTRUCTION_MAP = {
  energetic: 'Pump up the energy — sound genuinely hyped, with rising intonation and punchy emphasis on key words. Like you just discovered something amazing and NEED to share it.',
  calm: 'Speak in a warm, relaxed, intimate tone — like you\'re sharing a secret with a close friend over coffee. Slow, deliberate, with gentle pauses.',
  confident: 'Speak with natural authority — no filler words, strong downward intonation at the end of statements. You KNOW this works and you\'re sharing it matter-of-factly.',
  dramatic: 'Use dramatic pauses before key reveals. Build tension with slower pacing, then speed up at the payoff. Vary your volume — quiet for setup, louder for the punchline.',
};

const TAG_INSTRUCTION_MAP = {
  laughs: 'Break into a brief, genuine laugh mid-sentence — not forced, like something actually amused you.',
  excited: 'Get noticeably more animated — raise your pitch, speed up slightly, let real enthusiasm come through.',
  sighs: 'Let out a natural, audible sigh — like you\'re processing something real.',
  hesitant: 'Slow down and add "um" or a brief pause — like you\'re choosing your words carefully.',
  surprised: 'React with genuine surprise — slightly higher pitch, a brief gasp or "wait what" energy.',
  satisfied: 'Sound content and pleased — warm smile in your voice, slower and lower.',
  whispers: 'Drop to a conspiratorial whisper — like you\'re telling a secret the audience needs to lean in for.',
  angry: 'Get heated — tighter delivery, clipped words, real frustration in your voice.',
  sad: 'Let your voice drop lower and softer — genuine empathy, slower pace.',
  happy: 'Sound bright and warm — natural smile in your voice, upbeat rhythm.',
};

/**
 * Build natural language delivery instructions from emotion tags + tone preset.
 *
 * @param {string[]} tags - Emotion tags extracted from the text
 * @param {string|null} tone - Voice tone preset
 * @returns {string} Natural language instructions for gpt-4o-mini-tts
 */
function buildTTSInstructions(tags, tone) {
  const parts = [
    'You are recording a TikTok voiceover. Speak like a real person — NOT a narrator or AI.',
    'Use natural vocal variety: change your pace, pitch, and volume throughout.',
    'Emphasize key words by punching them harder. Add micro-pauses before important points.',
    'Sound like you\'re talking to one person through the phone, not reading from a script.',
  ];

  if (tone && TONE_INSTRUCTION_MAP[tone]) {
    parts.push(TONE_INSTRUCTION_MAP[tone]);
  } else {
    // Default: conversational energy
    parts.push('Keep it conversational and engaging — like sharing something cool you just found out.');
  }

  for (const tag of tags) {
    if (TAG_INSTRUCTION_MAP[tag]) {
      parts.push(TAG_INSTRUCTION_MAP[tag]);
    }
  }

  return parts.join(' ');
}

/**
 * Generate TTS audio from text, routing to the correct provider.
 *
 * If voice matches an OpenAI preset name, uses OpenAI TTS.
 * Otherwise, treats it as an ElevenLabs voice_id and uses ElevenLabs.
 *
 * @param {string} text - Text to convert to speech (may contain [emotion] tags)
 * @param {string} voice - OpenAI voice name OR ElevenLabs voice_id
 * @param {string} outputPath - Path to write the MP3 file
 * @param {Object} [context] - Optional context for ElevenLabs prosody
 * @param {string} [context.previousText] - Text from the previous scene
 * @param {string} [context.nextText] - Text from the next scene
 * @param {string} [tone] - Voice tone preset: energetic, calm, confident, dramatic
 * @param {number} [voiceSpeed] - Base TTS speed multiplier (0.7–1.5); emotion tags may further adjust
 * @returns {Promise<void>}
 */
export async function generateTTS(text, voice = 'alloy', outputPath, context = {}, ttsProvider = null, tone = null, voiceSpeed = null) {
  if (!text || text.length === 0) {
    throw new Error('TTS text is empty');
  }

  // Explicit provider override takes precedence
  if (ttsProvider === 'hume') {
    return generateHumeTTS(text, voice, outputPath, tone, voiceSpeed);
  }
  if (ttsProvider === 'elevenlabs') {
    const isCloned = !ELEVENLABS_PREMADE_VOICES.has(voice);
    return generateElevenLabsTTS(text, voice, outputPath, context, tone, isCloned);
  }
  if (ttsProvider === 'openai') {
    return generateOpenAITTS(text, voice, outputPath, tone, voiceSpeed);
  }

  // Auto-route: preset OpenAI voice names → OpenAI
  if (OPENAI_VOICES.has(voice)) {
    return generateOpenAITTS(text, voice, outputPath, tone, voiceSpeed);
  }

  // Pre-made ElevenLabs voices → Hume Octave 2 (better emotional delivery)
  if (ELEVENLABS_PREMADE_VOICES.has(voice) && process.env.HUME_API_KEY) {
    return generateHumeTTS(text, voice, outputPath, tone, voiceSpeed);
  }

  // ElevenLabs voice_id — pre-made voices use v3, cloned voices use v2
  const isCloned = !ELEVENLABS_PREMADE_VOICES.has(voice);
  return generateElevenLabsTTS(text, voice, outputPath, context, tone, isCloned);
}

/**
 * Generate TTS audio using OpenAI gpt-4o-mini-tts with natural language instructions.
 *
 * @param {string} text - Text to convert to speech (may contain [emotion] tags)
 * @param {string} voice - OpenAI TTS voice name
 * @param {string} outputPath - Path to write the WAV file
 * @param {string} [tone] - Voice tone preset
 * @param {number|null} [voiceSpeed] - Base speed override (0.7–1.5)
 * @returns {Promise<void>}
 */
async function generateOpenAITTS(text, voice, outputPath, tone = null, voiceSpeed = null) {
  // Build instructions from raw text (with emotion tags) before stripping
  const { cleanText, tags } = parseEmotionTags(text);
  const instructions = buildTTSInstructions(tags, tone);

  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error(`TTS text exceeds ${MAX_TEXT_LENGTH} character limit (got ${cleanText.length})`);
  }

  const params = {
    model: 'gpt-4o-mini-tts',
    voice,
    input: cleanText,
    instructions,
    response_format: 'wav',
  };

  // Only apply speed if explicitly set (gpt-4o-mini-tts handles pacing via instructions)
  if (voiceSpeed != null) {
    params.speed = Math.min(Math.max(voiceSpeed, 0.25), 4.0);
  }

  const response = await getClient().audio.speech.create(params);

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}
