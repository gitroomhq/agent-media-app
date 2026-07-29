// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * ElevenLabs TTS — Text-to-Speech using a cloned or preset ElevenLabs voice.
 *
 * Generates per-scene audio with context-aware prosody using
 * previous_text / next_text parameters for natural scene transitions.
 *
 * API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 */

import { writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ELEVENLABS_API_KEY = () => process.env.ELEVENLABS_API_KEY;
const BASE_URL = 'https://api.elevenlabs.io/v1';
const MAX_TEXT_LENGTH = 5000; // ElevenLabs allows ~5000 chars per request

// ── Tone presets for voice_settings ──────────────────────────────────────────

const TONE_PRESETS = {
  energetic: { stability: 0.3, similarity_boost: 0.8, style: 0.8, use_speaker_boost: true },
  calm:      { stability: 0.85, similarity_boost: 0.75, style: 0.15, use_speaker_boost: false },
  confident: { stability: 0.65, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
  dramatic:  { stability: 0.35, similarity_boost: 0.9, style: 0.9, use_speaker_boost: true },
};

const DEFAULT_VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

/**
 * Generate TTS audio for a single text segment using ElevenLabs.
 *
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice_id (cloned or preset)
 * @param {string} outputPath - Path to write the WAV file
 * @param {Object} [context] - Optional context for prosody continuity
 * @param {string} [context.previousText] - Text from the previous scene
 * @param {string} [context.nextText] - Text from the next scene
 * @param {string} [tone] - Voice tone: energetic, calm, confident, dramatic
 * @param {boolean} [isClonedVoice=false] - Whether this is a cloned voice (uses v2 model)
 * @returns {Promise<void>}
 */
export async function generateElevenLabsTTS(text, voiceId, outputPath, context = {}, tone = null, isClonedVoice = false) {
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

  // v3 processes emotion tags natively ([excited], [laughs], [whispers]);
  // for cloned voices (v2), strip tags from input text
  let inputText = text;
  if (isClonedVoice) {
    inputText = text.replace(/\[\w+\]/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  const modelId = isClonedVoice ? 'eleven_multilingual_v2' : 'eleven_v3';

  const body = {
    text: inputText,
    model_id: modelId,
    voice_settings: TONE_PRESETS[tone] ?? DEFAULT_VOICE_SETTINGS,
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

  const mp3Buffer = Buffer.from(await response.arrayBuffer());

  // Convert MP3 → WAV (pcm_s16le, 44100 Hz, mono) for pipeline consistency
  const tmpMp3 = outputPath.replace(/\.wav$/, '.tmp.mp3');
  await writeFile(tmpMp3, mp3Buffer);
  await execFileAsync('ffmpeg', [
    '-y', '-i', tmpMp3,
    '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '1',
    outputPath,
  ]);
  await unlink(tmpMp3).catch(() => {});
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
