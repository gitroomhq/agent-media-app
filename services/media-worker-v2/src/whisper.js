// Whisper transcription via OpenAI API
import { createReadStream } from 'node:fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function transcribeWithWhisper(audioPath) {
  const formData = new FormData();
  const file = new Blob([await import('node:fs/promises').then(fs => fs.readFile(audioPath))]);
  formData.append('file', file, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Whisper API error: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  return result.words || [];
}
