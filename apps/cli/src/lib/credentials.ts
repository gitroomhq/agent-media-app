// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Credential store for the agent-media CLI.
 *
 * Manages API keys and profiles at ~/.agent-media/credentials.json
 * (or AGENT_MEDIA_CONFIG_DIR). Supports multiple named profiles for
 * multi-account usage.
 *
 * File format:
 * {
 *   "currentProfile": "default",
 *   "profiles": {
 *     "default": {
 *       "apiKey": "ma_xxxxx",
 *       "email": "user@example.com",
 *       "userId": "uuid",
 *       "createdAt": "ISO8601"
 *     }
 *   }
 * }
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.js';

const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

export const DEFAULT_PROFILE = 'default';

export interface CredentialProfile {
  apiKey: string;
  email: string;
  userId: string;
  createdAt: string;
}

export interface CredentialsStore {
  currentProfile: string;
  profiles: Record<string, CredentialProfile>;
}

/**
 * Ensure the config directory exists.
 */
function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * In-memory cache to avoid re-reading the file on every call.
 * Cleared on save so writes are immediately visible.
 */
let _cache: CredentialsStore | null = null;

/**
 * Load the credentials store from disk. Returns an empty store if the
 * file does not exist or is malformed. Results are cached in-memory
 * for the lifetime of the process.
 */
export function loadCredentials(): CredentialsStore {
  if (_cache) return _cache;

  if (!existsSync(CREDENTIALS_FILE)) {
    return { currentProfile: DEFAULT_PROFILE, profiles: {} };
  }
  try {
    const raw = readFileSync(CREDENTIALS_FILE, 'utf-8');
    const data = JSON.parse(raw) as CredentialsStore;
    // Basic shape validation
    if (!data.profiles || typeof data.profiles !== 'object') {
      return { currentProfile: DEFAULT_PROFILE, profiles: {} };
    }
    _cache = data;
    return data;
  } catch {
    return { currentProfile: DEFAULT_PROFILE, profiles: {} };
  }
}

/**
 * Persist the credentials store to disk.
 */
export function saveCredentials(store: CredentialsStore): void {
  ensureDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600, // rw------- owner-only
  });
  _cache = store; // Update in-memory cache
}

/**
 * Get the active profile name, respecting:
 * 1. Explicit --profile flag
 * 2. AGENT_MEDIA_PROFILE env var
 * 3. The currentProfile field in the store
 */
export function resolveProfileName(flagProfile?: string): string {
  if (flagProfile) return flagProfile;
  const envProfile = process.env['AGENT_MEDIA_PROFILE'];
  if (envProfile) return envProfile;
  const store = loadCredentials();
  return store.currentProfile || DEFAULT_PROFILE;
}

/**
 * Get the API key for the resolved profile.
 *
 * Resolution order:
 * 1. AGENT_MEDIA_API_KEY env var (bypasses profile system entirely)
 * 2. Profile-based lookup from credentials.json
 *
 * Returns null if no credentials are found.
 */
export function getApiKey(profileName?: string): string | null {
  // Env var always wins
  const envKey = process.env['AGENT_MEDIA_API_KEY'];
  if (envKey) return envKey;

  const store = loadCredentials();
  const name = resolveProfileName(profileName);
  const profile = store.profiles[name];
  return profile?.apiKey ?? null;
}

/**
 * Get the full credential profile for a given profile name.
 */
export function getProfile(profileName?: string): CredentialProfile | null {
  const store = loadCredentials();
  const name = resolveProfileName(profileName);
  return store.profiles[name] ?? null;
}

/**
 * Save credentials for a profile.
 */
export function saveProfile(
  profileName: string,
  profile: CredentialProfile,
): void {
  const store = loadCredentials();
  store.profiles[profileName] = profile;
  // If this is the first profile, make it the current one
  if (Object.keys(store.profiles).length === 1) {
    store.currentProfile = profileName;
  }
  saveCredentials(store);
}

/**
 * Delete a specific profile from the store.
 * If the deleted profile was the current one, resets to the first
 * remaining profile or DEFAULT_PROFILE.
 */
export function deleteProfile(profileName: string): boolean {
  const store = loadCredentials();
  if (!store.profiles[profileName]) return false;

  delete store.profiles[profileName];

  if (store.currentProfile === profileName) {
    const remaining = Object.keys(store.profiles);
    store.currentProfile = remaining[0] ?? DEFAULT_PROFILE;
  }

  saveCredentials(store);
  return true;
}

/**
 * Delete all profiles and remove the credentials file entirely.
 */
export function clearAllCredentials(): void {
  if (existsSync(CREDENTIALS_FILE)) {
    unlinkSync(CREDENTIALS_FILE);
  }
}

/**
 * List all profile names in the store.
 */
export function listProfiles(): string[] {
  const store = loadCredentials();
  return Object.keys(store.profiles);
}
