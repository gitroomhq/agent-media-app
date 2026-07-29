// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * TTS — Unified Text-to-Speech router.
 *
 * Routes to ElevenLabs (for cloned voice_id) or OpenAI (for preset names).
 * Supports per-scene generation with prosody context for ElevenLabs.
 */

import OpenAI from 'openai';
import { writeFile } from 'node:fs/promises';
import { generateElevenLabsTTS } from './elevenlabs-tts.js';

// Lazy init — avoid crashing at import time if env var is missing
let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const OPENAI_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
const MAX_TEXT_LENGTH = 4096; // OpenAI TTS limit

/**
 * Generate TTS audio from text, routing to the correct provider.
 *
 * If voice matches an OpenAI preset name, uses OpenAI TTS.
 * Otherwise, treats it as an ElevenLabs voice_id and uses ElevenLabs.
 *
 * @param {string} text - Text to convert to speech
 * @param {string} voice - OpenAI voice name OR ElevenLabs voice_id
 * @param {string} outputPath - Path to write the MP3 file
 * @param {Object} [context] - Optional context for ElevenLabs prosody
 * @param {string} [context.previousText] - Text from the previous scene
 * @param {string} [context.nextText] - Text from the next scene
 * @returns {Promise<void>}
 */
export async function generateTTS(text, voice = 'alloy', outputPath, context = {}) {
  if (!text || text.length === 0) {
    throw new Error('TTS text is empty');
  }

  // Route to the correct provider
  if (OPENAI_VOICES.has(voice)) {
    return generateOpenAITTS(text, voice, outputPath);
  }

  // Treat as ElevenLabs voice_id
  return generateElevenLabsTTS(text, voice, outputPath, context);
}

/**
 * Generate TTS audio using OpenAI.
 *
 * @param {string} text - Text to convert to speech
 * @param {string} voice - OpenAI TTS voice name
 * @param {string} outputPath - Path to write the MP3 file
 * @returns {Promise<void>}
 */
async function generateOpenAITTS(text, voice, outputPath) {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`TTS text exceeds ${MAX_TEXT_LENGTH} character limit (got ${text.length})`);
  }

  const response = await getClient().audio.speech.create({
    model: 'tts-1-hd',
    voice,
    input: text,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}
