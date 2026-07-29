// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * OpenAI Whisper API client for word-level transcription.
 *
 * Sends the video file to Whisper with word-level timestamp granularity
 * and returns an array of { word, start, end } objects.
 */

import OpenAI from 'openai';
import { createReadStream } from 'node:fs';

// Lazy init — avoid crashing at import time if env var is missing
let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * @typedef {Object} WordTimestamp
 * @property {string} word - The transcribed word
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 */

/**
 * Transcribe a video/audio file using OpenAI Whisper API.
 * Returns word-level timestamps.
 *
 * @param {string} filePath - Path to the input video/audio file
 * @returns {Promise<WordTimestamp[]>}
 */
export async function transcribeWithWhisper(filePath) {
  const response = await getClient().audio.transcriptions.create({
    model: 'whisper-1',
    file: createReadStream(filePath),
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  // Extract word-level timestamps from the response
  const words = response.words ?? [];

  return words.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
}
