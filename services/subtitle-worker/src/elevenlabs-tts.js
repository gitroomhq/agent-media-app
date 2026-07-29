// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * ElevenLabs TTS — Text-to-Speech using a cloned or preset ElevenLabs voice.
 *
 * Generates per-scene audio with context-aware prosody using
 * previous_text / next_text parameters for natural scene transitions.
 *
 * API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 */

import { writeFile } from 'node:fs/promises';

const ELEVENLABS_API_KEY = () => process.env.ELEVENLABS_API_KEY;
const BASE_URL = 'https://api.elevenlabs.io/v1';
const MAX_TEXT_LENGTH = 5000; // ElevenLabs allows ~5000 chars per request

/**
 * Generate TTS audio for a single text segment using ElevenLabs.
 *
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice_id (cloned or preset)
 * @param {string} outputPath - Path to write the MP3 file
 * @param {Object} [context] - Optional context for prosody continuity
 * @param {string} [context.previousText] - Text from the previous scene
 * @param {string} [context.nextText] - Text from the next scene
 * @returns {Promise<void>}
 */
export async function generateElevenLabsTTS(text, voiceId, outputPath, context = {}) {
  if (!text || text.length === 0) {
    throw new Error('ElevenLabs TTS: text is empty');
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`ElevenLabs TTS: text exceeds ${MAX_TEXT_LENGTH} chars (got ${text.length})`);
  }

  const apiKey = ELEVENLABS_API_KEY();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const body = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };

  // Add context for prosody continuity across scenes
  if (context.previousText) {
    body.previous_text = context.previousText;
  }
  if (context.nextText) {
    body.next_text = context.nextText;
  }

  const response = await fetch(
    `${BASE_URL}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorBody}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * Clone a voice from an audio file using ElevenLabs Instant Voice Clone.
 *
 * @param {string} name - Display name for the cloned voice
 * @param {Buffer} audioBuffer - Audio file buffer (MP3/WAV, 1-2 min recommended)
 * @param {string} fileName - Original file name for the upload
 * @returns {Promise<string>} The voice_id for the cloned voice
 */
export async function cloneVoice(name, audioBuffer, fileName) {
  const apiKey = ELEVENLABS_API_KEY();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('files', new Blob([audioBuffer]), fileName);
  formData.append('remove_background_noise', 'true');

  const response = await fetch(`${BASE_URL}/voices/add`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`ElevenLabs voice clone failed (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  return result.voice_id;
}

/**
 * Delete a cloned voice from ElevenLabs.
 *
 * @param {string} voiceId - The voice_id to delete
 * @returns {Promise<void>}
 */
export async function deleteVoice(voiceId) {
  const apiKey = ELEVENLABS_API_KEY();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  const response = await fetch(`${BASE_URL}/voices/${voiceId}`, {
    method: 'DELETE',
    headers: {
      'xi-api-key': apiKey,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`ElevenLabs voice delete failed (${response.status}): ${errorBody}`);
  }
}
