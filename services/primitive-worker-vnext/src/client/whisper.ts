// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * OpenAI Whisper transcription helper. Returns word-level timestamps
 * suitable for ASS subtitle generation.
 */

import { readFile } from 'node:fs/promises';

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export async function transcribeWithWhisper(
  apiKey: string,
  audioPath: string,
  language?: string,
): Promise<WhisperWord[]> {
  const bytes = await readFile(audioPath);
  // Node 22 has global FormData + Blob.
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'audio.wav');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  if (language) form.append('language', language);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`whisper ${resp.status}: ${text.slice(0, 400)}`);
    (err as any).status = resp.status;
    throw err;
  }
  const json = (await resp.json()) as { words?: WhisperWord[]; segments?: unknown[] };
  return (json.words ?? []).map((w) => ({
    word: String(w.word ?? ''),
    start: Number(w.start ?? 0),
    end: Number(w.end ?? 0),
  })).filter((w) => w.word.length > 0 && w.end > w.start);
}
