// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Configuration management for the agent-media CLI.
 *
 * Stores config at ~/.agent-media/config.json (or AGENT_MEDIA_CONFIG_DIR).
 *
 * Supported keys:
 * - api_url: Supabase Edge Functions URL
 * - output_format: default output format (human/json/quiet)
 * - default_model: default model for generate command
 * - auto_open_browser: whether to auto-open browser on login (default: true)
 * - download_dir: default download directory
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = process.env['AGENT_MEDIA_CONFIG_DIR'] ?? join(homedir(), '.agent-media');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export type ConfigData = Record<string, unknown>;

/** All recognized configuration keys. */
export const VALID_CONFIG_KEYS = [
  'api_url',
  'output_format',
  'default_model',
  'auto_open_browser',
  'download_dir',
] as const;

export type ConfigKey = (typeof VALID_CONFIG_KEYS)[number];

/** Default values for configuration keys. */
export const CONFIG_DEFAULTS: Partial<Record<ConfigKey, unknown>> = {
  auto_open_browser: true,
  output_format: 'human',
};

/**
 * Check whether a string is a valid configuration key.
 */
export function isValidConfigKey(key: string): key is ConfigKey {
  return (VALID_CONFIG_KEYS as readonly string[]).includes(key);
}

/**
 * Ensure the config directory exists.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load the config file. Returns an empty object if it does not exist.
 */
export function loadConfig(): ConfigData {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as ConfigData;
  } catch {
    return {};
  }
}

/**
 * Save the config object to disk.
 */
export function saveConfig(config: ConfigData): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get a single config value by key.
 */
export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a single config value and persist to disk.
 */
export function setConfigValue(key: string, value: unknown): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Reset the config file by removing it entirely, restoring defaults.
 */
export function resetConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}
