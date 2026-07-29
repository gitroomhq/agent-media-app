// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Music — Background music track resolver.
 *
 * Maps genre names to royalty-free MP3 tracks stored in the
 * `music-library` Supabase Storage bucket.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;

const GENRES = {
  chill:      'chill.mp3',
  energetic:  'energetic.mp3',
  corporate:  'corporate.mp3',
  dramatic:   'dramatic.mp3',
  upbeat:     'upbeat.mp3',
};

export const VALID_MUSIC_GENRES = new Set(Object.keys(GENRES));

/**
 * Get the public URL for a music track by genre.
 *
 * @param {string} genre - One of: chill, energetic, corporate, dramatic, upbeat
 * @returns {string} Public URL to the MP3 file
 */
export function getMusicTrackUrl(genre) {
  const filename = GENRES[genre];
  if (!filename) {
    throw new Error(`Unknown music genre '${genre}'. Valid: ${Object.keys(GENRES).join(', ')}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/music-library/${filename}`;
}

/**
 * Download a music track to a local file.
 *
 * @param {string} genre - Music genre
 * @param {string} outputPath - Local path to write the MP3
 * @returns {Promise<void>}
 */
export async function downloadMusicTrack(genre, outputPath) {
  const { writeFile } = await import('node:fs/promises');

  const url = getMusicTrackUrl(genre);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download music track '${genre}': HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}
